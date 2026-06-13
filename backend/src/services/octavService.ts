import { BigNumber } from "bignumber.js";

import { env } from "../env.js";
import { logger } from "../logger.js";

export interface NavResult {
  // USD net asset value as a decimal string (BigNumber-normalized; never a float).
  navUsd: string;
  raw: unknown;
}

export class MissingOctavCredentialsError extends Error {}
export class OctavError extends Error {}

// Raw Octav /v1/nav response (USD default): { nav, currency, conversionPrice }.
interface OctavNavResponse {
  nav?: number | string;
  currency?: string;
  conversionPrice?: number | string;
}

// One plain wallet token holding (assetByProtocols.wallet.chains[*].protocolPositions.WALLET.assets[]).
interface OctavAsset {
  symbol?: string;
  name?: string;
  value?: string;
  balance?: string;
  price?: string;
  contract?: string;
  chainKey?: string;
  imgSmall?: string;
  imgLarge?: string;
}
interface OctavChainPositions {
  protocolPositions?: { WALLET?: { assets?: OctavAsset[] } };
}
interface OctavPortfolioEntry {
  address?: string;
  networth?: string;
  assetByProtocols?: { wallet?: { chains?: Record<string, OctavChainPositions> } };
}

// A token the player holds, for the arena wallet panel.
export interface Holding {
  symbol: string;
  name: string;
  valueUsd: string;
  balance: string;
  priceUsd: string;
  contract: string;
  chain: string;
  image?: string;
}

export interface PortfolioResult {
  navUsd: string;
  holdings: Holding[];
  raw: unknown;
}

// Sole adapter for the Octav public NAV API (api.octav.fi/v1). Used at settlement as an
// INDEPENDENT cross-check of the on-chain final USDC; it is never the authoritative score.
export class OctavService {
  private static instance: OctavService;

  constructor(
    private readonly baseUrl: string = env.OCTAV_API_URL,
    private readonly apiKey: string | undefined = env.OCTAV_API_KEY,
  ) {}

  static getInstance(): OctavService {
    if (!OctavService.instance) {
      OctavService.instance = new OctavService();
    }
    return OctavService.instance;
  }

  // GET /v1/nav?addresses=<address> with Authorization: Bearer. Returns USD NAV as a string.
  async getNav(address: string): Promise<NavResult> {
    if (!this.apiKey) {
      throw new MissingOctavCredentialsError("OCTAV_API_KEY is not set");
    }
    const params = new URLSearchParams({ addresses: address });
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/nav?${params.toString()}`, {
        headers: { accept: "application/json", authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      logger.warn({ err: error, address }, "[octav] nav request failed");
      throw new OctavError("Octav NAV request failed");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OctavError(`Octav responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as OctavNavResponse;
    return { navUsd: this.normalizeNav(body.nav), raw: body };
  }

  // GET /v1/wallet?addresses=<address> — wallet token balances only (no DeFi positions). It
  // returns logos (imgSmall/imgLarge) by DEFAULT and REJECTS the /portfolio-style includeImages
  // param with a 400. Unlike /portfolio there is no ~1min cache, so it reflects the wallet's
  // current state immediately — used by the live sampler, the wallet-panel poll, and scoring.
  async getWallet(address: string): Promise<PortfolioResult> {
    if (!this.apiKey) {
      throw new MissingOctavCredentialsError("OCTAV_API_KEY is not set");
    }
    const params = new URLSearchParams({ addresses: address });
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/wallet?${params.toString()}`, {
        headers: { accept: "application/json", authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      logger.warn({ err: error, address }, "[octav] wallet request failed");
      throw new OctavError("Octav wallet request failed");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OctavError(`Octav responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as OctavPortfolioEntry[];
    const entry = Array.isArray(body) ? body[0] : undefined;
    return { navUsd: this.normalizeNav(entry?.networth), holdings: this.parseHoldings(entry), raw: body };
  }

  // Flatten the plain wallet tokens across chains, biggest USD value first. The /wallet response
  // carries thousands of zero-value spam tokens — drop anything without a positive USD value.
  private parseHoldings(entry: OctavPortfolioEntry | undefined): Holding[] {
    const chains = entry?.assetByProtocols?.wallet?.chains ?? {};
    const out: Holding[] = [];
    for (const [chainKey, chain] of Object.entries(chains)) {
      for (const asset of chain.protocolPositions?.WALLET?.assets ?? []) {
        if (!(Number(asset.value) > 0)) continue;
        out.push({
          symbol: asset.symbol ?? "",
          name: asset.name ?? "",
          valueUsd: asset.value ?? "0",
          balance: asset.balance ?? "0",
          priceUsd: asset.price ?? "0",
          contract: asset.contract ?? "",
          chain: asset.chainKey ?? chainKey,
          image: asset.imgSmall ?? asset.imgLarge,
        });
      }
    }
    return out.sort((a, b) => Number(b.valueUsd) - Number(a.valueUsd));
  }

  // nav arrives as a JSON number; keep it exact as a decimal string (no float retention).
  private normalizeNav(nav: number | string | undefined): string {
    if (nav === undefined || nav === "") return "0";
    const parsed = new BigNumber(nav);
    return parsed.isFinite() ? parsed.toFixed() : "0";
  }
}

export const octavService = OctavService.getInstance();
