"use client";

export type Series = {
  id: string;
  name: string;
  color: string;
  you?: boolean;
  points: number[]; // pnl % over time
};

/** Build initial series: you + opponents, each seeded near 0. */
export function buildSeries(
  you: { id: string; name: string },
  opponents: { id: string; name: string }[],
): Series[] {
  const palette = ["#34D6E0", "#FF36A3", "#ff8a3d", "#3da5ff", "#8B909C", "#A6D61F"];
  const seed = () => Array.from({ length: 8 }, () => (Math.random() - 0.5) * 4);
  return [
    { id: you.id, name: you.name, color: "#C5F72B", you: true, points: seed() },
    ...opponents.map((o, i) => ({
      id: o.id,
      name: o.name,
      color: palette[i % palette.length],
      points: seed(),
    })),
  ];
}

/** Advance every series one random-walk step; keep a scrolling window. */
export function stepSeries(series: Series[], window = 44): Series[] {
  return series.map((s) => {
    const last = s.points[s.points.length - 1] ?? 0;
    const drift = s.you ? 0.22 : 0;
    const step = (Math.random() - 0.5) * (s.you ? 2.2 : 3.0) + drift;
    const next = Math.max(-40, Math.min(70, last + step));
    const pts = [...s.points, next];
    if (pts.length > window) pts.shift();
    return { ...s, points: pts };
  });
}

/** Render-only Polymarket-style multi-line chart. */
export function PnlChartView({ series, height = 200 }: { series: Series[]; height?: number }) {
  const all = series.flatMap((s) => s.points);
  const min = Math.min(-5, ...all);
  const max = Math.max(5, ...all);
  const W = 320;
  const H = height;
  const pad = 6;

  const xy = (p: number, i: number, n: number) => {
    const x = pad + (i / Math.max(n, 1)) * (W - pad * 2);
    const y = pad + (1 - (p - min) / (max - min || 1)) * (H - pad * 2);
    return [x, y] as const;
  };

  const toPath = (pts: number[]) => {
    const n = pts.length - 1;
    return pts
      .map((p, i) => {
        const [x, y] = xy(p, i, n);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const zeroY = pad + (1 - (0 - min) / (max - min || 1)) * (H - pad * 2);
  const ordered = [...series].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="3 4" />
      {ordered.map((s) => {
        const n = s.points.length - 1;
        const [lx, ly] = xy(s.points[s.points.length - 1] ?? 0, n, n);
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
            <circle cx={lx} cy={ly} r={s.you ? 3.5 : 2} fill={s.color} fillOpacity={s.you ? 1 : 0.65} />
          </g>
        );
      })}
    </svg>
  );
}
