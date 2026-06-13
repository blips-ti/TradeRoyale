import { BigNumber } from "bignumber.js";

import { env } from "../env.js";
import { logger } from "../logger.js";

const LIFI_BASE_URL = "https://li.quest/v1";
const BPS_DENOMINATOR = 10_000;
// Auto mode: LI.FI's omit-default is a flat 0.5%/step (too tight for illiquid tokens), so we send a
// generous buffer and let maxPriceImpact + toAmountMin bound the real risk instead of a fixed cap.
const AUTO_MODE_SLIPPAGE_DECIMAL = "0.05";

// LI.FI native-token sentinel addresses (both EVM conventions). A `fromToken` matching one of
// these means the swap spends the chain's native gas token, so the tx carries a non-zero value.
export const NATIVE_TOKEN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
] as const;

// Native gas token (ETH on Base) is 18 decimals; the LI.FI token list only covers erc20s.
export const NATIVE_TOKEN_DECIMALS = 18;

export function isNativeToken(token: string): boolean {
  return (NATIVE_TOKEN_ADDRESSES as readonly string[]).includes(token.toLowerCase());
}

export interface TokenMeta {
  priceUSD: string;
  decimals: number;
}

export interface QuoteRequest {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
}

// A single same-chain contract interaction the agent wants to perform (deposit/stake/zap).
// `toAmount` is the DESIRED output the call needs; LI.FI computes the `fromAmount` to supply.
export interface ContractCallsQuoteRequest {
  fromToken: string;
  toToken: string;
  toAmount: string;
  fromAddress: string;
  toContractAddress: string;
  toContractCallData: string;
  toContractGasLimit: string;
}

export interface SwapQuote {
  // The exact transaction LI.FI built; we execute it verbatim (never model-supplied calldata).
  transactionRequest: { to: string; data: string; value: string };
  approvalAddress: string;
  // LI.FI-computed input the wallet must spend. For contractCalls the API derives this from
  // the requested `toAmount`, so it is the balance the player actually needs.
  fromAmount: string;
  toAmount: string;
  // May be "0" for contract calls (arbitrary-call output is the protocol's accounting, not
  // LI.FI's) — surface it but do NOT treat 0 as an error for that path.
  toAmountMin: string;
  toolUsed: string;
  fromTokenIsNative: boolean;
}

export interface TradeableToken {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  priceUSD: string;
}

export class LifiQuoteError extends Error {}

// Raw LI.FI shapes (subset). We never trust these beyond the fields we read.
interface LifiTransactionRequest {
  to?: string;
  data?: string;
  value?: string;
}

interface LifiEstimate {
  approvalAddress?: string;
  fromAmount?: string;
  toAmount?: string;
  toAmountMin?: string;
}

interface LifiAction {
  fromChainId?: number;
  toChainId?: number;
}

interface LifiQuoteResponse {
  tool?: string;
  transactionRequest?: LifiTransactionRequest;
  estimate?: LifiEstimate;
  action?: LifiAction;
}

interface LifiToken {
  address?: string;
  symbol?: string;
  decimals?: number;
  name?: string;
  priceUSD?: string;
}

interface LifiTokensResponse {
  tokens?: Record<string, LifiToken[]>;
}

// REST adapter for the LI.FI aggregator (li.quest/v1). Base-only (same-chain on env.CHAIN_ID),
// but ANY token LI.FI can quote — there is no hard token whitelist. The backend re-quotes
// server-side and executes LI.FI's own transactionRequest; the agent only expresses intent.
export class LifiService {
  private static instance: LifiService;

  constructor(
    private readonly chainId: number = env.CHAIN_ID,
    private readonly seedTokens: string[] = env.TRADEABLE_TOKENS,
    private readonly maxSlippageBps: number | "auto" = env.MAX_SLIPPAGE_BPS,
    private readonly apiKey: string | undefined = env.LIFI_API_KEY,
    private readonly maxPriceImpact: number = env.MAX_PRICE_IMPACT,
  ) {}

  static getInstance(): LifiService {
    if (!LifiService.instance) {
      LifiService.instance = new LifiService();
    }
    return LifiService.instance;
  }

  // Same-chain quote on env.CHAIN_ID (fromChain == toChain). Bridging is out of scope.
  async getQuote(request: QuoteRequest): Promise<SwapQuote> {
    const params = new URLSearchParams({
      fromChain: String(this.chainId),
      toChain: String(this.chainId),
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAmount: request.fromAmount,
      fromAddress: request.fromAddress,
      slippage: this.slippageDecimal(),
    });
    // Auto mode bounds risk with maxPriceImpact (decimal) instead of a fixed bps reject.
    if (this.isAutoMode()) params.set("maxPriceImpact", String(this.maxPriceImpact));
    const body = await this.fetchJson<LifiQuoteResponse>(`/quote?${params.toString()}`);
    return this.toSwapQuote(body, request);
  }

  // Same-chain contract interaction (deposit/stake/zap) on env.CHAIN_ID via the BETA
  // /v1/quote/contractCalls endpoint. The request gives the DESIRED `toAmount`; LI.FI returns
  // the computed `fromAmount` plus a standard quote object (transactionRequest + estimate).
  // Output accounting for arbitrary calls is the protocol's, so toAmount/toAmountMin may be
  // "0" and we do NOT apply the swap slippage gate here.
  async getContractCallsQuote(request: ContractCallsQuoteRequest): Promise<SwapQuote> {
    const payload = {
      fromChain: String(this.chainId),
      toChain: String(this.chainId),
      fromToken: request.fromToken,
      toToken: request.toToken,
      fromAddress: request.fromAddress,
      toAmount: request.toAmount,
      slippage: this.slippageDecimal(),
      // Auto mode bounds risk with maxPriceImpact instead of a fixed bps cap; omitted when numeric.
      ...(this.isAutoMode() ? { maxPriceImpact: this.maxPriceImpact } : {}),
      contractCalls: [
        {
          fromAmount: request.toAmount,
          fromTokenAddress: request.toToken,
          toContractAddress: request.toContractAddress,
          toContractCallData: request.toContractCallData,
          toContractGasLimit: request.toContractGasLimit,
        },
      ],
    };
    const body = await this.postJson<LifiQuoteResponse>("/quote/contractCalls", payload);
    return this.toContractCallQuote(body, request);
  }

  // Seed token metadata for the Base chain — display/portfolio-seed only, NOT a trade
  // whitelist (the agent may trade any token LI.FI can quote on Base).
  async getTokens(): Promise<TradeableToken[]> {
    const params = new URLSearchParams({ chains: String(this.chainId) });
    const body = await this.fetchJson<LifiTokensResponse>(`/tokens?${params.toString()}`);
    const chainTokens = body.tokens?.[String(this.chainId)] ?? [];
    const wanted = new Set(this.seedTokens);
    const matched = chainTokens
      .filter((token) => token.address && wanted.has(token.address.toLowerCase()))
      .map((token) => this.toTradeableToken(token));
    return matched.filter((token): token is TradeableToken => token !== null);
  }

  // USD prices keyed by lowercased address for a set of Base token addresses.
  async getPrices(tokens: string[]): Promise<Record<string, string>> {
    const meta = await this.getTokenMeta(tokens);
    return Object.fromEntries(Object.entries(meta).map(([address, info]) => [address, info.priceUSD]));
  }

  // priceUSD + decimals keyed by lowercased address, for USD valuation with correct decimal
  // scaling. The native sentinel is injected with 18 decimals (LI.FI's token list is erc20).
  async getTokenMeta(tokens: string[]): Promise<Record<string, TokenMeta>> {
    const params = new URLSearchParams({ chains: String(this.chainId) });
    const body = await this.fetchJson<LifiTokensResponse>(`/tokens?${params.toString()}`);
    const chainTokens = body.tokens?.[String(this.chainId)] ?? [];
    const wanted = new Set(tokens.map((token) => token.toLowerCase()));
    const entries = chainTokens
      .filter((token) => token.address && wanted.has(token.address.toLowerCase()))
      .map((token): [string, TokenMeta] => [
        token.address!.toLowerCase(),
        { priceUSD: token.priceUSD ?? "0", decimals: token.decimals ?? NATIVE_TOKEN_DECIMALS },
      ]);
    return Object.fromEntries(entries);
  }

  private toSwapQuote(body: LifiQuoteResponse, request: QuoteRequest): SwapQuote {
    const tx = body.transactionRequest;
    const estimate = body.estimate;
    if (!tx?.to || !tx.data || !estimate?.approvalAddress || !estimate.toAmount || !estimate.toAmountMin) {
      throw new LifiQuoteError("LI.FI quote response is missing required fields");
    }
    const fromTokenIsNative = isNativeToken(request.fromToken);
    const value = this.resolveValue(tx.value, fromTokenIsNative);
    // Auto mode skips the fixed-bps reject (maxPriceImpact + toAmountMin guard instead); a numeric
    // cap keeps the legacy hard rejection. toAmountMin still drives the executed minimum either way.
    const cap = this.maxSlippageBps;
    if (cap !== "auto") this.assertSlippageWithinBound(estimate.toAmount, estimate.toAmountMin, cap);
    return {
      transactionRequest: { to: tx.to, data: tx.data, value },
      approvalAddress: estimate.approvalAddress,
      fromAmount: estimate.fromAmount ?? request.fromAmount,
      toAmount: estimate.toAmount,
      toAmountMin: estimate.toAmountMin,
      toolUsed: body.tool ?? "unknown",
      fromTokenIsNative,
    };
  }

  private toContractCallQuote(body: LifiQuoteResponse, request: ContractCallsQuoteRequest): SwapQuote {
    const tx = body.transactionRequest;
    const estimate = body.estimate;
    // fromAmount (the LI.FI-computed input) is required: a missing value must NOT fall back to
    // "0", or the balance gate would pass on 0 and approve(0)/spend(0) → revert or garbage.
    if (!tx?.to || !tx.data || !estimate?.approvalAddress || !estimate.fromAmount) {
      throw new LifiQuoteError("LI.FI contractCalls response is missing required fields");
    }
    this.assertSameChain(body.action);
    const fromTokenIsNative = isNativeToken(request.fromToken);
    const value = this.resolveValue(tx.value, fromTokenIsNative);
    // No slippage gate and no toAmountMin>0 requirement: arbitrary-call output is the
    // protocol's accounting. Surface the estimate fields verbatim for the agent to judge.
    return {
      transactionRequest: { to: tx.to, data: tx.data, value },
      approvalAddress: estimate.approvalAddress,
      fromAmount: estimate.fromAmount,
      toAmount: estimate.toAmount ?? "0",
      toAmountMin: estimate.toAmountMin ?? "0",
      toolUsed: body.tool ?? "custom",
      fromTokenIsNative,
    };
  }

  // Defensive: the response must echo our same-chain request. Bridging is out of scope, so a
  // fromChainId != toChainId (or either != env.CHAIN_ID) is rejected rather than executed.
  private assertSameChain(action: LifiAction | undefined): void {
    if (!action) return;
    const { fromChainId, toChainId } = action;
    if (fromChainId !== undefined && fromChainId !== this.chainId) {
      throw new LifiQuoteError(`Quote fromChainId ${fromChainId} is not the Base chain ${this.chainId}`);
    }
    if (toChainId !== undefined && toChainId !== this.chainId) {
      throw new LifiQuoteError(`Quote toChainId ${toChainId} is not the Base chain ${this.chainId}`);
    }
  }

  // Native fromToken: a non-zero value is expected and we keep LI.FI's exact value (LI.FI
  // returns hex; we normalize to a base-unit decimal string for transport). ERC-20 fromToken:
  // value must be 0 (spending happens via approve/transferFrom in the calldata).
  private resolveValue(rawValue: string | undefined, fromTokenIsNative: boolean): string {
    const parsed = this.parseValue(rawValue);
    if (!fromTokenIsNative) {
      if (!parsed.isZero()) {
        throw new LifiQuoteError("ERC-20 quote returned a non-zero native value");
      }
      return "0";
    }
    if (parsed.isZero()) {
      throw new LifiQuoteError("Native-token quote returned a zero value");
    }
    return parsed.toFixed(0);
  }

  // LI.FI's tx value may be 0x-hex or decimal; parse both into a BigNumber.
  private parseValue(rawValue: string | undefined): BigNumber {
    if (!rawValue) return new BigNumber(0);
    return rawValue.startsWith("0x") ? new BigNumber(rawValue.slice(2) || "0", 16) : new BigNumber(rawValue);
  }

  private assertSlippageWithinBound(toAmount: string, toAmountMin: string, bps: number): void {
    const expected = new BigNumber(toAmount);
    const floor = new BigNumber(toAmountMin);
    if (expected.isZero()) {
      throw new LifiQuoteError("Quote toAmount is zero");
    }
    const maxDrop = expected.times(bps).div(BPS_DENOMINATOR);
    if (expected.minus(floor).gt(maxDrop)) {
      throw new LifiQuoteError(
        `Quote slippage exceeds ${bps} bps (toAmount ${toAmount}, toAmountMin ${toAmountMin})`,
      );
    }
  }

  private toTradeableToken(token: LifiToken): TradeableToken | null {
    if (!token.address || !token.symbol || token.decimals === undefined) return null;
    return {
      address: token.address.toLowerCase(),
      symbol: token.symbol,
      decimals: token.decimals,
      name: token.name ?? token.symbol,
      priceUSD: token.priceUSD ?? "0",
    };
  }

  private isAutoMode(): boolean {
    return this.maxSlippageBps === "auto";
  }

  // Auto mode sends a generous fixed buffer (real risk bounded by maxPriceImpact + toAmountMin);
  // numeric mode converts the configured bps cap to LI.FI's decimal slippage form.
  private slippageDecimal(): string {
    if (this.maxSlippageBps === "auto") return AUTO_MODE_SLIPPAGE_DECIMAL;
    return (this.maxSlippageBps / Number(BPS_DENOMINATOR)).toString();
  }

  private async fetchJson<T>(path: string): Promise<T> {
    return this.request<T>(path, undefined);
  }

  private async postJson<T>(path: string, payload: unknown): Promise<T> {
    return this.request<T>(path, JSON.stringify(payload));
  }

  private async request<T>(path: string, body: string | undefined): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.apiKey) headers["x-lifi-api-key"] = this.apiKey;
    let response: Response;
    try {
      response = await fetch(`${LIFI_BASE_URL}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body,
      });
    } catch (error) {
      logger.warn({ err: error, path }, "[lifi] request failed");
      throw new LifiQuoteError("LI.FI request failed");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new LifiQuoteError(`LI.FI responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }
}

export const lifiService = LifiService.getInstance();
