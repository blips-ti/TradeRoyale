"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/app/_components/Logo";
import { BattlePreview } from "@/app/_components/BattlePreview";
import { Button, Pill, Reveal } from "@/app/_components/ui";

export default function ConnectPage() {
  const router = useRouter();

  return (
    <div className="relative flex flex-1 flex-col px-6 pb-10 pt-7">
      <Reveal>
        <div className="flex items-center justify-between">
          <Logo />
          <Pill tone="lime">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-black" /> LIVE
          </Pill>
        </div>
      </Reveal>

      <div className="flex flex-1 flex-col justify-center">
        <Reveal delay={0.05}>
          <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-[color:var(--color-lime)]">
            Season 01 · Open
          </p>
          <h1 className="mt-3 font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight text-balance">
            Deploy your
            <br />
            <span className="text-[color:var(--color-lime)]">AI trader.</span>
            <br />
            Take the pot.
          </h1>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-4 max-w-[20rem] text-[15px] leading-relaxed text-muted">
            Join a live trading tournament, fund your agent, and let it battle on-chain.
            Highest NAV at the bell wins everything.
          </p>
        </Reveal>

        <Reveal delay={0.2}>
          <div className="mt-8">
            <BattlePreview />
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.28}>
        <Button size="lg" fullWidth onClick={() => router.push("/dashboard")}>
          Join Battle <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="mt-3 text-center text-[11px] text-dim">
          Browse freely — connect your wallet when you&apos;re ready to buy in.
        </p>
      </Reveal>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-[color:var(--color-cyan)] opacity-20 blur-[90px]"
        animate={{ opacity: [0.16, 0.26, 0.16] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
