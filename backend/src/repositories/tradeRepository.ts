import type { Redis } from 'ioredis';

import { RedisKeys } from '../domain/redisKeys.js';
import type { Trade } from '../domain/types.js';
import { getRedis } from '../lib/redis.js';

const DEFAULT_TRADE_LIMIT = 200;

export class TradeRepository {
  constructor(private readonly redis: Redis = getRedis()) {}

  async append(trade: Trade): Promise<void> {
    await this.redis.rpush(RedisKeys.gameTrades(trade.gameId), JSON.stringify(trade));
  }

  async list(gameId: string, limit: number = DEFAULT_TRADE_LIMIT): Promise<Trade[]> {
    const raw = await this.redis.lrange(RedisKeys.gameTrades(gameId), -limit, -1);
    return raw.map((entry) => JSON.parse(entry) as Trade);
  }

  async listForPlayer(gameId: string, playerId: string): Promise<Trade[]> {
    const trades = await this.list(gameId);
    return trades.filter((trade) => trade.playerId === playerId);
  }
}
