import { describe, expect, it, vi } from 'vitest';

import type { Game, Player } from '../domain/types.js';
import type { LifiService } from '../services/lifiService.js';
import type { TradeExecutor } from '../services/tradeExecutor.js';
import type { TradeRepository } from '../repositories/tradeRepository.js';
import type { ViemReader } from '../services/viemClient.js';
import type { GameEventHub } from '../ws/gameEventHub.js';
import { type AgentToolContext, buildAgentTools, clampWaitSeconds, type ToolDeps } from './tools.js';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const game: Game = {
  id: 'g1',
  status: 'live',
  entryToken: USDC,
  entryAmount: '1000000',
  durationSec: 3600,
  maxPlayers: 10,
  createdAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 3_600_000).toISOString(),
};

const player: Player = {
  id: 'p1',
  gameId: 'g1',
  displayName: 'alice',
  unlinkAddress: 'unlink1',
  encMnemonic: 'enc',
  depositStatus: 'confirmed',
  createdAt: new Date().toISOString(),
  strategyPrompt: 'trade',
  privyWalletId: 'wallet-1',
  privyWalletAddress: '0xprivywallet0000000000000000000000000000',
  fundsStatus: 'released',
};

interface Mocks extends ToolDeps {
  appended: unknown[];
  broadcasts: Array<{ type: string; data: Record<string, unknown> }>;
}

function buildMocks(balance: string): Mocks {
  const appended: unknown[] = [];
  const broadcasts: Array<{ type: string; data: Record<string, unknown> }> = [];
  const executor = {
    executeSwap: vi.fn(async (_wallet, input: { fromToken: string; toToken: string; fromAmount: string }) => ({
      txHash: '0xtxhash',
      status: 'confirmed',
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      toAmountMin: '999000000000000',
      tool: 'uniswap',
    })),
    executeContractCall: vi.fn(async (_wallet, input: { fromToken: string; toToken: string; toAmount: string }) => ({
      txHash: '0xzaphash',
      status: 'confirmed',
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: '1000000',
      toAmount: '0',
      toAmountMin: '0',
      tool: 'custom',
    })),
  } as unknown as TradeExecutor;
  const lifi = {
    getQuote: vi.fn(async () => ({
      transactionRequest: { to: '0xr', data: '0xd', value: '0' },
      approvalAddress: '0xs',
      fromAmount: '1000000',
      toAmount: '1000000000000000',
      toAmountMin: '999000000000000',
      toolUsed: 'uniswap',
      fromTokenIsNative: false,
    })),
    getContractCallsQuote: vi.fn(async () => ({
      transactionRequest: { to: '0xr', data: '0xd', value: '0' },
      approvalAddress: '0xs',
      fromAmount: '1000000',
      toAmount: '0',
      toAmountMin: '0',
      toolUsed: 'custom',
      fromTokenIsNative: false,
    })),
    getTokens: vi.fn(async () => []),
    getPrices: vi.fn(async () => ({ [USDC]: '1' })),
    getTokenMeta: vi.fn(async () => ({ [USDC]: { priceUSD: '1', decimals: 6 } })),
  } as unknown as LifiService;
  const viem = {
    getErc20Balance: vi.fn(async () => balance),
    getNativeBalance: vi.fn(async () => balance),
    getErc20Balances: vi.fn(async () => ({ [USDC]: balance })),
  } as unknown as ViemReader;
  const trades = { append: vi.fn(async (trade: unknown) => void appended.push(trade)) } as unknown as TradeRepository;
  const hub = {
    broadcast: vi.fn((type: string, _gameId: string, data: Record<string, unknown>) => void broadcasts.push({ type, data })),
  } as unknown as GameEventHub;
  return { executor, lifi, viem, trades, hub, appended, broadcasts };
}

const PROTOCOL = '0x9999999999999999999999999999999999999999';

function context(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    game,
    player,
    touchedTokens: new Set<string>([USDC]),
    gameOwnedAddresses: new Set<string>([player.privyWalletAddress!.toLowerCase()]),
    secondsRemaining: () => 1800,
    waitState: {},
    ...overrides,
  };
}

async function runTool(tools: ReturnType<typeof buildAgentTools>, name: string, args: unknown): Promise<string> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  const result = await tool.run(args);
  return typeof result === 'string' ? result : JSON.stringify(result);
}

describe('buildAgentTools execute_swap validation', () => {
  it('rejects identical fromToken and toToken', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: USDC, fromAmount: '1' }));
    expect(out.error).toMatch(/must differ/);
    expect(mocks.executor.executeSwap).not.toHaveBeenCalled();
  });

  it('allows any token (no whitelist) but still rejects a non-positive amount', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '0' }));
    expect(out.error).toMatch(/positive base-unit/);
  });

  it('rejects a fromAmount greater than the erc20 wallet balance', async () => {
    const mocks = buildMocks('500');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '1000' }));
    expect(out.error).toMatch(/exceeds balance/);
    expect(mocks.executor.executeSwap).not.toHaveBeenCalled();
  });

  it('checks the native balance when fromToken is the native sentinel', async () => {
    const mocks = buildMocks('500');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: NATIVE, toToken: USDC, fromAmount: '1000' }));
    expect(mocks.viem.getNativeBalance).toHaveBeenCalled();
    expect(out.error).toMatch(/exceeds balance/);
  });

  it('still allows trading with little time left (no T-5min stop — trade to the buzzer)', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context({ secondsRemaining: () => 120 }), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '100' }));
    expect(out.txHash).toBe('0xtxhash');
    expect(mocks.executor.executeSwap).toHaveBeenCalledTimes(1);
  });

  it('rejects trading only after the game has ended (secondsRemaining <= 0)', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context({ secondsRemaining: () => 0 }), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '100' }));
    expect(out.error).toMatch(/the game has ended/);
    expect(mocks.executor.executeSwap).not.toHaveBeenCalled();
  });

  it('rejects when the game is not live', async () => {
    const mocks = buildMocks('1000000');
    const notLive = { ...game, status: 'lobby' as const };
    const tools = buildAgentTools(context({ game: notLive }), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '100' }));
    expect(out.error).toMatch(/not live/);
  });

  it('rejects when the player has no provisioned trading wallet', async () => {
    const mocks = buildMocks('1000000');
    const noWallet: Player = { ...player, privyWalletId: undefined, privyWalletAddress: undefined };
    const tools = buildAgentTools(context({ player: noWallet }), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '100' }));
    expect(out.error).toMatch(/No trading wallet/);
    expect(mocks.executor.executeSwap).not.toHaveBeenCalled();
  });

  it('executes, records the traded tokens as touched, persists with txHash, and broadcasts', async () => {
    const mocks = buildMocks('1000000');
    const ctx = context();
    const tools = buildAgentTools(ctx, mocks);
    const out = JSON.parse(await runTool(tools, 'execute_swap', { fromToken: USDC, toToken: WETH, fromAmount: '100' }));
    expect(out.txHash).toBe('0xtxhash');
    expect(mocks.executor.executeSwap).toHaveBeenCalledTimes(1);
    expect((mocks.appended[0] as { txHash: string }).txHash).toBe('0xtxhash');
    expect(ctx.touchedTokens.has(WETH)).toBe(true);
    const tradeEvent = mocks.broadcasts.find((event) => event.type === 'trade_executed');
    expect(tradeEvent?.data.txHash).toBe('0xtxhash');
  });
});

describe('buildAgentTools get_swap_quote', () => {
  it('returns a quote preview using the wallet address as fromAddress', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'get_swap_quote', { fromToken: USDC, toToken: WETH, fromAmount: '100' }));
    expect(out.toAmountMin).toBe('999000000000000');
    expect(mocks.lifi.getQuote).toHaveBeenCalledWith(expect.objectContaining({ fromAddress: player.privyWalletAddress }));
  });
});

describe('buildAgentTools get_portfolio', () => {
  it('reads erc20 balances of touched tokens plus native ETH and includes USD prices', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'get_portfolio', {}));
    expect(mocks.viem.getErc20Balances).toHaveBeenCalledWith([USDC], player.privyWalletAddress);
    expect(mocks.viem.getNativeBalance).toHaveBeenCalledWith(player.privyWalletAddress);
    expect(out.balances.native).toBe('1000000');
    expect(out.prices[USDC]).toBe('1');
    // 1_000_000 USDC base units (6 decimals) at $1 = exactly $1 (decimal-normalized, M1 fix).
    expect(out.totalUSD).toBe('1');
  });

  it('normalizes per-token decimals so an 18-decimal token is not summed raw against USDC', async () => {
    const mocks = buildMocks('1000000');
    // 1 WETH (1e18, 18 decimals) at $2000 plus 1 USDC at $1 -> $2001, not a raw-bigint sum.
    mocks.viem.getErc20Balances = vi.fn(async () => ({
      [USDC]: '1000000',
      [WETH]: '1000000000000000000',
    })) as unknown as ViemReader['getErc20Balances'];
    mocks.lifi.getTokenMeta = vi.fn(async () => ({
      [USDC]: { priceUSD: '1', decimals: 6 },
      [WETH]: { priceUSD: '2000', decimals: 18 },
    })) as unknown as LifiService['getTokenMeta'];
    mocks.viem.getNativeBalance = vi.fn(async () => '0') as unknown as ViemReader['getNativeBalance'];
    const tools = buildAgentTools(context({ touchedTokens: new Set([USDC, WETH]) }), mocks);
    const out = JSON.parse(await runTool(tools, 'get_portfolio', {}));
    expect(out.totalUSD).toBe('2001');
  });
});

function protocolArgs(overrides: Record<string, string> = {}) {
  return {
    fromToken: USDC,
    toToken: USDC,
    toAmount: '1000000',
    toContractAddress: PROTOCOL,
    toContractCallData: '0xd0e30db0',
    toContractGasLimit: '200000',
    description: 'deposit USDC into a lending protocol',
    ...overrides,
  };
}

describe('buildAgentTools execute_protocol_action', () => {
  it('rejects a contract address that is a game-owned wallet (wallet isolation)', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(
      await runTool(tools, 'execute_protocol_action', protocolArgs({ toContractAddress: player.privyWalletAddress! })),
    );
    expect(out.error).toMatch(/game-owned wallet/);
    expect(mocks.executor.executeContractCall).not.toHaveBeenCalled();
    expect(mocks.lifi.getContractCallsQuote).not.toHaveBeenCalled();
  });

  it('rejects approve() calldata in the agent leg (selector denylist — fund-drain guard)', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    // approve(address,uint256) selector 0x095ea7b3 — would let the agent approve an attacker.
    const out = JSON.parse(await runTool(tools, 'execute_protocol_action', protocolArgs({ toContractCallData: '0x095ea7b3' })));
    expect(out.error).toMatch(/token approval\/transfer/);
    expect(mocks.lifi.getContractCallsQuote).not.toHaveBeenCalled();
  });

  it('rejects transfer() calldata in the agent leg (selector denylist)', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    // transfer(address,uint256) selector 0xa9059cbb — would move tokens off the wallet.
    const out = JSON.parse(await runTool(tools, 'execute_protocol_action', protocolArgs({ toContractCallData: '0xa9059cbb' })));
    expect(out.error).toMatch(/token approval\/transfer/);
  });

  it('rejects non-hex calldata', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_protocol_action', protocolArgs({ toContractCallData: 'deposit()' })));
    expect(out.error).toMatch(/0x-prefixed hex/);
  });

  it('rejects when the LI.FI-computed input exceeds the wallet balance', async () => {
    const mocks = buildMocks('500');
    const tools = buildAgentTools(context(), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_protocol_action', protocolArgs()));
    expect(out.error).toMatch(/Computed input 1000000 .* exceeds balance 500/);
    expect(mocks.executor.executeContractCall).not.toHaveBeenCalled();
  });

  it('rejects only after the game has ended (secondsRemaining <= 0), not at low time', async () => {
    const mocks = buildMocks('1000000');
    const tools = buildAgentTools(context({ secondsRemaining: () => 0 }), mocks);
    const out = JSON.parse(await runTool(tools, 'execute_protocol_action', protocolArgs()));
    expect(out.error).toMatch(/the game has ended/);
  });

  it('executes, persists a contract_call trade with description, and surfaces the estimate verbatim', async () => {
    const mocks = buildMocks('1000000');
    const ctx = context();
    const tools = buildAgentTools(ctx, mocks);
    const out = JSON.parse(await runTool(tools, 'execute_protocol_action', protocolArgs({ toToken: WETH })));
    expect(out.txHash).toBe('0xzaphash');
    expect(out.toAmount).toBe('0');
    expect(out.toAmountMin).toBe('0');
    expect(mocks.executor.executeContractCall).toHaveBeenCalledTimes(1);
    const trade = mocks.appended[0] as { kind: string; description: string; txHash: string };
    expect(trade.kind).toBe('contract_call');
    expect(trade.description).toBe('deposit USDC into a lending protocol');
    expect(ctx.touchedTokens.has(WETH)).toBe(true);
    const event = mocks.broadcasts.find((broadcast) => broadcast.type === 'trade_executed');
    expect(event?.data.kind).toBe('contract_call');
    expect(event?.data.txHash).toBe('0xzaphash');
  });
});

describe('buildAgentTools wait tool', () => {
  it('records the requested wait seconds into waitState and ends the turn', async () => {
    const mocks = buildMocks('1000000');
    const ctx = context();
    const tools = buildAgentTools(ctx, mocks);
    const out = JSON.parse(await runTool(tools, 'wait', { seconds: 45 }));
    expect(out.ok).toBe(true);
    expect(ctx.waitState.requestedSeconds).toBe(45);
  });

  it('rejects a negative wait', async () => {
    const mocks = buildMocks('1000000');
    const ctx = context();
    const tools = buildAgentTools(ctx, mocks);
    const out = JSON.parse(await runTool(tools, 'wait', { seconds: -5 }));
    expect(out.error).toMatch(/non-negative/);
    expect(ctx.waitState.requestedSeconds).toBeUndefined();
  });
});

describe('clampWaitSeconds', () => {
  it('raises a below-floor request up to the floor', () => {
    expect(clampWaitSeconds(0, 10, 3600)).toBe(10);
  });

  it('caps a request above the time remaining', () => {
    expect(clampWaitSeconds(600, 10, 120)).toBe(120);
  });

  it('passes through an in-range request', () => {
    expect(clampWaitSeconds(30, 10, 3600)).toBe(30);
  });

  it('returns 0 when no time remains', () => {
    expect(clampWaitSeconds(30, 10, 0)).toBe(0);
  });
});
