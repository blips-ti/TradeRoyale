"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Lock } from "lucide-react";
import type { MatchView } from "@/app/_lib/gameView";
import { usd } from "@/app/_lib/format";
import { formatDelta } from "@/app/_lib/useNow";
import { Card, LiveBadge, MatchLogo, Status, Tag } from "./ui";

export function MatchCard({
  match,
  now,
  joinedGameId,
  featured = false,
}: {
  match: MatchView;
  now: number;
  joinedGameId: string | null;
  featured?: boolean;
}) {
  const youreIn = joinedGameId === match.id;
  const lockedOut = !!joinedGameId && !youreIn;
  const live = match.bucket === "live";
  const ended = match.bucket === "ended";

  const countdown = live
    ? match.endsAt
      ? `Ends in ${formatDelta(match.endsAt - now)}`
      : "Live"
    : ended
      ? "Ended"
      : "Open lobby";

  return (
    <Link href={`/match/${match.id}`} className="block transition active:scale-[0.99]">
      <Card className={`p-5 ${live ? "live-card border-[color:var(--color-loss)]/50" : ""} ${ended ? "opacity-60" : ""}`}>
        {/* header: logo + title + tags */}
        <div className="flex items-start gap-3">
          <MatchLogo seed={match.name} size={featured ? 56 : 50} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-[20px] font-bold uppercase leading-tight tracking-tight">
                {match.name}
              </h3>
              <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-muted" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {match.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="mt-4 flex items-end gap-7">
          <Metric value={usd(match.prizePoolUsd)} label="Prize pool" accent />
          <Metric value={usd(match.entryUsd)} label="Entry" />
          <Metric value={`${match.playerCount}/${match.maxPlayers}`} label="Players" dim />
        </div>

        <div className="mt-4 h-px w-full bg-[color:var(--color-line)]" />

        {/* footer: countdown + status */}
        <div className="mt-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Clock className="h-4 w-4" style={{ color: live ? "var(--color-loss)" : "var(--color-lime)" }} />
            {countdown} · {match.durationMin} min
            {match.playerCount > 0 && (
              <span className="ml-1 inline-flex items-center gap-1 text-[12px]">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-profit)]" />
                {match.playerCount}
              </span>
            )}
          </span>
          {ended ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-[color:var(--color-surface-2)] px-3 py-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-dim">
              Ended
            </span>
          ) : youreIn ? (
            <Status kind="registered" />
          ) : lockedOut ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-[color:var(--color-surface-2)] px-3 py-1.5 text-[12.5px] font-medium text-dim">
              <Lock className="h-3.5 w-3.5" /> Locked
            </span>
          ) : live ? (
            <LiveBadge />
          ) : (
            <Status kind="open" />
          )}
        </div>
      </Card>
    </Link>
  );
}

function Metric({ value, label, accent, dim }: { value: string; label: string; accent?: boolean; dim?: boolean }) {
  return (
    <div className="leading-none">
      <p
        className={`font-display text-[22px] font-bold tracking-tight tnum ${
          accent ? "text-[color:var(--color-lime)]" : dim ? "text-muted" : "text-fg"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[13px] text-muted">{label}</p>
    </div>
  );
}
