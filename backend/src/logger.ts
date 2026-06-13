import { pino } from "pino";

import { env } from "./env.js";

const isProduction = process.env.NODE_ENV === "production";

// Pretty logs in dev; structured JSON to stdout in production (Railway reads stdout).
// `err` serializer renders Error message/stack/code — without it, non-enumerable Error fields
// log as `{}` in prod JSON, hiding every settlement/shield failure.
export const logger = pino({
  level: env.LOG_LEVEL,
  serializers: { err: pino.stdSerializers.err },
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
