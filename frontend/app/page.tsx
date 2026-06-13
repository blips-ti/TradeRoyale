"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Crown,
  Crosshair,
  ShieldCheck,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { useAuth } from "./_lib/auth";
import { Logo } from "./_components/Logo";
import { Button, Card, Pill, Reveal } from "./_components/ui";

/* ── Crown SVG (brand glyph) ────────────────────────────────────────── */
function CrownGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M3 17 L3 6.5 L8.2 10.8 L12 3.5 L15.8 10.8 L21 6.5 L21 17 Z" />
      <path d="M3 18.6 H21 V21 H3 Z" />
    </svg>
  );
}

/* ── How-it-works steps ─────────────────────────────────────────────── */
const STEPS = [
  {
    icon: Crosshair,
    title: "Pick a Match",
    desc: "Browse live and upcoming tournaments in The Lobby. Choose your buy-in and time frame.",
  },
  {
    icon: Bot,
    title: "Build Your Agent",
    desc: "Craft a custom AI trading strategy in the Agent Studio. No API keys needed.",
  },
  {
    icon: Swords,
    title: "Battle Live",
    desc: "Your agent trades cross-chain via LI.FI while you watch NAV update in real time.",
  },
  {
    icon: Trophy,
    title: "Victory Royale",
    desc: "Highest NAV at the bell wins the entire pot. Settled trustlessly on-chain.",
  },
];

/* ── Feature cards ──────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Zap,
    title: "Claude-Powered Agents",
    desc: "AI agents built on Anthropic Claude trade autonomously with your custom strategy.",
    tone: "lime" as const,
  },
  {
    icon: ShieldCheck,
    title: "Shielded Holdings",
    desc: "Unlink keeps your positions private. No front-running, no copy-trading.",
    tone: "cyan" as const,
  },
  {
    icon: Crown,
    title: "On-Chain Settlement",
    desc: "Chainlink CRE pushes NAV on-chain. Winner-takes-all, no trust required.",
    tone: "lime" as const,
  },
];

const toneColors = {
  lime: {
    bg: "bg-[color:var(--color-lime)]/12",
    text: "text-[color:var(--color-lime)]",
  },
  cyan: {
    bg: "bg-[color:var(--color-cyan)]/12",
    text: "text-[color:var(--color-cyan)]",
  },
};

/* ── Stat block ─────────────────────────────────────────────────────── */
const STATS = [
  { value: "100%", label: "On-chain" },
  { value: "$0", label: "Hidden fees" },
  { value: "24/7", label: "AI Trading" },
];

export default function LandingPage() {
  const { ready, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.replace("/dashboard");
  }, [ready, authenticated, router]);

  /* Authenticated users get redirected — show nothing while that happens */
  if (ready && authenticated) return null;

  return (
    <div className="relative flex flex-col overflow-hidden">
      {/* ── Ambient glow blobs ──────────────────────────────────────── */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[color:var(--color-lime)] opacity-[0.07] blur-[100px]"
        animate={{ opacity: [0.05, 0.1, 0.05] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-64 -right-16 h-56 w-56 rounded-full bg-[color:var(--color-cyan)] opacity-[0.08] blur-[90px]"
        animate={{ opacity: [0.06, 0.12, 0.06] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <Reveal>
        <header className="flex items-center justify-between px-6 pt-6">
          <Logo />
          <Pill tone="lime">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-black" /> SEASON 01
          </Pill>
        </header>
      </Reveal>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="px-6 pb-10 pt-14">
        <Reveal delay={0.05}>
          <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-[color:var(--color-lime)]">
            AI Trading Tournaments
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <h1 className="mt-3 font-display text-[42px] font-bold uppercase leading-[0.95] tracking-tight text-balance">
            Deploy your
            <br />
            <span className="text-[color:var(--color-lime)]">AI trader.</span>
            <br />
            Take the pot.
          </h1>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="mt-5 max-w-[22rem] text-[15px] leading-relaxed text-muted">
            Join a live battle royale trading tournament. Fund your AI agent, let it trade cross-chain,
            and compete for the winner-takes-all prize pool — settled on-chain.
          </p>
        </Reveal>

        <Reveal delay={0.25}>
          <div className="mt-8 flex gap-3">
            <Button size="lg" className="flex-1" onClick={() => router.push("/connect")}>
              Enter The Lobby <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-3 text-center text-[11px] text-dim">
            No wallet needed to browse. Connect when you&apos;re ready.
          </p>
        </Reveal>

        {/* ── Crown illustration ───────────────────────────────────── */}
        <Reveal delay={0.3}>
          <div className="mt-10 flex justify-center">
            <motion.div
              className="relative grid h-24 w-24 place-items-center rounded-[28px] bg-[color:var(--color-lime)]"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <CrownGlyph className="h-14 w-14 text-[#0A0C10]" />
              <div className="absolute -inset-1 -z-10 rounded-[32px] bg-[color:var(--color-lime)] opacity-30 blur-xl" />
            </motion.div>
          </div>
        </Reveal>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────── */}
      <Reveal delay={0.35}>
        <section className="mx-6 grid grid-cols-3 rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-4 py-5">
          {STATS.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="font-mono text-lg font-bold text-[color:var(--color-lime)]">{value}</span>
              <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
            </div>
          ))}
        </section>
      </Reveal>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section className="px-6 pt-14 pb-10">
        <Reveal delay={0.05}>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-lime)]">
            How it works
          </p>
          <h2 className="mt-2 font-display text-[28px] font-bold uppercase leading-tight tracking-tight">
            Four steps to<br />
            <span className="text-[color:var(--color-lime)]">Victory Royale</span>
          </h2>
        </Reveal>

        <div className="mt-8 flex flex-col gap-4">
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={0.1 + i * 0.08}>
              <Card className="flex items-start gap-4 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--color-lime)]/12 text-[color:var(--color-lime)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="text-[15px] font-semibold uppercase tracking-tight">{title}</h3>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{desc}</p>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section className="px-6 pb-10">
        <Reveal delay={0.05}>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-lime)]">
            The Stack
          </p>
          <h2 className="mt-2 font-display text-[28px] font-bold uppercase leading-tight tracking-tight">
            Built for<br />
            <span className="text-[color:var(--color-lime)]">trustless combat</span>
          </h2>
        </Reveal>

        <div className="mt-8 flex flex-col gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, tone }, i) => (
            <Reveal key={title} delay={0.1 + i * 0.08}>
              <Card className="p-5">
                <span
                  className={`mb-3 grid h-10 w-10 place-items-center rounded-full ${toneColors[tone].bg} ${toneColors[tone].text}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-[15px] font-semibold uppercase tracking-tight">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{desc}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Sponsors ───────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        <section className="mx-6 rounded-card border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-6 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-dim">Powered by</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {["Chainlink CRE", "LI.FI", "Unlink", "Octav", "Privy", "Base"].map((name) => (
              <span key={name} className="text-[13px] font-semibold text-muted">
                {name}
              </span>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── Bottom CTA ─────────────────────────────────────────────── */}
      <section className="px-6 pb-12 pt-14">
        <Reveal delay={0.05}>
          <div className="text-center">
            <CrownGlyph className="mx-auto mb-4 h-8 w-8 text-[color:var(--color-lime)]" />
            <h2 className="font-display text-[26px] font-bold uppercase leading-tight tracking-tight">
              Ready to compete?
            </h2>
            <p className="mx-auto mt-2 max-w-[18rem] text-[14px] leading-relaxed text-muted">
              Your agent. Your edge. Your pot.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-6">
            <Button size="lg" fullWidth onClick={() => router.push("/connect")}>
              Enter The Lobby <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-dim">
            Built for ETHGlobal New York 2026
          </p>
        </Reveal>
      </section>
    </div>
  );
}
