import { Hono } from "hono";

import { gameService, type GameService } from "../services/gameService.js";
import { privyService, type PrivyService } from "../services/privyService.js";

// Public all-time leaderboard. Auth is OPTIONAL: a valid Bearer token just flags the caller's
// own row (you=true); without it the board still renders, just with no highlight.
export function buildLeaderboardRoutes(
  service: GameService = gameService,
  privy: PrivyService = privyService,
): Hono {
  const router = new Hono();

  router.get("/", async (c) => {
    const authz = c.req.header("authorization");
    let ownerId: string | undefined;
    if (authz?.startsWith("Bearer ")) {
      ownerId = await privy.verifyAccessToken(authz.slice(7)).catch(() => undefined);
    }
    const entries = await service.getLeaderboard(ownerId);
    return c.json({ entries });
  });

  return router;
}
