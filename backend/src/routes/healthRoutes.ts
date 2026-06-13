import { Hono } from 'hono';

import { buildAgentRequestParams } from '../agent/agentRequest.js';
import { getAnthropicClient } from '../agent/anthropicClient.js';
import { env } from '../env.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../logger.js';
import { lifiService } from '../services/lifiService.js';
import { octavService } from '../services/octavService.js';
import { unlinkService, type UnlinkService } from '../services/unlinkService.js';

interface DependencyStatus {
  ok: boolean;
  error?: string;
}

async function tryStep(fn: () => Promise<unknown>): Promise<DependencyStatus> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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

  // Layered agent diagnostic — surfaces the EXACT error behind "[agentLoop] turn failed".
  // Mirrors a real tick (LI.FI token list -> Octav NAV -> Anthropic toolRunner ±MCP) so we can
  // tell whether the failure is the model id, thinking/beta, the LI.FI MCP, or a key.
  router.get('/health/agent', async (c) => {
    const buildTest = (mcp: boolean) =>
      buildAgentRequestParams({
        model: env.AGENT_MODEL,
        maxTokens: 64,
        maxIterations: 1,
        system: 'Diagnostic. Reply with the single word OK.',
        firstMessage: 'Reply OK.',
        tools: [],
        lifiMcp: { enabled: mcp, url: env.LIFI_MCP_URL, authorizationToken: env.LIFI_API_KEY },
      });

    const lifi = await tryStep(() => lifiService.getTokens());
    const octav = await tryStep(() => octavService.getPortfolioNav('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'));
    const anthropic = await tryStep(() => getAnthropicClient().beta.messages.toolRunner(buildTest(false)).runUntilDone());
    const anthropicMcp = env.AGENT_USE_LIFI_MCP
      ? await tryStep(() => getAnthropicClient().beta.messages.toolRunner(buildTest(true)).runUntilDone())
      : { ok: true, error: 'mcp disabled' };

    return c.json({
      model: env.AGENT_MODEL,
      lifiMcpEnabled: env.AGENT_USE_LIFI_MCP,
      hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
      hasOctavKey: Boolean(env.OCTAV_API_KEY),
      hasLifiKey: Boolean(env.LIFI_API_KEY),
      lifi,
      octav,
      anthropic,
      anthropicMcp,
    });
  });

  return router;
}
