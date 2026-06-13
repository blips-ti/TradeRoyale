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

// Octav /v1/portfolio returns an array (one entry per address); `networth` is the total USD value.
interface OctavPortfolioEntry {
  address?: string;
  networth?: string;
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

  // GET /v1/portfolio?addresses=<address>&waitForSync=true — forces a fresh sync and returns
  // the address's total USD net worth. Used by the live NAV sampler (the arena chart/standings).
  async getPortfolioNav(address: string): Promise<NavResult> {
    if (!this.apiKey) {
      throw new MissingOctavCredentialsError("OCTAV_API_KEY is not set");
    }
    const params = new URLSearchParams({ addresses: address, waitForSync: "true" });
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/portfolio?${params.toString()}`, {
        headers: { accept: "application/json", authorization: `Bearer ${this.apiKey}` },
      });
    } catch (error) {
      logger.warn({ err: error, address }, "[octav] portfolio request failed");
      throw new OctavError("Octav portfolio request failed");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OctavError(`Octav responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as OctavPortfolioEntry[];
    const entry = Array.isArray(body) ? body[0] : undefined;
    return { navUsd: this.normalizeNav(entry?.networth), raw: body };
  }

  // nav arrives as a JSON number; keep it exact as a decimal string (no float retention).
  private normalizeNav(nav: number | string | undefined): string {
    if (nav === undefined || nav === "") return "0";
    const parsed = new BigNumber(nav);
    return parsed.isFinite() ? parsed.toFixed() : "0";
  }
}

export const octavService = OctavService.getInstance();
