"use client";

import { useEffect } from "react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { useAchievements } from "@/app/_lib/achievementsStore";
import { AchievementUnlock } from "./AchievementUnlock";

/**
 * Drives the achievement celebration from the BE-persisted ledger. On connect we load the
 * user's unlocked set; conditions (connect / first join / agent set up) call the idempotent
 * unlock endpoint — so a celebration fires the FIRST time ever, never again on reconnect.
 */
export function AchievementWatcher() {
  const { authenticated, user } = useAuth();
  const { joinedMatchId, agent } = useGame();
  const address = user?.address ?? null;
  const { loaded, queue, load, tryUnlock, dequeue, reset } = useAchievements();

  // Load (or clear) the ledger when the connected wallet changes.
  useEffect(() => {
    if (address) load(address);
    else reset();
  }, [address, load, reset]);

  // Fire condition-based unlocks once the ledger is loaded.
  useEffect(() => {
    if (!loaded || !address) return;
    if (authenticated) tryUnlock(address, "connect");
    if (joinedMatchId) tryUnlock(address, "join");
    if (agent) tryUnlock(address, "agent");
  }, [loaded, address, authenticated, joinedMatchId, agent, tryUnlock]);

  return <AchievementUnlock achievement={queue[0] ?? null} onDismiss={dequeue} />;
}
