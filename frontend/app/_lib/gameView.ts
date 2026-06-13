/* Adapts a backend Game (+ player count) into the card view model the dashboard renders.
   The BE has no display name/tags yet, so we derive a stable name from the gameId. */

import type { Game } from "./types";
import { baseUnitsToNumber, bucketOf, type FeBucket } from "./units";

export type MatchView = {
  id: string;
  name: string;
  tags: string[];
  bucket: FeBucket; // ongoing | live | ended
  entryUsd: number;
  prizePoolUsd: number;
  playerCount: number;
  maxPlayers: number;
  durationMin: number; // match length in minutes
  endsAt?: number; // ms, present once live
};

const ADJ = ["Crimson", "Neon", "Golden", "Shadow", "Hyper", "Frost", "Solar", "Onyx", "Turbo", "Apex", "Void", "Wild"];
const NOUN = ["Vault", "Pit", "Royale", "Gauntlet", "Derby", "Clash", "Rumble", "Circuit", "Bracket", "Skirmish", "Bowl", "Arena"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function gameName(id: string): string {
  const h = hash(id);
  return `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
}

export function bannerSeedFor(id: string): number {
  return hash(id) >>> 16;
}

export function gameToView(game: Game, playerCount: number): MatchView {
  const entryUsd = baseUnitsToNumber(game.entryAmount);
  return {
    id: game.id,
    name: gameName(game.id),
    tags: ["crypto"],
    bucket: bucketOf(game.status),
    entryUsd,
    prizePoolUsd: entryUsd * playerCount,
    playerCount,
    maxPlayers: game.maxPlayers,
    durationMin: Math.round(game.durationSec / 60),
    endsAt: game.endsAt ? Date.parse(game.endsAt) : undefined,
  };
}
