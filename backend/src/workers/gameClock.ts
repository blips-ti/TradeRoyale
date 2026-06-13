import { agentRunner, AgentRunner } from '../agent/agentRunner.js';
import type { Game, PlayerResult } from '../domain/types.js';
import { logger } from '../logger.js';
import { GameRepository } from '../repositories/gameRepository.js';
import { settlementOrchestrator, SettlementOrchestrator } from '../settlement/settlementOrchestrator.js';
import { gameEventHub, GameEventHub } from '../ws/gameEventHub.js';

const CLOCK_INTERVAL_MS = 5_000;
const TICK_CADENCE_MS = 30_000;
const MS_PER_SEC = 1000;

// Ticks live games on a 30s cadence; at the deadline it settles them server-side (live ->
// settling -> ended): liquidate to USDC, on-chain finalUsdc + Octav NAV, rank, settlement record.
export class GameClock {
  private timer: NodeJS.Timeout | undefined;
  private readonly lastTickAt = new Map<string, number>();

  constructor(
    private readonly games: GameRepository = new GameRepository(),
    private readonly hub: GameEventHub = gameEventHub,
    private readonly intervalMs: number = CLOCK_INTERVAL_MS,
    private readonly runner: AgentRunner = agentRunner,
    private readonly orchestrator: SettlementOrchestrator = settlementOrchestrator,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runIteration(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, '[gameClock] started');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runIteration(): Promise<void> {
    try {
      const games = await this.games.listLive();
      await Promise.allSettled(games.map((game) => this.tickGame(game)));
    } catch (error) {
      logger.error({ err: error }, '[gameClock] iteration failed');
    }
  }

  private async tickGame(game: Game): Promise<void> {
    if (game.status !== 'live' || !game.endsAt) return;
    const now = Date.now();
    const endsAtMs = new Date(game.endsAt).getTime();
    if (now >= endsAtMs) {
      await this.endGame(game);
      return;
    }
    this.maybeTick(game, now, endsAtMs);
  }

  private maybeTick(game: Game, now: number, endsAtMs: number): void {
    const last = this.lastTickAt.get(game.id) ?? 0;
    if (now - last < TICK_CADENCE_MS) return;
    this.lastTickAt.set(game.id, now);
    const secondsRemaining = Math.max(0, Math.ceil((endsAtMs - now) / MS_PER_SEC));
    this.hub.broadcast('game_tick', game.id, { secondsRemaining });
  }

  // Deadline reached: ABORT and AWAIT all agent loops first (no trade may race the liquidation),
  // move the game to 'settling', run server-side settlement (liquidate -> finalUsdc -> NAV ->
  // rank), then mark 'ended' and broadcast the ranked results.
  private async endGame(game: Game): Promise<void> {
    this.lastTickAt.delete(game.id);
    await this.games.save({ ...game, status: 'settling' });
    // Loops read game.status each iteration; saving 'settling' + aborting stops them promptly.
    await this.runner.stopGame(game.id);
    let results: PlayerResult[];
    try {
      results = await this.orchestrator.settle(game);
    } catch (error) {
      logger.error({ err: error, gameId: game.id }, '[gameClock] settlement failed');
      results = [];
    }
    await this.games.save({ ...game, status: 'ended' });
    await this.games.removeFromLiveIndex(game.id);
    await this.games.addToEndedIndex(game.id);
    this.hub.broadcast('game_ended', game.id, { results });
    logger.info({ gameId: game.id, players: results.length }, '[gameClock] game ended');
  }
}

export const gameClock = new GameClock();
