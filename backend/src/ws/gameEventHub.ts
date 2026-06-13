import type { WSContext } from 'hono/ws';

import { logger } from '../logger.js';
import { buildGameEvent, type GameEvent, type GameEventType } from './events.js';

const OPEN_READY_STATE = 1;

// Fan-out hub keyed by gameId. Each socket records the playerId it connected as (from the WS
// query) so private events (an agent's own reasoning/trades) go ONLY to that player's sockets,
// while game-wide events (NAV, ticks, results) go to everyone in the game.
export class GameEventHub {
  private static instance: GameEventHub;
  private readonly subscribers = new Map<string, Map<WSContext, string | undefined>>();

  static getInstance(): GameEventHub {
    if (!GameEventHub.instance) {
      GameEventHub.instance = new GameEventHub();
    }
    return GameEventHub.instance;
  }

  subscribe(gameId: string, ws: WSContext, playerId?: string): void {
    const map = this.subscribers.get(gameId) ?? new Map<WSContext, string | undefined>();
    map.set(ws, playerId);
    this.subscribers.set(gameId, map);
  }

  unsubscribe(gameId: string, ws: WSContext): void {
    const map = this.subscribers.get(gameId);
    if (!map) return;
    map.delete(ws);
    if (map.size === 0) this.subscribers.delete(gameId);
  }

  // Game-wide event — delivered to every socket in the game.
  broadcast(type: GameEventType, gameId: string, data: Record<string, unknown>): void {
    this.deliver(gameId, buildGameEvent(type, gameId, data));
  }

  // Private event — delivered ONLY to sockets that connected as `playerId`. Used for an agent's
  // own reasoning stream and trades so opponents never receive another player's logs.
  broadcastToPlayer(type: GameEventType, gameId: string, playerId: string, data: Record<string, unknown>): void {
    this.deliver(gameId, buildGameEvent(type, gameId, { ...data, playerId }), playerId);
  }

  private deliver(gameId: string, event: GameEvent, onlyPlayerId?: string): void {
    const map = this.subscribers.get(gameId);
    if (!map || map.size === 0) return;
    const payload = JSON.stringify(event);
    for (const [ws, playerId] of map) {
      if (onlyPlayerId !== undefined && playerId !== onlyPlayerId) continue;
      if (ws.readyState !== OPEN_READY_STATE) continue;
      try {
        ws.send(payload);
      } catch (error) {
        logger.warn({ err: error, gameId, type: event.type }, '[ws] failed to send to subscriber');
      }
    }
  }
}

export const gameEventHub = GameEventHub.getInstance();
