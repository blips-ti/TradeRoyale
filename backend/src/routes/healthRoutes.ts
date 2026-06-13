import { Hono } from 'hono';

import { getRedis } from '../lib/redis.js';
import { logger } from '../logger.js';
import { unlinkService, type UnlinkService } from '../services/unlinkService.js';

interface DependencyStatus {
  ok: boolean;
  error?: string;
}

async function checkRedis(): Promise<DependencyStatus> {
  try {
    const pong = await getRedis().ping();
    return { ok: pong === 'PONG' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error }, '[health] redis ping failed');
    return { ok: false, error: message };
  }
}

async function checkUnlink(unlink: UnlinkService): Promise<DependencyStatus> {
  try {
    await unlink.ping();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ err: error }, '[health] unlink ping failed');
    return { ok: false, error: message };
  }
}

export function buildHealthRoutes(unlink: UnlinkService = unlinkService): Hono {
  const router = new Hono();

  router.get('/healthcheck', (c) => c.json({ status: 'ok' }));

  router.get('/health/deep', async (c) => {
    const [redis, unlinkStatus] = await Promise.all([checkRedis(), checkUnlink(unlink)]);
    const healthy = redis.ok && unlinkStatus.ok;
    return c.json({ status: healthy ? 'ok' : 'degraded', redis, unlink: unlinkStatus }, healthy ? 200 : 503);
  });

  return router;
}
