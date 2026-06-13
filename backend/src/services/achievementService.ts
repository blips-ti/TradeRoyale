import { ACHIEVEMENT_XP, isAchievementId, XP_PER_LEVEL, type AchievementId } from "../domain/achievements.js";
import { AchievementRepository } from "../repositories/achievementRepository.js";

export interface AchievementState {
  unlocked: string[];
  totalXp: number;
  level: number;
}

export interface UnlockResult extends AchievementState {
  newlyUnlocked: boolean;
}

export class UnknownAchievementError extends Error {}

export class AchievementService {
  constructor(private readonly repo: AchievementRepository = new AchievementRepository()) {}

  async getState(ownerAddress: string): Promise<AchievementState> {
    const record = await this.repo.get(ownerAddress.toLowerCase());
    return this.toState(record?.unlocked ?? []);
  }

  // Idempotent: unlocking an already-unlocked achievement returns newlyUnlocked=false, so the
  // FE only celebrates the first time ever (not on reconnect).
  async unlock(ownerAddress: string, id: string): Promise<UnlockResult> {
    if (!isAchievementId(id)) throw new UnknownAchievementError(`Unknown achievement: ${id}`);
    const addr = ownerAddress.toLowerCase();
    const record = (await this.repo.get(addr)) ?? { unlocked: [], unlockedAt: {} };
    if (record.unlocked.includes(id)) {
      return { ...this.toState(record.unlocked), newlyUnlocked: false };
    }
    const unlocked = [...record.unlocked, id];
    await this.repo.save(addr, {
      unlocked,
      unlockedAt: { ...record.unlockedAt, [id]: new Date().toISOString() },
    });
    return { ...this.toState(unlocked), newlyUnlocked: true };
  }

  private toState(unlocked: string[]): AchievementState {
    const totalXp = unlocked.reduce((sum, id) => sum + (ACHIEVEMENT_XP[id as AchievementId] ?? 0), 0);
    return { unlocked, totalXp, level: Math.floor(totalXp / XP_PER_LEVEL) };
  }
}

export const achievementService = new AchievementService();
