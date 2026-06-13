"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Menu, Wallet, Zap } from "lucide-react";
import { useAuth } from "@/app/_lib/auth";
import { useGame } from "@/app/_lib/store";
import { useSessionSync } from "@/app/_lib/useSessionSync";
import { getMatchBase, resolveMatch } from "@/app/_lib/matches";
import { formatDelta, useNow } from "@/app/_lib/useNow";
import { Logo } from "./Logo";
import { MenuSheet } from "./MenuSheet";
import { TabBar } from "./TabBar";
import { Avatar, Button, Spinner } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { init, anchorAt, joinedMatchId } = useGame();
  const now = useNow(1000);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Reconcile the user's active game/player with the backend (source of truth) on
  // (re)connect or wallet switch — clears stale local state when there's no active game.
  useSessionSync(user?.id ?? null);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Live-lock: once your match is live, you can only be on its live screen.
  const base = authenticated && joinedMatchId ? getMatchBase(joinedMatchId) : null;
  const match = base && anchorAt && now ? resolveMatch(base, anchorAt, now) : null;
  useEffect(() => {
    if (match && match.status === "live" && pathname !== `/match/${match.id}/live`) {
      router.replace(`/match/${match.id}/live`);
    }
  }, [match, pathname, router]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted">
        <Spinner /> <span className="text-sm">Loading…</span>
      </div>
    );
  }

  const showBanner = match && match.status === "upcoming";

  return (
    <>
      <header
        className={`sticky top-0 z-20 flex items-center justify-between px-5 pb-3 pt-[max(env(safe-area-inset-top),0.9rem)] transition-colors duration-200 ${
          scrolled ? "glass border-b border-[color:var(--color-line)]" : ""
        }`}
      >
        <Link href="/dashboard" aria-label="TradeRoyale home">
          <Logo />
        </Link>

        <div className="flex items-center gap-2">
          {authenticated && user ? (
            <Link href="/profile" aria-label="Profile">
              <Avatar name={user.name} size={36} />
            </Link>
          ) : (
            <Button size="sm" onClick={login}>
              <Wallet className="h-4 w-4" /> Connect
            </Button>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--color-surface)] text-fg transition active:scale-95"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      {showBanner && match && (
        <Link
          href={`/match/${match.id}/setup`}
          className="mx-5 mb-3 flex items-center gap-3 rounded-card border border-[color:var(--color-lime)]/40 bg-[color:var(--color-lime)]/10 px-4 py-3 transition active:scale-[0.99]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--color-lime)] text-black">
            <Zap className="h-4 w-4" fill="currentColor" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-fg">
              You&apos;re in {match.name} · setup your agent
            </p>
            <p className="font-mono text-[12px] text-[color:var(--color-lime)]">
              Starts in {formatDelta(match.startsAt - now)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-[color:var(--color-lime)]" />
        </Link>
      )}

      <main className="flex flex-1 flex-col px-5 pb-2">{children}</main>
      <TabBar />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
