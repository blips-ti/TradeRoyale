import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { env } from "../env.js";
import { toPublicPlayer } from "../domain/types.js";
import {
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
): Hono {
  const router = new Hono();

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

  router.get("/:gameId", async (c) => {
    const result = await service.getGameWithPlayers(c.req.param("gameId"));
    return c.json(result);
  });

  router.post(
    "/:gameId/join",
    zValidator("json", joinGameSchema),
    async (c) => {
      const body = c.req.valid("json");
      const result = await service.joinGame({
        gameId: c.req.param("gameId"),
        displayName: body.displayName,
        strategyPrompt: body.strategyPrompt,
      });
      return c.json(result, 201);
    },
  );

  router.put(
    "/:gameId/players/:playerId/strategy",
    zValidator("json", updateStrategySchema),
    async (c) => {
      const body = c.req.valid("json");
      const player = await service.setStrategy({
        gameId: c.req.param("gameId"),
        playerId: c.req.param("playerId"),
        strategyPrompt: body.strategyPrompt,
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

export { GameConflictError, GameNotFoundError };
