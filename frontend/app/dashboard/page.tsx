"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { useGame } from "@/app/_lib/store";
import { resolveAll } from "@/app/_lib/matches";
import { useNow } from "@/app/_lib/useNow";
import { usd } from "@/app/_lib/format";
import { AppShell } from "@/app/_components/AppShell";
import { MatchCard } from "@/app/_components/MatchCard";
import { Card, Reveal } from "@/app/_components/ui";

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { anchorAt, joinedMatchId } = useGame();
  const now = useNow(1000);
  const [tab, setTab] = useState<"all" | "mine">("all");

  if (!anchorAt || !now) return null;

  const matches = resolveAll(anchorAt, now);
  const live = matches.filter((m) => m.status === "live").length;
  const totalOnline = matches.reduce((a, m) => a + m.onlineNow, 0);
  const biggestPot = Math.max(...matches.map((m) => m.prizePoolUsd));

  const shown = tab === "mine" ? matches.filter((m) => m.id === joinedMatchId) : matches;
  // Upcoming first (soonest start), then live (least time remaining).
  const upcoming = shown
    .filter((m) => m.status === "upcoming")
    .sort((a, b) => a.startsAt - b.startsAt);
  const liveList = shown.filter((m) => m.status === "live").sort((a, b) => a.endsAt - b.endsAt);

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      {/* live stats strip */}
      <Reveal>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Online" value={totalOnline.toLocaleString()} live />
          <StatTile label="Live now" value={`${live}`} />
          <StatTile label="Top pot" value={usd(biggestPot)} accent />
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

      {shown.length === 0 ? (
        <Reveal delay={0.08}>
          <Card className="p-8 text-center text-[14px] text-muted">
            {tab === "mine" ? "You haven't joined a Match yet." : "No Matches right now."}
          </Card>
        </Reveal>
      ) : (
        <div className="flex flex-col gap-3">
          {upcoming.length > 0 && (
            <>
              <Reveal delay={0.08}>
                <SectionHead title="Ongoing" count={upcoming.length} />
              </Reveal>
              {upcoming.map((m, i) => (
                <Reveal key={m.id} delay={0.1 + i * 0.04}>
                  <MatchCard match={m} now={now} joinedMatchId={joinedMatchId} />
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
                  <MatchCard match={m} now={now} joinedMatchId={joinedMatchId} />
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

function StatTile({
  label,
  value,
  accent,
  live,
}: {
  label: string;
  value: string;
  accent?: boolean;
  live?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center gap-1 p-3">
      <span
        className={`font-display text-[19px] font-bold leading-none tnum ${
          accent ? "text-[color:var(--color-lime)]" : "text-fg"
        }`}
      >
        {value}
      </span>
      <span className="flex items-center gap-1 text-[10.5px] uppercase tracking-[0.12em] text-muted">
        {live && <Radio className="h-3 w-3 text-[color:var(--color-profit)]" />}
        {label}
      </span>
    </Card>
  );
}
