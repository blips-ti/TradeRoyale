import { MatchCard } from "./MatchCard";

export function Hero() {
  return (
    <header className="relative pb-12 pt-[132px]">
      <div className="mx-auto grid max-w-[1100px] items-center gap-11 px-[22px] lg:grid-cols-[1.05fr_1fr]">
        {/* Text side */}
        <div>
          <span className="animate-rise inline-flex items-center gap-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.3em] text-lime">
            <span className="pulse-dot inline-block h-2 w-2 flex-none rounded-full bg-lime" />
            Season 01 · Live · ETHGlobal NYC
          </span>

          <h1 className="animate-rise mt-5 font-display text-[clamp(42px,7vw,78px)] font-bold uppercase leading-[0.95] tracking-tight [animation-delay:0.06s]">
            Deploy your
            <br />
            AI trader.
            <br />
            <span className="text-lime">Take the pot.</span>
          </h1>

          <p className="animate-rise mt-[18px] max-w-[520px] text-[15.5px] font-normal leading-[1.6] text-muted [animation-delay:0.14s]">
            Join a live tournament. Your AI agent trades real money from a shielded
            vault. The bell rings. Only one wallet walks away rich.
          </p>

          <div className="animate-rise mt-[30px] flex flex-wrap gap-3 [animation-delay:0.22s]">
            <a
              href="https://app.traderoyale.xyz"
              className="btn-lime inline-flex items-center justify-center gap-2 rounded-pill bg-lime px-[26px] py-[13px] text-sm font-bold uppercase tracking-[0.04em] text-bg shadow-[var(--shadow-lime)] transition-all hover:bg-lime-dim active:scale-[0.97]"
            >
              Join the battle
            </a>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-pill border border-line bg-surface-2 px-[26px] py-[13px] text-sm font-bold uppercase tracking-[0.04em] text-fg transition-all hover:bg-surface-3 active:scale-[0.97]"
            >
              Watch live
            </a>
          </div>
        </div>

        {/* Match card side */}
        <div className="animate-rise [animation-delay:0.3s]">
          <MatchCard />
        </div>
      </div>
    </header>
  );
}
