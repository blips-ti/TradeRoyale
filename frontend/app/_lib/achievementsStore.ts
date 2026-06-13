"use client";

import { create } from "zustand";
import { api } from "./api";
import { achievementById, type Achievement } from "./achievements";

type AchievementsState = {
  /** BE-confirmed unlocked achievement ids (source of truth) */
  unlocked: Set<string>;
  loaded: boolean;
  /** newly-unlocked achievements waiting to be celebrated */
  queue: Achievement[];
  /** ids we've already POSTed this session (avoids redundant calls) */
  attempted: Set<string>;

  load: () => Promise<void>;
  tryUnlock: (id: string) => Promise<void>;
  dequeue: () => void;
  reset: () => void;
};

export const useAchievements = create<AchievementsState>((set, get) => ({
  unlocked: new Set(),
  loaded: false,
  queue: [],
  attempted: new Set(),

  load: async () => {
    try {
      const state = await api.getAchievements();
      set({ unlocked: new Set(state.unlocked), loaded: true });
    } catch {
      set({ loaded: true }); // backend unreachable — degrade quietly
    }
  },

  tryUnlock: async (id) => {
    const { unlocked, attempted } = get();
    if (unlocked.has(id) || attempted.has(id)) return;
    set({ attempted: new Set(attempted).add(id) });
    try {
      const res = await api.unlockAchievement(id);
      set((s) => ({ unlocked: new Set(s.unlocked).add(id) }));
      if (res.newlyUnlocked) {
        const ach = achievementById(id);
        if (ach) set((s) => ({ queue: [...s.queue, ach] }));
      }
    } catch {
      // allow a later retry if the call failed
      set((s) => {
        const next = new Set(s.attempted);
        next.delete(id);
        return { attempted: next };
      });
    }
  },

  dequeue: () => set((s) => ({ queue: s.queue.slice(1) })),

  reset: () => set({ unlocked: new Set(), loaded: false, queue: [], attempted: new Set() }),
}));
