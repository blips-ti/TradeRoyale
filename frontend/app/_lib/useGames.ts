"use client";

import * as React from "react";
import { api } from "./api";
import { gameToView, type MatchView } from "./gameView";

/**
 * Polls the backend list (`GET /games?status=all`) — open + live games, each
 * already carrying its `playerCount`. Returns card view models + loading/error.
 */
export function useGames(pollMs = 5000) {
  const [views, setViews] = React.useState<MatchView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const games = await api.listGames("all");
      setViews(games.map((g) => gameToView(g, g.playerCount ?? 0)));
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Can't reach the backend");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [pollMs, refresh]);

  return { views, loading, error, refresh };
}
