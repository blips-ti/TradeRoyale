import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game, Player } from '../domain/types.js';
import type { GameRepository } from '../repositories/gameRepository.js';
import type { PlayerRepository } from '../repositories/playerRepository.js';
import { AgentRunner } from './agentRunner.js';
import type { AgentTickResult, TradingAgent } from './tradingAgent.js';

const MIN_LOOP_INTERVAL_MS = 10_000;
const DEFAULT_WAIT_SECONDS = 30;

function game(endsInSec: number): Game {
  return {
    id: 'g1',
    status: 'live',
    entryToken: '0xusdc',
    entryAmount: '1000000',
    durationSec: 3600,
    maxPlayers: 10,
    createdAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + endsInSec * 1000).toISOString(),
  };
}

function player(id: string): Player {
  return {
    id,
    gameId: 'g1',
    displayName: id,
    unlinkAddress: `unlink-${id}`,
    encMnemonic: 'enc',
    depositStatus: 'confirmed',
    createdAt: new Date().toISOString(),
    privyWalletId: `wallet-${id}`,
    privyWalletAddress: `0xwallet${id}`,
    fundsStatus: 'released',
    strategyPrompt: 'trade',
  };
}

function buildDeps(options: { game: Game; players: Player[]; runTick: TradingAgent['runTick'] }) {
  const games = {
    get: vi.fn(async () => options.game),
    listPlayerIds: vi.fn(async () => options.players.map((p) => p.id)),
  } as unknown as GameRepository;
  const saved: Player[] = [];
  const players = {
    get: vi.fn(async (id: string) => options.players.find((p) => p.id === id) ?? null),
    getMany: vi.fn(async () => options.players),
    save: vi.fn(async (p: Player) => void saved.push(p)),
  } as unknown as PlayerRepository;
  const agent = { runTick: vi.fn(options.runTick) } as unknown as TradingAgent;
  return { games, players, agent, saved };
}

function tickResult(playerId: string, requestedWaitSeconds?: number): AgentTickResult {
  return { playerId, summary: 'did a thing', touchedTokens: ['0xusdc'], requestedWaitSeconds };
}

describe('AgentRunner continuous loops', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs turns until the deadline, then stops on its own', async () => {
    const g = game(70); // ~70s left: with a 30s default wait + 10s floor, expect ~2-3 turns.
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1') });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    // Drive the loop: each turn is followed by a 30s wait. Advance well past the deadline.
    await vi.advanceTimersByTimeAsync(120_000);

    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    // After the deadline the loop has exited; no further turns accrue.
    const after = (deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(after);
    await runner.stopGame('g1');
  });

  it('clamps a below-floor wait to MIN_LOOP_INTERVAL_MS between turns', async () => {
    const g = game(3600);
    // Agent always asks to wait 0s; the floor (10s) must apply between turns.
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1', 0) });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(0); // let the first turn run
    const afterFirst = (deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(afterFirst).toBe(1);
    // 9s < floor: no second turn yet.
    await vi.advanceTimersByTimeAsync(9_000);
    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    // Crossing the 10s floor triggers the next turn.
    await vi.advanceTimersByTimeAsync(2_000);
    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    await runner.stopGame('g1');
  });

  it('abort (stopGame) stops the loop promptly', async () => {
    const g = game(3600);
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1', 60) });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(0);
    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    // During the 60s wait, abort: the loop must tear down and not run another turn.
    await runner.stopGame('g1');
    await vi.advanceTimersByTimeAsync(120_000);
    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('stops one player after repeated failures without affecting another', async () => {
    const g = game(3600);
    const runTick = vi.fn(async (_game: Game, p: Player) => {
      if (p.id === 'bad') throw new Error('boom');
      return tickResult(p.id, 30);
    });
    const deps = buildDeps({ game: g, players: [player('good'), player('bad')], runTick });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    // Drive enough time for 'bad' to hit its 5-failure cap (2s backoff each) and 'good' to keep going.
    await vi.advanceTimersByTimeAsync(120_000);

    const badTurns = runTick.mock.calls.filter((c) => c[1].id === 'bad').length;
    const goodTurns = runTick.mock.calls.filter((c) => c[1].id === 'good').length;
    // 'bad' stopped at the failure cap (5); 'good' kept trading.
    expect(badTurns).toBe(5);
    expect(goodTurns).toBeGreaterThan(1);
    await runner.stopGame('g1');
  });

  it('honors AGENT_MAX_TURNS_PER_GAME hard cap', async () => {
    const g = game(3600);
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1', 0) });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 3);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(600_000);
    expect((deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    await runner.stopGame('g1');
  });
});
