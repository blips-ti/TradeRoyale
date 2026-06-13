import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  achievementService,
  UnknownAchievementError,
  type AchievementService,
} from "../services/achievementService.js";
import { unlockAchievementSchema } from "./schemas.js";

export function buildAchievementRoutes(
  service: AchievementService = achievementService,
): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  router.get("/me", requireAuth(), async (c) => {
    const state = await service.getState(c.get("userId"));
    return c.json(state);
  });

  router.post("/me/unlock", requireAuth(), zValidator("json", unlockAchievementSchema), async (c) => {
    const { id } = c.req.valid("json");
    const result = await service.unlock(c.get("userId"), id);
    return c.json(result);
  });

  return router;
}

export { UnknownAchievementError };
