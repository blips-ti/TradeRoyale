/* Base-unit string <-> display USD, and BE status -> FE bucket mapping. */

import type { GameStatus } from "./types";

export const USDC_DECIMALS = 6;

/** Base-unit string -> Number (safe for display-sized USDC amounts). */
export function baseUnitsToNumber(base: string, decimals = USDC_DECIMALS): number {
  if (!base) return 0;
  const neg = base.startsWith("-");
  const digits = (neg ? base.slice(1) : base).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals);
  const n = Number(`${whole}.${frac}`);
  return neg ? -n : n;
}

/** Base-unit USDC string -> "$1,234" (or "$1,234.56" with cents). */
export function formatUsd(base: string, decimals = USDC_DECIMALS, cents = false): string {
  const n = baseUnitsToNumber(base, decimals);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** Display USD (number) -> base-unit string. e.g. toBaseUnits(20) => "20000000". */
export function toBaseUnits(amountUsd: number, decimals = USDC_DECIMALS): string {
  const [whole, frac = ""] = String(amountUsd).split(".");
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  return `${BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0")}`;
}

/** Prize pool while a game is in lobby/live: players * entry (settlement value comes from BE later). */
export function livePoolBaseUnits(playerCount: number, entryAmount: string): string {
  return `${BigInt(playerCount) * BigInt(entryAmount || "0")}`;
}

/* ── status buckets the FE renders (Ongoing / Live / Ended) ──────────────────── */

export type FeBucket = "ongoing" | "live" | "ended";

export function bucketOf(status: GameStatus): FeBucket {
  if (status === "lobby") return "ongoing";
  if (status === "ended") return "ended";
  return "live"; // live | settling
}
