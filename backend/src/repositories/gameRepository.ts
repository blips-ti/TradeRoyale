import type { Redis } from 'ioredis';

import { RedisKeys } from '../domain/redisKeys.js';
import type { Game } from '../domain/types.js';
import { getRedis } from '../lib/redis.js';

export class GameRepository {
  constructor(private readonly redis: Redis = getRedis()) {}

  async save(game: Game): Promise<void> {
    await this.redis.set(RedisKeys.game(game.id), JSON.stringify(game));
  }

  async get(gameId: string): Promise<Game | null> {
    const raw = await this.redis.get(RedisKeys.game(gameId));
    if (!raw) return null;
    return JSON.parse(raw) as Game;
  }

  async addToOpenIndex(gameId: string): Promise<void> {
    await this.redis.sadd(RedisKeys.openGames(), gameId);
  }

  async removeFromOpenIndex(gameId: string): Promise<void> {
    await this.redis.srem(RedisKeys.openGames(), gameId);
  }

  async listOpenIds(): Promise<string[]> {
    return this.redis.smembers(RedisKeys.openGames());
  }

  async listOpen(): Promise<Game[]> {
    const ids = await this.listOpenIds();
    const games = await Promise.all(ids.map((id) => this.get(id)));
    return games.filter((game): game is Game => game !== null);
  }

  async addToLiveIndex(gameId: string): Promise<void> {
    await this.redis.sadd(RedisKeys.liveGames(), gameId);
  }

  async removeFromLiveIndex(gameId: string): Promise<void> {
    await this.redis.srem(RedisKeys.liveGames(), gameId);
  }

  async listLive(): Promise<Game[]> {
    const ids = await this.redis.smembers(RedisKeys.liveGames());
    const games = await Promise.all(ids.map((id) => this.get(id)));
    return games.filter((game): game is Game => game !== null);
  }

  async addToEndedIndex(gameId: string): Promise<void> {
    await this.redis.sadd(RedisKeys.endedGames(), gameId);
  }

  async listEnded(): Promise<Game[]> {
    const ids = await this.redis.smembers(RedisKeys.endedGames());
    const games = await Promise.all(ids.map((id) => this.get(id)));
    return games.filter((game): game is Game => game !== null);
  }

  async addPlayer(gameId: string, playerId: string): Promise<void> {
    await this.redis.sadd(RedisKeys.gamePlayers(gameId), playerId);
  }

  async listPlayerIds(gameId: string): Promise<string[]> {
    return this.redis.smembers(RedisKeys.gamePlayers(gameId));
  }

  async countPlayers(gameId: string): Promise<number> {
    return this.redis.scard(RedisKeys.gamePlayers(gameId));
  }
}
