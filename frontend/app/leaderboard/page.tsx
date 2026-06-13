"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Coins, Crown, Trophy } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { api } from "@/app/_lib/api";
import type { LeaderboardEntry } from "@/app/_lib/types";
import { baseUnitsToNumber } from "@/app/_lib/units";
import { usd } from "@/app/_lib/format";
import { AppShell } from "@/app/_components/AppShell";
import { Avatar, Card, Reveal, Spinner } from "@/app/_components/ui";

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Leaderboard />
    </AppShell>
  );
}

function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getLeaderboard()
      .then((e) => alive && setEntries(e))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      <Reveal>
        <h1 className="px-1 font-display text-[22px] font-bold uppercase tracking-tight">Leaderboard</h1>
      </Reveal>

      {/* season prize hero */}
      <Reveal delay={0.05}>
        <div className="relative overflow-hidden rounded-card border border-[color:var(--color-lime)]/30 bg-gradient-to-br from-[color:var(--color-lime)]/18 via-[color:var(--color-surface)] to-[color:var(--color-cyan)]/12 p-5">
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[color:var(--color-lime)] opacity-20 blur-3xl"
            animate={{ opacity: [0.14, 0.28, 0.14] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* floating coins */}
          {[
            { x: "78%", y: "8%", d: 0 },
            { x: "88%", y: "55%", d: 0.6 },
            { x: "70%", y: "70%", d: 1.2 },
          ].map((c, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute text-[color:var(--color-lime)]"
              style={{ left: c.x, top: c.y }}
              animate={{ y: [0, -7, 0], rotate: [0, 12, 0], opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 3 + i, repeat: Infinity, delay: c.d, ease: "easeInOut" }}
            >
              <Coins className="h-5 w-5" />
            </motion.span>
          ))}

          <div className="relative flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[color:var(--color-lime)] text-black shadow-[0_8px_24px_-8px_var(--color-lime)]">
              <Trophy className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[color:var(--color-lime)]">
                Season 01 · Grand Prize
              </p>
              <p className="font-display text-[34px] font-bold leading-none tnum">$1,000</p>
              <p className="mt-1 text-[12px] text-muted">Highest total PnL when the season ends takes the pot.</p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ranked list */}
      {entries === null ? (
        <Reveal delay={0.1}>
          <Card className="flex items-center justify-center gap-2 p-8 text-[14px] text-muted">
            <Spinner /> Loading ranks…
          </Card>
        </Reveal>
      ) : entries.length === 0 ? (
        <Reveal delay={0.1}>
          <Card className="p-8 text-center text-[14px] text-muted">
            No results yet — play a match to claim your spot.
          </Card>
        </Reveal>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e, i) => {
            const pnl = baseUnitsToNumber(e.pnlUsd);
            const rank = i + 1;
            return (
              <Reveal key={`${e.displayName}-${i}`} delay={0.1 + i * 0.03}>
                <Card
                  className={`flex items-center gap-3 p-3 ${
                    e.you ? "border-[color:var(--color-lime)]/60 bg-[color:var(--color-lime)]/10" : ""
                  }`}
                >
                  <span
                    className={`w-6 text-center font-mono text-[14px] font-bold ${
                      rank === 1 ? "text-[color:var(--color-lime)]" : "text-muted"
                    }`}
                  >
                    {rank}
                  </span>
                  <Avatar name={e.you ? user?.name ?? e.displayName : e.displayName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[15px] font-bold text-fg">
                      {e.you ? "You" : e.displayName}
                      {rank === 1 && <Crown className="h-4 w-4 shrink-0 text-[color:var(--color-lime)]" />}
                    </p>
                    <p className="text-[12px] text-muted">
                      {e.wins} {e.wins === 1 ? "win" : "wins"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted">PnL</p>
                    <p
                      className="font-display text-[16px] font-bold tnum"
                      style={{ color: pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
                    >
                      {pnl >= 0 ? "+" : "−"}
                      {usd(Math.abs(pnl))}
                    </p>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
