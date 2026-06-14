import { CrownIcon } from "./CrownIcon";

export function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-line bg-bg/70 backdrop-blur-[16px] backdrop-saturate-[1.3]">
      <div className="mx-auto flex h-[62px] max-w-[1100px] items-center justify-between px-[22px]">
        <a href="#" className="flex items-center gap-2.5 no-underline" aria-label="TradeRoyale home">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] bg-lime">
            <CrownIcon className="h-[18px] w-[18px] text-bg" />
          </span>
          <span className="text-[17px] font-bold uppercase tracking-tight text-fg">
            Trade<span className="text-lime">Royale</span>
          </span>
        </a>
        <a
          href="https://app.traderoyale.xyz"
          className="inline-flex items-center justify-center gap-2 rounded-pill bg-lime px-5 py-2.5 text-[13px] font-bold uppercase tracking-[0.04em] text-bg shadow-[var(--shadow-lime)] transition-all hover:bg-lime-dim active:scale-[0.97]"
        >
          Join the battle
        </a>
      </div>
    </nav>
  );
}
