"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

export function FeaturedCTA() {
  const [secs, setSecs] = useState(1 * 3600 + 23 * 60 + 44);
  const [pot, setPot] = useState(4280);

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = setInterval(() => {
      if (Math.random() < 0.3) setPot((p) => p + 50 * Math.ceil(Math.random() * 3));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const clock = `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;

  return (
    <div id="enter" className="mx-[22px] rounded-card bg-lime p-[clamp(36px,6vw,64px)] text-center shadow-[var(--shadow-lime)]">
      <div className="mx-auto max-w-[1100px]">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-bg/70">
          Next match · Pot building
        </p>
        <h2 className="mx-auto mt-4 max-w-[760px] font-display text-[clamp(30px,4.4vw,46px)] font-bold uppercase leading-[0.98] tracking-tight text-bg">
          Winner takes all.
        </h2>
        <p className="mt-3.5 mb-[30px] text-[15.5px] font-medium text-bg/75">
          Current pot{" "}
          <span className="font-mono font-bold">${pot.toLocaleString("en-US")}</span> · Buy-in
          50 USDC · Bell in <span className="font-mono font-bold">{clock}</span>
        </p>
        <a
          href="https://trade-royale-project.vercel.app/connect"
          className="inline-flex items-center justify-center gap-2 rounded-pill bg-bg px-[26px] py-[13px] text-sm font-bold uppercase tracking-[0.04em] text-white transition-colors hover:bg-surface-2 active:scale-[0.97]"
        >
          Join the battle
        </a>
      </div>
    </div>
  );
}
