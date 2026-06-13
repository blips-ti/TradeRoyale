import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { env } from "../env.js";
import { toPublicPlayer } from "../domain/types.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  ForbiddenError,
  GameConflictError,
  GameNotFoundError,
  gameService,
  type GameService,
} from "../services/gameService.js";
import {
  unlinkService,
  type UnlinkService,
} from "../services/unlinkService.js";
import {
  createGameSchema,
  joinGameSchema,
  listGamesQuerySchema,
  startGameSchema,
  updateStrategySchema,
} from "./schemas.js";

export function buildGameRoutes(
  service: GameService = gameService,
  unlink: UnlinkService = unlinkService,
): Hono<{ Variables: AuthVariables }> {
  const router = new Hono<{ Variables: AuthVariables }>();

  router.post("/", zValidator("json", createGameSchema), async (c) => {
    const body = c.req.valid("json");
    const game = await service.createGame(body);
    return c.json(game, 201);
  });

  router.get("/", zValidator("query", listGamesQuerySchema), async (c) => {
    const { status } = c.req.valid("query");
    const games = await service.listGames(status);
    return c.json({ games });
  });

  // Recover the caller's active game + player (reconnect / new device) — by verified Privy id.
  // Static "/me" is matched before the "/:gameId" param route.
  router.get("/me", requireAuth(), async (c) => {
    const active = await service.getActiveForOwner(c.get("userId"));
    return c.json(active ?? { game: null, player: null });
  });

  router.get("/:gameId", async (c) => {
    const result = await service.getGameWithPlayers(c.req.param("gameId"));
    return c.json(result);
  });

  router.post(
    "/:gameId/join",
    requireAuth(),
    zValidator("json", joinGameSchema),
    async (c) => {
      const body = c.req.valid("json");
      const result = await service.joinGame({
        gameId: c.req.param("gameId"),
        displayName: body.displayName,
        strategyPrompt: body.strategyPrompt,
        ownerId: c.get("userId"),
      });
      return c.json(result, 201);
    },
  );

  router.put(
    "/:gameId/players/:playerId/strategy",
    requireAuth(),
    zValidator("json", updateStrategySchema),
    async (c) => {
      const body = c.req.valid("json");
      const player = await service.setStrategy({
        gameId: c.req.param("gameId"),
        playerId: c.req.param("playerId"),
        strategyPrompt: body.strategyPrompt,
        ownerId: c.get("userId"),
      });
      return c.json({ player: toPublicPlayer(player) });
    },
  );

  router.get("/:gameId/trades", async (c) => {
    const trades = await service.getTrades(c.req.param("gameId"));
    return c.json({ trades });
  });

  router.get("/:gameId/results", async (c) => {
    const settlement = await service.getSettlement(c.req.param("gameId"));
    return c.json({ settlement });
  });

  router.post(
    "/:gameId/start",
    zValidator("json", startGameSchema),
    async (c) => {
      const body = c.req.valid("json");
      const gameId = c.req.param("gameId");
      const game = body.force
        ? await service.forceStartGame(gameId)
        : await service.startGame(gameId);
      return c.json(game);
    },
  );

  // Owner-only: the caller's own Unlink account keys, used by the FE to deposit entry funds
  // into their BE-custodied vault. More specific than "/:playerId", so declared before it.
  router.get("/:gameId/players/:playerId/unlink-account", requireAuth(), async (c) => {
    const account = await service.exportUnlinkAccount(
      c.req.param("gameId"),
      c.req.param("playerId"),
      c.get("userId"),
    );
    return c.json({ account });
  });

  router.get("/:gameId/players/:playerId", async (c) => {
    const gameId = c.req.param("gameId");
    const playerId = c.req.param("playerId");
    const player = await service.getPlayer(gameId, playerId);
    const balances = await unlink.getBalances({
      playerId: player.id,
      unlinkAddress: player.unlinkAddress,
      encMnemonic: player.encMnemonic,
    });
    return c.json({
      player: toPublicPlayer(player),
      entryToken: env.ENTRY_TOKEN_ADDRESS,
      balances,
    });
  });

  return router;
}

export { ForbiddenError, GameConflictError, GameNotFoundError };
