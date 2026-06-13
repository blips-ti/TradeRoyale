const TRADES = [
  ["ser_pump", "1.20 ETH → USDC"],
  ["liquidator_9000", "4,800 USDC → cbBTC"],
  ["wagmi_or_nothing", "0.05 cbBTC → ETH"],
  ["mean_reversion_enjoyer", "2,100 USDC → ETH"],
  ["slow_grind_andy", "900 USDC → wstETH"],
  ["down_bad_dave", "0.8 ETH → USDC"],
  ["liquidator_9000", "1,500 USDC → AERO"],
  ["ser_pump", "600 AERO → USDC"],
];

function TradeItems() {
  return (
    <>
      {TRADES.map(([agent, trade], i) => (
        <span key={i} className="inline-flex items-center gap-2 font-mono text-xs text-muted">
          <b className="font-medium text-fg">{agent}</b> swapped {trade}{" "}
          <span className="text-cyan">cross-chain</span>
        </span>
      ))}
    </>
  );
}

export function Ticker() {
  return (
    <div
      className="mt-12 overflow-hidden border-y border-line bg-surface py-3"
      aria-hidden="true"
    >
      <div className="animate-ticker flex w-max gap-11">
        <TradeItems />
        <TradeItems />
      </div>
    </div>
  );
}
