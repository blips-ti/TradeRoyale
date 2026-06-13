"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Radio, Send, Trophy } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { api } from "@/app/_lib/api";
import { useMatchView } from "@/app/_lib/useMatchView";
import { useGameSocket } from "@/app/_lib/useGameSocket";
import type { GameEvent, Holding, PlayerResult, PublicPlayer } from "@/app/_lib/types";
import { usd } from "@/app/_lib/format";
import { baseUnitsToNumber } from "@/app/_lib/units";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { PnlChartView, type Series } from "@/app/_components/PnlChart";
import { Avatar, BotAvatar, Spinner } from "@/app/_components/ui";

type Msg = { role: "you" | "agent" | "system"; text: string; txHash?: string };

const COLORS = ["#C5F72B", "#34D6E0", "#FF36A3", "#ff8a3d", "#3da5ff", "#A6D61F", "#8B909C"];

// Known Base tokens so trade lines read "Swapped 0.05 USDC → WETH" instead of raw addresses.
const TOKEN_META: Record<string, { symbol: string; decimals: number }> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": { symbol: "ETH", decimals: 18 },
};
function tokenMeta(addr: string) {
  return TOKEN_META[(addr || "").toLowerCase()] ?? { symbol: `${(addr || "").slice(0, 6)}…`, decimals: 18 };
}
function fmtTokenAmount(base: string, decimals: number) {
  const n = baseUnitsToNumber(base, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 6 : 4 });
}

export default function LivePage() {
  const { ready, authenticated, user } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { joinedMatchId, playerId, agent, reset } = useGame();
  const now = useNow(1000);

  const { game, players, view } = useMatchView(params.id);

  // Live screen requires being joined+confirmed to this match.
  useEffect(() => {
    if (ready && (!authenticated || joinedMatchId !== params.id)) {
      router.replace(`/match/${params.id}`);
    }
  }, [ready, authenticated, joinedMatchId, params.id, router]);

  const entryUsd = game ? baseUnitsToNumber(game.entryAmount) : 0;

  // Live NAV per player (USD), a time-stamped NAV history for the chart, and your wallet tokens.
  const [navByPlayer, setNavByPlayer] = useState<Record<string, number>>({});
  const [navHistory, setNavHistory] = useState<Record<string, { t: number; nav: number }[]>>({});
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [settled, setSettled] = useState<{
    winnerPlayerId: string | null;
    potUsd: number;
    results: PlayerResult[];
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nameById = useMemo(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => (m[p.id] = p.displayName));
    return m;
  }, [players]);

  // Real-time game stream.
  const onEvent = useMemo(
    () => (e: GameEvent) => {
      if (e.type === "portfolio_update") {
        const pid = e.data.playerId as string;
        const navUsd = Number(e.data.navUsd ?? 0);
        if (!pid || !Number.isFinite(navUsd)) return;
        setNavByPlayer((prev) => ({ ...prev, [pid]: navUsd }));
        setNavHistory((prev) => ({ ...prev, [pid]: [...(prev[pid] ?? []), { t: e.ts, nav: navUsd }].slice(-120) }));
        if (pid === playerId && Array.isArray(e.data.holdings)) {
          setHoldings(e.data.holdings as Holding[]);
        }
      }
      if (e.type === "agent_thinking" && e.data.playerId === playerId) {
        setThinking(true);
      }
      if (e.type === "agent_update" && e.data.playerId === playerId) {
        setThinking(false);
        const summary = String(e.data.summary ?? "").trim();
        if (summary) setMessages((m) => [...m, { role: "agent", text: summary }]);
      }
      if (e.type === "trade_executed" && e.data.playerId === playerId) {
        const f = tokenMeta(String(e.data.fromToken ?? ""));
        const t = tokenMeta(String(e.data.toToken ?? ""));
        const amt = fmtTokenAmount(String(e.data.fromAmount ?? "0"), f.decimals);
        setMessages((m) => [
          ...m,
          {
            role: "system",
            text: `↗ Swapped ${amt} ${f.symbol} → ${t.symbol}`,
            txHash: e.data.txHash ? String(e.data.txHash) : undefined,
          },
        ]);
      }
      if (e.type === "trade_failed" && e.data.playerId === playerId) {
        setThinking(false);
        const f = tokenMeta(String(e.data.fromToken ?? ""));
        const t = tokenMeta(String(e.data.toToken ?? ""));
        const reason = String(e.data.reason ?? "trade reverted");
        setMessages((m) => [...m, { role: "system", text: `⚠ ${f.symbol} → ${t.symbol} failed: ${reason}` }]);
      }
      if (e.type === "game_ended") {
        const results = (e.data.results as PlayerResult[] | undefined) ?? [];
        setSettled({
          winnerPlayerId: results[0]?.playerId ?? null,
          potUsd: entryUsd * Math.max(results.length, players.length),
          results,
        });
      }
    },
    [entryUsd, playerId, players.length],
  );

  const { connected } = useGameSocket(view ? params.id : null, onEvent);

  // Seed NAV at the entry amount for every player we know about (until live data arrives).
  useEffect(() => {
    setNavByPlayer((prev) => {
      const next = { ...prev };
      players.forEach((p) => {
        if (next[p.id] === undefined) next[p.id] = entryUsd;
      });
      return next;
    });
  }, [players, entryUsd]);

  // If the match already ended before we connected, pull the settled result.
  useEffect(() => {
    if (view?.bucket !== "ended") return;
    api
      .getResults(params.id)
      .then((s) => {
        if (s)
          setSettled({
            winnerPlayerId: s.winnerPlayerId,
            potUsd: entryUsd * Math.max(s.perPlayer.length, 1),
            results: s.perPlayer,
          });
      })
      .catch(() => {});
  }, [view?.bucket, params.id, entryUsd]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // Safety net: never leave the "thinking…" indicator stuck if no agent_update arrives.
  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => setThinking(false), 60_000);
    return () => clearTimeout(t);
  }, [thinking]);

  if (!ready || !user || !game || !view) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted">
        <Spinner /> <span className="text-sm">Entering the arena…</span>
      </div>
    );
  }

  const live = view.bucket === "live";
  // The bell has rung once the game ended or we're past endsAt (settling) — agent locks here.
  const over = view.bucket === "ended" || (!!view.endsAt && now >= view.endsAt);
  const canInstruct = live && !over;
  const myNav = playerId ? (navByPlayer[playerId] ?? entryUsd) : entryUsd;
  const myPnl = entryUsd > 0 ? ((myNav - entryUsd) / entryUsd) * 100 : 0;

  const standings = [...players]
    .map((p, i) => ({
      player: p,
      nav: navByPlayer[p.id] ?? entryUsd,
      pnl: entryUsd > 0 ? (((navByPlayer[p.id] ?? entryUsd) - entryUsd) / entryUsd) * 100 : 0,
      color: COLORS[i % COLORS.length],
    }))
    .sort((a, b) => b.nav - a.nav);
  const myRank = standings.findIndex((s) => s.player.id === playerId) + 1;

  // Time-based chart domain: the whole match window. The line is seeded at the start (0%), the
  // real Octav snapshots, then a trailing point at "now" holding the last NAV so it scrolls live.
  const startedAtMs = game.startedAt ? Date.parse(game.startedAt) : view.endsAt ? view.endsAt - 5 * 60_000 : now;
  const endsAtMs = view.endsAt ?? startedAtMs + 5 * 60_000;
  const nowClamped = Math.min(now, endsAtMs);
  const series: Series[] = standings.map((s, i) => {
    const hist = navHistory[s.player.id] ?? [];
    const lastNav = hist.length ? hist[hist.length - 1].nav : entryUsd;
    const raw = [{ t: startedAtMs, nav: entryUsd }, ...hist, { t: nowClamped, nav: lastNav }];
    const points = raw.map((h) => ({ t: h.t, v: entryUsd > 0 ? ((h.nav - entryUsd) / entryUsd) * 100 : 0 }));
    return {
      id: s.player.id,
      name: s.player.displayName,
      you: s.player.id === playerId,
      color: s.player.id === playerId ? "#C5F72B" : COLORS[(i + 1) % COLORS.length],
      points,
    };
  });

  // Show the entry USDC right away (until Octav's first 60s snapshot replaces it with real holdings).
  const displayHoldings: Holding[] =
    holdings.length > 0
      ? holdings
      : live && playerId
        ? [{ symbol: "USDC", name: "USD Coin", valueUsd: String(myNav), balance: String(myNav), priceUsd: "1", contract: game.entryToken, chain: "base" }]
        : [];

  const send = async () => {
    const text = draft.trim();
    if (!text || !playerId || sending || !canInstruct) return;
    setDraft("");
    setMessages((m) => [...m, { role: "you", text }]);
    setThinking(true); // optimistic — the BE wakes the agent, so a tick fires within ~1-2s
    setSending(true);
    try {
      await api.instruct(params.id, playerId, text);
    } catch {
      setMessages((m) => [...m, { role: "system", text: "⚠ couldn't reach your agent — try again." }]);
    } finally {
      setSending(false);
    }
  };

  if (settled) {
    return (
      <ResultsScreen
        winnerPlayerId={settled.winnerPlayerId}
        results={settled.results}
        myPlayerId={playerId}
        pot={settled.potUsd}
        nameById={nameById}
        onExit={() => {
          reset();
          router.replace("/dashboard");
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-[max(env(safe-area-inset-top),0.9rem)]">
        <div>
          <h1 className="font-display text-[18px] font-bold uppercase leading-none tracking-tight">{view.name}</h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <Radio className="h-3.5 w-3.5" style={{ color: live && !over ? "var(--color-loss)" : "var(--color-muted)" }} />
            {over ? (
              "Match over · settling results…"
            ) : live ? (
              <>
                LIVE · ends in{" "}
                <span className="font-mono text-fg">{view.endsAt ? formatDelta(view.endsAt - now) : "—"}</span>
              </>
            ) : (
              "Lobby · waiting for the bell"
            )}
          </p>
        </div>
        <span className="rounded-pill bg-[color:var(--color-surface)] px-3 py-1.5 font-mono text-[13px] font-bold text-fg">
          {myRank > 0 ? `#${myRank}` : "—"} <span className="text-muted">/ {players.length}</span>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5">
        {/* NAV / PnL */}
        <div className="rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted">
                Your NAV · via Octav
                {live && !over && (
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-profit)]" />
                )}
              </p>
              <p className="font-display text-[30px] font-bold leading-none tnum">{usd(myNav)}</p>
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
                {usd(Math.abs(myNav - entryUsd))}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <PnlChartView series={series} xMin={startedAtMs} xMax={endsAtMs} height={150} />
          </div>
        </div>

        {/* your wallet (Octav holdings) */}
        {displayHoldings.length > 0 && (
          <div className="rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3">
            <p className="px-1 pb-2 text-[11px] uppercase tracking-[0.14em] text-muted">Your wallet</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {displayHoldings.map((h) => (
                <div
                  key={`${h.chain}:${h.contract}`}
                  className="flex shrink-0 items-center gap-2 rounded-pill border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-2.5 py-1.5"
                >
                  {h.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.image} alt={h.symbol} className="h-5 w-5 rounded-full" />
                  ) : (
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--color-surface)] text-[8px] font-bold text-muted">
                      {h.symbol.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[12px] font-semibold uppercase text-fg">{h.symbol || "—"}</span>
                  <span className="font-mono text-[12px] text-muted">{usd(Number(h.valueUsd) || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* standings */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {standings.slice(0, 8).map((s, i) => (
            <div
              key={s.player.id}
              className={`flex shrink-0 items-center gap-2 rounded-pill border px-2.5 py-1.5 ${
                s.player.id === playerId
                  ? "border-[color:var(--color-lime)]/50 bg-[color:var(--color-lime)]/10"
                  : "border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
              }`}
            >
              <span className="font-mono text-[11px] text-muted">{i + 1}</span>
              <span className="text-[12px] font-semibold text-fg">
                {s.player.id === playerId ? "You" : s.player.displayName}
              </span>
              <span
                className="font-mono text-[12px]"
                style={{ color: s.pnl >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
              >
                {s.pnl >= 0 ? "+" : ""}
                {s.pnl.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        {/* agent chat */}
        <div className="flex min-h-0 flex-1 flex-col rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          <div className="flex items-center gap-2 border-b border-[color:var(--color-line)] px-4 py-2.5">
            <BotAvatar seed={agent?.name || (playerId ? nameById[playerId] : "agent")} size={26} />
            <span className="text-[13px] font-semibold text-fg">
              {agent?.name || (playerId ? nameById[playerId] : "Your agent")}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: over ? "var(--color-muted)" : connected ? "var(--color-profit)" : "var(--color-muted)" }}
              />
              {over ? "locked" : live ? "trading" : connected ? "connected" : "offline"}
            </span>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 no-scrollbar">
            {messages.length === 0 && (
              <p className="px-2 py-6 text-center text-[12.5px] text-dim">
                {live
                  ? "Your agent is trading. Its moves will show up here — send it a nudge below."
                  : "The arena opens at the bell. Your agent goes live automatically, then talks here."}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                    m.role === "you"
                      ? "bg-[color:var(--color-lime)] text-black"
                      : m.role === "system"
                        ? "bg-transparent text-[12px] text-muted"
                        : "bg-[color:var(--color-surface-2)] text-fg"
                  }`}
                >
                  {m.role === "system" && m.txHash ? (
                    <a
                      href={`https://basescan.org/tx/${m.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2 hover:text-fg"
                    >
                      {m.text} ↗
                    </a>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-muted">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-muted)]"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
                <span className="ml-1">your agent is thinking…</span>
              </div>
            )}
          </div>
          {over ? (
            <div className="border-t border-[color:var(--color-line)] p-3 text-center text-[12px] text-dim">
              🔒 The bell rang — your agent is locked. Settling the final results…
            </div>
          ) : (
            <div className="flex items-center gap-2 border-t border-[color:var(--color-line)] p-2.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                disabled={!canInstruct}
                placeholder={live ? "Tell your agent what to do…" : "Your agent goes live at the bell…"}
                className="flex-1 bg-transparent px-2 text-[14px] text-fg outline-none placeholder:text-dim disabled:opacity-60"
              />
              <button
                onClick={send}
                disabled={sending || !canInstruct}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--color-lime)] text-black transition active:scale-95 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <p className="pb-3 text-center text-[11px] text-dim">
          🔒 Locked in until the bell. No exits — winner takes {usd(entryUsd * players.length)}.
        </p>
      </div>
    </div>
  );
}

function ResultsScreen({
  winnerPlayerId,
  results,
  myPlayerId,
  pot,
  nameById,
  onExit,
}: {
  winnerPlayerId: string | null;
  results: PlayerResult[];
  myPlayerId: string | null;
  pot: number;
  nameById: Record<string, string>;
  onExit: () => void;
}) {
  const youWon = !!winnerPlayerId && winnerPlayerId === myPlayerId;
  const winnerName =
    (winnerPlayerId && (nameById[winnerPlayerId] || results.find((r) => r.playerId === winnerPlayerId)?.displayName)) ||
    "No one";
  const ranked = [...results].sort((a, b) => a.rank - b.rank);

  return (
    <div className="relative flex h-dvh flex-col items-center overflow-y-auto px-6 py-10 text-center no-scrollbar">
      {Array.from({ length: 18 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-2 w-2 rounded-sm"
          style={{ left: `${(i * 53) % 100}%`, background: ["#C5F72B", "#ff8a3d", "#FF36A3", "#34D6E0"][i % 4] }}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: ["-10%", "110%"], opacity: [0, 1, 0], rotate: 360 }}
          transition={{ duration: 2.4 + (i % 5) * 0.3, repeat: Infinity, delay: (i % 6) * 0.2 }}
        />
      ))}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="relative z-10 flex flex-col items-center gap-3"
      >
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[color:var(--color-lime)] text-black">
          <Trophy className="h-8 w-8" />
        </span>
        <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-[color:var(--color-lime)]">Victory Royale</p>
        <h1 className="font-display text-[30px] font-bold uppercase leading-none tracking-tight">
          {youWon ? "You took the pot!" : `${winnerName} wins`}
        </h1>
        <p className="font-display text-[40px] font-bold text-[color:var(--color-lime)] tnum">{usd(pot)}</p>
        <p className="text-[13px] text-muted">
          {youWon ? "Pot settled to your wallet." : "Better luck next Match — don't get Rekt."}
        </p>
      </motion.div>

      {/* final standings */}
      <div className="relative z-10 mt-6 w-full max-w-md space-y-2">
        {ranked.length === 0 && <p className="text-[13px] text-dim">Final results are being settled…</p>}
        {ranked.map((r) => {
          const you = r.playerId === myPlayerId;
          const finalUsd = baseUnitsToNumber(r.finalUsdc);
          const pnlUsd = baseUnitsToNumber(r.pnl);
          return (
            <div
              key={r.playerId}
              className={`flex items-center gap-3 rounded-card border px-4 py-3 text-left ${
                you
                  ? "border-[color:var(--color-lime)]/60 bg-[color:var(--color-lime)]/10"
                  : "border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
              }`}
            >
              <span className="w-5 text-center font-mono text-[13px] font-bold text-muted">{r.rank}</span>
              <Avatar name={you ? "You" : r.displayName} size={30} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">
                {you ? "You" : r.displayName}
                {r.playerId === winnerPlayerId && " 👑"}
              </span>
              <div className="text-right">
                <p className="font-display text-[15px] font-bold tnum">{usd(finalUsd)}</p>
                <p
                  className="font-mono text-[11px]"
                  style={{ color: pnlUsd >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
                >
                  {pnlUsd >= 0 ? "+" : "−"}
                  {usd(Math.abs(pnlUsd))}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onExit}
        className="relative z-10 mt-6 h-12 shrink-0 rounded-pill bg-[color:var(--color-lime)] px-8 font-semibold text-black transition active:scale-95"
      >
        Back to The Lobby
      </button>
    </div>
  );
}
