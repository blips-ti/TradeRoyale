"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleCheck, Coins, Lock, X, Zap } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import {
  ACHIEVEMENTS,
  computeProgress,
  XP_PER_LEVEL,
  type Achievement,
  type Rarity,
} from "@/app/_lib/achievements";
import { Badge } from "./Badge";

const RARITY_LABEL: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Common", color: "#dcc08a" },
  rare: { label: "Rare", color: "#59c2ff" },
  epic: { label: "Epic", color: "#ff36a3" },
  legendary: { label: "Legendary", color: "#ffcc66" },
};

export function AchievementsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { authenticated } = useAuth();
  const { joinedMatchId, agent } = useGame();
  const p = computeProgress({ authenticated, joinedMatchId, agent });
  const total = ACHIEVEMENTS.length;
  const unlockedCount = p.unlocked.size;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative flex h-[92dvh] w-full max-w-md flex-col rounded-t-[1.75rem] border-t border-[color:var(--color-line-strong)] bg-[color:var(--color-bg)]"
          >
            {/* header */}
            <div className="shrink-0 rounded-t-[1.75rem] px-5 pb-4 pt-4">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[20px] font-bold uppercase tracking-tight">Achievements</h2>
                <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--color-surface)] text-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* level + xp */}
              <div className="mt-4 flex items-center gap-4 rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
                <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[color:var(--color-lime)] text-black">
                  <span className="font-display text-[22px] font-bold leading-none">{p.level}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-end justify-between">
                    <p className="font-display text-[15px] font-bold uppercase tracking-wide">Level {p.level}</p>
                    <p className="font-mono text-[12px] text-muted">
                      <span className="text-[color:var(--color-lime)]">{p.xpInLevel}</span>/{XP_PER_LEVEL} XP
                    </p>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-pill bg-[color:var(--color-surface-2)]">
                    <div
                      className="h-full rounded-pill bg-[color:var(--color-lime)]"
                      style={{ width: `${(p.xpInLevel / XP_PER_LEVEL) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {unlockedCount}/{total} unlocked · {p.totalXp.toLocaleString()} total XP
                  </p>
                </div>
              </div>
            </div>

            {/* list */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-8 no-scrollbar">
              {ACHIEVEMENTS.map((a) => (
                <AchievementCard key={a.id} a={a} done={p.unlocked.has(a.id)} />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AchievementCard({ a, done }: { a: Achievement; done: boolean }) {
  const rarity = RARITY_LABEL[a.rarity];
  return (
    <div
      className={`overflow-hidden rounded-card border ${
        done ? "border-[color:var(--color-lime)]/60" : "border-[color:var(--color-line)]"
      } bg-[color:var(--color-surface)]`}
    >
      {/* status header strip */}
      <div
        className={`flex items-center gap-2 px-4 py-2 ${
          done
            ? "bg-[color:var(--color-lime)] text-black"
            : "bg-[color:var(--color-surface-2)] text-muted"
        }`}
      >
        {done ? <CircleCheck className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
        <span className="text-[12px] font-bold uppercase tracking-[0.12em]">
          {done ? "Completed" : "In Progress"}
        </span>
        {done && <Check className="ml-auto h-5 w-5" strokeWidth={3} />}
      </div>

      {/* body */}
      <div className="flex items-center gap-3.5 p-4">
        <Badge rarity={a.rarity} icon={a.icon} size={60} locked={!done} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-bold leading-tight text-fg">{a.name}</p>
          <p className="text-[12.5px] leading-snug text-muted">{a.desc}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-pill bg-[color:var(--color-lime)]/12 px-2 py-0.5 text-[11px] font-bold text-[color:var(--color-lime)]">
              <Zap className="h-3 w-3" fill="currentColor" /> {a.xp} XP
            </span>
            <span className="inline-flex items-center gap-1 rounded-pill bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--color-gold)]">
              <Coins className="h-3 w-3" /> {a.coins.toLocaleString()}
            </span>
            <span
              className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold uppercase"
              style={{ background: `${rarity.color}22`, color: rarity.color }}
            >
              {rarity.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
