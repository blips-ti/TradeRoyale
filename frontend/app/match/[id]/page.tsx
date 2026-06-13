"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Clock, Lock, ShieldCheck, Users, Wallet, WifiOff, X } from "lucide-react";
import { useWallets } from "@privy-io/react-auth";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { api } from "@/app/_lib/api";
import { depositEntry, type DepositPhase } from "@/app/_lib/unlinkDeposit";
import type { Game, JoinResult, PublicPlayer } from "@/app/_lib/types";
import { bannerSeedFor, gameName } from "@/app/_lib/gameView";
import { bucketOf, formatUsd, livePoolBaseUnits } from "@/app/_lib/units";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { AppShell } from "@/app/_components/AppShell";
import { MatchBanner } from "@/app/_components/MatchBanner";
import { Avatar, Button, Card, Reveal, Spinner } from "@/app/_components/ui";

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
  const { authenticated, user, login } = useAuth();
  const { joinedMatchId, setSession } = useGame();
  const now = useNow(1000);

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);

  // Fetch + light poll the game.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.getGame(params.id);
        if (!alive) return;
        setGame(res.game);
        setPlayers(res.players);
        setError(null);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [params.id]);

  if (loading && !game) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted">
        <Spinner /> Loading Match…
      </div>
    );
  }
  if (error && !game) {
    return (
      <Card className="mt-4 flex flex-col items-center gap-2 p-8 text-center">
        <WifiOff className="h-6 w-6 text-[color:var(--color-loss)]" />
        <p className="text-[14px] text-fg">Can&apos;t reach the arena</p>
      </Card>
    );
  }
  if (!game) {
    return <Card className="mt-4 p-8 text-center text-muted">Match not found.</Card>;
  }

  const bucket = bucketOf(game.status);
  const live = bucket === "live";
  const name = gameName(game.id);
  const youreIn = joinedMatchId === game.id;
  const lockedOut = !!joinedMatchId && !youreIn;
  const entryLabel = formatUsd(game.entryAmount, undefined, true);
  const poolLabel = formatUsd(livePoolBaseUnits(players.length, game.entryAmount), undefined, true);
  const spotsLeft = Math.max(game.maxPlayers - players.length, 0);
  const endsAtMs = game.endsAt ? Date.parse(game.endsAt) : 0;

  // Joining only establishes the BE session. The agent is configured later (post-deposit),
  // and only a real strategy save sets the local agent — so "join" never fakes an agent.
  const onJoined = (res: JoinResult) => {
    setSession(game.id, res.playerId);
  };

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      <Reveal>
        <MatchBanner seed={bannerSeedFor(game.id)} name={name} height={150} />
      </Reveal>

      {/* status + countdown */}
      <Reveal delay={0.05}>
        <div className="flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Clock className="h-4 w-4" style={{ color: live ? "var(--color-loss)" : "var(--color-lime)" }} />
            {live ? `Ends in ${formatDelta(endsAtMs - now)}` : bucket === "ended" ? "Ended" : "Open lobby"}
          </span>
          <span
            className={`rounded-pill px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              live
                ? "bg-[color:var(--color-loss)]/15 text-[color:var(--color-loss)]"
                : bucket === "ongoing"
                  ? "bg-[color:var(--color-profit)]/15 text-[color:var(--color-profit)]"
                  : "bg-[color:var(--color-surface-2)] text-dim"
            }`}
          >
            {live ? "Live" : bucket === "ongoing" ? "Open" : "Ended"}
          </span>
        </div>
      </Reveal>

      {/* stats */}
      <Reveal delay={0.08}>
        <Card className="grid grid-cols-3 divide-x divide-[color:var(--color-line)] p-0">
          <Stat label="Prize pool" value={poolLabel} accent />
          <Stat label="Entry" value={entryLabel} />
          <Stat label="Players" value={`${players.length}/${game.maxPlayers}`} />
        </Card>
      </Reveal>

      {/* briefing + players */}
      <Reveal delay={0.1}>
        <Card className="p-5">
          <h3 className="font-display text-[14px] font-semibold uppercase tracking-wide text-fg">Briefing</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {Math.round(game.durationSec / 60)}-minute AI-agent trading battle on Base. Fund your vault, deploy
            your agent, and the highest NAV at the bell takes the whole pool. No mercy, no second place.
          </p>
          <div className="mt-4 flex items-center gap-2 border-t border-[color:var(--color-line)] pt-4">
            <Users className="h-4 w-4 text-[color:var(--color-lime)]" />
            <div className="flex -space-x-2">
              {players.slice(0, 8).map((p) => (
                <Avatar key={p.id} name={p.displayName} size={26} className="ring-2 ring-[color:var(--color-surface)]" />
              ))}
            </div>
            <span className="text-[12.5px] text-muted">
              {players.length} in · {spotsLeft} spots left
            </span>
          </div>
        </Card>
      </Reveal>

      <div className="flex-1" />

      {/* CTA */}
      <Reveal delay={0.14}>
        {!authenticated ? (
          bucket === "ongoing" ? (
            <Button fullWidth onClick={login}>
              <Wallet className="h-4 w-4" /> Connect wallet to join
            </Button>
          ) : (
            <Button variant="dark" fullWidth disabled>
              {live ? "Registration closed" : "Match ended"}
            </Button>
          )
        ) : youreIn ? (
          <Button fullWidth onClick={() => router.push(`/match/${game.id}/${live ? "live" : "setup"}`)}>
            {live ? "Enter The Arena" : "Set up your agent"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : lockedOut ? (
          <Button variant="dark" fullWidth disabled>
            <Lock className="h-4 w-4" /> You&apos;re already in a Match
          </Button>
        ) : bucket === "ongoing" ? (
          <Button fullWidth onClick={() => setDepositOpen(true)}>
            Register · Buy in {entryLabel}
          </Button>
        ) : (
          <Button variant="dark" fullWidth disabled>
            {live ? "Registration closed" : "Match ended"}
          </Button>
        )}
      </Reveal>

      <AnimatePresence>
        {depositOpen && (
          <BuyInSheet
            gameId={game.id}
            name={name}
            entryLabel={entryLabel}
            defaultAgentName={user?.name ?? "Agent"}
            ownerAddress={user?.address ?? null}
            onClose={() => setDepositOpen(false)}
            onJoined={onJoined}
            onContinue={() => router.push(`/match/${game.id}/setup`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4">
      <span className={`font-display text-[18px] font-bold leading-none tnum ${accent ? "text-[color:var(--color-lime)]" : "text-fg"}`}>
        {value}
      </span>
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{label}</span>
    </div>
  );
}

/* Two-step buy-in: name your agent + join (creates the vault/session), then the deposit
   instructions. The actual Unlink browser deposit is the next integration step. */
function BuyInSheet({
  gameId,
  name,
  entryLabel,
  defaultAgentName,
  ownerAddress,
  onClose,
  onJoined,
  onContinue,
}: {
  gameId: string;
  name: string;
  entryLabel: string;
  defaultAgentName: string;
  ownerAddress: string | null;
  onClose: () => void;
  onJoined: (res: JoinResult) => void;
  onContinue: () => void;
}) {
  const { wallets } = useWallets();
  const [agentName, setAgentName] = useState(defaultAgentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [phase, setPhase] = useState<DepositPhase | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const buyIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.joinGame(gameId, {
        displayName: agentName.trim() || "Agent",
      });
      setJoined(res);
      onJoined(res);
    } catch (e) {
      setError((e as Error).message || "Couldn't join");
    } finally {
      setLoading(false);
    }
  };

  const PHASE_LABEL: Record<DepositPhase, string> = {
    preparing: "Preparing…",
    registering: "Registering your vault…",
    depositing: "Confirm in your wallet…",
    confirming: "Confirming deposit…",
  };

  // Polls the BE until its DepositWatcher confirms the shielded balance reached the entry amount.
  const waitForConfirmed = async (pid: string) => {
    for (let i = 0; i < 30; i++) {
      const detail = await api.getPlayer(gameId, pid).catch(() => null);
      if (detail?.player.depositStatus === "confirmed") return;
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("Deposit not detected yet — give it a moment, then retry.");
  };

  const runDeposit = async () => {
    if (!joined) return;
    setDepositing(true);
    setError(null);
    setPhase("preparing");
    try {
      const exported = await api.getUnlinkAccount(gameId, joined.playerId);
      const wallet =
        wallets.find((w) => w.address?.toLowerCase() === ownerAddress?.toLowerCase()) ?? wallets[0];
      if (!wallet) throw new Error("No wallet connected to deposit from");
      const provider = (await wallet.getEthereumProvider()) as Parameters<typeof depositEntry>[0]["provider"];
      await depositEntry({
        playerId: joined.playerId,
        token: joined.deposit.token,
        amount: joined.deposit.amount,
        exported,
        provider,
        onPhase: setPhase,
      });
      await waitForConfirmed(joined.playerId);
      setConfirmed(true);
    } catch (e) {
      setError((e as Error).message || "Deposit failed");
    } finally {
      setDepositing(false);
      setPhase(null);
    }
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
          <h3 className="font-display text-[18px] font-bold uppercase tracking-tight">
            {joined ? "Fund your vault" : "Buy in"}
          </h3>
          <button onClick={onClose} className="text-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!joined ? (
          <>
            <label className="mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Name your agent
            </label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              maxLength={40}
              placeholder="Your trader's name"
              className="mb-3 w-full rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 font-display text-[16px] font-semibold text-fg outline-none placeholder:text-dim"
            />

            <div className="rounded-card bg-[color:var(--color-surface-2)] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] text-muted">
                  <Wallet className="h-4 w-4" /> Buy in to {name}
                </span>
                <span className="font-display text-[22px] font-bold text-[color:var(--color-lime)] tnum">{entryLabel}</span>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-card border border-[color:var(--color-line)] px-4 py-3 text-[12.5px] text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-lime)]" />
              <span>
                Your buy-in is locked in the pool for the whole Match. <b className="text-fg">You can&apos;t leave once you join.</b> Winner takes the pot.
              </span>
            </div>

            {error && <p className="mt-3 text-center text-[12.5px] text-[color:var(--color-loss)]">{error}</p>}

            <Button fullWidth className="mt-4" onClick={buyIn} disabled={loading}>
              {loading ? <><Spinner /> Creating your vault…</> : `Buy in ${entryLabel}`}
            </Button>
          </>
        ) : confirmed ? (
          <>
            <div className="flex items-center gap-2 rounded-card bg-[color:var(--color-profit)]/12 px-4 py-3 text-[13px] text-[color:var(--color-profit)]">
              <Check className="h-4 w-4" /> Deposit confirmed — your vault is funded.
            </div>
            <Button fullWidth className="mt-4" onClick={onContinue}>
              Set up your agent <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-card bg-[color:var(--color-profit)]/12 px-4 py-3 text-[13px] text-[color:var(--color-profit)]">
              <Check className="h-4 w-4" /> Vault created — fund it to lock your seat.
            </div>

            <div className="mt-4 rounded-card bg-[color:var(--color-surface-2)] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] text-muted">
                  <Wallet className="h-4 w-4" /> Deposit to your private vault
                </span>
                <span className="font-display text-[22px] font-bold text-[color:var(--color-lime)] tnum">{entryLabel}</span>
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Funds move from your wallet into the Unlink shielded pool. Your agent trades from a
                wallet linked to it the moment the deposit confirms.
              </p>
            </div>

            {error && <p className="mt-3 text-center text-[12.5px] text-[color:var(--color-loss)]">{error}</p>}

            <Button fullWidth className="mt-4" onClick={runDeposit} disabled={depositing}>
              {depositing ? (
                <>
                  <Spinner /> {phase ? PHASE_LABEL[phase] : "Depositing…"}
                </>
              ) : (
                `Deposit ${entryLabel}`
              )}
            </Button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
