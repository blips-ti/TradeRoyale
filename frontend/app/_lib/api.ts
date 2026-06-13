/* Typed REST client for the trade-royal-backend. */

import type {
  AchievementState,
  ActivePlayerResponse,
  Game,
  GameWithPlayers,
  JoinResult,
  PlayerDetail,
  PublicPlayer,
  Settlement,
  Trade,
  UnlockResult,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error || `${res.status} ${res.statusText}`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listGames: (status: "open" | "live" | "all" = "all") =>
    req<{ games: Game[] }>(`/games?status=${status}`).then((r) => r.games),

  getGame: (gameId: string) => req<GameWithPlayers>(`/games/${gameId}`),

  // Recover the user's active game + player by wallet address (reconnect / new device).
  getActive: (ownerAddress: string) => req<ActivePlayerResponse>(`/games/me/${ownerAddress}`),

  joinGame: (gameId: string, body: { displayName: string; strategyPrompt?: string; ownerAddress?: string }) =>
    req<JoinResult>(`/games/${gameId}/join`, { method: "POST", body: JSON.stringify(body) }),

  setStrategy: (gameId: string, playerId: string, strategyPrompt: string) =>
    req<{ player: PublicPlayer }>(`/games/${gameId}/players/${playerId}/strategy`, {
      method: "PUT",
      body: JSON.stringify({ strategyPrompt }),
    }),

  getPlayer: (gameId: string, playerId: string) =>
    req<PlayerDetail>(`/games/${gameId}/players/${playerId}`),

  getTrades: (gameId: string) => req<{ trades: Trade[] }>(`/games/${gameId}/trades`).then((r) => r.trades),

  getResults: (gameId: string) =>
    req<{ settlement: Settlement | null }>(`/games/${gameId}/results`).then((r) => r.settlement),

  // Persisted achievements/XP (BE-authoritative; unlock is idempotent).
  getAchievements: (ownerAddress: string) => req<AchievementState>(`/achievements/${ownerAddress}`),

  unlockAchievement: (ownerAddress: string, id: string) =>
    req<UnlockResult>(`/achievements/${ownerAddress}/unlock`, {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  // Proposed BE addition (integration plan §7A) — live instruction to the agent.
  instruct: (gameId: string, playerId: string, message: string) =>
    req<{ ok: boolean }>(`/games/${gameId}/players/${playerId}/instruct`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};

export { ApiError };
