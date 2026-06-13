"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Clock, Lock, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { getMatchBase, opponentsFor, resolveMatch } from "@/app/_lib/matches";
import { usd } from "@/app/_lib/format";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { AppShell } from "@/app/_components/AppShell";
import { MatchBanner } from "@/app/_components/MatchBanner";
import { Avatar, Button, Card, Reveal } from "@/app/_components/ui";

export default function MatchDetailPage() {
  return (
    <AppShell>
      <MatchDetail />
    </AppShell>
  );
}

function MatchDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { authenticated, login } = useAuth();
  const { anchorAt, joinedMatchId, join } = useGame();
  const now = useNow(1000);
  const [depositOpen, setDepositOpen] = useState(false);

  const base = getMatchBase(params.id);
  if (!base) {
    return <Card className="mt-4 p-8 text-center text-muted">Match not found.</Card>;
  }
  if (!anchorAt || !now) return null;

  const match = resolveMatch(base, anchorAt, now);
  const youreIn = joinedMatchId === match.id;
  const lockedOut = !!joinedMatchId && !youreIn;
  const preview = opponentsFor(match.id, Math.min(match.playersJoined, 8));

  const confirmDeposit = () => {
    join(match.id);
    setDepositOpen(false);
    router.push(`/match/${match.id}/setup`);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      <Reveal>
        <MatchBanner seed={match.bannerSeed} name={match.name} height={150} />
      </Reveal>

      {/* status + countdown */}
      <Reveal delay={0.05}>
        <div className="flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Clock className="h-4 w-4 text-[color:var(--color-lime)]" />
            {match.status === "upcoming"
              ? `Starts in ${formatDelta(match.startsAt - now)}`
              : match.status === "live"
                ? `Ends in ${formatDelta(match.endsAt - now)}`
                : "Ended"}
          </span>
          <span
            className={`rounded-pill px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              match.status === "live"
                ? "bg-[color:var(--color-lime)]/15 text-[color:var(--color-lime)]"
                : match.status === "upcoming"
                  ? "bg-[color:var(--color-profit)]/15 text-[color:var(--color-profit)]"
                  : "bg-[color:var(--color-surface-2)] text-dim"
            }`}
          >
            {match.status === "live" ? "Live" : match.status === "upcoming" ? "Open" : "Ended"}
          </span>
        </div>
      </Reveal>

      {/* stats */}
      <Reveal delay={0.08}>
        <Card className="grid grid-cols-3 divide-x divide-[color:var(--color-line)] p-0">
          <Stat label="Prize pool" value={usd(match.prizePoolUsd)} accent />
          <Stat label="Entry" value={usd(match.entryFeeUsd)} />
          <Stat label="Players" value={`${match.playersJoined}/${match.maxPlayers}`} />
        </Card>
      </Reveal>

      {/* description */}
      <Reveal delay={0.1}>
        <Card className="p-5">
          <h3 className="font-display text-[14px] font-semibold uppercase tracking-wide text-fg">
            Briefing
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{match.description}</p>
          <div className="mt-4 flex items-center gap-2 border-t border-[color:var(--color-line)] pt-4">
            <Users className="h-4 w-4 text-[color:var(--color-lime)]" />
            <div className="flex -space-x-2">
              {preview.map((p) => (
                <Avatar key={p.id} name={p.name} size={26} className="ring-2 ring-[color:var(--color-surface)]" />
              ))}
            </div>
            <span className="text-[12.5px] text-muted">
              {match.onlineNow} traders online · {match.spotsLeft} spots left
            </span>
          </div>
        </Card>
      </Reveal>

      <div className="flex-1" />

      {/* CTA */}
      <Reveal delay={0.14}>
        {!authenticated ? (
          match.status === "upcoming" ? (
            <Button fullWidth onClick={login}>
              <Wallet className="h-4 w-4" /> Connect wallet to join
            </Button>
          ) : (
            <Button variant="dark" fullWidth disabled>
              {match.status === "live" ? "Registration closed" : "Match ended"}
            </Button>
          )
        ) : youreIn ? (
          <Button
            fullWidth
            onClick={() =>
              router.push(`/match/${match.id}/${match.status === "live" ? "live" : "setup"}`)
            }
          >
            {match.status === "live" ? "Enter The Arena" : "Set up your agent"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : lockedOut ? (
          <Button variant="dark" fullWidth disabled>
            <Lock className="h-4 w-4" /> You&apos;re already in a Match
          </Button>
        ) : match.status === "upcoming" ? (
          <Button fullWidth onClick={() => setDepositOpen(true)}>
            Register · Buy in {usd(match.entryFeeUsd)}
          </Button>
        ) : (
          <Button variant="dark" fullWidth disabled>
            {match.status === "live" ? "Registration closed" : "Match ended"}
          </Button>
        )}
      </Reveal>

      {/* Deposit sheet */}
      <AnimatePresence>
        {depositOpen && (
          <DepositSheet
            entry={match.entryFeeUsd}
            name={match.name}
            onClose={() => setDepositOpen(false)}
            onConfirm={confirmDeposit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <span
        className={`font-display text-[18px] font-bold leading-none tnum ${
          accent ? "text-[color:var(--color-lime)]" : "text-fg"
        }`}
      >
        {value}
      </span>
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}

function DepositSheet({
  entry,
  name,
  onClose,
  onConfirm,
}: {
  entry: number;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const go = () => {
    setLoading(true);
    setTimeout(onConfirm, 900); // mock deposit confirmation
  };
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative mx-auto w-full max-w-md rounded-t-card border-t border-[color:var(--color-line-strong)] bg-[color:var(--color-surface)] p-5 pb-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[18px] font-bold uppercase tracking-tight">Confirm buy-in</h3>
          <button onClick={onClose} className="text-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-card bg-[color:var(--color-surface-2)] p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14px] text-muted">
              <Wallet className="h-4 w-4" /> Deposit to {name} pool
            </span>
            <span className="font-display text-[22px] font-bold text-[color:var(--color-lime)] tnum">
              {usd(entry)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-card border border-[color:var(--color-line)] px-4 py-3 text-[12.5px] text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-lime)]" />
          <span>
            Your buy-in is locked in the prize pool for the whole Match. <b className="text-fg">You can&apos;t leave once you join.</b> Winner takes the pot.
          </span>
        </div>

        <Button fullWidth className="mt-4" onClick={go} disabled={loading}>
          {loading ? "Depositing…" : `Deposit ${usd(entry)} & join`}
        </Button>
      </motion.div>
    </motion.div>
  );
}
