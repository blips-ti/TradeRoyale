"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgentConfig = {
  name: string;
  prompt: string;
  risk: "degen" | "balanced" | "sniper";
};

type GameState = {
  /** session anchor for relative match timing (reset if stale) */
  anchorAt: number | null;
  /** the single match/game the user is in (one at a time, cannot leave) */
  joinedMatchId: string | null;
  /** the backend playerId for the joined game (recovered on reconnect) */
  playerId: string | null;
  /** the user's agent setup for their match */
  agent: AgentConfig | null;

  init: () => void;
  join: (matchId: string) => void;
  /** set the real backend session after join / on reconnect rehydrate */
  setSession: (gameId: string, playerId: string) => void;
  setAgent: (agent: AgentConfig) => void;
  /** dev/round reset — used after a match ends */
  reset: () => void;
};

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      anchorAt: null,
      joinedMatchId: null,
      playerId: null,
      agent: null,

      init: () => {
        const now = Date.now();
        const a = get().anchorAt;
        if (!a || now - a > TWELVE_HOURS) set({ anchorAt: now });
      },

      join: (matchId) => {
        if (get().joinedMatchId) return; // one match at a time, no switching
        set({ joinedMatchId: matchId });
      },

      setSession: (gameId, playerId) => set({ joinedMatchId: gameId, playerId }),

      setAgent: (agent) => set({ agent }),

      reset: () => set({ joinedMatchId: null, playerId: null, agent: null }),
    }),
    {
      name: "alphaarena.game",
      partialize: (s) => ({
        anchorAt: s.anchorAt,
        joinedMatchId: s.joinedMatchId,
        playerId: s.playerId,
        agent: s.agent,
      }),
    },
  ),
);
