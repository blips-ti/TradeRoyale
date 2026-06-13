import type { Redis } from 'ioredis';

import { RedisKeys } from '../domain/redisKeys.js';
import type { Player } from '../domain/types.js';
import { getRedis } from '../lib/redis.js';

// Pointer from a user's wallet address to their current game/player.
export interface ActivePlayerRef {
  gameId: string;
  playerId: string;
}

export class PlayerRepository {
  constructor(private readonly redis: Redis = getRedis()) {}

  async save(player: Player): Promise<void> {
    await this.redis.set(RedisKeys.player(player.id), JSON.stringify(player));
  }

  async get(playerId: string): Promise<Player | null> {
    const raw = await this.redis.get(RedisKeys.player(playerId));
    if (!raw) return null;
    return JSON.parse(raw) as Player;
  }

  async getMany(playerIds: string[]): Promise<Player[]> {
    const players = await Promise.all(playerIds.map((id) => this.get(id)));
    return players.filter((player): player is Player => player !== null);
  }

  async setActiveForOwner(ownerAddress: string, ref: ActivePlayerRef): Promise<void> {
    await this.redis.set(RedisKeys.ownerActive(ownerAddress), JSON.stringify(ref));
  }

  async getActiveForOwner(ownerAddress: string): Promise<ActivePlayerRef | null> {
    const raw = await this.redis.get(RedisKeys.ownerActive(ownerAddress));
    if (!raw) return null;
    return JSON.parse(raw) as ActivePlayerRef;
  }
}
