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

  const toPath = (pts: SeriesPoint[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xt(p.t).toFixed(1)} ${yv(p.v).toFixed(1)}`).join(" ");

  const zeroY = yv(0);
  const ordered = [...series].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="3 4" />
      {ordered.map((s) => {
        if (s.points.length === 0) return null;
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.id}>
            <path
              d={toPath(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.you ? 3 : 1.5}
              strokeOpacity={s.you ? 1 : 0.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={xt(last.t)} cy={yv(last.v)} r={s.you ? 3.5 : 2} fill={s.color} fillOpacity={s.you ? 1 : 0.65} />
          </g>
        );
      })}
    </svg>
  );
}
