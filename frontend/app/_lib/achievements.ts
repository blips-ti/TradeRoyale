export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  xp: number;
  coins: number;
  rarity: Rarity;
  icon: string; // lucide key resolved in Badge
};

/** 10 achievements. First three unlock from real app state; the rest are mocked. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: "connect", name: "First Contact", desc: "Connect your wallet", xp: 50, coins: 100, rarity: "common", icon: "wallet" },
  { id: "join", name: "Enter The Arena", desc: "Join your first Match", xp: 100, coins: 200, rarity: "common", icon: "swords" },
  { id: "agent", name: "Loadout Locked", desc: "Set up your AI agent", xp: 100, coins: 200, rarity: "rare", icon: "bot" },
  { id: "first-win", name: "First Blood", desc: "Win your first Match", xp: 250, coins: 500, rarity: "rare", icon: "trophy" },
  { id: "high-roller", name: "High Roller", desc: "Buy into a $500+ Match", xp: 300, coins: 600, rarity: "rare", icon: "coins" },
  { id: "hat-trick", name: "Hat Trick", desc: "Win 3 Matches in a season", xp: 500, coins: 1000, rarity: "epic", icon: "flame" },
  { id: "whale-hunter", name: "Whale Hunter", desc: "Beat a top-10 ranked trader", xp: 400, coins: 800, rarity: "epic", icon: "crosshair" },
  { id: "comeback", name: "Comeback King", desc: "Win after being last at the half", xp: 600, coins: 1200, rarity: "epic", icon: "trending-up" },
  { id: "diamond", name: "Diamond Hands", desc: "Win through a 20% drawdown", xp: 750, coins: 1500, rarity: "legendary", icon: "gem" },
  { id: "champion", name: "Season Champion", desc: "Finish #1 on the season ladder", xp: 2000, coins: 5000, rarity: "legendary", icon: "crown" },
];

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export const XP_PER_LEVEL = 500;

export type Progress = {
  unlocked: Set<string>;
  totalXp: number;
  level: number;
  xpInLevel: number;
  best: Achievement | null;
};

/** Derives XP/level/best from the BE-persisted unlocked set (source of truth). */
export function progressFor(unlocked: Set<string>): Progress {
  const totalXp = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).reduce((s, a) => s + a.xp, 0);
  const level = Math.floor(totalXp / XP_PER_LEVEL);
  const xpInLevel = totalXp % XP_PER_LEVEL;

  const best =
    ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).sort(
      (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.xp - a.xp,
    )[0] ?? null;

  return { unlocked, totalXp, level, xpInLevel, best };
}

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
