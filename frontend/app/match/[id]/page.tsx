"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Clock, Crown, Lock, ShieldCheck, Trophy, Users, Wallet, WifiOff, X } from "lucide-react";
import { useConnectWallet, useWallets } from "@privy-io/react-auth";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { api } from "@/app/_lib/api";
import { depositEntry, type DepositPhase } from "@/app/_lib/unlinkDeposit";
import type { Game, PlayerResult, PublicPlayer } from "@/app/_lib/types";
import { bannerSeedFor, gameName } from "@/app/_lib/gameView";
import { baseUnitsToNumber, bucketOf, formatUsd, livePoolBaseUnits } from "@/app/_lib/units";
import { formatDelta, useNow } from "@/app/_lib/useNow";

// Minimal shape shared by a Privy useWallets() ConnectedWallet and a useConnectWallet() result —
// enough to switch to Base and hand a provider to the deposit flow.
type EvmWallet = {
  address?: string;
  switchChain: (chainId: number | `0x${string}`) => Promise<void>;
  getEthereumProvider: () => Promise<unknown>;
};
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
  const { joinedMatchId, setSession, reset } = useGame();
  const now = useNow(1000);

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  // The caller's OWN player in this game (created vault may be unfunded) — drives the CTA.
  const [mine, setMine] = useState<{ playerId: string; deposited: boolean } | null>(null);

  const reloadMine = useCallback(async () => {
    if (!authenticated) {
      setMine(null);
      return;
    }
    try {
      const res = await api.getActive();
      if (res.game?.id === params.id && res.player) {
        setMine({ playerId: res.player.id, deposited: res.player.depositStatus === "confirmed" });
      } else {
        setMine(null);
      }
    } catch {
      setMine(null);
    }
  }, [authenticated, params.id]);

  useEffect(() => {
    reloadMine();
    const t = setInterval(reloadMine, 4000);
    return () => clearInterval(t);
  }, [reloadMine]);

  // Final settled results, fetched once the game has ended (drives the winners section).
  const [results, setResults] = useState<PlayerResult[] | null>(null);
  useEffect(() => {
    if (game?.status !== "ended") return;
    api
      .getResults(params.id)
      .then((s) => setResults(s?.perPlayer ?? []))
      .catch(() => {});
  }, [game?.status, params.id]);

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
  // "In" only counts once the deposit is confirmed; a created-but-unfunded vault is "pending".
  const confirmedHere = mine?.deposited === true;
  const pendingHere = !!mine && !mine.deposited;
  const lockedOut = !!joinedMatchId && joinedMatchId !== game.id;
  const entryLabel = formatUsd(game.entryAmount, undefined, true);
  const poolLabel = formatUsd(livePoolBaseUnits(players.length, game.entryAmount), undefined, true);
  const spotsLeft = Math.max(game.maxPlayers - players.length, 0);
  const readyCount = players.filter((p) => p.agentReady).length;
  const durationMin = Math.round(game.durationSec / 60);
  const endsAtMs = game.endsAt ? Date.parse(game.endsAt) : 0;

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
            {live ? `Ends in ${formatDelta(endsAtMs - now)}` : bucket === "ended" ? "Ended" : "Open lobby"} · {durationMin} min
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

      {/* final results (ended games) */}
      {bucket === "ended" && (
        <Reveal delay={0.1}>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-display text-[14px] font-semibold uppercase tracking-wide text-fg">
              <Trophy className="h-4 w-4 text-[color:var(--color-lime)]" /> Final results
            </h3>
            <div className="mt-3 space-y-2">
              {results === null ? (
                <p className="text-[13px] text-muted">Loading results…</p>
              ) : results.length === 0 ? (
                <p className="text-[13px] text-muted">Results are being settled…</p>
              ) : (
                [...results]
                  .sort((a, b) => a.rank - b.rank)
                  .map((r) => {
                    const pnlNum = baseUnitsToNumber(r.pnl);
                    const absPnl = r.pnl.startsWith("-") ? r.pnl.slice(1) : r.pnl;
                    const isMine = r.playerId === mine?.playerId;
                    return (
                      <div
                        key={r.playerId}
                        className={`flex items-center gap-3 rounded-card border px-3 py-2.5 ${
                          isMine
                            ? "border-[color:var(--color-lime)]/50 bg-[color:var(--color-lime)]/10"
                            : "border-[color:var(--color-line)] bg-[color:var(--color-surface)]"
                        }`}
                      >
                        <span className="w-5 text-center font-mono text-[13px] font-bold text-muted">{r.rank}</span>
                        <Avatar name={isMine ? "You" : r.displayName} size={28} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">
                          {isMine ? "You" : r.displayName}
                          {r.rank === 1 && <Crown className="ml-1 inline h-3.5 w-3.5 text-[color:var(--color-lime)]" />}
                        </span>
                        <div className="text-right">
                          <p className="font-display text-[14px] font-bold tnum">{formatUsd(r.finalUsdc, undefined, true)}</p>
                          <p
                            className="font-mono text-[11px]"
                            style={{ color: pnlNum >= 0 ? "var(--color-profit)" : "var(--color-loss)" }}
                          >
                            {pnlNum >= 0 ? "+" : "−"}
                            {formatUsd(absPnl, undefined, true)}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </Card>
        </Reveal>
      )}

      {/* briefing + players */}
      <Reveal delay={0.1}>
        <Card className="p-5">
          <h3 className="font-display text-[14px] font-semibold uppercase tracking-wide text-fg">Briefing</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {durationMin}-minute AI-agent trading battle on Base. Fund your vault, deploy your agent, and the
            highest NAV at the bell takes the whole pool. No mercy, no second place.
          </p>
          <div className="mt-4 flex items-center gap-2 border-t border-[color:var(--color-line)] pt-4">
            <Users className="h-4 w-4 text-[color:var(--color-lime)]" />
            <div className="flex -space-x-2">
              {players.slice(0, 8).map((p) => (
                <Avatar key={p.id} name={p.displayName} size={26} className="ring-2 ring-[color:var(--color-surface)]" />
              ))}
            </div>
            <span className="text-[12.5px] text-muted">
              {players.length}/{game.maxPlayers} joined ·{" "}
              <span className="text-[color:var(--color-lime)]">{readyCount} ready</span>
            </span>
          </div>
          {bucket === "ongoing" && (
            <p className="mt-3 text-center text-[12px] text-dim">
              The match starts automatically once all {game.maxPlayers} players have deposited and set up their agent.
            </p>
          )}
        </Card>
      </Reveal>

      <div className="flex-1" />

      {/* CTA */}
      <Reveal delay={0.14}>
        {bucket === "ended" ? (
          <Button
            variant="dark"
            fullWidth
            onClick={() => {
              if (mine) reset(); // release the session for the match you just played
              router.push("/dashboard");
            }}
          >
            <ArrowLeft className="h-4 w-4" /> Back to matches
          </Button>
        ) : !authenticated ? (
          bucket === "ongoing" ? (
            <Button fullWidth onClick={login}>
              <Wallet className="h-4 w-4" /> Connect wallet to join
            </Button>
          ) : (
            <Button variant="dark" fullWidth disabled>
              {live ? "Registration closed" : "Match ended"}
            </Button>
          )
        ) : confirmedHere ? (
          <Button fullWidth onClick={() => router.push(`/match/${game.id}/${live ? "live" : "setup"}`)}>
            {live ? "Enter The Arena" : "Set up your agent"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : pendingHere ? (
          <Button fullWidth onClick={() => setDepositOpen(true)}>
            <Wallet className="h-4 w-4" /> Complete your deposit · {entryLabel}
          </Button>
        ) : lockedOut ? (
          <Button variant="dark" fullWidth disabled>
            <Lock className="h-4 w-4" /> You&apos;re already in a Match
          </Button>
        ) : bucket === "ongoing" ? (
          spotsLeft > 0 ? (
            <Button fullWidth onClick={() => setDepositOpen(true)}>
              Deposit {entryLabel} to join
            </Button>
          ) : (
            <Button variant="dark" fullWidth disabled>
              Match full
            </Button>
          )
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
            token={game.entryToken}
            amount={game.entryAmount}
            existingPlayerId={pendingHere ? mine?.playerId : undefined}
            onClose={() => setDepositOpen(false)}
            onConfirmed={(pid) => {
              setSession(game.id, pid);
              reloadMine();
            }}
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

/* One mandatory action: name your agent → create the vault → fire the on-chain deposit from
   the user's wallet → wait for the BE to confirm. No deposit, no join. */
function BuyInSheet({
  gameId,
  name,
  entryLabel,
  defaultAgentName,
  ownerAddress,
  token,
  amount,
  existingPlayerId,
  onClose,
  onConfirmed,
  onContinue,
}: {
  gameId: string;
  name: string;
  entryLabel: string;
  defaultAgentName: string;
  ownerAddress: string | null;
  token: string;
  amount: string;
  existingPlayerId?: string;
  onClose: () => void;
  onConfirmed: (playerId: string) => void;
  onContinue: () => void;
}) {
  const { wallets } = useWallets();
  const [agentName, setAgentName] = useState(defaultAgentName);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<DepositPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // On mobile PWAs (e.g. Rabby over WalletConnect) the session often drops after login, so
  // useWallets() is empty at deposit time even though the wallet is linked. useConnectWallet lets
  // us re-establish the connection on demand; onSuccess hands back the freshly connected wallet.
  const connectCbRef = useRef<{ resolve: (w: EvmWallet) => void; reject: (e: Error) => void } | null>(null);
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      const cb = connectCbRef.current;
      connectCbRef.current = null;
      if (!cb) return;
      if ("getEthereumProvider" in wallet) cb.resolve(wallet as EvmWallet);
      else cb.reject(new Error("Connect an Ethereum wallet on Base to deposit."));
    },
    onError: (err) => {
      const cb = connectCbRef.current;
      connectCbRef.current = null;
      cb?.reject(new Error(typeof err === "string" && err ? err : "Wallet connection was cancelled."));
    },
  });

  const PHASE_LABEL: Record<DepositPhase, string> = {
    connecting: "Connecting your wallet…",
    preparing: "Setting up your vault…",
    registering: "Registering…",
    depositing: "Confirm in your wallet…",
    confirming: "Confirming deposit…",
  };

  // The wallet to deposit from: prefer the already-connected one matching the logged-in owner,
  // otherwise (empty on mobile PWAs) prompt a reconnect and use the wallet that comes back.
  const ensureWallet = async (): Promise<EvmWallet> => {
    const connected = wallets.find((w) => w.address?.toLowerCase() === ownerAddress?.toLowerCase()) ?? wallets[0];
    if (connected) return connected;
    setPhase("connecting");
    return new Promise<EvmWallet>((resolve, reject) => {
      connectCbRef.current = { resolve, reject };
      connectWallet();
    });
  };

  // Polls the BE until its DepositWatcher confirms the shielded balance reached the entry amount.
  const waitForConfirmed = async (pid: string) => {
    for (let i = 0; i < 40; i++) {
      const detail = await api.getPlayer(gameId, pid).catch(() => null);
      if (detail?.player.depositStatus === "confirmed") return;
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error("Deposit sent but not confirmed yet — give it a moment, then retry.");
  };

  // Create the vault (if new) then immediately fire the deposit tx; confirm = joined.
  const run = async () => {
    setRunning(true);
    setError(null);
    setPhase("preparing");
    try {
      let pid = existingPlayerId ?? null;
      if (!pid) {
        const res = await api.joinGame(gameId, { displayName: agentName.trim() || "Agent" });
        pid = res.playerId;
      }
      const exported = await api.getUnlinkAccount(gameId, pid);
      const wallet = await ensureWallet();
      // Deposit happens on Base mainnet — make sure the wallet is on the right chain first.
      await wallet.switchChain(8453).catch(() => {});
      const provider = (await wallet.getEthereumProvider()) as Parameters<typeof depositEntry>[0]["provider"];
      await depositEntry({ playerId: pid, token, amount, exported, provider, onPhase: setPhase });
      await waitForConfirmed(pid);
      setConfirmed(true);
      onConfirmed(pid);
    } catch (e) {
      setError((e as Error).message || "Deposit failed");
    } finally {
      setRunning(false);
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
      <div className="absolute inset-0 bg-black/60" onClick={running ? undefined : onClose} />
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative mx-auto w-full max-w-md rounded-t-card border-t border-[color:var(--color-line-strong)] bg-[color:var(--color-surface)] p-5 pb-8"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-[18px] font-bold uppercase tracking-tight">
            {confirmed ? "You're in!" : existingPlayerId ? "Complete your deposit" : `Join ${name}`}
          </h3>
          <button onClick={onClose} className="text-muted" disabled={running}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmed ? (
          <>
            <div className="flex items-center gap-2 rounded-card bg-[color:var(--color-profit)]/12 px-4 py-3 text-[13px] text-[color:var(--color-profit)]">
              <Check className="h-4 w-4" /> Deposit confirmed — your seat is locked.
            </div>
            <Button fullWidth className="mt-4" onClick={onContinue}>
              Set up your agent <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {!existingPlayerId && (
              <>
                <label className="mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Name your agent
                </label>
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  maxLength={40}
                  disabled={running}
                  placeholder="Your trader's name"
                  className="mb-3 w-full rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 font-display text-[16px] font-semibold text-fg outline-none placeholder:text-dim disabled:opacity-60"
                />
              </>
            )}

            <div className="rounded-card bg-[color:var(--color-surface-2)] p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] text-muted">
                  <Wallet className="h-4 w-4" /> Deposit to enter {name}
                </span>
                <span className="font-display text-[22px] font-bold text-[color:var(--color-lime)] tnum">{entryLabel}</span>
              </div>
              <p className="mt-2 text-[12px] text-muted">
                {entryLabel} moves from your wallet into your private Unlink vault. Your agent trades
                from a wallet linked to it once the deposit confirms.
              </p>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-card border border-[color:var(--color-line)] px-4 py-3 text-[12.5px] text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-lime)]" />
              <span>
                The deposit is required to enter. <b className="text-fg">No deposit, no seat.</b> Buy-in is
                locked for the whole Match — winner takes the pot.
              </span>
            </div>

            {error && <p className="mt-3 text-center text-[12.5px] text-[color:var(--color-loss)]">{error}</p>}

            <Button fullWidth className="mt-4" onClick={run} disabled={running}>
              {running ? (
                <>
                  <Spinner /> {phase ? PHASE_LABEL[phase] : "Working…"}
                </>
              ) : existingPlayerId ? (
                `Deposit ${entryLabel}`
              ) : (
                `Deposit ${entryLabel} to join`
              )}
            </Button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
