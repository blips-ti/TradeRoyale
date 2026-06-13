import {
  Bot,
  Coins,
  Crosshair,
  Crown,
  Flame,
  Gem,
  Lock,
  Swords,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Rarity } from "@/app/_lib/achievements";

const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  swords: Swords,
  bot: Bot,
  trophy: Trophy,
  coins: Coins,
  flame: Flame,
  crosshair: Crosshair,
  "trending-up": TrendingUp,
  gem: Gem,
  crown: Crown,
};

const RARITY: Record<Rarity, { a: string; b: string; ring: string }> = {
  common: { a: "#dcc08a", b: "#8a6a3b", ring: "#efd8a8" },
  rare: { a: "#8fd6ff", b: "#2f7fd6", ring: "#c6e9ff" },
  epic: { a: "#ff9ad8", b: "#d61e8f", ring: "#ffc6ea" },
  legendary: { a: "#ffe488", b: "#e0a92e", ring: "#fff2bd" },
};

const SHIELD = "M24 2 L44 9.5 V25 C44 39 35.5 48 24 52 C12.5 48 4 39 4 25 V9.5 Z";
const GLOSS = "M24 2 L44 9.5 V19 C44 25 35.5 29 24 29 C12.5 29 4 25 4 19 V9.5 Z";

export function Badge({
  rarity = "common",
  icon,
  size = 56,
  locked = false,
}: {
  rarity?: Rarity;
  icon: string;
  size?: number;
  locked?: boolean;
}) {
  const r = RARITY[rarity];
  const Icon = ICONS[icon] ?? Trophy;
  const gid = `grad-${rarity}-${locked ? "l" : "u"}`;

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 54"
        width={size}
        height={size}
        style={{
          filter: locked
            ? "grayscale(0.85) brightness(0.7)"
            : "drop-shadow(0 6px 14px rgb(0 0 0 / 0.55))",
          opacity: locked ? 0.5 : 1,
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={r.a} />
            <stop offset="1" stopColor={r.b} />
          </linearGradient>
        </defs>
        <path d={SHIELD} fill={`url(#${gid})`} stroke={r.ring} strokeWidth="1.6" strokeLinejoin="round" />
        <path d={GLOSS} fill="rgba(255,255,255,0.22)" />
      </svg>
      <Icon
        className="absolute text-white"
        style={{ width: size * 0.34, height: size * 0.34, marginTop: -size * 0.04 }}
        strokeWidth={2.3}
      />
      {locked && (
        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-[color:var(--color-line-strong)] bg-[color:var(--color-bg)]">
          <Lock className="h-2.5 w-2.5 text-muted" />
        </span>
      )}
    </span>
  );
}
