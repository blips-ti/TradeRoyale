import { describe, expect, it, vi } from 'vitest';

import type { Game, Player } from '../domain/types.js';
import type { GameRepository } from '../repositories/gameRepository.js';
import type { PlayerRepository } from '../repositories/playerRepository.js';
import type { UnlinkService } from '../services/unlinkService.js';
import type { GameEventHub } from '../ws/gameEventHub.js';
import { DepositWatcher } from './depositWatcher.js';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const game: Game = {
  id: 'g1',
  status: 'lobby',
  entryToken: USDC,
  entryAmount: '1000000',
  durationSec: 3600,
  maxPlayers: 10,
  createdAt: new Date().toISOString(),
};

const player: Player = {
  id: 'p1',
  gameId: 'g1',
  displayName: 'alice',
  unlinkAddress: 'unlink1',
  encMnemonic: 'enc',
  depositStatus: 'pending',
  createdAt: new Date().toISOString(),
};

describe('DepositWatcher', () => {
  it('confirms a deposit with startingBalance equal to the entry amount, not the raw balance', async () => {
    const saved: Player[] = [];
    const games = {
      listOpen: vi.fn(async () => [game]),
      listPlayerIds: vi.fn(async () => [player.id]),
    } as unknown as GameRepository;
    const players = {
      getMany: vi.fn(async () => [player]),
      save: vi.fn(async (p: Player) => void saved.push(p)),
    } as unknown as PlayerRepository;
    // Wallet over-deposited (2 USDC) but only entryAmount (1 USDC) is put in play.
    const unlink = { getTokenBalance: vi.fn(async () => '2000000') } as unknown as UnlinkService;
    const broadcasts: Array<{ data: Record<string, unknown> }> = [];
    const hub = {
      broadcast: vi.fn((_type: string, _id: string, data: Record<string, unknown>) => void broadcasts.push({ data })),
    } as unknown as GameEventHub;

    await new DepositWatcher(games, players, unlink, hub).runIteration();

    expect(saved).toHaveLength(1);
    expect(saved[0]!.depositStatus).toBe('confirmed');
    expect(saved[0]!.startingBalance).toBe('1000000');
    expect(broadcasts[0]!.data.startingBalance).toBe('1000000');
  });

  it('does not confirm when the balance is below the entry amount', async () => {
    const games = {
      listOpen: vi.fn(async () => [game]),
      listPlayerIds: vi.fn(async () => [player.id]),
    } as unknown as GameRepository;
    const save = vi.fn(async () => undefined);
    const players = { getMany: vi.fn(async () => [player]), save } as unknown as PlayerRepository;
    const unlink = { getTokenBalance: vi.fn(async () => '999999') } as unknown as UnlinkService;
    const hub = { broadcast: vi.fn() } as unknown as GameEventHub;

    await new DepositWatcher(games, players, unlink, hub).runIteration();
    expect(save).not.toHaveBeenCalled();
  });
});
