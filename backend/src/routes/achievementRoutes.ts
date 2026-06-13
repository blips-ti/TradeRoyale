import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  achievementService,
  UnknownAchievementError,
  type AchievementService,
} from "../services/achievementService.js";
import { unlockAchievementSchema } from "./schemas.js";

export function buildAchievementRoutes(service: AchievementService = achievementService): Hono {
  const router = new Hono();

  router.get("/:ownerAddress", async (c) => {
    const state = await service.getState(c.req.param("ownerAddress"));
    return c.json(state);
  });

  router.post("/:ownerAddress/unlock", zValidator("json", unlockAchievementSchema), async (c) => {
    const { id } = c.req.valid("json");
    const result = await service.unlock(c.req.param("ownerAddress"), id);
    return c.json(result);
  });

  return router;
}

export { UnknownAchievementError };
