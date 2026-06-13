import type { WSContext } from 'hono/ws';

import { logger } from '../logger.js';
import { buildGameEvent, type GameEvent, type GameEventType } from './events.js';

const OPEN_READY_STATE = 1;

// Fan-out hub keyed by gameId. Routes and workers broadcast; the WS route subscribes sockets.
export class GameEventHub {
  private static instance: GameEventHub;
  private readonly subscribers = new Map<string, Set<WSContext>>();

  static getInstance(): GameEventHub {
    if (!GameEventHub.instance) {
      GameEventHub.instance = new GameEventHub();
    }
    return GameEventHub.instance;
  }

  subscribe(gameId: string, ws: WSContext): void {
    const set = this.subscribers.get(gameId) ?? new Set<WSContext>();
    set.add(ws);
    this.subscribers.set(gameId, set);
  }

  unsubscribe(gameId: string, ws: WSContext): void {
    const set = this.subscribers.get(gameId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.subscribers.delete(gameId);
  }

  broadcast(type: GameEventType, gameId: string, data: Record<string, unknown>): void {
    const event = buildGameEvent(type, gameId, data);
    this.send(gameId, event);
  }

  private send(gameId: string, event: GameEvent): void {
    const set = this.subscribers.get(gameId);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
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
