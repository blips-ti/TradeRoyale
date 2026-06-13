import { pino } from "pino";

import { env } from "./env.js";

const isProduction = process.env.NODE_ENV === "production";

// Pretty logs in dev; structured JSON in production.
export const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});
