"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Coins, Zap } from "lucide-react";
import type { Achievement, Rarity } from "@/app/_lib/achievements";
import { Badge } from "./Badge";

const RARITY_COLOR: Record<Rarity, string> = {
  common: "#dcc08a",
  rare: "#59c2ff",
  epic: "#ff36a3",
  legendary: "#ffcc66",
};

const CONFETTI = ["#C5F72B", "#34D6E0", "#FF36A3", "#ff8a3d", "#ffcc66"];

export function AchievementUnlock({
  achievement,
  onDismiss,
}: {
  achievement: Achievement | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden px-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* dimmed/blurred overlay on the current screen */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onDismiss} />

          {/* confetti */}
          {Array.from({ length: 30 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute top-0 h-2.5 w-2.5 rounded-[2px]"
              style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length] }}
              initial={{ y: "-10%", opacity: 0, rotate: 0 }}
              animate={{ y: "115%", opacity: [0, 1, 1, 0], rotate: 360 }}
              transition={{ duration: 2.6 + (i % 5) * 0.35, repeat: Infinity, delay: (i % 7) * 0.18, ease: "linear" }}
            />
          ))}

          {/* radial glow behind badge */}
          <motion.div
            className="pointer-events-none absolute h-72 w-72 rounded-full"
            style={{ background: `radial-gradient(circle, ${RARITY_COLOR[achievement.rarity]}55, transparent 70%)` }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1.4, opacity: 1 }}
            transition={{ duration: 0.6 }}
          />

          <div className="relative z-10 flex flex-col items-center text-center">
            <motion.p
              className="font-mono text-[12px] uppercase tracking-[0.35em] text-[color:var(--color-lime)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Achievement Unlocked
            </motion.p>

            <motion.div
              className="relative my-7"
              initial={{ scale: 0, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 13, delay: 0.1 }}
            >
              <motion.span
                className="absolute inset-0 -z-10 grid place-items-center"
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 2.3, opacity: 0 }}
                transition={{ duration: 1, delay: 0.25 }}
              >
                <span
                  className="h-32 w-32 rounded-full border-2"
                  style={{ borderColor: RARITY_COLOR[achievement.rarity] }}
                />
              </motion.span>
              <Badge rarity={achievement.rarity} icon={achievement.icon} size={132} />
            </motion.div>

            <motion.h1
              className="font-display text-[30px] font-bold uppercase leading-none"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              {achievement.name}
            </motion.h1>
            <motion.p
              className="mt-2 max-w-[16rem] text-[14px] text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              {achievement.desc}
            </motion.p>

            <motion.div
              className="mt-5 flex items-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <span className="inline-flex items-center gap-1 rounded-pill bg-[color:var(--color-lime)]/15 px-3 py-1.5 text-[13px] font-bold text-[color:var(--color-lime)]">
                <Zap className="h-3.5 w-3.5" fill="currentColor" /> +{achievement.xp} XP
              </span>
              <span className="inline-flex items-center gap-1 rounded-pill bg-[color:var(--color-surface-2)] px-3 py-1.5 text-[13px] font-bold text-[color:var(--color-gold)]">
                <Coins className="h-3.5 w-3.5" /> +{achievement.coins.toLocaleString()}
              </span>
            </motion.div>

            <motion.button
              onClick={onDismiss}
              className="mt-8 h-12 rounded-pill bg-[color:var(--color-lime)] px-12 font-semibold text-black transition active:scale-95"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
            >
              Claim
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
