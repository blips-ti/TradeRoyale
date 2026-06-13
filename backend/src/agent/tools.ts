import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import { BigNumber } from 'bignumber.js';
import { randomUUID } from 'node:crypto';
import { toFunctionSelector } from 'viem';
import * as z from 'zod/v4';

import type { Game, Player, Trade, TradeKind } from '../domain/types.js';
import {
  isNativeToken,
  lifiService,
  LifiService,
  NATIVE_TOKEN_DECIMALS,
  type TokenMeta,
} from '../services/lifiService.js';
import { logger } from '../logger.js';
import { TradeRepository } from '../repositories/tradeRepository.js';
import { tradeExecutor, TradeExecutor } from '../services/tradeExecutor.js';
import { viemReader, ViemReader } from '../services/viemClient.js';
import { gameEventHub, GameEventHub } from '../ws/gameEventHub.js';

// Token-moving selectors the agent's OWN contract-call leg may never use: these let a
// prompt-steered agent approve an attacker spender or move tokens off its wallet. The denyset
// on toContractAddress + per-player wallet isolation is the containment; a protocol allowlist
// (deny-by-default) is the stronger follow-up the team deferred.
const DENIED_CALLDATA_SELECTORS = new Set<string>(
  [
    'function approve(address,uint256)',
    'function increaseAllowance(address,uint256)',
    'function transfer(address,uint256)',
    'function transferFrom(address,address,uint256)',
    'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
    'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
    // Permit2 approve(token, spender, amount, expiration).
    'function approve(address,address,uint160,uint48)',
  ].map((signature) => toFunctionSelector(signature)),
);

function calldataSelector(callData: string): string {
  return callData.slice(0, 10).toLowerCase();
}

// Tools the LI.FI MCP server replaces (read-only market exploration). Dropped from our
// custom toolset when MCP is enabled; our security-boundary tools always stay.
export const MCP_REPLACED_TOOL_NAMES = ['get_market', 'get_swap_quote'] as const;

// Mutable holder the wait tool writes into; the loop reads requestedSeconds after the turn.
export interface WaitState {
  requestedSeconds?: number;
}

export interface AgentToolContext {
  game: Game;
  player: Player;
  // Lowercased Base token addresses the player has traded; the agent may trade ANY token
  // LI.FI quotes (no hard whitelist), and execute_swap adds new tokens here for portfolio
  // reads. Seeded with the entry token + the player's persisted touched set.
  touchedTokens: Set<string>;
  // Wallet-isolation denyset (lowercased): game-owned addresses the agent must never target
  // with a contract call — every player's Privy wallet (incl. its own) and Unlink addresses.
  // Prevents an agent from "interacting" with a sibling wallet to drain or collude.
  gameOwnedAddresses: Set<string>;
  secondsRemaining: () => number;
  // The wait tool records the agent's requested next-turn delay here; the loop clamps it.
  waitState: WaitState;
}

export interface ToolDeps {
  executor: TradeExecutor;
  lifi: LifiService;
  viem: ViemReader;
  trades: TradeRepository;
  hub: GameEventHub;
}

interface WalletContext {
  privyWalletId: string;
  privyWalletAddress: string;
}

const swapInputSchema = z.object({
  fromToken: z.string().describe('Source token address on Base (erc20, or the native ETH sentinel)'),
  toToken: z.string().describe('Destination token address on Base'),
  fromAmount: z.string().describe('Amount of the source token, as a base-unit integer string'),
});

const quoteInputSchema = z.object({
  fromToken: z.string().describe('Source token address on Base'),
  toToken: z.string().describe('Destination token address on Base'),
  fromAmount: z.string().describe('Amount of the source token, as a base-unit integer string'),
});

const waitInputSchema = z.object({
  seconds: z.number().describe('Seconds to wait before your next turn (clamped to a server floor and the time left).'),
});

const protocolActionInputSchema = z.object({
  fromToken: z.string().describe('Token you spend on Base (erc20, or the native ETH sentinel)'),
  toToken: z.string().describe('Token the target contract consumes for the interaction'),
  toAmount: z.string().describe('Desired toToken amount the call needs (base-unit string); LI.FI computes the input to spend'),
  toContractAddress: z.string().describe('The protocol contract to call on Base (must NOT be a game-owned wallet)'),
  toContractCallData: z.string().describe('ABI-encoded calldata for the contract call, 0x-prefixed hex'),
  toContractGasLimit: z.string().describe('Gas limit for the contract call as a decimal string'),
  description: z.string().describe('Short human-readable summary of the protocol action (e.g. "deposit USDC into Aave")'),
});

function defaultDeps(): ToolDeps {
  return {
    executor: tradeExecutor,
    lifi: lifiService,
    viem: viemReader,
    trades: new TradeRepository(),
    hub: gameEventHub,
  };
}

// Builds the per-player tool set. Trading is INTENT-only: the model names tokens + amount;
// the backend re-quotes LI.FI and executes LI.FI's own transactionRequest on the player's
// public Base Privy wallet. Server-side guards (balance, slippage, live game, wallet
// ownership) are re-checked here — model output is never trusted. There is no token
// whitelist (any LI.FI-quotable token on Base is allowed); bridging is out of scope.
export function buildAgentTools(context: AgentToolContext, deps: ToolDeps = defaultDeps()): BetaRunnableTool[] {
  const wallet: WalletContext = {
    privyWalletId: context.player.privyWalletId ?? '',
    privyWalletAddress: context.player.privyWalletAddress ?? '',
  };

  const getPortfolio = betaZodTool({
    name: 'get_portfolio',
    description:
      'Get the current Base token balances of your trading wallet (tokens you have touched, plus native ETH), per-token USD prices, and total portfolio USD value. Call this before deciding what to trade.',
    inputSchema: z.object({}),
    run: async () => {
      const balances = await readPortfolio(context, wallet, deps);
      const meta = await deps.lifi.getTokenMeta([...context.touchedTokens]);
      const prices = Object.fromEntries(Object.entries(meta).map(([address, info]) => [address, info.priceUSD]));
      const totalUSD = computeTotalUSD(balances, meta);
      return JSON.stringify({ balances, prices, totalUSD });
    },
  });

  const getMarket = betaZodTool({
    name: 'get_market',
    description: 'List a seed set of well-known Base tokens with symbol, decimals, and current USD price. You are not limited to these — you may trade any token LI.FI can quote on Base.',
    inputSchema: z.object({}),
    run: async () => {
      const tokens = await deps.lifi.getTokens();
      return JSON.stringify({ tokens });
    },
  });

  const getSwapQuote = betaZodTool({
    name: 'get_swap_quote',
    description:
      'Preview a same-chain Base swap without executing it. Returns the expected output and minimum guaranteed output. Use this before execute_swap.',
    inputSchema: quoteInputSchema,
    run: async (args) => {
      const validation = validateSwapArgs(args, context);
      if (validation) return validation;
      const quote = await deps.lifi.getQuote({
        fromToken: args.fromToken,
        toToken: args.toToken,
        fromAmount: args.fromAmount,
        fromAddress: wallet.privyWalletAddress,
      });
      return JSON.stringify({ toAmount: quote.toAmount, toAmountMin: quote.toAmountMin, tool: quote.toolUsed });
    },
  });

  const executeSwap = betaZodTool({
    name: 'execute_swap',
    description:
      'Execute a same-chain Base swap of fromAmount of fromToken into toToken from your trading wallet (gas sponsored). Trades any LI.FI-quotable token on Base. Only call after previewing with a quote.',
    inputSchema: swapInputSchema,
    run: async (args) => runExecuteSwap(args, context, wallet, deps),
  });

  const executeProtocolAction = betaZodTool({
    name: 'execute_protocol_action',
    description:
      'Perform an arbitrary same-chain Base protocol interaction (deposit, stake, zap, etc.) via LI.FI contract calls. You supply the target contract, calldata, gas limit, the token you spend (fromToken), the token the call consumes (toToken), the desired toAmount, and a description. LI.FI computes the input to spend. Use this for protocol actions a plain swap cannot express; remember to unwind back into USDC before the deadline.',
    inputSchema: protocolActionInputSchema,
    run: async (args) => runExecuteProtocolAction(args, context, wallet, deps),
  });

  const getTimeRemaining = betaZodTool({
    name: 'get_time_remaining',
    description: 'Get the number of seconds remaining before the game ends.',
    inputSchema: z.object({}),
    run: async () => JSON.stringify({ secondsRemaining: context.secondsRemaining() }),
  });

  const wait = betaZodTool({
    name: 'wait',
    description:
      'End your current turn and set how many seconds to wait before your next decision. Calling this ENDS the turn — do it once you have nothing more to do right now. The actual wait is clamped to a server-side floor and the time left in the game.',
    inputSchema: waitInputSchema,
    run: async (args) => {
      if (!Number.isFinite(args.seconds) || args.seconds < 0) {
        return toolError('seconds must be a non-negative number.');
      }
      context.waitState.requestedSeconds = args.seconds;
      return JSON.stringify({ ok: true, requestedWaitSeconds: args.seconds });
    },
  });

  return [getPortfolio, getMarket, getSwapQuote, executeSwap, executeProtocolAction, getTimeRemaining, wait];
}

// Clamp the agent's requested wait into [floorSeconds, secondsRemaining]. Below floor → floor
// (cost backstop); above the time left → the time left (never sleep past the buzzer).
export function clampWaitSeconds(requested: number, floorSeconds: number, secondsRemaining: number): number {
  const ceiling = Math.max(0, secondsRemaining);
  if (ceiling <= 0) return 0;
  const clampedToFloor = Math.max(requested, floorSeconds);
  return Math.min(clampedToFloor, ceiling);
}

async function readPortfolio(
  context: AgentToolContext,
  wallet: WalletContext,
  deps: ToolDeps,
): Promise<Record<string, string>> {
  const erc20Tokens = [...context.touchedTokens].filter((token) => !isNativeToken(token));
  const balances = await deps.viem.getErc20Balances(erc20Tokens, wallet.privyWalletAddress);
  balances.native = await deps.viem.getNativeBalance(wallet.privyWalletAddress);
  return balances;
}

async function runExecuteSwap(
  args: z.infer<typeof swapInputSchema>,
  context: AgentToolContext,
  wallet: WalletContext,
  deps: ToolDeps,
): Promise<string> {
  const validation = validateSwapArgs(args, context);
  if (validation) return validation;
  if (!wallet.privyWalletId || !wallet.privyWalletAddress) {
    return toolError('No trading wallet is provisioned for this player yet.');
  }
  if (context.secondsRemaining() <= 0) {
    return toolError('Trading is closed: the game has ended.');
  }
  const balance = await readBalance(args.fromToken, wallet.privyWalletAddress, deps);
  if (new BigNumber(args.fromAmount).gt(balance)) {
    return toolError(`fromAmount ${args.fromAmount} exceeds balance ${balance} of ${args.fromToken}.`);
  }
  try {
    const result = await deps.executor.executeSwap(wallet, args);
    context.touchedTokens.add(args.fromToken.toLowerCase());
    context.touchedTokens.add(args.toToken.toLowerCase());
    const trade = persistableTrade(context, 'swap', result);
    await deps.trades.append(trade);
    deps.hub.broadcast('trade_executed', context.game.id, {
      playerId: context.player.id,
      kind: 'swap',
      fromToken: result.fromToken,
      toToken: result.toToken,
      fromAmount: result.fromAmount,
      toAmountMin: result.toAmountMin,
      txHash: result.txHash,
    });
    return JSON.stringify({
      txHash: result.txHash,
      status: result.status,
      toAmountMin: result.toAmountMin,
      tool: result.tool,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ playerId: context.player.id, err: message }, '[agent] execute_swap failed');
    deps.hub.broadcast('trade_failed', context.game.id, {
      playerId: context.player.id,
      kind: 'swap',
      fromToken: args.fromToken,
      toToken: args.toToken,
      reason: message,
    });
    return toolError(`Swap failed: ${message}`);
  }
}

async function runExecuteProtocolAction(
  args: z.infer<typeof protocolActionInputSchema>,
  context: AgentToolContext,
  wallet: WalletContext,
  deps: ToolDeps,
): Promise<string> {
  const validation = validateProtocolArgs(args, context, wallet);
  if (validation) return validation;
  try {
    // Quote first: LI.FI computes the input to spend (fromAmount) from the desired toAmount,
    // so the balance gate must use the computed value, not a model-supplied amount.
    const quote = await deps.lifi.getContractCallsQuote({
      fromToken: args.fromToken,
      toToken: args.toToken,
      toAmount: args.toAmount,
      fromAddress: wallet.privyWalletAddress,
      toContractAddress: args.toContractAddress,
      toContractCallData: args.toContractCallData,
      toContractGasLimit: args.toContractGasLimit,
    });
    const balance = await readBalance(args.fromToken, wallet.privyWalletAddress, deps);
    if (new BigNumber(quote.fromAmount).gt(balance)) {
      return toolError(`Computed input ${quote.fromAmount} of ${args.fromToken} exceeds balance ${balance}.`);
    }
    const result = await deps.executor.executeContractCall(wallet, args);
    context.touchedTokens.add(args.fromToken.toLowerCase());
    context.touchedTokens.add(args.toToken.toLowerCase());
    const trade = persistableTrade(context, 'contract_call', result, args.description);
    await deps.trades.append(trade);
    deps.hub.broadcast('trade_executed', context.game.id, {
      playerId: context.player.id,
      kind: 'contract_call',
      fromToken: result.fromToken,
      toToken: result.toToken,
      fromAmount: result.fromAmount,
      toAmountMin: result.toAmountMin,
      txHash: result.txHash,
      description: args.description,
    });
    // Surface the estimate verbatim (toAmount/toAmountMin may be "0" for arbitrary calls — the
    // protocol accounts for the real output, so the agent judges effect via get_portfolio).
    return JSON.stringify({
      txHash: result.txHash,
      status: result.status,
      fromAmount: result.fromAmount,
      toAmount: result.toAmount,
      toAmountMin: result.toAmountMin,
      tool: result.tool,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ playerId: context.player.id, err: message }, '[agent] execute_protocol_action failed');
    deps.hub.broadcast('trade_failed', context.game.id, {
      playerId: context.player.id,
      kind: 'contract_call',
      fromToken: args.fromToken,
      toToken: args.toToken,
      reason: message,
    });
    return toolError(`Protocol action failed: ${message}`);
  }
}

async function readBalance(token: string, owner: string, deps: ToolDeps): Promise<string> {
  return isNativeToken(token) ? deps.viem.getNativeBalance(owner) : deps.viem.getErc20Balance(token, owner);
}

// Guards that remain after dropping the whitelist + cross-chain: tokens must differ, amount
// must be a positive base-unit integer, and the game must be live. Balance, slippage, and
// wallet-ownership are enforced in runExecuteSwap and the LI.FI quote.
function validateSwapArgs(
  args: { fromToken: string; toToken: string; fromAmount: string },
  context: AgentToolContext,
): string | null {
  if (args.fromToken.toLowerCase() === args.toToken.toLowerCase()) return toolError('fromToken and toToken must differ.');
  if (!/^[0-9]+$/.test(args.fromAmount) || new BigNumber(args.fromAmount).lte(0)) {
    return toolError('fromAmount must be a positive base-unit integer string.');
  }
  if (context.game.status !== 'live') return toolError('Game is not live.');
  return null;
}

// Wallet-isolation + sanity guards for contract calls. The denyset enforces that the agent can
// only interact with external protocol contracts, never any game-owned wallet (its own or a
// sibling's) — closing the self-deal / sibling-drain hole that arbitrary calldata would open.
function validateProtocolArgs(
  args: z.infer<typeof protocolActionInputSchema>,
  context: AgentToolContext,
  wallet: WalletContext,
): string | null {
  if (context.game.status !== 'live') return toolError('Game is not live.');
  if (!wallet.privyWalletId || !wallet.privyWalletAddress) {
    return toolError('No trading wallet is provisioned for this player yet.');
  }
  if (context.secondsRemaining() <= 0) {
    return toolError('Trading is closed: the game has ended.');
  }
  if (context.gameOwnedAddresses.has(args.toContractAddress.toLowerCase())) {
    return toolError('toContractAddress is a game-owned wallet; protocol calls must target external contracts only.');
  }
  if (!/^0x[0-9a-fA-F]*$/.test(args.toContractCallData)) {
    return toolError('toContractCallData must be 0x-prefixed hex.');
  }
  if (DENIED_CALLDATA_SELECTORS.has(calldataSelector(args.toContractCallData))) {
    return toolError('Calldata selector is a token approval/transfer, which is forbidden in a protocol action.');
  }
  if (!/^[0-9]+$/.test(args.toAmount) || new BigNumber(args.toAmount).lte(0)) {
    return toolError('toAmount must be a positive base-unit integer string.');
  }
  if (!/^[0-9]+$/.test(args.toContractGasLimit) || new BigNumber(args.toContractGasLimit).lte(0)) {
    return toolError('toContractGasLimit must be a positive integer string.');
  }
  return null;
}

interface TradeResultFields {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmountMin: string;
  tool: string;
  txHash: string;
  status: string;
}

function persistableTrade(
  context: AgentToolContext,
  kind: TradeKind,
  result: TradeResultFields,
  description?: string,
): Trade {
  return {
    id: randomUUID(),
    gameId: context.game.id,
    playerId: context.player.id,
    kind,
    fromToken: result.fromToken,
    toToken: result.toToken,
    fromAmount: result.fromAmount,
    toAmountMin: result.toAmountMin,
    tool: result.tool,
    txHash: result.txHash,
    status: result.status,
    createdAt: new Date().toISOString(),
    description,
  };
}

// USD value = sum over tokens of (balance / 10^decimals) * priceUSD, with each token's own
// decimals so mixed-decimal balances are not summed raw (the M1 bug). BigNumber keeps the
// decimal price exact (no JS float / no Number()); a non-finite/empty priceUSD contributes 0.
function computeTotalUSD(balances: Record<string, string>, meta: Record<string, TokenMeta>): string {
  let total = new BigNumber(0);
  for (const [token, amount] of Object.entries(balances)) {
    const info = meta[token.toLowerCase()];
    if (!info?.priceUSD) continue;
    const price = new BigNumber(info.priceUSD);
    if (price.isNaN() || !price.isFinite()) continue;
    const decimals = info.decimals ?? NATIVE_TOKEN_DECIMALS;
    const value = new BigNumber(amount).times(price).div(new BigNumber(10).pow(decimals));
    total = total.plus(value);
  }
  return total.toFixed();
}

function toolError(message: string): string {
  return JSON.stringify({ error: message });
}
