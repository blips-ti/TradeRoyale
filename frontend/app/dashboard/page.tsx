"use client";

import { useState } from "react";
import { Radio, WifiOff } from "lucide-react";
import { useGame } from "@/app/_lib/store";
import { useGames } from "@/app/_lib/useGames";
import { useNow } from "@/app/_lib/useNow";
import { usd } from "@/app/_lib/format";
import { AppShell } from "@/app/_components/AppShell";
import { MatchCard } from "@/app/_components/MatchCard";
import { Card, Reveal, Spinner } from "@/app/_components/ui";

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { joinedMatchId } = useGame();
  const now = useNow(1000);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const { views, loading, error } = useGames();

  const visible = tab === "mine" ? views.filter((v) => v.id === joinedMatchId) : views;
  // Ongoing (lobby): fullest first. Live: least time remaining.
  const ongoing = visible.filter((v) => v.bucket === "ongoing").sort((a, b) => b.playerCount - a.playerCount);
  const liveList = visible.filter((v) => v.bucket === "live").sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0));

  const liveCount = views.filter((v) => v.bucket === "live").length;
  const totalPlayers = views.reduce((a, v) => a + v.playerCount, 0);
  const topPot = views.reduce((a, v) => Math.max(a, v.prizePoolUsd), 0);

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      {/* live stats strip */}
      <Reveal>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Players" value={totalPlayers.toLocaleString()} live />
          <StatTile label="Live now" value={`${liveCount}`} />
          <StatTile label="Top pot" value={usd(topPot)} accent />
        </div>
      </Reveal>

      {/* segmented control */}
      <Reveal delay={0.04}>
        <div className="flex rounded-pill bg-[color:var(--color-surface)] p-1">
          {(["all", "mine"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-pill py-2.5 text-[14px] font-semibold tracking-tight transition ${
                tab === t ? "bg-[color:var(--color-lime)] text-black" : "text-muted"
              }`}
            >
              {t === "all" ? "All Matches" : "My Match"}
            </button>
          ))}
        </div>
      </Reveal>

      {/* body states */}
      {loading && views.length === 0 ? (
        <Reveal delay={0.08}>
          <Card className="flex items-center justify-center gap-2 p-8 text-[14px] text-muted">
            <Spinner /> Loading Matches…
          </Card>
        </Reveal>
      ) : error && views.length === 0 ? (
        <Reveal delay={0.08}>
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <WifiOff className="h-6 w-6 text-[color:var(--color-loss)]" />
            <p className="text-[14px] text-fg">Can&apos;t reach the arena</p>
            <p className="text-[12.5px] text-muted">The backend isn&apos;t responding. It&apos;ll appear here once it&apos;s live.</p>
          </Card>
        </Reveal>
      ) : visible.length === 0 ? (
        <Reveal delay={0.08}>
          <Card className="p-8 text-center text-[14px] text-muted">
            {tab === "mine" ? "You haven't joined a Match yet." : "No open Matches right now."}
          </Card>
        </Reveal>
      ) : (
        <div className="flex flex-col gap-3">
          {ongoing.length > 0 && (
            <>
              <Reveal delay={0.08}>
                <SectionHead title="Ongoing" count={ongoing.length} />
              </Reveal>
              {ongoing.map((m, i) => (
                <Reveal key={m.id} delay={0.1 + i * 0.04}>
                  <MatchCard match={m} now={now} joinedGameId={joinedMatchId} />
                </Reveal>
              ))}
            </>
          )}
          {liveList.length > 0 && (
            <>
              <Reveal delay={0.12}>
                <SectionHead title="Live" count={liveList.length} live />
              </Reveal>
              {liveList.map((m, i) => (
                <Reveal key={m.id} delay={0.14 + i * 0.04}>
                  <MatchCard match={m} now={now} joinedGameId={joinedMatchId} />
                </Reveal>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, count, live }: { title: string; count: number; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      {live && <span className="pulse-live inline-block h-2 w-2 rounded-full bg-[color:var(--color-loss)]" />}
      <h2
        className="font-display text-[15px] font-bold uppercase tracking-wide"
        style={{ color: live ? "var(--color-loss)" : "var(--color-fg)" }}
      >
        {title}
      </h2>
      <span className="grid h-5 min-w-5 place-items-center rounded-md bg-[color:var(--color-surface-2)] px-1 text-[11px] font-bold text-muted">
        {count}
      </span>
    </div>
  );
}

function StatTile({ label, value, accent, live }: { label: string; value: string; accent?: boolean; live?: boolean }) {
  return (
    <Card className="flex flex-col items-center gap-1 p-3">
      <span className={`font-display text-[19px] font-bold leading-none tnum ${accent ? "text-[color:var(--color-lime)]" : "text-fg"}`}>
        {value}
      </span>
      <span className="flex items-center gap-1 text-[10.5px] uppercase tracking-[0.12em] text-muted">
        {live && <Radio className="h-3 w-3 text-[color:var(--color-profit)]" />}
        {label}
      </span>
    </Card>
  );
}
