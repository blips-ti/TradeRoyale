"use client";

export type SeriesPoint = { t: number; v: number }; // t = ms timestamp, v = pnl %

export type Series = {
  id: string;
  name: string;
  color: string;
  you?: boolean;
  points: SeriesPoint[];
};

/** Render-only multi-line chart with a TIME x-axis [xMin..xMax]. Re-render as `xMax` (now)
    advances and the line tips track the latest value, so it scrolls live with the clock. */
export function PnlChartView({
  series,
  xMin,
  xMax,
  height = 200,
}: {
  series: Series[];
  xMin: number;
  xMax: number;
  height?: number;
}) {
  const allV = series.flatMap((s) => s.points.map((p) => p.v));
  const min = Math.min(-1, ...allV);
  const max = Math.max(1, ...allV);
  const W = 320;
  const H = height;
  const pad = 6;
  const span = Math.max(xMax - xMin, 1);

  const xt = (t: number) => {
    const x = pad + ((t - xMin) / span) * (W - pad * 2);
    return Math.max(pad, Math.min(W - pad, x));
  };
  const yv = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);

  const toPath = (pts: SeriesPoint[], dy: number) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xt(p.t).toFixed(1)} ${(yv(p.v) + dy).toFixed(1)}`).join(" ");

  // Spread coincident lines a few px apart vertically so players with identical NAVs still show
  // as separate lines (purely visual — symmetric around the true value). Stable per series id.
  const GAP = 2.5;
  const offsetById = new Map(series.map((s, i) => [s.id, (i - (series.length - 1) / 2) * GAP]));

  const zeroY = yv(0);
  const ordered = [...series].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="3 4" />
      {ordered.map((s) => {
        if (s.points.length === 0) return null;
        const last = s.points[s.points.length - 1];
        const dy = offsetById.get(s.id) ?? 0;
        return (
          <g key={s.id}>
            <path
              d={toPath(s.points, dy)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.you ? 3 : 2}
              strokeOpacity={s.you ? 1 : 0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={xt(last.t)} cy={yv(last.v) + dy} r={s.you ? 3.5 : 2.5} fill={s.color} fillOpacity={s.you ? 1 : 0.95} />
          </g>
        );
      })}
    </svg>
  );
}
