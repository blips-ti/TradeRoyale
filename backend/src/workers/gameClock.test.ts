import { describe, expect, it, vi } from 'vitest';

import type { AgentRunner } from '../agent/agentRunner.js';
import type { Game } from '../domain/types.js';
import type { GameRepository } from '../repositories/gameRepository.js';
import type { SettlementOrchestrator } from '../settlement/settlementOrchestrator.js';
import type { GameEventHub } from '../ws/gameEventHub.js';
import { GameClock } from './gameClock.js';

function endedGame(): Game {
  return {
    id: 'g1',
    status: 'live',
    entryToken: '0xusdc',
    entryAmount: '1000000',
    durationSec: 3600,
    maxPlayers: 10,
    createdAt: new Date().toISOString(),
    // Already past the deadline so the next clock iteration ends the game.
    endsAt: new Date(Date.now() - 1000).toISOString(),
  };
}

describe('GameClock settlement ordering', () => {
  it('aborts + awaits agent loops BEFORE settlement liquidation runs', async () => {
    const order: string[] = [];
    const game = endedGame();
    const games = {
      listLive: vi.fn(async () => [game]),
      save: vi.fn(async () => undefined),
      removeFromLiveIndex: vi.fn(async () => undefined),
    } as unknown as GameRepository;
    const runner = {
      stopGame: vi.fn(async () => {
        order.push('stopGame');
      }),
    } as unknown as AgentRunner;
    const orchestrator = {
      settle: vi.fn(async () => {
        order.push('settle');
        return [];
      }),
    } as unknown as SettlementOrchestrator;
    const hub = { broadcast: vi.fn() } as unknown as GameEventHub;

    const clock = new GameClock(games, hub, 5_000, runner, orchestrator);
    await clock.runIteration();

    // The loops are torn down before liquidation so no trade can race it.
    expect(order).toEqual(['stopGame', 'settle']);
    expect(runner.stopGame).toHaveBeenCalledWith('g1');
  });
});
