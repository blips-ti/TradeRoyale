import { Redis } from "ioredis";

import { env } from "../env.js";
import { logger } from "../logger.js";

let client: Redis | undefined;

// Single shared ioredis connection. The rediss:// URL carries TLS; ioredis enables it from the scheme.
export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on("error", (error) => {
    logger.error({ err: error }, "[redis] connection error");
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = undefined;
}
