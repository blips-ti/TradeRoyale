import { env } from "../env.js";
import type { Game, Player } from "../domain/types.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { clampWaitSeconds } from "./tools.js";
import { tradingAgent, TradingAgent } from "./tradingAgent.js";

const MS_PER_SEC = 1000;
const FAILURE_BACKOFF_MS = 2_000;
const MAX_CONSECUTIVE_FAILURES = 5;

interface RunningLoop {
  controller: AbortController;
  done: Promise<void>;
}

// Continuous, per-player, autonomous agent loops. Each eligible player runs ONE independent
// async loop (keyed `${gameId}:${playerId}`, tracked per game so a game can abort all of its
// loops) that trades the FULL game window until the buzzer. The agent paces itself via the
// `wait` tool; there is no shared timer and no stop-before-end threshold.
export class AgentRunner {
  private readonly loops = new Map<string, Map<string, RunningLoop>>();
  // playerId -> resolver that ends the current inter-turn wait early, so a live instruction
  // triggers a near-immediate tick instead of waiting out the full pause.
  private readonly wakes = new Map<string, () => void>();

  // Cut a player's current wait short so their agent acts on a fresh instruction right away.
  // No-op if the player isn't currently waiting (the instruction is read on the next tick anyway).
  wake(playerId: string): void {
    this.wakes.get(playerId)?.();
  }

  constructor(
    private readonly games: GameRepository = new GameRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly agent: TradingAgent = tradingAgent,
    private readonly minLoopIntervalMs: number = env.MIN_LOOP_INTERVAL_MS,
    private readonly defaultWaitSeconds: number = env.DEFAULT_WAIT_SECONDS,
    private readonly maxTurns: number = env.AGENT_MAX_TURNS_PER_GAME,
  ) {}

  // Startup sweep at game start: launch a loop for every already-eligible player. Idempotent —
  // a player whose loop is already running is skipped (so this is safe to call repeatedly).
  async start(gameId: string): Promise<void> {
    const game = await this.games.get(gameId);
    if (!game || game.status !== "live") return;
    const players = await this.eligiblePlayers(game);
    const gameOwnedAddresses = await this.collectGameOwnedAddresses(game);
    for (const player of players) this.startPlayerLoop(game, player, gameOwnedAddresses);
  }

  // Called when a player's funds are released (the funds_released path) to begin their loop
  // immediately, without waiting for a sweep. No-ops if the player isn't eligible yet.
  async onFundsReleased(gameId: string, playerId: string): Promise<void> {
    const game = await this.games.get(gameId);
    if (!game || game.status !== "live") return;
    const player = await this.players.get(playerId);
    if (!player || !this.isEligible(player)) return;
    const gameOwnedAddresses = await this.collectGameOwnedAddresses(game);
    this.startPlayerLoop(game, player, gameOwnedAddresses);
  }

  // Abort all loops for a game and AWAIT their teardown — callers (game-end transition) must
  // await this BEFORE settlement liquidation so no trade can race the liquidation.
  async stopGame(gameId: string): Promise<void> {
    const gameLoops = this.loops.get(gameId);
    if (!gameLoops) return;
    for (const loop of gameLoops.values()) loop.controller.abort();
    await Promise.allSettled([...gameLoops.values()].map((loop) => loop.done));
    this.loops.delete(gameId);
    logger.info({ gameId }, "[agentRunner] all loops stopped");
  }

  // Abort + await every loop across all games (app shutdown).
  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.loops.keys()].map((gameId) => this.stopGame(gameId)));
  }

  private startPlayerLoop(game: Game, player: Player, gameOwnedAddresses: string[]): void {
    const key = player.id;
    const gameLoops = this.loops.get(game.id) ?? new Map<string, RunningLoop>();
    if (gameLoops.has(key)) return;
    const controller = new AbortController();
    const done = this.runPlayerLoop(game, player, gameOwnedAddresses, controller.signal).finally(() => {
      this.loops.get(game.id)?.delete(key);
    });
    gameLoops.set(key, { controller, done });
    this.loops.set(game.id, gameLoops);
    logger.info({ gameId: game.id, playerId: player.id }, "[agentLoop] player loop started");
  }

  // One player's continuous loop. Crash-safe: a thrown turn is caught, logged, and the loop
  // backs off then continues; consecutive failures are capped so a permanently-broken player
  // stops without affecting anyone else. Loops while not aborted AND the game is still live.
  private async runPlayerLoop(
    game: Game,
    player: Player,
    gameOwnedAddresses: string[],
    signal: AbortSignal,
  ): Promise<void> {
    let consecutiveFailures = 0;
    let turns = 0;
    while (!signal.aborted && (await this.isGameLive(game.id)) && this.secondsRemaining(game) > 0) {
      if (this.maxTurns > 0 && turns >= this.maxTurns) {
        logger.info({ gameId: game.id, playerId: player.id, turns }, "[agentLoop] max turns reached");
        return;
      }
      let waitSeconds = this.defaultWaitSeconds;
      try {
        const fresh = (await this.players.get(player.id)) ?? player;
        const result = await this.agent.runTick(game, fresh, gameOwnedAddresses, signal);
        // Clear any live instruction — runTick injected it into this turn; it must not repeat.
        await this.players.save({
          ...fresh,
          lastAgentSummary: result.summary,
          touchedTokens: result.touchedTokens,
          pendingInstruction: undefined,
        });
        waitSeconds = result.requestedWaitSeconds ?? this.defaultWaitSeconds;
        consecutiveFailures = 0;
        turns += 1;
      } catch (error) {
        if (signal.aborted) return;
        consecutiveFailures += 1;
        logger.warn(
          { err: error, gameId: game.id, playerId: player.id, consecutiveFailures },
          "[agentLoop] turn failed",
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.error({ gameId: game.id, playerId: player.id }, "[agentLoop] player loop aborted: repeated failures");
          return;
        }
        await this.sleep(FAILURE_BACKOFF_MS, signal);
        continue;
      }
      const floorSeconds = this.minLoopIntervalMs / MS_PER_SEC;
      const clamped = clampWaitSeconds(waitSeconds, floorSeconds, this.secondsRemaining(game));
      if (clamped <= 0) return;
      await this.interruptibleSleep(player.id, clamped * MS_PER_SEC, signal);
    }
  }

  // Like sleep(), but also resolves early when wake(playerId) is called (a new instruction).
  private interruptibleSleep(playerId: string, ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        this.wakes.delete(playerId);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      this.wakes.set(playerId, done);
    });
  }

  // Abortable sleep — resolves early (not rejects) when the signal aborts, so the loop exits
  // its condition check cleanly. Used for both inter-turn waits and failure backoff.
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async isGameLive(gameId: string): Promise<boolean> {
    const game = await this.games.get(gameId);
    return game?.status === "live";
  }

  private async eligiblePlayers(game: Game): Promise<Player[]> {
    const playerIds = await this.games.listPlayerIds(game.id);
    const players = await this.players.getMany(playerIds);
    return players.filter((player) => this.isEligible(player));
  }

  private isEligible(player: Player): boolean {
    return (
      player.depositStatus === "confirmed" &&
      player.fundsStatus === "released" &&
      Boolean(player.privyWalletId) &&
      Boolean(player.strategyPrompt?.trim())
    );
  }

  // Wallet-isolation denyset: every game-owned address (Privy + Unlink) across all players; an
  // agent's protocol calls may never target one of these.
  private async collectGameOwnedAddresses(game: Game): Promise<string[]> {
    const playerIds = await this.games.listPlayerIds(game.id);
    const players = await this.players.getMany(playerIds);
    const addresses = new Set<string>();
    for (const player of players) {
      if (player.privyWalletAddress) addresses.add(player.privyWalletAddress.toLowerCase());
      if (player.unlinkAddress) addresses.add(player.unlinkAddress.toLowerCase());
    }
    return [...addresses];
  }

  private secondsRemaining(game: Game): number {
    if (!game.endsAt) return 0;
    return Math.max(0, Math.ceil((new Date(game.endsAt).getTime() - Date.now()) / MS_PER_SEC));
  }
}

export const agentRunner = new AgentRunner();
