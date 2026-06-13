import { serve } from "@hono/node-server";

import { agentRunner } from "./agent/agentRunner.js";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { closeRedis } from "./lib/redis.js";
import { logger } from "./logger.js";
import { depositWatcher } from "./workers/depositWatcher.js";
import { gameClock } from "./workers/gameClock.js";

function start(): void {
  const { app, injectWebSocket } = createApp();

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { port: info.port, unlinkEnvironment: env.UNLINK_ENVIRONMENT },
      "[index] trade-royal-backend listening",
    );
  });

  injectWebSocket(server);
  depositWatcher.start();
  gameClock.start();

  registerShutdown(server);
}

function registerShutdown(server: ReturnType<typeof serve>): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "[index] shutting down");
    depositWatcher.stop();
    gameClock.stop();
    // Abort + AWAIT all agent loops before exit so no in-flight turn is killed mid-trade.
    await agentRunner.stopAll();
    server.close();
    await closeRedis();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start();
