import { cn } from "@/app/_lib/cn";

/* Generated default banner — deterministic neon gradient + grid + bolt watermark. */

const PAIRS = [
  ["#C5F72B", "#34D6E0"],
  ["#FF36A3", "#ff8a3d"],
  ["#34D6E0", "#3da5ff"],
  ["#ff8a3d", "#C5F72B"],
  ["#34D6E0", "#C5F72B"],
];

export function MatchBanner({
  seed,
  name,
  className,
  rounded = true,
  height = 140,
}: {
  seed: number;
  name?: string;
  className?: string;
  rounded?: boolean;
  height?: number;
}) {
  const [a, b] = PAIRS[seed % PAIRS.length] ?? PAIRS[0];
  return (
    <div
      className={cn("relative overflow-hidden", rounded && "rounded-card", className)}
      style={{ height }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(125deg, ${a} 0%, ${b} 100%)` }}
      />
      {/* radial light */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 140% at 15% -10%, rgba(255,255,255,.35), transparent 45%)" }}
      />
      {/* grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.5) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      {/* crown watermark */}
      <svg
        viewBox="0 0 24 24"
        className="absolute -right-3 -bottom-5 h-40 w-40 opacity-15"
        aria-hidden
      >
        <path
          d="M3 17 L3 6.5 L8.2 10.8 L12 3.5 L15.8 10.8 L21 6.5 L21 17 Z M3 18.6 H21 V21 H3 Z"
          fill="#0a0c10"
          fillRule="evenodd"
        />
      </svg>
      {/* bottom scrim for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/55 to-transparent" />
      {name && (
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="font-display text-[26px] font-bold uppercase leading-none tracking-tight text-white drop-shadow">
            {name}
          </h2>
        </div>
      )}
    </div>
  );
}
