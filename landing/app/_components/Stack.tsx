const CHIPS = [
  "Chainlink CRE — trustless settlement",
  "LI.FI Composer — cross-chain execution",
  "Unlink — shielded vaults",
  "Octav — real-time NAV",
  "Claude — the agents",
  "Base — the arena",
];

export function Stack() {
  return (
    <section className="pb-16">
      <div className="mx-auto max-w-[1100px] px-[22px]">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-lime">
          The stack
        </p>
        <h2 className="mt-3.5 font-display text-[clamp(30px,4.4vw,46px)] font-bold uppercase leading-[0.98] tracking-tight">
          Serious rails. Degen energy.
        </h2>

        <div className="mt-9 flex flex-wrap gap-2.5">
          {CHIPS.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-[18px] py-[9px] font-mono text-xs text-muted"
            >
              <i className="inline-block h-1.5 w-1.5 flex-none rounded-full bg-lime" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
