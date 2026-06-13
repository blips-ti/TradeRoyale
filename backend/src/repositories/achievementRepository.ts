import type { Redis } from 'ioredis';

import { RedisKeys } from '../domain/redisKeys.js';
import { getRedis } from '../lib/redis.js';

// One user's unlocked achievements + when each was first unlocked.
export interface AchievementRecord {
  unlocked: string[];
  unlockedAt: Record<string, string>;
}

export class AchievementRepository {
  constructor(private readonly redis: Redis = getRedis()) {}

  async get(ownerAddress: string): Promise<AchievementRecord | null> {
    const raw = await this.redis.get(RedisKeys.achievements(ownerAddress));
    if (!raw) return null;
    return JSON.parse(raw) as AchievementRecord;
  }

  async save(ownerAddress: string, record: AchievementRecord): Promise<void> {
    await this.redis.set(RedisKeys.achievements(ownerAddress), JSON.stringify(record));
  }
}
