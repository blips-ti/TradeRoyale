"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Data ──────────────────────────────────────────────────────────── */
interface Agent {
  name: string;
  addr: string;
  nav: number;
}

const INITIAL_AGENTS: Agent[] = [
  { name: "liquidator_9000", addr: "0x7f...a2c4", nav: 1187.2 },
  { name: "ser_pump", addr: "0x3b...91de", nav: 1142.55 },
  { name: "mean_reversion_enjoyer", addr: "0xc4...77f0", nav: 1098.1 },
  { name: "wagmi_or_nothing", addr: "0x91...04bb", nav: 1061.4 },
  { name: "slow_grind_andy", addr: "0xe8...c331", nav: 1024.85 },
  { name: "down_bad_dave", addr: "0x55...8a17", nav: 962.3 },
];

const START = 1000;
const fmt = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(2, "0");

function ShieldIcon() {
  return (
    <svg
      className="h-[10px] w-[10px] flex-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#7B5CFF"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */
export function MatchCard() {
  const [agents, setAgents] = useState<Agent[]>(() =>
    [...INITIAL_AGENTS].sort((a, b) => b.nav - a.nav)
  );
  const [pot, setPot] = useState(4280);
  const [secs, setSecs] = useState(1 * 3600 + 23 * 60 + 44);
  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down">>({});
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  /* NAV updates */
  useEffect(() => {
    if (reduced.current) return;
    const id = setInterval(() => {
      setAgents((prev) => {
        const next = prev.map((a) => ({ ...a }));
        const idx = Math.floor(Math.random() * next.length);
        const delta = (Math.random() - 0.46) * 14;
        next[idx].nav = Math.max(400, next[idx].nav + delta);

        setFlashMap((fm) => ({ ...fm, [next[idx].name]: delta >= 0 ? "up" : "down" }));
        setTimeout(() => {
          setFlashMap((fm) => {
            const copy = { ...fm };
            delete copy[next[idx].name];
            return copy;
          });
        }, 650);

        return next.sort((a, b) => b.nav - a.nav);
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  /* Pot growth */
  useEffect(() => {
    if (reduced.current) return;
    const id = setInterval(() => {
      if (Math.random() < 0.3) {
        setPot((p) => p + 50 * Math.ceil(Math.random() * 3));
      }
    }, 3000);
    return () => clearInterval(id);
  }, []);

  /* Countdown */
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  const potStr = "$" + pot.toLocaleString("en-US");

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-card)]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-[18px]">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-dim">Total pot</div>
          <div className="font-mono text-2xl font-bold text-lime lg:text-[30px]">{potStr}</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-lime px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-lime">
          In progress
        </span>
        <div className="text-right">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-dim">Time to bell</div>
          <div className="font-mono text-xl font-bold text-fg lg:text-[23px]">{clock}</div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="p-1.5 sm:p-2">
        {agents.map((a, i) => {
          const pnl = ((a.nav - START) / START) * 100;
          const isUp = pnl >= 0;
          const flash = flashMap[a.name];
          return (
            <div
              key={a.name}
              className={`grid grid-cols-[26px_1fr_auto_auto] items-center gap-2.5 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-white/[0.03] sm:gap-3 ${
                flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""
              }`}
            >
              <div className={`font-mono text-[13px] font-bold text-center ${i === 0 ? "text-lime" : "text-dim"}`}>
                {i + 1}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13.5px] font-semibold">{a.name}</span>
                <span className="flex items-center gap-1 font-mono text-[10.5px] text-dim">
                  <ShieldIcon />
                  {a.addr} · shielded
                </span>
              </div>
              <div className="font-mono text-[13.5px] font-medium text-right">{fmt(a.nav)}</div>
              <div
                className={`min-w-[72px] font-mono text-[12.5px] font-bold text-right ${
                  isUp ? "text-profit" : "text-loss"
                }`}
              >
                {isUp ? "+" : ""}
                {pnl.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap justify-between gap-2.5 border-t border-line px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
        <span className="text-purple">Vaults shielded · zk</span>
        <span>Settles on-chain</span>
      </div>
    </div>
  );
}
