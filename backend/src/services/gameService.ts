import { randomUUID } from "node:crypto";

import { BigNumber } from "bignumber.js";

import { agentRunner, AgentRunner } from "../agent/agentRunner.js";
import { env } from "../env.js";
import type { Game, Player, PublicPlayer, Settlement, Trade } from "../domain/types.js";
import { isAgentReady, toOwnPlayer, toPublicPlayer } from "../domain/types.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { SettlementRepository } from "../repositories/settlementRepository.js";
import { TradeRepository } from "../repositories/tradeRepository.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";
import { type Holding, octavService, OctavService } from "./octavService.js";
import { privyService, PrivyService } from "./privyService.js";
import { unlinkService, UnlinkService, type AccountExportPayload } from "./unlinkService.js";

const DEFAULT_DURATION_SEC = 3600;
const DEFAULT_MAX_PLAYERS = 10;
const MIN_FORCE_START_PLAYERS = 2;
const MS_PER_SEC = 1000;

export interface CreateGameInput {
  name?: string;
  description?: string;
  entryAmount: string;
  durationSec?: number;
  maxPlayers?: number;
}

export interface JoinGameInput {
  gameId: string;
  displayName: string;
  strategyPrompt?: string;
  // The joining user's verified Privy id (DID) — links the player to their identity.
  ownerId?: string;
}

export interface ActivePlayer {
  game: Game;
  player: PublicPlayer;
}

export interface SetStrategyInput {
  gameId: string;
  playerId: string;
  strategyPrompt: string;
  // Authenticated caller (verified Privy id) — must own the player.
  ownerId: string;
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

// One leaderboard row (per user): wins + all-time signed PnL (base-unit USDC string).
export interface LeaderboardEntry {
  displayName: string;
  wins: number;
  pnlUsd: string;
  you: boolean;
}

export type GameListStatus = "open" | "live" | "all";

// A game in a list response, enriched with its current player count.
export interface GameListItem extends Game {
  playerCount: number;
}

export class GameConflictError extends Error {}
export class GameNotFoundError extends Error {}
export class ForbiddenError extends Error {}

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
    private readonly octav: OctavService = octavService,
  ) {}

  async createGame(input: CreateGameInput): Promise<Game> {
    const game: Game = {
      id: randomUUID(),
      status: "lobby",
      name: input.name,
      description: input.description,
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
      const [open, live, ended] = await Promise.all([
        this.games.listOpen(),
        this.games.listLive(),
        this.games.listEnded(),
      ]);
      return [...open, ...live, ...ended];
    }
    return this.games.listOpen();
  }

  async getGameWithPlayers(gameId: string): Promise<GameWithPlayers> {
    const game = await this.requireGame(gameId);
    const playerIds = await this.games.listPlayerIds(gameId);
    const players = await this.players.getMany(playerIds);
    return { game, players: players.map(toPublicPlayer) };
  }

  // The user's current game + player (recover a session by verified Privy id), or null.
  async getActiveForOwner(ownerId: string): Promise<ActivePlayer | null> {
    const ref = await this.players.getActiveForOwner(ownerId.toLowerCase());
    if (!ref) return null;
    const [game, player] = await Promise.all([this.games.get(ref.gameId), this.players.get(ref.playerId)]);
    if (!game || !player) return null;
    return { game, player: toOwnPlayer(player) };
  }

  async getPlayer(gameId: string, playerId: string): Promise<Player> {
    const player = await this.players.get(playerId);
    if (!player || player.gameId !== gameId) {
      throw new GameNotFoundError("Player not found in this game");
    }
    return player;
  }

  // Owner-only: queue a live instruction the player's agent reads on its next turn (then clears).
  async setInstruction(input: {
    gameId: string;
    playerId: string;
    ownerId: string;
    message: string;
  }): Promise<void> {
    const player = await this.getPlayer(input.gameId, input.playerId);
    this.assertOwner(player, input.ownerId);
    await this.players.save({ ...player, pendingInstruction: input.message });
    // Cut the agent's current wait short so it acts on the instruction within a second or two.
    this.runner.wake(input.playerId);
  }

  // Owner-only: the player's own Unlink account keys, so the FE can deposit the entry funds
  // into the BE-custodied vault from the user's wallet (1-tx deposit). Owner-checked.
  async exportUnlinkAccount(
    gameId: string,
    playerId: string,
    ownerId: string,
  ): Promise<AccountExportPayload> {
    const player = await this.getPlayer(gameId, playerId);
    this.assertOwner(player, ownerId);
    return this.unlink.exportAccount({
      unlinkAddress: player.unlinkAddress,
      encMnemonic: player.encMnemonic,
    });
  }

  // Owner-only: the player's live trading-wallet holdings from Octav /wallet, so the arena can
  // poll its own wallet panel every 30s (independent of the WS push). Empty before the wallet
  // exists; never throws on an Octav hiccup — returns an empty list so the panel just holds.
  async getPlayerWallet(
    gameId: string,
    playerId: string,
    ownerId: string,
  ): Promise<{ navUsd: string; holdings: Holding[] }> {
    const player = await this.getPlayer(gameId, playerId);
    this.assertOwner(player, ownerId);
    if (!player.privyWalletAddress) return { navUsd: "0", holdings: [] };
    try {
      const { navUsd, holdings } = await this.octav.getWallet(player.privyWalletAddress);
      return { navUsd, holdings };
    } catch (error) {
      logger.warn({ err: error, gameId, playerId }, "[gameService] octav wallet fetch failed");
      return { navUsd: "0", holdings: [] };
    }
  }

  // Strategy is editable only while the game is still in the lobby — once live, the prompt
  // is frozen so a player can't redirect their agent mid-competition. The caller must own
  // the player (verified Privy id).
  async setStrategy(input: SetStrategyInput): Promise<Player> {
    const game = await this.requireGame(input.gameId);
    if (game.status !== "lobby") {
      throw new GameConflictError(
        "Strategy can only be set while the game is in lobby",
      );
    }
    const player = await this.getPlayer(input.gameId, input.playerId);
    this.assertOwner(player, input.ownerId);
    const updated: Player = { ...player, strategyPrompt: input.strategyPrompt };
    await this.players.save(updated);
    // Setting a strategy is the final readiness step — auto-start if that fills the lobby.
    void this.maybeAutoStart(input.gameId);
    return updated;
  }

  // Auto-start once every slot is filled by a READY player (deposit confirmed + agent set up).
  // Fire-and-forget from setStrategy; never throws into the caller.
  private async maybeAutoStart(gameId: string): Promise<void> {
    try {
      const game = await this.games.get(gameId);
      if (!game || game.status !== "lobby") return;
      const playerIds = await this.games.listPlayerIds(gameId);
      const players = await this.players.getMany(playerIds);
      const ready = players.filter(isAgentReady);
      if (ready.length < game.maxPlayers) return;
      await this.transitionToLive(gameId, { force: false });
      logger.info({ gameId, ready: ready.length }, "[gameService] auto-started — lobby full + all ready");
    } catch (error) {
      logger.warn({ err: error, gameId }, "[gameService] auto-start check failed");
    }
  }

  private assertOwner(player: Player, ownerId: string): void {
    if (player.ownerId !== ownerId.toLowerCase()) {
      throw new ForbiddenError("You don't own this player");
    }
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

  // All-time leaderboard: one row per user (Privy id), aggregating wins + signed PnL across
  // every settled game, richest PnL first. `callerOwnerId` (if known) flags the caller's row.
  async getLeaderboard(callerOwnerId?: string): Promise<LeaderboardEntry[]> {
    const ended = await this.games.listEnded();
    const byOwner = new Map<string, { displayName: string; wins: number; pnl: BigNumber }>();
    for (const game of ended) {
      const settlement = await this.settlements.get(game.id);
      if (!settlement) continue;
      const players = await this.players.getMany(settlement.perPlayer.map((r) => r.playerId));
      const ownerById = new Map(players.map((p) => [p.id, p.ownerId]));
      for (const result of settlement.perPlayer) {
        const ownerId = ownerById.get(result.playerId);
        if (!ownerId) continue;
        const entry = byOwner.get(ownerId) ?? { displayName: result.displayName, wins: 0, pnl: new BigNumber(0) };
        entry.pnl = entry.pnl.plus(result.pnl || "0");
        if (settlement.winnerPlayerId === result.playerId) entry.wins += 1;
        entry.displayName = result.displayName;
        byOwner.set(ownerId, entry);
      }
    }
    const caller = callerOwnerId?.toLowerCase();
    const entries: LeaderboardEntry[] = [...byOwner.entries()].map(([ownerId, e]) => ({
      displayName: e.displayName,
      wins: e.wins,
      pnlUsd: e.pnl.toFixed(0),
      you: caller ? ownerId === caller : false,
    }));
    entries.sort((a, b) => new BigNumber(b.pnlUsd).comparedTo(a.pnlUsd) ?? 0);
    return entries;
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
    const ownerId = input.ownerId?.toLowerCase();
    const player: Player = {
      id: randomUUID(),
      gameId: game.id,
      displayName: input.displayName,
      unlinkAddress: gameAccount.unlinkAddress,
      encMnemonic: gameAccount.encMnemonic,
      depositStatus: "pending",
      createdAt: new Date().toISOString(),
      ownerId,
      strategyPrompt: input.strategyPrompt,
      privyWalletId: wallet.walletId,
      privyWalletAddress: wallet.address,
      fundsStatus: "pending",
    };
    await this.players.save(player);
    await this.games.addPlayer(game.id, player.id);
    if (ownerId) {
      await this.players.setActiveForOwner(ownerId, { gameId: game.id, playerId: player.id });
    }
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
