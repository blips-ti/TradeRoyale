"use client";

import * as React from "react";
import { api } from "./api";
import { useGame } from "./store";

/**
 * Reconciles local session state with the backend (`GET /games/me`, authorized by the Privy
 * token), which is the source of truth — no localStorage. Keyed on the user id so connect,
 * reconnect, a new device, OR a wallet switch all re-sync. If the backend reports no active
 * game, local state is cleared (so a fresh wallet starts from 0). Best-effort; silent on failure.
 */
export function useSessionSync(userId: string | null) {
  const setSession = useGame((s) => s.setSession);
  const reset = useGame((s) => s.reset);

  React.useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    let alive = true;
    api
      .getActive()
      .then((res) => {
        if (!alive) return;
        if (res.game && res.player) setSession(res.game.id, res.player.id);
        else reset();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, setSession, reset]);
}
