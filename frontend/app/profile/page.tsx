"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronRight, Copy, LogOut, Swords, Wallet } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { useAchievements } from "@/app/_lib/achievementsStore";
import { getMatchBase, resolveMatch } from "@/app/_lib/matches";
import { ACHIEVEMENTS, progressFor, XP_PER_LEVEL } from "@/app/_lib/achievements";
import { shortAddress } from "@/app/_lib/format";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { AppShell } from "@/app/_components/AppShell";
import { AchievementsSheet } from "@/app/_components/AchievementsSheet";
import { Badge } from "@/app/_components/Badge";
import { Avatar, Button, Card, Pill, Reveal } from "@/app/_components/ui";

export default function ProfilePage() {
  return (
    <AppShell>
      <Profile />
    </AppShell>
  );
}

function Profile() {
  const { user, logout, login } = useAuth();
  const { anchorAt, joinedMatchId, agent } = useGame();
  const now = useNow(1000);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [achOpen, setAchOpen] = useState(false);
  const unlocked = useAchievements((s) => s.unlocked);
  const progress = progressFor(unlocked);

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[color:var(--color-lime)]/12 text-[color:var(--color-lime)]">
          <Wallet className="h-7 w-7" />
        </span>
        <div>
          <p className="font-display text-[20px] font-bold uppercase">Not connected</p>
          <p className="mt-1 text-[14px] text-muted">Connect your wallet to set up your profile and join Matches.</p>
        </div>
        <Button onClick={login} className="px-8">
          <Wallet className="h-4 w-4" /> Connect wallet
        </Button>
      </div>
    );
  }

  const base = joinedMatchId ? getMatchBase(joinedMatchId) : null;
  const match = base && anchorAt && now ? resolveMatch(base, anchorAt, now) : null;

  const copy = () => {
    if (!user.address) return;
    navigator.clipboard?.writeText(user.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 pt-1">
      <Reveal>
        <h1 className="px-1 font-display text-[22px] font-bold uppercase tracking-tight">Profile</h1>
      </Reveal>

      <Reveal delay={0.06}>
        <Card className="flex flex-col items-center gap-3 p-7 text-center">
          <span className="relative">
            <Avatar name={user.name} size={84} />
            {progress.best && (
              <span className="absolute -bottom-1.5 -right-1.5">
                <Badge rarity={progress.best.rarity} icon={progress.best.icon} size={34} />
              </span>
            )}
          </span>
          <div>
            <p className="font-display text-[22px] font-bold uppercase">{user.name}</p>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <Pill tone="lime">Lvl {progress.level}</Pill>
              {progress.best && <Pill tone="neutral">{progress.best.name}</Pill>}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Level / achievements */}
      <Reveal delay={0.08}>
        <button
          onClick={() => setAchOpen(true)}
          className="flex w-full items-center gap-3 rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:var(--color-lime)] text-black">
            <span className="font-display text-[20px] font-bold leading-none">{progress.level}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="font-display text-[15px] font-bold uppercase tracking-wide">Level {progress.level}</p>
              <span className="font-mono text-[11px] text-muted">
                <span className="text-[color:var(--color-lime)]">{progress.xpInLevel}</span>/{XP_PER_LEVEL} XP
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-[color:var(--color-surface-2)]">
              <div
                className="h-full rounded-pill bg-[color:var(--color-lime)]"
                style={{ width: `${(progress.xpInLevel / XP_PER_LEVEL) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              {progress.unlocked.size}/{ACHIEVEMENTS.length} achievements unlocked
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </button>
      </Reveal>

      {/* current match */}
      <Reveal delay={0.09}>
        {match ? (
          <Link href={`/match/${match.id}/${match.status === "live" ? "live" : "setup"}`}>
            <Card className="flex items-center gap-3 p-4 transition active:scale-[0.99]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--color-lime)] text-black">
                <Swords className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Your Match</p>
                <p className="truncate text-[15px] font-bold text-fg">{match.name}</p>
                <p className="font-mono text-[12px] text-[color:var(--color-lime)]">
                  {match.status === "upcoming"
                    ? `Starts in ${formatDelta(match.startsAt - now)}`
                    : match.status === "live"
                      ? `Live · ends in ${formatDelta(match.endsAt - now)}`
                      : "Ended"}
                  {agent ? ` · ${agent.name}` : " · agent not set"}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted" />
            </Card>
          </Link>
        ) : (
          <Card className="flex items-center justify-between p-4">
            <span className="text-[14px] text-muted">Not in a Match yet.</span>
            <Button size="sm" onClick={() => router.push("/dashboard")}>
              Browse
            </Button>
          </Card>
        )}
      </Reveal>

      <Reveal delay={0.12}>
        <button
          onClick={copy}
          className="flex w-full items-center gap-3 rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--color-lime)]/12 text-[color:var(--color-lime)]">
            <Wallet className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Wallet address</p>
            <p className="truncate font-mono text-[14px] text-fg">
              {copied ? "copied ✓" : shortAddress(user.address, 10, 8)}
            </p>
          </div>
          <Copy className="h-4 w-4 text-muted" />
        </button>
      </Reveal>

      <div className="flex-1" />

      <Reveal delay={0.16}>
        <Button
          variant="dark"
          fullWidth
          onClick={() => {
            logout();
            router.replace("/connect");
          }}
        >
          <LogOut className="h-4 w-4" /> Disconnect
        </Button>
      </Reveal>

      <AchievementsSheet open={achOpen} onClose={() => setAchOpen(false)} />
    </div>
  );
}
