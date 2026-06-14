import { BigNumber } from "bignumber.js";
import { encodeFunctionData, erc20Abi } from "viem";

import { env } from "../env.js";
import { logger } from "../logger.js";
import { isNativeToken } from "./lifiService.js";
import { privyService, PrivyService } from "./privyService.js";
import { type SwapWalletContext } from "./tradeExecutor.js";
import { viemReader, ViemReader } from "./viemClient.js";

// LI.FI COMPOSER execution layer.
//
// Composer (https://composer.li.quest) compiles a multi-step DeFi Flow — swaps, deposits,
// staking, arbitrary contract calls — into ONE self-custodial transaction, passing each step's
// output into the next (dynamic calldata injection) and simulating the whole path before it is
// signed. This module is the autonomous agent's execution layer over Composer: the agent
// expresses a high-level intent, we build a Composer Flow (eDSL), compile it to a single
// transactionRequest, and execute it from the player's Privy wallet with sponsored gas.

const COMPOSER_BASE_URL = "https://composer.li.quest";
const DEFAULT_SLIPPAGE = 0.03;
// Composer returns hex-encoded `value`; Privy requires a 0x-prefixed value (never bare "0").
const ZERO_VALUE: `0x${string}` = "0x0";

// ── Composer Flow document (eDSL) ────────────────────────────────────────────────────────────

// An ERC-20 (or native) asset referenced by a Flow input or node.
interface FlowResource {
  kind: "erc20" | "native";
  token?: string;
  chainId: number;
}

// A named input resource the Flow consumes (e.g. the amount of fromToken to spend).
interface FlowInput {
  name: string;
  resource: FlowResource;
}

// One node in the Flow DAG. `op` is a Composer operation (e.g. "lifi.swap", "protocol.deposit");
// `bind` wires a prior node's / input's output into this node's args via `$ref`; `config` carries
// op-specific params (target token, slippage, target contract + calldata, …).
interface FlowNode {
  id: string;
  op: string;
  bind?: Record<string, { $ref: string }>;
  config?: Record<string, unknown>;
}

// A Composer Flow — the multi-step plan that compiles down to a single transaction.
export interface ComposerFlow {
  version: number;
  id: string;
  chainId: number;
  inputs: FlowInput[];
  nodes: FlowNode[];
}

// ── Compile (runtime) parameters + result ────────────────────────────────────────────────────

// How a Flow input is materialised at compile time — i.e. where the spent funds come from.
type InputMaterialiser =
  | { kind: "directDeposit"; amount: string }
  | { kind: "permit2"; amount: string }
  | { kind: "transferFrom"; amount: string };

export interface ComposeRuntime {
  // Address that will sign + send the compiled transaction (the player's Privy wallet).
  signer: string;
  // Materialiser per Flow input name.
  inputs: Record<string, InputMaterialiser>;
  // Where any leftover / produced funds are swept after the Flow runs.
  sweepTo: string;
}

interface ComposerApproval {
  token: string;
  spender: string;
  amount: string;
}

// The compiled output of POST /compose: a single ready-to-sign transaction plus the ERC-20
// approvals it needs and the simulated resources it produces.
export interface ComposeCompileResult {
  status: "success" | "partial";
  userProxy: string;
  transactionRequest: { to: string; data: string; value: string; gasLimit?: string };
  approvals: ComposerApproval[];
  producedResources: Array<{ token: string; amount: string }>;
}

export interface SwapAndDepositParams {
  chainId: number;
  // Token the player spends.
  fromToken: string;
  // Token the protocol takes as its deposit asset (what the swap targets).
  depositToken: string;
  // The protocol position token minted by the deposit (e.g. a vault / receipt token).
  protocolToken: string;
  // Base-unit amount of fromToken to spend.
  amountIn: string;
  slippage?: number;
}

export class LifiComposerService {
  private static instance: LifiComposerService;

  constructor(
    private readonly privy: PrivyService = privyService,
    private readonly viem: ViemReader = viemReader,
    private readonly baseUrl: string = COMPOSER_BASE_URL,
    private readonly apiKey: string | undefined = env.LIFI_API_KEY,
  ) {}

  static getInstance(): LifiComposerService {
    if (!LifiComposerService.instance) {
      LifiComposerService.instance = new LifiComposerService();
    }
    return LifiComposerService.instance;
  }

  // Build the canonical Composer multi-step Flow: take `amountIn` of fromToken, swap it to the
  // protocol's deposit asset, then deposit into the protocol — output of the swap node is bound
  // into the deposit node, so Composer chains them into ONE transaction.
  buildSwapAndDepositFlow(params: SwapAndDepositParams): ComposerFlow {
    return {
      version: 1,
      id: `swap-and-deposit-${params.fromToken}-${params.protocolToken}`,
      chainId: params.chainId,
      inputs: [
        {
          name: "amountIn",
          resource: { kind: "erc20", token: params.fromToken, chainId: params.chainId },
        },
      ],
      nodes: [
        {
          id: "swap",
          op: "lifi.swap",
          bind: { amountIn: { $ref: "input.amountIn" } },
          config: {
            resourceOut: { kind: "erc20", token: params.depositToken, chainId: params.chainId },
            slippage: params.slippage ?? DEFAULT_SLIPPAGE,
          },
        },
        {
          id: "deposit",
          op: "protocol.deposit",
          // Dynamic injection: the swap's realised output feeds the deposit amount.
          bind: { amountIn: { $ref: "node.swap.amountOut" } },
          config: { protocolToken: params.protocolToken },
        },
      ],
    };
  }

  // Compile any Flow into a single signable transaction via POST /compose.
  async compose(flow: ComposerFlow, runtime: ComposeRuntime): Promise<ComposeCompileResult> {
    return this.request<ComposeCompileResult>("/compose", JSON.stringify({ flow, ...runtime }));
  }

  // Intent → compiled transaction: build a swap→deposit Flow and compile it for the given wallet,
  // materialising the input from the wallet's own balance and sweeping leftovers back to it.
  async composeSwapAndDeposit(
    wallet: SwapWalletContext,
    params: SwapAndDepositParams,
  ): Promise<ComposeCompileResult> {
    const flow = this.buildSwapAndDepositFlow(params);
    return this.compose(flow, {
      signer: wallet.privyWalletAddress,
      inputs: { amountIn: { kind: "directDeposit", amount: params.amountIn } },
      sweepTo: wallet.privyWalletAddress,
    });
  }

  // Execute a compiled Composer transaction from the player's Privy wallet: clear every ERC-20
  // approval Composer asked for, then send the single composed transactionRequest with sponsored
  // gas and confirm it on-chain.
  async executeComposed(
    wallet: SwapWalletContext,
    result: ComposeCompileResult,
  ): Promise<{ txHash: string; status: string }> {
    for (const approval of result.approvals) {
      await this.ensureAllowance(wallet, approval.token, approval.spender, approval.amount);
    }
    const txHash = await this.privy.sendTransaction(
      wallet.privyWalletId,
      {
        to: result.transactionRequest.to,
        data: result.transactionRequest.data,
        value: result.transactionRequest.value || ZERO_VALUE,
      },
      { sponsor: true },
    );
    await this.viem.waitForReceipt(txHash);
    logger.info({ walletId: wallet.privyWalletId, txHash, userProxy: result.userProxy }, "[composer] flow executed");
    return { txHash, status: "confirmed" };
  }

  // Approve the Composer proxy/router only when the current allowance is short; skipped for
  // native sources (nothing to approve).
  private async ensureAllowance(
    wallet: SwapWalletContext,
    token: string,
    spender: string,
    amount: string,
  ): Promise<void> {
    if (isNativeToken(token)) return;
    const allowance = await this.viem.getErc20Allowance(token, wallet.privyWalletAddress, spender);
    if (new BigNumber(allowance).gte(amount)) return;
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender as `0x${string}`, BigInt(new BigNumber(amount).toFixed(0))],
    });
    const approveHash = await this.privy.sendTransaction(
      wallet.privyWalletId,
      { to: token, data: approveData, value: "0" },
      { sponsor: true },
    );
    await this.viem.waitForReceipt(approveHash);
  }

  private async request<T>(path: string, body: string): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    // The LI.FI API is open; an api key only raises rate limits.
    if (this.apiKey) headers["x-lifi-api-key"] = this.apiKey;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { method: "POST", headers, body });
    } catch (error) {
      logger.warn({ err: error, path }, "[composer] request failed");
      throw new Error("LI.FI Composer request failed");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`LI.FI Composer responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    return response.json() as Promise<T>;
  }
}

export const lifiComposerService = LifiComposerService.getInstance();
