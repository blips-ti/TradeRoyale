import { decodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import type { Player, PlayerResult, Settlement } from '../domain/types.js';
import type { PlayerRepository } from '../repositories/playerRepository.js';
import type { SettlementRepository } from '../repositories/settlementRepository.js';
import type { PrivyService } from '../services/privyService.js';
import type { ViemReader } from '../services/viemClient.js';
import type { GameEventHub } from '../ws/gameEventHub.js';
import { SettlementService } from './settlementService.js';

const ENTRY_TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

// Deterministic, valid 20-byte hex address per id (encodeFunctionData rejects non-hex addresses).
const ADDRESSES: Record<string, string> = {
  winner: '0x1111111111111111111111111111111111111111',
  loser: '0x2222222222222222222222222222222222222222',
  ranked: '0x3333333333333333333333333333333333333333',
  richer: '0x4444444444444444444444444444444444444444',
  aaa: '0xaaaa000000000000000000000000000000000000',
  bbb: '0xbbbb000000000000000000000000000000000000',
  empty: '0x5555555555555555555555555555555555555555',
  solo: '0x6666666666666666666666666666666666666666',
  ok: '0x7777777777777777777777777777777777777777',
  bad: '0x8888888888888888888888888888888888888888',
  a: '0x9999999999999999999999999999999999999999',
};

function result(playerId: string, rank: number, finalUsdc: string): PlayerResult {
  return {
    rank,
    playerId,
    displayName: playerId,
    privyWalletAddress: ADDRESSES[playerId] ?? `0x${playerId.padEnd(40, '0')}`,
    startingBalance: '1000000',
    finalUsdc,
    octavNavUsd: '0',
    pnl: '0',
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
    privyWalletAddress: ADDRESSES[id],
    fundsStatus: 'released',
  };
}

interface Options {
  players: Player[];
  // USDC balance per lowercased wallet address (the authoritative on-chain read).
  balances: Record<string, string>;
  sendTransaction?: PrivyService['sendTransaction'];
}

function buildService(options: Options) {
  const saved: Settlement[] = [];
  const broadcasts: Array<{ type: string; data: Record<string, unknown> }> = [];
  const playersById = new Map(options.players.map((p) => [p.id, p]));
  const settlements = {
    save: vi.fn(async (settlement: Settlement) => void saved.push(settlement)),
    get: vi.fn(async () => null),
  } as unknown as SettlementRepository;
  const players = {
    get: vi.fn(async (id: string) => playersById.get(id) ?? null),
  } as unknown as PlayerRepository;
  const viem = {
    getErc20BalancesForOwners: vi.fn(async (_token: string, owners: string[]) =>
      Object.fromEntries(owners.map((owner) => [owner.toLowerCase(), options.balances[owner.toLowerCase()] ?? '0'])),
    ),
    waitForReceipt: vi.fn(async () => undefined),
  } as unknown as ViemReader;
  const send = options.sendTransaction ?? vi.fn(async () => '0xhash');
  const privy = { sendTransaction: send } as unknown as PrivyService;
  const hub = {
    broadcast: vi.fn((type: string, _id: string, data: Record<string, unknown>) => void broadcasts.push({ type, data })),
  } as unknown as GameEventHub;
  const service = new SettlementService(settlements, players, viem, privy, hub, ENTRY_TOKEN);
  return { service, settlements, players, viem, privy, hub, saved, broadcasts, send };
}

describe('SettlementService.buildSettlement', () => {
  it('sums finalUsdc into the prize pool and picks the rank-1 winner', async () => {
    const { service, saved } = buildService({ players: [], balances: {} });
    const settlement = await service.buildSettlement('g1', [result('p1', 1, '1500000'), result('p2', 2, '900000')]);
    expect(settlement.prizePoolUsdc).toBe('2400000');
    expect(settlement.winnerPlayerId).toBe('p1');
    expect(settlement.payoutStatus).toBe('pending');
    expect(saved).toHaveLength(1);
  });

  it('sets winnerPlayerId null when there are no results', async () => {
    const { service } = buildService({ players: [], balances: {} });
    const settlement = await service.buildSettlement('g1', []);
    expect(settlement.winnerPlayerId).toBeNull();
    expect(settlement.prizePoolUsdc).toBe('0');
  });
});

function settlementFor(players: Player[], prizePoolUsdc: string): Settlement {
  return {
    gameId: 'g1',
    winnerPlayerId: players[0]?.id ?? null,
    prizePoolUsdc,
    perPlayer: players.map((p, index) => result(p.id, index + 1, '0')),
    computedAt: new Date().toISOString(),
    payoutStatus: 'pending',
  };
}

describe('SettlementService.executePayout', () => {
  it('determines the winner from on-chain USDC (single multicall) and moves every loser balance to it', async () => {
    const winner = player('winner');
    const loser = player('loser');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '3000000',
      [loser.privyWalletAddress!.toLowerCase()]: '1200000',
    };
    const { service, viem, send } = buildService({ players: [winner, loser], balances });

    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));
    // ONE multicall across both owners (the single RPC that scores every trader's wallet).
    expect(viem.getErc20BalancesForOwners).toHaveBeenCalledTimes(1);
    expect((viem.getErc20BalancesForOwners as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(ENTRY_TOKEN);
    expect(payout.winnerPlayerId).toBe('winner');

    // Exactly one transfer: the loser's FULL balance into the winner, sponsored.
    expect((send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    const [walletId, request, sendOptions] = (send as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(walletId).toBe(loser.privyWalletId);
    expect(request.to).toBe(ENTRY_TOKEN);
    expect(request.value).toBe('0');
    expect(sendOptions).toEqual({ sponsor: true });
    const decoded = decodeFunctionData({ abi: erc20Abi, data: request.data as `0x${string}` });
    expect(decoded.functionName).toBe('transfer');
    expect((decoded.args[0] as string).toLowerCase()).toBe(winner.privyWalletAddress!.toLowerCase());
    expect((decoded.args[1] as bigint).toString()).toBe('1200000');

    expect(payout.transfers).toEqual([{ playerId: 'loser', amount: '1200000', txHash: '0xhash', ok: true }]);
  });

  it('overrides a stale rank: the wallet with the most USDC wins, not perPlayer[0]', async () => {
    const ranked = player('ranked');
    const richer = player('richer');
    const balances = {
      [ranked.privyWalletAddress!.toLowerCase()]: '1000000',
      [richer.privyWalletAddress!.toLowerCase()]: '5000000',
    };
    const { service, send } = buildService({ players: [ranked, richer], balances });
    const payout = await service.executePayout(settlementFor([ranked, richer], '6000000'));
    expect(payout.winnerPlayerId).toBe('richer');
    // The loser is 'ranked' (lower balance) — its full balance is sent to 'richer'.
    expect((send as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(ranked.privyWalletId);
  });

  it('tie-breaks deterministically on the lowest playerId when balances are equal', async () => {
    const a = player('aaa');
    const b = player('bbb');
    const balances = {
      [a.privyWalletAddress!.toLowerCase()]: '2000000',
      [b.privyWalletAddress!.toLowerCase()]: '2000000',
    };
    const { service, send } = buildService({ players: [b, a], balances });
    const payout = await service.executePayout(settlementFor([b, a], '4000000'));
    // Equal balances -> lowest playerId ('aaa') wins regardless of input order.
    expect(payout.winnerPlayerId).toBe('aaa');
    expect((send as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(b.privyWalletId);
  });

  it('skips zero-balance losers and the winner', async () => {
    const winner = player('winner');
    const empty = player('empty');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '3000000',
      [empty.privyWalletAddress!.toLowerCase()]: '0',
    };
    const { service, send } = buildService({ players: [winner, empty], balances });
    const payout = await service.executePayout(settlementFor([winner, empty], '3000000'));
    expect(send).not.toHaveBeenCalled();
    expect(payout.transfers).toEqual([]);
  });

  it('no-ops with a single player (winner is the only wallet)', async () => {
    const solo = player('solo');
    const balances = { [solo.privyWalletAddress!.toLowerCase()]: '5000000' };
    const { service, send, saved } = buildService({ players: [solo], balances });
    const payout = await service.executePayout(settlementFor([solo], '5000000'));
    expect(send).not.toHaveBeenCalled();
    expect(payout.winnerPlayerId).toBe('solo');
    expect(saved.at(-1)!.payoutStatus).toBe('executed');
  });

  it('isolates a per-loser failure: others still transfer and payoutStatus is partial', async () => {
    const winner = player('winner');
    const ok = player('ok');
    const bad = player('bad');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '9000000',
      [ok.privyWalletAddress!.toLowerCase()]: '1000000',
      [bad.privyWalletAddress!.toLowerCase()]: '2000000',
    };
    const send = vi.fn(async (walletId: string) => {
      if (walletId === bad.privyWalletId) throw new Error('privy boom');
      return '0xok';
    }) as unknown as PrivyService['sendTransaction'];
    const { service, saved } = buildService({ players: [winner, ok, bad], balances, sendTransaction: send });

    const payout = await service.executePayout(settlementFor([winner, ok, bad], '12000000'));
    expect((send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    const okTransfer = payout.transfers.find((t) => t.playerId === 'ok');
    const badTransfer = payout.transfers.find((t) => t.playerId === 'bad');
    expect(okTransfer).toEqual({ playerId: 'ok', amount: '1000000', txHash: '0xok', ok: true });
    expect(badTransfer).toEqual({ playerId: 'bad', amount: '2000000', ok: false });
    expect(saved.at(-1)!.payoutStatus).toBe('partial');
  });

  it('marks payoutStatus failed when every transfer throws', async () => {
    const winner = player('winner');
    const a = player('a');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '5000000',
      [a.privyWalletAddress!.toLowerCase()]: '1000000',
    };
    const send = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as PrivyService['sendTransaction'];
    const { service, saved } = buildService({ players: [winner, a], balances, sendTransaction: send });
    await service.executePayout(settlementFor([winner, a], '6000000'));
    expect(saved.at(-1)!.payoutStatus).toBe('failed');
  });

  it('broadcasts prize_paid with the winner and transfer audit trail', async () => {
    const winner = player('winner');
    const loser = player('loser');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '3000000',
      [loser.privyWalletAddress!.toLowerCase()]: '1200000',
    };
    const { service, broadcasts } = buildService({ players: [winner, loser], balances });
    await service.executePayout(settlementFor([winner, loser], '4200000'));
    const event = broadcasts.find((b) => b.type === 'prize_paid');
    expect(event).toBeDefined();
    expect(event!.data.winnerPlayerId).toBe('winner');
    expect(event!.data.winnerAddress).toBe(winner.privyWalletAddress);
    expect(event!.data.prizePoolUsdc).toBe('4200000');
    expect((event!.data.transfers as unknown[])).toHaveLength(1);
  });

  it('persists the per-transfer payouts audit on the settlement record', async () => {
    const winner = player('winner');
    const loser = player('loser');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '3000000',
      [loser.privyWalletAddress!.toLowerCase()]: '1200000',
    };
    const { service, saved } = buildService({ players: [winner, loser], balances });
    await service.executePayout(settlementFor([winner, loser], '4200000'));
    expect(saved.at(-1)!.payouts).toEqual([{ playerId: 'loser', amount: '1200000', txHash: '0xhash', ok: true }]);
    expect(saved.at(-1)!.winnerPlayerId).toBe('winner');
  });
});
