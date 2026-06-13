import { BigNumber } from "bignumber.js";

import { env } from "../env.js";
import type { Game, Player } from "../domain/types.js";
import { toPublicPlayer } from "../domain/types.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { unlinkService, UnlinkService } from "../services/unlinkService.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";

// Polls pending players in lobby games and confirms deposits once the entry token balance is sufficient.
export class DepositWatcher {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly games: GameRepository = new GameRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly unlink: UnlinkService = unlinkService,
    private readonly hub: GameEventHub = gameEventHub,
    private readonly intervalMs: number = env.DEPOSIT_POLL_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runIteration(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, "[depositWatcher] started");
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // Public for the tester; one tick is fully self-contained and never throws.
  async runIteration(): Promise<void> {
    try {
      const games = await this.games.listOpen();
      await Promise.allSettled(games.map((game) => this.checkGame(game)));
    } catch (error) {
      logger.error({ err: error }, "[depositWatcher] iteration failed");
    }
  }

  private async checkGame(game: Game): Promise<void> {
    if (game.status !== "lobby") return;
    const playerIds = await this.games.listPlayerIds(game.id);
    const players = await this.players.getMany(playerIds);
    const pending = players.filter(
      (player) => player.depositStatus === "pending",
    );
    await Promise.allSettled(
      pending.map((player) => this.checkPlayer(game, player)),
    );
  }

  private async checkPlayer(game: Game, player: Player): Promise<void> {
    try {
      const balance = await this.unlink.getTokenBalance({
        playerId: player.id,
        unlinkAddress: player.unlinkAddress,
        encMnemonic: player.encMnemonic,
        token: game.entryToken,
      });
      if (new BigNumber(balance).lt(game.entryAmount)) return;
      await this.confirmDeposit(game, player);
    } catch (error) {
      logger.warn(
        { err: error, playerId: player.id, gameId: game.id },
        "[depositWatcher] player check failed",
      );
    }
  }

  // startingBalance is the exact entry amount put in play (releaseFunds withdraws exactly
  // game.entryAmount), NOT the raw Unlink balance — excess would overstate PnL and strand funds.
  private async confirmDeposit(game: Game, player: Player): Promise<void> {
    const confirmed: Player = {
      ...player,
      depositStatus: "confirmed",
      startingBalance: game.entryAmount,
    };
    await this.players.save(confirmed);
    this.hub.broadcast("deposit_confirmed", player.gameId, {
      player: toPublicPlayer(confirmed),
      startingBalance: game.entryAmount,
    });
    logger.info(
      { playerId: player.id, gameId: player.gameId },
      "[depositWatcher] deposit confirmed",
    );
  }
}

export const depositWatcher = new DepositWatcher();
