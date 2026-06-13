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

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const games = await api.listGames("all");
        if (!alive) return;
        setViews(games.map((g) => gameToView(g, g.playerCount ?? 0)));
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message || "Can't reach the backend");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { views, loading, error };
}
