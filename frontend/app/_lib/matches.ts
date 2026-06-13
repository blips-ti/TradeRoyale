import { handleFor } from "./format";

export type MatchStatus = "upcoming" | "live" | "ended";

export type MatchBase = {
  id: string;
  name: string;
  description: string;
  entryFeeUsd: number;
  maxPlayers: number;
  playersJoined: number;
  /** seconds from the session anchor that the match starts */
  startOffsetSec: number;
  durationSec: number;
  bannerSeed: number;
  tags: string[];
  assetClass: string;
};

export type Match = MatchBase & {
  startsAt: number;
  endsAt: number;
  status: MatchStatus;
  prizePoolUsd: number;
  spotsLeft: number;
  onlineNow: number;
};

/* ── Mocked matches ─────────────────────────────────────────────────────────
   Times are relative to a per-session anchor (set on first load) so countdowns
   stay live. Genesis starts soon so the full join → setup → live flow is demoable.
   ──────────────────────────────────────────────────────────────────────────── */
export const MATCHES: MatchBase[] = [
  {
    id: "genesis-arena",
    name: "Genesis Arena",
    description:
      "The flagship opener. 30 minutes, winner takes the whole pool. Pure agent-vs-agent combat across crypto majors — no mercy, no second place.",
    entryFeeUsd: 20,
    maxPlayers: 50,
    playersJoined: 38,
    startOffsetSec: 120,
    durationSec: 1800,
    bannerSeed: 1,
    tags: ["crypto", "majors"],
    assetClass: "Crypto",
  },
  {
    id: "crash-derby",
    name: "Crash Derby",
    description:
      "High-volatility shoot-out on the most degenerate pairs. Diamond hands only. Currently in progress — registration is closed.",
    entryFeeUsd: 50,
    maxPlayers: 100,
    playersJoined: 91,
    startOffsetSec: -600,
    durationSec: 1800,
    bannerSeed: 2,
    tags: ["crypto", "memes"],
    assetClass: "Crypto",
  },
  {
    id: "rookie-rumble",
    name: "Rookie Rumble",
    description:
      "Low buy-in, big bracket. The perfect arena to blood a new agent before the whales show up.",
    entryFeeUsd: 5,
    maxPlayers: 500,
    playersJoined: 274,
    startOffsetSec: 2700,
    durationSec: 3600,
    bannerSeed: 3,
    tags: ["crypto", "bonds"],
    assetClass: "Mixed",
  },
  {
    id: "whale-room",
    name: "Whale Room",
    description:
      "Invite-energy high-roller table. Steep buy-in, brutal field, life-changing pot. Only 20 seats.",
    entryFeeUsd: 500,
    maxPlayers: 20,
    playersJoined: 12,
    startOffsetSec: 21600,
    durationSec: 7200,
    bannerSeed: 4,
    tags: ["crypto", "fx"],
    assetClass: "Crypto",
  },
];

export function resolveMatch(base: MatchBase, anchorAt: number, now: number): Match {
  const startsAt = anchorAt + base.startOffsetSec * 1000;
  const endsAt = startsAt + base.durationSec * 1000;
  const status: MatchStatus = now < startsAt ? "upcoming" : now < endsAt ? "live" : "ended";
  // small deterministic-ish jitter on online count
  const jitter = Math.round(Math.sin(now / 4000 + base.bannerSeed) * 6);
  return {
    ...base,
    startsAt,
    endsAt,
    status,
    prizePoolUsd: base.playersJoined * base.entryFeeUsd,
    spotsLeft: Math.max(base.maxPlayers - base.playersJoined, 0),
    onlineNow: Math.max(base.playersJoined - 4 + jitter, 1),
  };
}

export function resolveAll(anchorAt: number, now: number): Match[] {
  return MATCHES.map((m) => resolveMatch(m, anchorAt, now));
}

export function getMatchBase(id: string) {
  return MATCHES.find((m) => m.id === id) ?? null;
}

/** Deterministic mock opponents for a match (used in detail + live chart). */
export function opponentsFor(matchId: string, count: number): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `${matchId}-${i}`;
    out.push({ id: seed, name: handleFor(seed) });
  }
  return out;
}
