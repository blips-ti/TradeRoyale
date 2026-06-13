import { randomUUID } from "node:crypto";

import { agentRunner, AgentRunner } from "../agent/agentRunner.js";
import { env } from "../env.js";
import type { Game, Player, PublicPlayer, Settlement, Trade } from "../domain/types.js";
import { toPublicPlayer } from "../domain/types.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { SettlementRepository } from "../repositories/settlementRepository.js";
import { TradeRepository } from "../repositories/tradeRepository.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";
import { privyService, PrivyService } from "./privyService.js";
import { unlinkService, UnlinkService } from "./unlinkService.js";

const DEFAULT_DURATION_SEC = 3600;
const DEFAULT_MAX_PLAYERS = 10;
const MIN_FORCE_START_PLAYERS = 2;
const MS_PER_SEC = 1000;

export interface CreateGameInput {
  entryAmount: string;
  durationSec?: number;
  maxPlayers?: number;
}

export interface JoinGameInput {
  gameId: string;
  displayName: string;
  strategyPrompt?: string;
}

export interface SetStrategyInput {
  gameId: string;
  playerId: string;
  strategyPrompt: string;
}

export interface JoinGameResult {
  playerId: string;
  unlinkAddress: string;
  deposit: {
    token: string;
    amount: string;
    instructions: string;
  };
}

export interface GameWithPlayers {
  game: Game;
  players: PublicPlayer[];
}

export type GameListStatus = "open" | "live" | "all";

// A game in a list response, enriched with its current player count.
export interface GameListItem extends Game {
  playerCount: number;
}

export class GameConflictError extends Error {}
export class GameNotFoundError extends Error {}

const DEPOSIT_INSTRUCTIONS =
  "Deposit into your own Unlink account, then transfer this exact amount to the unlinkAddress above";

export class GameService {
  constructor(
    private readonly games: GameRepository = new GameRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly unlink: UnlinkService = unlinkService,
    private readonly hub: GameEventHub = gameEventHub,
    private readonly trades: TradeRepository = new TradeRepository(),
    private readonly runner: AgentRunner = agentRunner,
    private readonly privy: PrivyService = privyService,
    private readonly settlements: SettlementRepository = new SettlementRepository(),
  ) {}

  async createGame(input: CreateGameInput): Promise<Game> {
    const game: Game = {
      id: randomUUID(),
      status: "lobby",
      entryToken: env.ENTRY_TOKEN_ADDRESS,
      entryAmount: input.entryAmount,
      durationSec: input.durationSec ?? DEFAULT_DURATION_SEC,
      maxPlayers: input.maxPlayers ?? DEFAULT_MAX_PLAYERS,
      createdAt: new Date().toISOString(),
    };
    await this.games.save(game);
    await this.games.addToOpenIndex(game.id);
    return game;
  }

  async listOpenGames(): Promise<Game[]> {
    return this.games.listOpen();
  }

  // Lobby ("open"), in-progress ("live"), or both ("all"), each with its player count.
  async listGames(status: GameListStatus): Promise<GameListItem[]> {
    const games = await this.gamesForStatus(status);
    return Promise.all(
      games.map(async (game) => ({ ...game, playerCount: await this.games.countPlayers(game.id) })),
    );
  }

  private async gamesForStatus(status: GameListStatus): Promise<Game[]> {
    if (status === "live") return this.games.listLive();
    if (status === "all") {
      const [open, live] = await Promise.all([this.games.listOpen(), this.games.listLive()]);
      return [...open, ...live];
    }
    return this.games.listOpen();
  }

  async getGameWithPlayers(gameId: string): Promise<GameWithPlayers> {
    const game = await this.requireGame(gameId);
    const playerIds = await this.games.listPlayerIds(gameId);
    const players = await this.players.getMany(playerIds);
    return { game, players: players.map(toPublicPlayer) };
  }

  async getPlayer(gameId: string, playerId: string): Promise<Player> {
    const player = await this.players.get(playerId);
    if (!player || player.gameId !== gameId) {
      throw new GameNotFoundError("Player not found in this game");
    }
    return player;
  }

  // Strategy is editable only while the game is still in the lobby — once live, the prompt
  // is frozen so a player can't redirect their agent mid-competition.
  async setStrategy(input: SetStrategyInput): Promise<Player> {
    const game = await this.requireGame(input.gameId);
    if (game.status !== "lobby") {
      throw new GameConflictError(
        "Strategy can only be set while the game is in lobby",
      );
    }
    const player = await this.getPlayer(input.gameId, input.playerId);
    const updated: Player = { ...player, strategyPrompt: input.strategyPrompt };
    await this.players.save(updated);
    return updated;
  }

  async getTrades(gameId: string): Promise<Trade[]> {
    await this.requireGame(gameId);
    return this.trades.list(gameId);
  }

  // The persisted Phase-3 settlement (null until the game has settled).
  async getSettlement(gameId: string): Promise<Settlement | null> {
    await this.requireGame(gameId);
    return this.settlements.get(gameId);
  }

  async joinGame(input: JoinGameInput): Promise<JoinGameResult> {
    const game = await this.requireGame(input.gameId);
    if (game.status !== "lobby") {
      throw new GameConflictError("Game is not accepting players");
    }
    const playerCount = await this.games.countPlayers(game.id);
    if (playerCount >= game.maxPlayers) {
      throw new GameConflictError("Game is full");
    }
    const gameAccount = await this.unlink.createGameAccount();
    // Entry custody stays in Unlink; the Privy wallet is the public Base trading wallet.
    const wallet = await this.privy.createPlayerWallet();
    const player: Player = {
      id: randomUUID(),
      gameId: game.id,
      displayName: input.displayName,
      unlinkAddress: gameAccount.unlinkAddress,
      encMnemonic: gameAccount.encMnemonic,
      depositStatus: "pending",
      createdAt: new Date().toISOString(),
      strategyPrompt: input.strategyPrompt,
      privyWalletId: wallet.walletId,
      privyWalletAddress: wallet.address,
      fundsStatus: "pending",
    };
    await this.players.save(player);
    await this.games.addPlayer(game.id, player.id);
    this.hub.broadcast("player_joined", game.id, {
      player: toPublicPlayer(player),
    });
    return {
      playerId: player.id,
      unlinkAddress: player.unlinkAddress,
      deposit: {
        token: game.entryToken,
        amount: game.entryAmount,
        instructions: DEPOSIT_INSTRUCTIONS,
      },
    };
  }

  async startGame(gameId: string): Promise<Game> {
    return this.transitionToLive(gameId, { force: false });
  }

  async forceStartGame(gameId: string): Promise<Game> {
    return this.transitionToLive(gameId, { force: true });
  }

  private async transitionToLive(
    gameId: string,
    options: { force: boolean },
  ): Promise<Game> {
    const game = await this.requireGame(gameId);
    if (game.status !== "lobby") {
      throw new GameConflictError("Game is not in lobby");
    }
    const playerIds = await this.games.listPlayerIds(gameId);
    const players = await this.players.getMany(playerIds);
    const confirmed = players.filter(
      (player) => player.depositStatus === "confirmed",
    );
    this.assertStartable(players, confirmed, options.force);

    const startedAt = new Date();
    const endsAt = new Date(
      startedAt.getTime() + game.durationSec * MS_PER_SEC,
    );
    const liveGame: Game = {
      ...game,
      status: "live",
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
    await this.games.save(liveGame);
    await this.games.removeFromOpenIndex(gameId);
    await this.games.addToLiveIndex(gameId);
    this.hub.broadcast("game_started", gameId, {
      startedAt: liveGame.startedAt,
      endsAt: liveGame.endsAt,
      confirmedPlayers: confirmed.length,
    });
    await this.releaseFunds(liveGame, confirmed);
    // Startup sweep: catch any eligible player whose loop wasn't started during releaseFunds.
    await this.runner.start(gameId);
    return liveGame;
  }

  // Withdraws each confirmed player's entry from Unlink to their Privy wallet, marks the
  // player funds-released, and broadcasts funds_released. Per-player failures are isolated so
  // one stuck withdrawal never blocks the rest; only released players begin agent ticks.
  private async releaseFunds(game: Game, confirmed: Player[]): Promise<void> {
    await Promise.allSettled(confirmed.map((player) => this.releasePlayerFunds(game, player)));
  }

  private async releasePlayerFunds(game: Game, player: Player): Promise<void> {
    if (!player.privyWalletAddress) return;
    try {
      await this.unlink.withdrawToAddress({
        playerId: player.id,
        unlinkAddress: player.unlinkAddress,
        encMnemonic: player.encMnemonic,
        recipientEvmAddress: player.privyWalletAddress,
        token: game.entryToken,
        amount: game.entryAmount,
      });
      await this.players.save({ ...player, fundsStatus: "released" });
      this.hub.broadcast("funds_released", game.id, { playerId: player.id });
      // Start this player's continuous agent loop now that their funds are live.
      await this.runner.onFundsReleased(game.id, player.id);
    } catch (error) {
      logger.warn(
        { err: error, gameId: game.id, playerId: player.id },
        "[gameService] funds release failed",
      );
    }
  }

  private assertStartable(
    players: Player[],
    confirmed: Player[],
    force: boolean,
  ): void {
    if (players.length === 0) {
      throw new GameConflictError("Cannot start a game with no players");
    }
    if (force) {
      if (confirmed.length < MIN_FORCE_START_PLAYERS) {
        throw new GameConflictError(
          "Force start requires at least 2 confirmed players",
        );
      }
      return;
    }
    if (confirmed.length !== players.length) {
      throw new GameConflictError(
        "All players must confirm their deposit before starting",
      );
    }
  }

  private async requireGame(gameId: string): Promise<Game> {
    const game = await this.games.get(gameId);
    if (!game) throw new GameNotFoundError("Game not found");
    return game;
  }
}

export const gameService = new GameService();
