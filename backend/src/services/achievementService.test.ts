import { describe, expect, it } from 'vitest';

import type { AchievementRecord } from '../repositories/achievementRepository.js';
import { AchievementService, UnknownAchievementError } from './achievementService.js';

class FakeRepo {
  private store = new Map<string, AchievementRecord>();
  async get(ownerAddress: string): Promise<AchievementRecord | null> {
    return this.store.get(ownerAddress) ?? null;
  }
  async save(ownerAddress: string, record: AchievementRecord): Promise<void> {
    this.store.set(ownerAddress, record);
  }
}

function makeService(): AchievementService {
  return new AchievementService(new FakeRepo() as unknown as never);
}

describe('AchievementService', () => {
  it('returns an empty state for an unknown user', async () => {
    const state = await makeService().getState('0xABC');
    expect(state).toEqual({ unlocked: [], totalXp: 0, level: 0 });
  });

  it('unlocks once, then is idempotent (celebrate only the first time)', async () => {
    const service = makeService();
    const first = await service.unlock('0xAbC', 'connect');
    expect(first.newlyUnlocked).toBe(true);
    expect(first.unlocked).toEqual(['connect']);
    expect(first.totalXp).toBe(50);

    const again = await service.unlock('0xabc', 'connect');
    expect(again.newlyUnlocked).toBe(false);
    expect(again.unlocked).toEqual(['connect']);
  });

  it('accumulates XP and levels up across achievements', async () => {
    const service = makeService();
    await service.unlock('0x1', 'connect'); // 50
    await service.unlock('0x1', 'join'); // 100
    await service.unlock('0x1', 'champion'); // 2000
    const state = await service.getState('0x1');
    expect(state.totalXp).toBe(2150);
    expect(state.level).toBe(4);
  });

  it('rejects an unknown achievement id', async () => {
    await expect(makeService().unlock('0x1', 'nope')).rejects.toBeInstanceOf(UnknownAchievementError);
  });
});
