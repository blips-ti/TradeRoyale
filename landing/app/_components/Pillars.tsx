const PILLARS = [
  {
    cls: "ai",
    icon: (
      <svg
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#7B5CFF"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 8V4H8" />
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M9 14h.01M15 14h.01" />
      </svg>
    ),
    title: "Your agent, your edge",
    desc: "The strategy prompt is the skill ceiling. Your agent reads markets, quotes routes, and fires trades — you coach it live from the touchline.",
    tag: "AI · Claude agents",
  },
  {
    cls: "priv",
    icon: (
      <svg
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#34D6E0"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Nobody sees your hand",
    desc: "Holdings are shielded with zk-proofs. Combatants can't copy your positions, front-run your moves, or target your vault. Privacy is the anti-cheat.",
    tag: "Unlink · zk privacy",
  },
  {
    cls: "bell",
    icon: (
      <svg
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C5F72B"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
    title: "The bell is law",
    desc: "At match end, a decentralized oracle snapshots every NAV and writes the result on-chain. The contract verifies and pays. Done.",
    tag: "Chainlink CRE · Octav NAV",
  },
];

const pillarStyles = {
  ai: {
    iconBg: "bg-purple/[0.12] border border-purple/25",
    hoverBorder: "hover:border-purple/40",
    tagColor: "text-purple",
  },
  priv: {
    iconBg: "bg-cyan/10 border border-cyan/[0.22]",
    hoverBorder: "hover:border-cyan/40",
    tagColor: "text-muted",
  },
  bell: {
    iconBg: "bg-lime/10 border border-lime/[0.22]",
    hoverBorder: "hover:border-lime/40",
    tagColor: "text-muted",
  },
};

export function Pillars() {
  return (
    <section className="pb-[88px]">
      <div className="mx-auto max-w-[1100px] px-[22px]">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-lime">
          Why it can&apos;t be rigged
        </p>
        <h2 className="mt-3.5 max-w-[680px] font-display text-[clamp(30px,4.4vw,46px)] font-bold uppercase leading-[0.98] tracking-tight">
          Nobody touches the outcome. Including us.
        </h2>

        <div className="mt-12 grid gap-4 lg:grid-cols-3 lg:gap-4">
          {PILLARS.map(({ cls, icon, title, desc, tag }) => {
            const s = pillarStyles[cls as keyof typeof pillarStyles];
            return (
              <div
                key={title}
                className={`rounded-card border border-line bg-surface p-7 shadow-[var(--shadow-card)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 ${s.hoverBorder}`}
              >
                <div className={`mb-[18px] grid h-11 w-11 place-items-center rounded-chip ${s.iconBg}`}>
                  {icon}
                </div>
                <h3 className="mb-2 text-[16.5px] font-bold uppercase">{title}</h3>
                <p className="text-sm leading-[1.65] text-muted">{desc}</p>
                <span
                  className={`mt-[18px] inline-block rounded-pill bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${s.tagColor}`}
                >
                  {tag}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
