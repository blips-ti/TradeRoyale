"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Lock } from "lucide-react";
import type { Match } from "@/app/_lib/matches";
import { usd } from "@/app/_lib/format";
import { formatDelta } from "@/app/_lib/useNow";
import { Card, LiveBadge, MatchLogo, Status, Tag } from "./ui";

export function MatchCard({
  match,
  now,
  joinedMatchId,
  featured = false,
}: {
  match: Match;
  now: number;
  joinedMatchId: string | null;
  featured?: boolean;
}) {
  const youreIn = joinedMatchId === match.id;
  const lockedOut = !!joinedMatchId && !youreIn;
  const live = match.status === "live";

  const countdown =
    match.status === "upcoming"
      ? `Starts in ${formatDelta(match.startsAt - now)}`
      : live
        ? `Ends in ${formatDelta(match.endsAt - now)}`
        : "Ended";

  return (
    <Link href={`/match/${match.id}`} className="block transition active:scale-[0.99]">
      <Card className={`p-5 ${live ? "live-card border-[color:var(--color-loss)]/50" : ""}`}>
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
          <Metric value={usd(match.entryFeeUsd)} label="Entry" />
          <Metric value={`${match.playersJoined}/${match.maxPlayers}`} label="Players" dim />
        </div>

        <div className="mt-4 h-px w-full bg-[color:var(--color-line)]" />

        {/* footer: countdown + status */}
        <div className="mt-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Clock
              className="h-4 w-4"
              style={{ color: live ? "var(--color-loss)" : "var(--color-lime)" }}
            />
            {countdown}
            <span className="ml-1 inline-flex items-center gap-1 text-[12px]">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-profit)]" />
              {match.onlineNow}
            </span>
          </span>
          {youreIn ? (
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
