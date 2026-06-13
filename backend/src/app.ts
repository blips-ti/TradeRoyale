import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';

import { logger } from './logger.js';
import { buildGameRoutes, GameConflictError, GameNotFoundError } from './routes/gameRoutes.js';
import { buildHealthRoutes } from './routes/healthRoutes.js';
import { buildUnlinkAuthRoutes } from './routes/unlinkAuthRoutes.js';
import { buildGameWsRoutes } from './ws/gameWsRoutes.js';

const HTTP_CONFLICT = 409;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL = 500;

export interface AppBundle {
  app: Hono;
  injectWebSocket: ReturnType<typeof createNodeWebSocket>['injectWebSocket'];
}

export function createApp(): AppBundle {
  const app = new Hono();
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.use('*', honoLogger((message, ...rest) => logger.debug({ rest }, message)));

  app.route('/', buildHealthRoutes());
  app.route('/games', buildGameRoutes());
  app.route('/api/unlink', buildUnlinkAuthRoutes());
  app.route('/ws', buildGameWsRoutes(upgradeWebSocket));

  app.notFound((c) => c.json({ error: 'Not found' }, HTTP_NOT_FOUND));
  app.onError((error, c) => {
    if (error instanceof GameConflictError) return c.json({ error: error.message }, HTTP_CONFLICT);
    if (error instanceof GameNotFoundError) return c.json({ error: error.message }, HTTP_NOT_FOUND);
    if (error instanceof HTTPException) return error.getResponse();
    logger.error({ err: error, path: c.req.path }, '[app] unhandled error');
    return c.json({ error: 'Internal server error' }, HTTP_INTERNAL);
  });

  return { app, injectWebSocket };
}
