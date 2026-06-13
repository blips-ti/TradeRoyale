"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio } from "lucide-react";

/* A small, looping "live trade battle" mockup for the landing hero: a moving multi-line chart,
   a cycling token-swap feed with real logos, and a NAV that shakes on each tick. Self-contained,
   purely decorative. */

const LOGO = (addr: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${addr}/logo.png`;

const TOKENS = {
  USDC: { sym: "USDC", img: LOGO("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), color: "#2775CA" },
  WETH: { sym: "WETH", img: LOGO("0x4200000000000000000000000000000000000006"), color: "#627EEA" },
  cbBTC: { sym: "cbBTC", img: LOGO("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"), color: "#F7931A" },
  AERO: { sym: "AERO", img: LOGO("0x940181a94A35A4569E4529A3CDfB74e38FD98631"), color: "#0052FF" },
  DEGEN: { sym: "DEGEN", img: LOGO("0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"), color: "#A36EFD" },
} as const;

type Tok = keyof typeof TOKENS;

const SWAP_SEQ: { from: Tok; to: Tok; pct: number }[] = [
  { from: "USDC", to: "WETH", pct: 2.1 },
  { from: "WETH", to: "cbBTC", pct: -0.7 },
  { from: "cbBTC", to: "AERO", pct: 3.4 },
  { from: "AERO", to: "DEGEN", pct: 5.2 },
  { from: "DEGEN", to: "USDC", pct: -1.3 },
  { from: "USDC", to: "WETH", pct: 1.6 },
];

function TokenImg({ tok, size = 18 }: { tok: Tok; size?: number }) {
  const [failed, setFailed] = useState(false);
  const t = TOKENS[tok];
  if (failed) {
    return (
      <span
        style={{ width: size, height: size, background: t.color }}
        className="grid shrink-0 place-items-center rounded-full text-[7px] font-bold text-white"
      >
        {t.sym.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={t.img} alt={t.sym} width={size} height={size} onError={() => setFailed(true)} className="shrink-0 rounded-full" />
  );
}

type Line = { you?: boolean; color: string; pts: number[] };
const N = 20;

function seedLines(): Line[] {
  const wob = (base: number, slope: number) =>
    Array.from({ length: N }, (_, i) => base + (i / N) * slope + (Math.random() - 0.5) * 10);
  return [
    { you: true, color: "#C5F72B", pts: wob(38, 34) },
    { color: "#34D6E0", pts: wob(52, 8) },
    { color: "#FF36A3", pts: wob(58, -6) },
  ];
}

function stepLines(lines: Line[]): Line[] {
  return lines.map((l) => {
    const last = l.pts[l.pts.length - 1] ?? 50;
    const drift = l.you ? 1.1 : -0.1;
    const next = Math.max(6, Math.min(94, last + (Math.random() - 0.5) * 11 + drift));
    return { ...l, pts: [...l.pts.slice(1), next] };
  });
}

function MiniChart() {
  const [lines, setLines] = useState<Line[]>(seedLines);
  useEffect(() => {
    const id = setInterval(() => setLines(stepLines), 650);
    return () => clearInterval(id);
  }, []);

  const W = 280;
  const H = 92;
  const x = (i: number) => (i / (N - 1)) * W;
  const y = (v: number) => H - (v / 100) * H;
  const path = (pts: number[]) => pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const ordered = [...lines].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      {ordered.map((l, i) => {
        const last = l.pts[l.pts.length - 1] ?? 50;
        return (
          <g key={i}>
            <path
              d={path(l.pts)}
              fill="none"
              stroke={l.color}
              strokeWidth={l.you ? 2.5 : 1.25}
              strokeOpacity={l.you ? 1 : 0.45}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ transition: "all 0.6s linear" }}
            />
            <circle cx={x(N - 1)} cy={y(last)} r={l.you ? 3 : 1.8} fill={l.color} fillOpacity={l.you ? 1 : 0.6} />
          </g>
        );
      })}
    </svg>
  );
}

export function BattlePreview() {
  // Seed with 3 rows so the feed never changes height (no reflow/flicker as swaps cycle).
  const [feed, setFeed] = useState<{ id: number; from: Tok; to: Tok; pct: number }[]>(() =>
    [
      { from: "USDC" as Tok, to: "WETH" as Tok, pct: 2.1 },
      { from: "WETH" as Tok, to: "cbBTC" as Tok, pct: -0.7 },
      { from: "cbBTC" as Tok, to: "AERO" as Tok, pct: 3.4 },
    ].map((s, i) => ({ id: -3 + i, ...s })),
  );
  const [nav, setNav] = useState(1284);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      const s = SWAP_SEQ[i % SWAP_SEQ.length];
      setFeed((f) => [{ id: i, ...s }, ...f].slice(0, 3));
      setNav((n) => Math.max(700, Math.round(n * (1 + s.pct / 100))));
      setTick((t) => t + 1);
      i += 1;
    }, 1700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full">
      {/* lime glow behind the device */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2rem] bg-[color:var(--color-lime)] opacity-10 blur-2xl" />

      {/* phone frame */}
      <div className="rounded-[2rem] border border-[color:var(--color-line-strong)] bg-black p-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="relative overflow-hidden rounded-[1.5rem] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          {/* notch */}
          <div className="absolute left-1/2 top-2 h-1 w-12 -translate-x-1/2 rounded-full bg-[color:var(--color-line-strong)]" />

          <div className="px-4 pb-4 pt-6">
            {/* header */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-loss)]">
                <Radio className="h-3 w-3" /> Live · 02:14
              </span>
              <motion.span
                key={`rank-${tick}`}
                initial={{ scale: 1.15 }}
                animate={{ scale: 1 }}
                className="rounded-pill bg-[color:var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] font-bold text-fg"
              >
                #1 <span className="text-muted">/ 3</span>
              </motion.span>
            </div>

            {/* NAV ticker — shakes on each tick */}
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Your NAV</p>
              <motion.p
                key={nav}
                initial={{ scale: 1.06, x: -2 }}
                animate={{ scale: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 14 }}
                className="font-display text-[28px] font-bold leading-none text-fg tnum"
              >
                ${nav.toLocaleString()}
              </motion.p>
            </div>

            {/* moving chart */}
            <div className="mt-3">
              <MiniChart />
            </div>

            {/* live swap feed — fixed height + clipped so it never reflows the card */}
            <div className="mt-3 flex h-[7.5rem] flex-col gap-1.5 overflow-hidden">
              <AnimatePresence initial={false}>
                {feed.map((s) => (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="flex items-center gap-2 rounded-pill border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-2.5 py-1.5"
                  >
                    <TokenImg tok={s.from} />
                    <span className="text-[11px] font-semibold uppercase text-fg">{TOKENS[s.from].sym}</span>
                    <span className="text-[color:var(--color-lime)]">→</span>
                    <TokenImg tok={s.to} />
                    <span className="text-[11px] font-semibold uppercase text-fg">{TOKENS[s.to].sym}</span>
                    <span
                      className="ml-auto font-mono text-[11px] font-bold"
                      style={{ color: s.pct >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
                    >
                      {s.pct >= 0 ? "+" : ""}
                      {s.pct.toFixed(1)}%
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
