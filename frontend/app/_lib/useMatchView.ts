"use client";

import * as React from "react";
import { api } from "./api";
import type { Game, PublicPlayer } from "./types";
import { gameToView, type MatchView } from "./gameView";

/**
 * Fetches + light-polls a real backend game (GET /:gameId) and adapts it to the MatchView
 * the UI renders. Replaces the old mock matches.ts timing. Pass gameId=null to stay idle.
 */
export function useMatchView(gameId: string | null, pollMs = 4000) {
  const [game, setGame] = React.useState<Game | null>(null);
  const [players, setPlayers] = React.useState<PublicPlayer[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!gameId) {
      setGame(null);
      setPlayers([]);
      setLoading(false);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await api.getGame(gameId);
        if (!alive) return;
        setGame(res.game);
        setPlayers(res.players);
      } catch {
        /* keep last good state */
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [gameId, pollMs]);

  const view: MatchView | null = game ? gameToView(game, players.length) : null;
  return { game, players, view, loading };
}
