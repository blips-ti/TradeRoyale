import { Hono } from 'hono';

import { unlinkService, type UnlinkService } from '../services/unlinkService.js';

// Standard Unlink browser-SDK auth endpoints. The SDK builds Web Request->Response handlers;
// we hand it Hono's raw Request and return its Response unchanged.
export function buildUnlinkAuthRoutes(unlink: UnlinkService = unlinkService): Hono {
  const router = new Hono();
  const handlers = unlink.createAuthRoutes();

  router.post('/register', (c) => handlers.register(c.req.raw));
  router.post('/authorization-token', (c) => handlers.authorizationToken(c.req.raw));

  return router;
}
