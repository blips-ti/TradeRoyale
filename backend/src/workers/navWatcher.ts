import type { Game, Player } from "../domain/types.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { octavService, OctavService } from "../services/octavService.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";

const NAV_INTERVAL_MS = 30_000; // Octav /wallet has no cache — sample every 30s for a live feel.

// Every 30s, reads each live player's trading-wallet holdings from the Octav /wallet API and
// broadcasts portfolio_update so the arena chart + standings + wallet panel stay live.
export class NavWatcher {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly games: GameRepository = new GameRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly octav: OctavService = octavService,
    private readonly hub: GameEventHub = gameEventHub,
    private readonly intervalMs: number = NAV_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runIteration(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, "[navWatcher] started");
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // One self-contained tick; never throws (a NAV read failure must not crash the loop).
  async runIteration(): Promise<void> {
    try {
      const games = await this.games.listLive();
      await Promise.allSettled(games.map((game) => this.sampleGame(game)));
    } catch (error) {
      logger.error({ err: error }, "[navWatcher] iteration failed");
    }
  }

  private async sampleGame(game: Game): Promise<void> {
    const playerIds = await this.games.listPlayerIds(game.id);
    const players = await this.players.getMany(playerIds);
    const funded = players.filter((player) => player.privyWalletAddress);
    await Promise.allSettled(funded.map((player) => this.samplePlayer(game.id, player)));
  }

  private async samplePlayer(gameId: string, player: Player): Promise<void> {
    try {
      const { navUsd, holdings } = await this.octav.getWallet(player.privyWalletAddress as string);
      this.hub.broadcast("portfolio_update", gameId, { playerId: player.id, navUsd, holdings });
    } catch (error) {
      logger.warn({ err: error, playerId: player.id, gameId }, "[navWatcher] nav sample failed");
    }
  }
}

export const navWatcher = new NavWatcher();
