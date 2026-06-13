"use client";

import * as React from "react";
import { api } from "./api";
import { useGame } from "./store";

/**
 * On connect, recovers the user's active game/player from the backend (`GET /games/me`,
 * authorized by the Privy token) so disconnect → reconnect, or a new device, restores the
 * profile/match. No-op if there's no active game. Best-effort; silent on failure.
 */
export function useSessionSync(authenticated: boolean) {
  const setSession = useGame((s) => s.setSession);

  React.useEffect(() => {
    if (!authenticated) return;
    let alive = true;
    api
      .getActive()
      .then((res) => {
        if (!alive || !res.game || !res.player) return;
        setSession(res.game.id, res.player.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [authenticated, setSession]);
}
