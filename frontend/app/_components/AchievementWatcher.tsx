"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { ACHIEVEMENTS, computeProgress, type Achievement } from "@/app/_lib/achievements";
import { AchievementUnlock } from "./AchievementUnlock";

/**
 * Watches the unlocked-achievement set and pops a full-screen celebration the
 * moment a NEW one unlocks during the session (e.g. connecting the wallet unlocks
 * "First Contact"). A baseline is captured once `ready` so pre-existing progress
 * isn't celebrated retroactively on reload.
 */
export function AchievementWatcher() {
  const { ready, authenticated } = useAuth();
  const { joinedMatchId, agent } = useGame();
  const { unlocked } = computeProgress({ authenticated, joinedMatchId, agent });
  const key = [...unlocked].sort().join(",");

  const initialized = useRef(false);
  const prev = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<Achievement[]>([]);

  useEffect(() => {
    if (!ready) return;
    if (!initialized.current) {
      initialized.current = true;
      prev.current = new Set(unlocked);
      return;
    }
    const fresh = [...unlocked].filter((id) => !prev.current.has(id));
    // Always resync (so disconnect removes ids → reconnect re-triggers the celebration).
    prev.current = new Set(unlocked);
    if (fresh.length) {
      const items = fresh
        .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
        .filter((a): a is Achievement => !!a);
      setQueue((q) => [...q, ...items]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  const current = queue[0] ?? null;
  return <AchievementUnlock achievement={current} onDismiss={() => setQueue((q) => q.slice(1))} />;
}
