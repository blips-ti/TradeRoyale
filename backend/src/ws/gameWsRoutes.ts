import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';

import { logger } from '../logger.js';
import { gameEventHub, GameEventHub } from './gameEventHub.js';

export function buildGameWsRoutes(
  upgradeWebSocket: UpgradeWebSocket,
  hub: GameEventHub = gameEventHub,
): Hono {
  const router = new Hono();

  router.get(
    '/games/:gameId',
    upgradeWebSocket((c) => {
      const gameId = c.req.param('gameId');
      // Who this socket is (from ?pid=…) — scopes private events to the player's own agent logs.
      const playerId = c.req.query('pid') || undefined;
      return {
        onOpen: (_event, ws) => {
          hub.subscribe(gameId, ws, playerId);
          logger.debug({ gameId, playerId }, '[ws] subscriber connected');
        },
        onClose: (_event, ws) => {
          hub.unsubscribe(gameId, ws);
          logger.debug({ gameId }, '[ws] subscriber disconnected');
        },
        onError: (event, ws) => {
          hub.unsubscribe(gameId, ws);
          logger.warn({ gameId, event }, '[ws] subscriber error');
        },
      };
    }),
  );

  return router;
}
