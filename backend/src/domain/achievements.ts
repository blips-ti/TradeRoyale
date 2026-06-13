// Server-authoritative achievement catalog (XP per id). Names/icons/rarity live on the FE;
// the backend only needs the XP to compute totals/level and own the unlock ledger.
export const ACHIEVEMENT_XP = {
  connect: 50,
  join: 100,
  agent: 100,
  'first-win': 250,
  'high-roller': 300,
  'hat-trick': 500,
  'whale-hunter': 400,
  comeback: 600,
  diamond: 750,
  champion: 2000,
} as const;

export type AchievementId = keyof typeof ACHIEVEMENT_XP;

export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENT_XP) as AchievementId[];

export const XP_PER_LEVEL = 500;

export function isAchievementId(id: string): id is AchievementId {
  return id in ACHIEVEMENT_XP;
}
