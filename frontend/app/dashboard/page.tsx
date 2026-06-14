"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Radio, WifiOff, X } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { useGames } from "@/app/_lib/useGames";
import { useNow } from "@/app/_lib/useNow";
import { api } from "@/app/_lib/api";
import { usd } from "@/app/_lib/format";
import { AppShell } from "@/app/_components/AppShell";
import { MatchCard } from "@/app/_components/MatchCard";
import { Button, Card, Reveal, Spinner } from "@/app/_components/ui";

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { authenticated } = useAuth();
  const { joinedMatchId } = useGame();
  const now = useNow(1000);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [showCreate, setShowCreate] = useState(false);
  const { views, loading, error, refresh } = useGames();

  const visible = tab === "mine" ? views.filter((v) => v.id === joinedMatchId) : views;
  // Ongoing (lobby): fullest first. Live: least time remaining.
  const ongoing = visible.filter((v) => v.bucket === "ongoing").sort((a, b) => b.playerCount - a.playerCount);
  const liveList = visible.filter((v) => v.bucket === "live").sort((a, b) => (a.endsAt ?? 0) - (b.endsAt ?? 0));
  const endedList = visible.filter((v) => v.bucket === "ended").sort((a, b) => (b.endsAt ?? 0) - (a.endsAt ?? 0));

  // Active games only — a user is in at most one non-ended game, so this is the real player
  // count (ended games' leftover player records would otherwise inflate it).
  const active = views.filter((v) => v.bucket !== "ended");
  const liveCount = active.filter((v) => v.bucket === "live").length;
  const totalPlayers = active.reduce((a, v) => a + v.playerCount, 0);
  const topPot = active.reduce((a, v) => Math.max(a, v.prizePoolUsd), 0);

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
          {endedList.length > 0 && (
            <>
              <Reveal delay={0.16}>
                <SectionHead title="Ended" count={endedList.length} />
              </Reveal>
              {endedList.map((m, i) => (
                <Reveal key={m.id} delay={0.18 + i * 0.04}>
                  <MatchCard match={m} now={now} joinedGameId={joinedMatchId} />
                </Reveal>
              ))}
            </>
          )}
        </div>
      )}

      {/* Floating create-competition button (connected users only). */}
      {authenticated && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-end px-5 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Create a competition"
            className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-[color:var(--color-lime)] text-black shadow-[var(--shadow-lime)] transition active:scale-95"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateMatchSheet
            onClose={() => setShowCreate(false)}
            onCreated={async () => {
              await refresh();
              setShowCreate(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Slide-up sheet to create a new competition. Collects name, description, max players, entry ($),
// and duration (min); POSTs to the backend, then refreshes the list.
function CreateMatchSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [players, setPlayers] = useState("2");
  const [entry, setEntry] = useState("5");
  const [duration, setDuration] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const maxPlayers = Math.round(Number(players));
    const entryUsd = Number(entry);
    const durationMin = Math.round(Number(duration));
    if (!name.trim()) return setError("Give your competition a name.");
    if (!Number.isFinite(maxPlayers) || maxPlayers < 2) return setError("At least 2 players.");
    if (!Number.isFinite(entryUsd) || entryUsd <= 0) return setError("Entry must be more than $0.");
    if (!Number.isFinite(durationMin) || durationMin < 1) return setError("Duration must be at least 1 minute.");

    setSubmitting(true);
    setError(null);
    try {
      // USDC has 6 decimals: dollars → base units.
      const entryAmount = String(Math.round(entryUsd * 1_000_000));
      await api.createGame({
        name: name.trim(),
        description: description.trim() || undefined,
        entryAmount,
        maxPlayers,
        durationSec: durationMin * 60,
      });
      await onCreated();
    } catch (e) {
      setError((e as Error).message || "Couldn't create the competition.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[22px] border-t border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-3 no-scrollbar"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[color:var(--color-line)]" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[20px] font-bold uppercase tracking-tight">New competition</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--color-surface)] text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3.5">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Solar Gauntlet"
              className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-dim"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="What's the vibe of this match?"
              className="w-full resize-none bg-transparent text-[15px] leading-snug text-fg outline-none placeholder:text-dim"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Players">
              <input
                value={players}
                onChange={(e) => setPlayers(e.target.value)}
                inputMode="numeric"
                className="w-full bg-transparent text-[15px] text-fg outline-none"
              />
            </Field>
            <Field label="Entry $">
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                inputMode="decimal"
                className="w-full bg-transparent text-[15px] text-fg outline-none"
              />
            </Field>
            <Field label="Minutes">
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                inputMode="numeric"
                className="w-full bg-transparent text-[15px] text-fg outline-none"
              />
            </Field>
          </div>

          {error && <p className="text-center text-[12.5px] text-[color:var(--color-loss)]">{error}</p>}

          <Button fullWidth onClick={submit} disabled={submitting} className="mt-1">
            {submitting ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              "Create competition"
            )}
          </Button>
        </div>
      </motion.div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <div className="rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3.5 py-3">{children}</div>
    </label>
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
