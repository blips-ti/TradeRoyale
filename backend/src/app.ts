import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger as honoLogger } from 'hono/logger';

import { env } from './env.js';
import { logger } from './logger.js';
import { UnauthorizedError } from './middleware/auth.js';
import { buildAchievementRoutes, UnknownAchievementError } from './routes/achievementRoutes.js';
import { buildGameRoutes, ForbiddenError, GameConflictError, GameNotFoundError } from './routes/gameRoutes.js';
import { buildHealthRoutes } from './routes/healthRoutes.js';
import { buildLeaderboardRoutes } from './routes/leaderboardRoutes.js';
import { buildUnlinkAuthRoutes } from './routes/unlinkAuthRoutes.js';
import { buildGameWsRoutes } from './ws/gameWsRoutes.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
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

  const corsOrigin = env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    '*',
    cors({
      origin: corsOrigin,
      allowHeaders: ['Content-Type', 'Authorization', 'x-player-id'],
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    }),
  );
  app.use('*', honoLogger((message, ...rest) => logger.debug({ rest }, message)));

  app.route('/', buildHealthRoutes());
  app.route('/games', buildGameRoutes());
  app.route('/leaderboard', buildLeaderboardRoutes());
  app.route('/achievements', buildAchievementRoutes());
  app.route('/api/unlink', buildUnlinkAuthRoutes());
  app.route('/ws', buildGameWsRoutes(upgradeWebSocket));

  app.notFound((c) => c.json({ error: 'Not found' }, HTTP_NOT_FOUND));
  app.onError((error, c) => {
    if (error instanceof GameConflictError) return c.json({ error: error.message }, HTTP_CONFLICT);
    if (error instanceof GameNotFoundError) return c.json({ error: error.message }, HTTP_NOT_FOUND);
    if (error instanceof ForbiddenError) return c.json({ error: error.message }, HTTP_FORBIDDEN);
    if (error instanceof UnauthorizedError) return c.json({ error: error.message }, HTTP_UNAUTHORIZED);
    if (error instanceof UnknownAchievementError) return c.json({ error: error.message }, HTTP_BAD_REQUEST);
    if (error instanceof HTTPException) return error.getResponse();
    logger.error({ err: error, path: c.req.path }, '[app] unhandled error');
    return c.json({ error: 'Internal server error' }, HTTP_INTERNAL);
  });

  return { app, injectWebSocket };
}
