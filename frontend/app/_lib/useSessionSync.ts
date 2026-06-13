"use client";

import * as React from "react";
import { api } from "./api";
import { useGame } from "./store";

/**
 * Reconciles local session state with the backend (`GET /games/me`, authorized by the Privy
 * token), which is the source of truth — no localStorage. Keyed on the user id so connect,
 * reconnect, a new device, OR a wallet switch all re-sync.
 *
 * A player only counts as "joined" once their deposit is CONFIRMED — a created-but-unfunded
 * vault must never show as registered. If the backend reports no active game (or a still-pending
 * deposit), local state is cleared. Best-effort; silent on failure.
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
        // Active = confirmed deposit in a game that hasn't ended. Ended games must release the
        // session so the player isn't locked out of joining the next match.
        const active =
          res.game &&
          res.player &&
          res.player.depositStatus === "confirmed" &&
          res.game.status !== "ended";
        if (active) setSession(res.game!.id, res.player!.id);
        else reset();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, setSession, reset]);
}
