"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Radio, Send, Trophy } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { getMatchBase, opponentsFor, resolveMatch } from "@/app/_lib/matches";
import { usd } from "@/app/_lib/format";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { buildSeries, PnlChartView, stepSeries, type Series } from "@/app/_components/PnlChart";
import { Avatar, BotAvatar, Spinner } from "@/app/_components/ui";

type Msg = { role: "you" | "agent"; text: string };

const AGENT_LINES = [
  "Rotating into ETH — momentum just flipped green. Sized 12%.",
  "Took profit on that SOL spike. Locking gains, staying nimble.",
  "Volatility spiking. Tightening stops, protecting the lead.",
  "Front-running the breakout. If it holds we extend the gap.",
  "Cutting the loser. No bags, no regrets. Reloading dry powder.",
  "Whales are accumulating — I'm tagging along for the ride.",
];

export default function LivePage() {
  const { ready, authenticated, user } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { anchorAt, joinedMatchId, agent, init, reset } = useGame();
  const now = useNow(1000);

  useEffect(() => init(), [init]);
  // Live screen requires being joined to this match (which requires a connected wallet).
  useEffect(() => {
    if (ready && (!authenticated || joinedMatchId !== params.id)) {
      router.replace(`/match/${params.id}`);
    }
  }, [ready, authenticated, joinedMatchId, params.id, router]);

  const base = getMatchBase(params.id);
  const me = useMemo(
    () => ({ id: user?.id ?? "you", name: agent?.name || user?.name || "You" }),
    [user, agent],
  );
  const opponents = useMemo(() => opponentsFor(params.id, 7), [params.id]);

  const [series, setSeries] = useState<Series[]>(() => buildSeries(me, opponents));
  const [messages, setMessages] = useState<Msg[]>([
    { role: "agent", text: "Agent online. Scanning the book — let's take this pot. 🦾" },
  ]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // live tick: advance pnl series (mock; real = Octav NAV every few min)
  useEffect(() => {
    const id = setInterval(() => setSeries((s) => stepSeries(s)), 1600);
    return () => clearInterval(id);
  }, []);

  // occasional unprompted agent chatter
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() < 0.5)
        setMessages((m) => [...m, { role: "agent", text: AGENT_LINES[Math.floor(Math.random() * AGENT_LINES.length)] }]);
    }, 9000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!base || !ready || !user || !anchorAt || !now) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted">
        <Spinner /> <span className="text-sm">Entering the arena…</span>
      </div>
    );
  }

  const match = resolveMatch(base, anchorAt, now);
  const mine = series.find((s) => s.you)!;
  const myPnl = mine.points[mine.points.length - 1] ?? 0;
  const nav = match.entryFeeUsd * (1 + myPnl / 100);

  const standings = [...series].sort(
    (a, b) => (b.points[b.points.length - 1] ?? 0) - (a.points[a.points.length - 1] ?? 0),
  );
  const myRank = standings.findIndex((s) => s.you) + 1;

  const ended = match.status === "ended";

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "you", text }]);
    setDraft("");
    setTimeout(() => {
      setMessages((m) => [...m, { role: "agent", text: AGENT_LINES[Math.floor(Math.random() * AGENT_LINES.length)] }]);
    }, 800);
  };

  if (ended) {
    return <VictoryRoyale winner={standings[0]} youWon={standings[0]?.you} pot={match.prizePoolUsd} onExit={() => { reset(); router.replace("/dashboard"); }} />;
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* top bar */}
      <header className="flex items-center justify-between px-5 pb-3 pt-[max(env(safe-area-inset-top),0.9rem)]">
        <div>
          <h1 className="font-display text-[18px] font-bold uppercase leading-none tracking-tight">
            {match.name}
          </h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <Radio className="h-3.5 w-3.5 text-[color:var(--color-loss)]" />
            LIVE · ends in <span className="font-mono text-fg">{formatDelta(match.endsAt - now)}</span>
          </p>
        </div>
        <span className="rounded-pill bg-[color:var(--color-surface)] px-3 py-1.5 font-mono text-[13px] font-bold text-fg">
          #{myRank} <span className="text-muted">/ {series.length}</span>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5">
        {/* NAV / PnL */}
        <div className="rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Your NAV · via Octav</p>
              <p className="font-display text-[30px] font-bold leading-none tnum">{usd(nav)}</p>
            </div>
            <div className="text-right">
              <p
                className="font-display text-[22px] font-bold leading-none tnum"
                style={{ color: myPnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
              >
                {myPnl >= 0 ? "+" : ""}
                {myPnl.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted">
                {myPnl >= 0 ? "+" : "−"}
                {usd(Math.abs(nav - match.entryFeeUsd))}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <PnlChartView series={series} height={150} />
          </div>
        </div>

        {/* standings (compact) */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {standings.slice(0, 6).map((s, i) => {
            const p = s.points[s.points.length - 1] ?? 0;
            return (
              <div
                key={s.id}
                className={`flex shrink-0 items-center gap-2 rounded-pill border px-2.5 py-1.5 ${
                  s.you ? "border-[color:var(--color-lime)]/50 bg-[color:var(--color-lime)]/10" : "border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
                }`}
              >
                <span className="font-mono text-[11px] text-muted">{i + 1}</span>
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-[12px] font-semibold text-fg">{s.you ? "You" : s.name}</span>
                <span
                  className="font-mono text-[12px]"
                  style={{ color: p >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
                >
                  {p >= 0 ? "+" : ""}
                  {p.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* chat */}
        <div className="flex min-h-0 flex-1 flex-col rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          <div className="flex items-center gap-2 border-b border-[color:var(--color-line)] px-4 py-2.5">
            <BotAvatar seed={agent?.name || me.id} size={26} />
            <span className="text-[13px] font-semibold text-fg">{agent?.name || "Your agent"}</span>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-[color:var(--color-profit)]">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-profit)]" /> trading
            </span>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 no-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                    m.role === "you"
                      ? "bg-[color:var(--color-lime)] text-black"
                      : "bg-[color:var(--color-surface-2)] text-fg"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-[color:var(--color-line)] p-2.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Tell your agent what to do…"
              className="flex-1 bg-transparent px-2 text-[14px] text-fg outline-none placeholder:text-dim"
            />
            <button
              onClick={send}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--color-lime)] text-black transition active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="pb-3 text-center text-[11px] text-dim">
          🔒 Locked in until the bell. No exits — winner takes {usd(match.prizePoolUsd)}.
        </p>
      </div>
    </div>
  );
}

function VictoryRoyale({
  winner,
  youWon,
  pot,
  onExit,
}: {
  winner?: Series;
  youWon?: boolean;
  pot: number;
  onExit: () => void;
}) {
  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* confetti-ish */}
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-2 w-2 rounded-sm"
          style={{
            left: `${(i * 53) % 100}%`,
            background: ["#C5F72B", "#ff8a3d", "#FF36A3", "#34D6E0"][i % 4],
          }}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: ["-10%", "110%"], opacity: [0, 1, 0], rotate: 360 }}
          transition={{ duration: 2.4 + (i % 5) * 0.3, repeat: Infinity, delay: (i % 6) * 0.2 }}
        />
      ))}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[color:var(--color-lime)] text-black">
          <Trophy className="h-8 w-8" />
        </span>
        <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-[color:var(--color-lime)]">
          Victory Royale
        </p>
        <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-tight">
          {youWon ? "You took the pot!" : `${winner?.name} wins`}
        </h1>
        {winner && <Avatar name={youWon ? "You" : winner.name} size={64} />}
        <p className="font-display text-[40px] font-bold text-[color:var(--color-lime)] tnum">{usd(pot)}</p>
        <p className="text-[13px] text-muted">{youWon ? "Pot settled to your wallet." : "Better luck next Match — don't get Rekt."}</p>
        <button
          onClick={onExit}
          className="mt-2 h-12 rounded-pill bg-[color:var(--color-lime)] px-8 font-semibold text-black transition active:scale-95"
        >
          Back to The Lobby
        </button>
      </motion.div>
    </div>
  );
}
