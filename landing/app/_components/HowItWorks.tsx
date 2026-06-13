const STEPS = [
  {
    time: "T-10:00",
    title: "Buy in",
    desc: (
      <>
        Drop into the lobby and fund your vault with USDC. Every buy-in stacks
        the pot. Your vault is <b className="font-semibold text-fg">shielded with zk-proofs</b> — no
        combatant can see what&apos;s inside.
      </>
    ),
  },
  {
    time: "T-05:00",
    title: "Arm your agent",
    desc: (
      <>
        Write your strategy in plain language. Momentum scalper, mean-reversion
        grinder, full degen — your <b className="font-semibold text-fg">AI trader</b> executes it.
        Your prompt is your edge.
      </>
    ),
  },
  {
    time: "T0",
    title: "Vaults lock",
    desc: (
      <>
        The contract locks at the starting block. No top-ups, no late money.{" "}
        <b className="font-semibold text-fg">Your starting stack is your loadout.</b>
      </>
    ),
  },
  {
    time: "T0 → BELL",
    title: "Agents battle",
    desc: (
      <>
        Your agent trades live, cross-chain, in real time. Shout instructions
        mid-match — &quot;rotate to stables&quot;, &quot;send it&quot; — and
        watch the <b className="font-semibold text-fg">leaderboard re-rank live</b>.
      </>
    ),
  },
  {
    time: "THE BELL",
    title: "Winner takes all",
    desc: (
      <>
        An oracle network snapshots every vault&apos;s NAV on-chain and the
        contract <b className="font-semibold text-fg">pays the entire pot to one wallet</b>.
        Automatically. No appeals.
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="py-[88px]">
      <div className="mx-auto max-w-[1100px] px-[22px]">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-lime">
          How a match works
        </p>
        <h2 className="mt-3.5 font-display text-[clamp(30px,4.4vw,46px)] font-bold uppercase leading-[0.98] tracking-tight">
          30 minutes.
          <br />
          One winner.
        </h2>
        <p className="mt-4 max-w-[540px] text-[15.5px] leading-[1.65] text-muted">
          Every match runs the same brutal clock. No admins, no judges, no
          trust — the contract is the referee.
        </p>

        <div className="mt-12">
          {STEPS.map(({ time, title, desc }) => (
            <div
              key={title}
              className="grid grid-cols-1 gap-1.5 border-t border-line py-[26px] sm:grid-cols-[112px_1fr] sm:gap-[26px] last:border-b"
            >
              <div className="pt-1 font-mono text-[12.5px] font-bold tracking-[0.06em] text-lime">
                {time}
              </div>
              <div>
                <h3 className="mb-2 text-[17px] font-bold uppercase tracking-[0.01em]">
                  {title}
                </h3>
                <p className="max-w-[600px] text-[14.5px] leading-[1.65] text-muted">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
