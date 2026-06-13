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
  UnlinkAccountExport,
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

// The auth layer registers a getter for the current Privy access token; every request
// attaches it as a Bearer so the backend can verify + authorize the caller.
let getAuthToken: () => Promise<string | null> = async () => null;
export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  getAuthToken = fn;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken().catch(() => null);
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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

  // Recover the authenticated user's active game + player (reconnect / new device).
  getActive: () => req<ActivePlayerResponse>(`/games/me`),

  joinGame: (gameId: string, body: { displayName: string; strategyPrompt?: string }) =>
    req<JoinResult>(`/games/${gameId}/join`, { method: "POST", body: JSON.stringify(body) }),

  setStrategy: (gameId: string, playerId: string, strategyPrompt: string) =>
    req<{ player: PublicPlayer }>(`/games/${gameId}/players/${playerId}/strategy`, {
      method: "PUT",
      body: JSON.stringify({ strategyPrompt }),
    }),

  getPlayer: (gameId: string, playerId: string) =>
    req<PlayerDetail>(`/games/${gameId}/players/${playerId}`),

  // Owner-only: the caller's Unlink account keys, to fund their own vault from the browser.
  getUnlinkAccount: (gameId: string, playerId: string) =>
    req<{ account: UnlinkAccountExport }>(
      `/games/${gameId}/players/${playerId}/unlink-account`,
    ).then((r) => r.account),

  getTrades: (gameId: string) => req<{ trades: Trade[] }>(`/games/${gameId}/trades`).then((r) => r.trades),

  getResults: (gameId: string) =>
    req<{ settlement: Settlement | null }>(`/games/${gameId}/results`).then((r) => r.settlement),

  // Persisted achievements/XP for the authenticated user (BE-authoritative; unlock idempotent).
  getAchievements: () => req<AchievementState>(`/achievements/me`),

  unlockAchievement: (id: string) =>
    req<UnlockResult>(`/achievements/me/unlock`, {
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
