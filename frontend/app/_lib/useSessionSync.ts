"use client";

import * as React from "react";
import { api } from "./api";
import { useGame } from "./store";

/**
 * On connect, recovers the user's active game/player from the backend by their
 * wallet address (so disconnect → reconnect, or a new device, restores the
 * profile/match). No-op if the user has no active game. Best-effort; silent on
 * network failure (the dashboard already surfaces backend reachability).
 */
export function useSessionSync(ownerAddress: string | null | undefined) {
  const setSession = useGame((s) => s.setSession);

  React.useEffect(() => {
    if (!ownerAddress) return;
    let alive = true;
    api
      .getActive(ownerAddress)
      .then((res) => {
        if (!alive || !res.game || !res.player) return;
        setSession(res.game.id, res.player.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ownerAddress, setSession]);
}
