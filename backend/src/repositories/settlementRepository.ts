import type { Redis } from "ioredis";

import { RedisKeys } from "../domain/redisKeys.js";
import type { Settlement } from "../domain/types.js";
import { getRedis } from "../lib/redis.js";

export class SettlementRepository {
  constructor(private readonly redis: Redis = getRedis()) {}

  async save(settlement: Settlement): Promise<void> {
    await this.redis.set(RedisKeys.gameSettlement(settlement.gameId), JSON.stringify(settlement));
  }

  async get(gameId: string): Promise<Settlement | null> {
    const raw = await this.redis.get(RedisKeys.gameSettlement(gameId));
    if (!raw) return null;
    return JSON.parse(raw) as Settlement;
  }
}
