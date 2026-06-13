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

describe('AgentRunner instruction-driven loops', () => {
  const calls = (deps: ReturnType<typeof buildDeps>) =>
    (deps.agent.runTick as ReturnType<typeof vi.fn>).mock.calls.length;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs one turn on its strategy at start, then idles (no autonomous looping)', async () => {
    const g = game(3600);
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1') });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(0); // initial strategy turn
    expect(calls(deps)).toBe(1);
    // No self-driven turns — stays at one turn no matter how much time passes.
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls(deps)).toBe(1);
    await runner.stopGame('g1');
  });

  it('acts again only when the player sends an instruction (wake)', async () => {
    const g = game(3600);
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1') });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls(deps)).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls(deps)).toBe(1); // still idle
    // A live instruction wakes the agent for exactly one more turn.
    runner.wake('p1');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls(deps)).toBe(2);
    await runner.stopGame('g1');
  });

  it('abort (stopGame) stops the idle loop promptly', async () => {
    const g = game(3600);
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1') });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls(deps)).toBe(1);
    await runner.stopGame('g1');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls(deps)).toBe(1);
  });

  it('isolates a failing player from a healthy one', async () => {
    const g = game(3600);
    const runTick = vi.fn(async (_game: Game, p: Player) => {
      if (p.id === 'bad') throw new Error('boom');
      return tickResult(p.id);
    });
    const deps = buildDeps({ game: g, players: [player('good'), player('bad')], runTick });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 0);

    await runner.start('g1');
    // 'bad' retries its initial turn and hits the 5-failure cap (2s backoff each).
    await vi.advanceTimersByTimeAsync(120_000);

    const badTurns = runTick.mock.calls.filter((c) => c[1].id === 'bad').length;
    const goodTurns = runTick.mock.calls.filter((c) => c[1].id === 'good').length;
    expect(badTurns).toBe(5); // stopped at the failure cap
    expect(goodTurns).toBe(1); // ran its one strategy turn, then idled — unaffected by 'bad'
    await runner.stopGame('g1');
  });

  it('honors AGENT_MAX_TURNS_PER_GAME hard cap', async () => {
    const g = game(3600);
    const deps = buildDeps({ game: g, players: [player('p1')], runTick: async () => tickResult('p1') });
    const runner = new AgentRunner(deps.games, deps.players, deps.agent, MIN_LOOP_INTERVAL_MS, DEFAULT_WAIT_SECONDS, 3);

    await runner.start('g1');
    await vi.advanceTimersByTimeAsync(0); // initial turn
    // Drive many instructions; the agent must stop at the 3-turn cap.
    for (let i = 0; i < 6; i++) {
      runner.wake('p1');
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(calls(deps)).toBe(3);
    await runner.stopGame('g1');
  });
});
