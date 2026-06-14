import { decodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import type { Player, PlayerResult, Settlement } from '../domain/types.js';
import type { PlayerRepository } from '../repositories/playerRepository.js';
import type { SettlementRepository } from '../repositories/settlementRepository.js';
import type { PrivyService } from '../services/privyService.js';
import type { UnlinkService } from '../services/unlinkService.js';
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

// The winner's depositor wallet is resolved from ownerId via Privy; every player carries one so
// the happy-path shield can route the pot out. The depositor address is distinct per player.
const DEPOSITORS: Record<string, string> = {
  winner: '0xdddd000000000000000000000000000000000001',
  richer: '0xdddd000000000000000000000000000000000002',
  aaa: '0xdddd000000000000000000000000000000000003',
  solo: '0xdddd000000000000000000000000000000000004',
};

function player(id: string): Player {
  return {
    id,
    gameId: 'g1',
    displayName: id,
    unlinkAddress: `unlink-${id}`,
    encMnemonic: 'enc',
    depositStatus: 'confirmed',
    createdAt: new Date().toISOString(),
    ownerId: `did:privy:${id}`,
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
  // Overrides for the winner-shield collaborators; each defaults to a working happy path.
  deposit?: UnlinkService['depositFromPrivyWallet'];
  withdraw?: UnlinkService['withdrawToAddress'];
  // Shielded-balance reader the credit poll calls; defaults to crediting the full pot immediately.
  getTokenBalance?: UnlinkService['getTokenBalance'];
  resolveDepositorAddress?: PrivyService['resolveDepositorAddress'];
  // Selects the payout path: true → legacy Privy→Unlink→depositor shield; false (default) → direct
  // Privy→depositor transfer. Defaults true here so the legacy Unlink suites keep exercising it.
  useUnlinkShield?: boolean;
}

// Short timing so the credit poll loop in tests resolves immediately instead of waiting real seconds.
const CREDIT_TIMEOUT_MS = 50;
const CREDIT_POLL_MS = 1;

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
    // The post-consolidation pot read: the winner now holds their own balance + every loser's.
    getErc20Balance: vi.fn(async (_token: string, owner: string) => options.balances[owner.toLowerCase()] ?? '0'),
    waitForReceipt: vi.fn(async () => undefined),
  } as unknown as ViemReader;
  const send = options.sendTransaction ?? vi.fn(async () => '0xhash');
  const resolveDepositorAddress =
    options.resolveDepositorAddress ?? vi.fn(async (ownerId: string) => DEPOSITORS[ownerId.replace('did:privy:', '')] ?? null);
  const privy = { sendTransaction: send, resolveDepositorAddress } as unknown as PrivyService;
  const deposit = options.deposit ?? vi.fn(async () => undefined);
  const withdraw = options.withdraw ?? vi.fn(async () => undefined);
  // Default credit: the shielded balance immediately equals the winner's consolidated pot (the
  // deposited amount), so the poll passes on the first read. Looks up by playerId -> pot balance.
  const getTokenBalance =
    options.getTokenBalance ??
    vi.fn(async (context: { playerId: string }) => {
      const address = playersById.get(context.playerId)?.privyWalletAddress ?? '';
      return options.balances[address.toLowerCase()] ?? '0';
    });
  const unlink = {
    depositFromPrivyWallet: deposit,
    withdrawToAddress: withdraw,
    getTokenBalance,
  } as unknown as UnlinkService;
  const hub = {
    broadcast: vi.fn((type: string, _id: string, data: Record<string, unknown>) => void broadcasts.push({ type, data })),
  } as unknown as GameEventHub;
  const service = new SettlementService(
    settlements,
    players,
    viem,
    privy,
    hub,
    unlink,
    ENTRY_TOKEN,
    CREDIT_TIMEOUT_MS,
    CREDIT_POLL_MS,
    options.useUnlinkShield ?? true,
  );
  return {
    service,
    settlements,
    players,
    viem,
    privy,
    hub,
    unlink,
    saved,
    broadcasts,
    send,
    deposit,
    withdraw,
    getTokenBalance,
    resolveDepositorAddress,
  };
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

describe('SettlementService.executePayout winner shield', () => {
  // After consolidation, the consolidated pot must leave the public Privy wallet: deposited into
  // Unlink, then withdrawn to the winner's OWN funding wallet. This is the privacy guarantee.
  function shieldSetup() {
    const winner = player('winner');
    const loser = player('loser');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '3000000',
      [loser.privyWalletAddress!.toLowerCase()]: '1200000',
    };
    return { winner, loser, balances };
  }

  it('deposits the on-chain pot into Unlink then withdraws it to the resolved depositor wallet', async () => {
    const { winner, loser, balances } = shieldSetup();
    const { service, deposit, withdraw, resolveDepositorAddress, saved } = buildService({
      players: [winner, loser],
      balances,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect((resolveDepositorAddress as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(winner.ownerId);
    const depositArgs = (deposit as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(depositArgs).toMatchObject({
      unlinkAddress: winner.unlinkAddress,
      privyWalletId: winner.privyWalletId,
      privyWalletAddress: winner.privyWalletAddress,
      token: ENTRY_TOKEN,
      amount: '3000000',
    });
    const withdrawArgs = (withdraw as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(withdrawArgs).toMatchObject({
      recipientEvmAddress: DEPOSITORS.winner,
      token: ENTRY_TOKEN,
      amount: '3000000',
    });
    expect(payout.shield).toEqual({
      winnerPlayerId: 'winner',
      amount: '3000000',
      phase: 'withdrawn',
      finalDestination: DEPOSITORS.winner,
    });
    expect(saved.at(-1)!.shield!.phase).toBe('withdrawn');
  });

  it('broadcasts prize_settled progress (deposited then withdrawn) ending at the final destination', async () => {
    const { winner, loser, balances } = shieldSetup();
    const { service, broadcasts } = buildService({ players: [winner, loser], balances });
    await service.executePayout(settlementFor([winner, loser], '4200000'));
    const settled = broadcasts.filter((b) => b.type === 'prize_settled');
    expect(settled.map((b) => b.data.phase)).toEqual(['deposited', 'withdrawn']);
    const terminal = settled.at(-1)!;
    expect(terminal.data.winnerPlayerId).toBe('winner');
    expect(terminal.data.finalDestination).toBe(DEPOSITORS.winner);
    expect(terminal.data.amount).toBe('3000000');
  });

  it('records deposit_failed and never attempts withdrawal when the Unlink deposit throws', async () => {
    const { winner, loser, balances } = shieldSetup();
    const deposit = vi.fn(async () => {
      throw new Error('unlink deposit boom');
    }) as unknown as UnlinkService['depositFromPrivyWallet'];
    const { service, withdraw, saved } = buildService({ players: [winner, loser], balances, deposit });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(withdraw).not.toHaveBeenCalled();
    expect(payout.shield!.phase).toBe('deposit_failed');
    expect(payout.shield!.error).toContain('unlink deposit boom');
    expect(saved.at(-1)!.shield!.phase).toBe('deposit_failed');
  });

  it('records withdraw_failed when the deposit succeeds but the withdrawal throws', async () => {
    const { winner, loser, balances } = shieldSetup();
    const withdraw = vi.fn(async () => {
      throw new Error('unlink withdraw boom');
    }) as unknown as UnlinkService['withdrawToAddress'];
    const { service, deposit, saved } = buildService({ players: [winner, loser], balances, withdraw });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(deposit).toHaveBeenCalledTimes(1);
    expect(payout.shield!.phase).toBe('withdraw_failed');
    expect(payout.shield!.finalDestination).toBe(DEPOSITORS.winner);
    expect(saved.at(-1)!.shield!.phase).toBe('withdraw_failed');
  });

  it('waits for the async shielded credit (balance 0 for N polls) then withdraws once credited', async () => {
    const { winner, loser, balances } = shieldSetup();
    // Unlink credits the shielded note asynchronously: the first two reads see 0, the third the pot.
    let reads = 0;
    const getTokenBalance = vi.fn(async () => {
      reads += 1;
      return reads < 3 ? '0' : '3000000';
    }) as unknown as UnlinkService['getTokenBalance'];
    const { service, withdraw, deposit, saved, broadcasts } = buildService({
      players: [winner, loser],
      balances,
      getTokenBalance,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(deposit).toHaveBeenCalledTimes(1);
    expect((getTokenBalance as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(payout.shield!.phase).toBe('withdrawn');
    expect(payout.shield!.finalDestination).toBe(DEPOSITORS.winner);
    // 'deposited' is recorded once (when credited), then 'withdrawn' — no duplicate deposit broadcast.
    const settled = broadcasts.filter((b) => b.type === 'prize_settled');
    expect(settled.map((b) => b.data.phase)).toEqual(['deposited', 'withdrawn']);
    expect(saved.at(-1)!.shield!.phase).toBe('withdrawn');
  });

  it('records deposit_uncredited and never withdraws when the shielded credit never lands', async () => {
    const { winner, loser, balances } = shieldSetup();
    // The deposit confirms on-chain but the shielded note is never credited -> the poll times out.
    const getTokenBalance = vi.fn(async () => '0') as unknown as UnlinkService['getTokenBalance'];
    const { service, withdraw, deposit, saved } = buildService({
      players: [winner, loser],
      balances,
      getTokenBalance,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(deposit).toHaveBeenCalledTimes(1);
    expect(withdraw).not.toHaveBeenCalled();
    expect(payout.shield!.phase).toBe('deposit_uncredited');
    expect(payout.shield!.error).toBe('shield deposit not credited in time (have 0, need 3000000)');
    expect(saved.at(-1)!.shield!.phase).toBe('deposit_uncredited');
  });

  it('records no_destination and skips the withdrawal when no depositor wallet resolves', async () => {
    const { winner, loser, balances } = shieldSetup();
    const resolveDepositorAddress = vi.fn(async () => null) as unknown as PrivyService['resolveDepositorAddress'];
    const { service, deposit, withdraw, saved } = buildService({
      players: [winner, loser],
      balances,
      resolveDepositorAddress,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(deposit).toHaveBeenCalledTimes(1);
    expect(withdraw).not.toHaveBeenCalled();
    expect(payout.shield!.phase).toBe('no_destination');
    expect(payout.shield!.finalDestination).toBeUndefined();
    expect(saved.at(-1)!.shield!.phase).toBe('no_destination');
  });

  it('skips the shield (phase consolidated) when the winner pot reads as zero on-chain', async () => {
    const winner = player('winner');
    const balances = { [winner.privyWalletAddress!.toLowerCase()]: '0' };
    const { service, deposit, withdraw } = buildService({ players: [winner], balances });
    const payout = await service.executePayout(settlementFor([winner], '0'));
    expect(deposit).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();
    expect(payout.shield!.phase).toBe('consolidated');
  });

  it('still records the prize_paid consolidation even when the shield deposit fails', async () => {
    const { winner, loser, balances } = shieldSetup();
    const deposit = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as UnlinkService['depositFromPrivyWallet'];
    const { service, broadcasts, saved } = buildService({ players: [winner, loser], balances, deposit });
    await service.executePayout(settlementFor([winner, loser], '4200000'));
    // Consolidation is independent of the shield: the loser->winner transfer audit survives.
    expect(broadcasts.find((b) => b.type === 'prize_paid')).toBeDefined();
    expect(saved.at(-1)!.payouts).toEqual([{ playerId: 'loser', amount: '1200000', txHash: '0xhash', ok: true }]);
  });
});

describe('SettlementService.executePayout direct payout (SETTLE_USE_UNLINK_SHIELD=false)', () => {
  // The direct path pays the winner's consolidated pot straight from the Privy wallet to their
  // resolved depositor wallet in ONE sponsored transfer — no Unlink deposit/withdraw, no decrypt.
  function directSetup() {
    const winner = player('winner');
    const loser = player('loser');
    const balances = {
      [winner.privyWalletAddress!.toLowerCase()]: '3000000',
      [loser.privyWalletAddress!.toLowerCase()]: '1200000',
    };
    return { winner, loser, balances };
  }

  // Mirrors the production send mock but lets us assert per-call by walletId. The first call is the
  // loser->winner consolidation; the second is the direct winner->depositor payout.
  function findWinnerPayoutCall(send: PrivyService['sendTransaction'], winnerWalletId: string) {
    return (send as ReturnType<typeof vi.fn>).mock.calls.find((call) => call[0] === winnerWalletId);
  }

  it('sends the full pot directly to the resolved depositor (withdrawn + txHash), no Unlink deposit', async () => {
    const { winner, loser, balances } = directSetup();
    const send = vi.fn(async () => '0xpayouthash') as unknown as PrivyService['sendTransaction'];
    const { service, deposit, withdraw, resolveDepositorAddress, saved } = buildService({
      players: [winner, loser],
      balances,
      sendTransaction: send,
      useUnlinkShield: false,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    // No Unlink hop touched on the direct path.
    expect(deposit).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();

    expect((resolveDepositorAddress as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(winner.ownerId);
    const winnerCall = findWinnerPayoutCall(send, winner.privyWalletId!);
    expect(winnerCall).toBeDefined();
    const [, request, sendOptions] = winnerCall!;
    expect(request.to).toBe(ENTRY_TOKEN);
    expect(request.value).toBe('0');
    expect(sendOptions).toEqual({ sponsor: true });
    const decoded = decodeFunctionData({ abi: erc20Abi, data: request.data as `0x${string}` });
    expect(decoded.functionName).toBe('transfer');
    expect((decoded.args[0] as string).toLowerCase()).toBe(DEPOSITORS.winner!.toLowerCase());
    expect((decoded.args[1] as bigint).toString()).toBe('3000000');

    expect(payout.shield).toEqual({
      winnerPlayerId: 'winner',
      amount: '3000000',
      phase: 'withdrawn',
      finalDestination: DEPOSITORS.winner,
      txHash: '0xpayouthash',
    });
    expect(saved.at(-1)!.shield!.phase).toBe('withdrawn');
    expect(saved.at(-1)!.shield!.txHash).toBe('0xpayouthash');
  });

  it('broadcasts a single prize_settled for the withdrawn phase', async () => {
    const { winner, loser, balances } = directSetup();
    const { service, broadcasts } = buildService({
      players: [winner, loser],
      balances,
      useUnlinkShield: false,
    });
    await service.executePayout(settlementFor([winner, loser], '4200000'));
    const settled = broadcasts.filter((b) => b.type === 'prize_settled');
    expect(settled.map((b) => b.data.phase)).toEqual(['withdrawn']);
    expect(settled.at(-1)!.data.finalDestination).toBe(DEPOSITORS.winner);
    expect(settled.at(-1)!.data.amount).toBe('3000000');
  });

  it('records no_destination and never sends a payout when no depositor wallet resolves', async () => {
    const { winner, loser, balances } = directSetup();
    const resolveDepositorAddress = vi.fn(async () => null) as unknown as PrivyService['resolveDepositorAddress'];
    const send = vi.fn(async () => '0xhash') as unknown as PrivyService['sendTransaction'];
    const { service, deposit, saved } = buildService({
      players: [winner, loser],
      balances,
      sendTransaction: send,
      resolveDepositorAddress,
      useUnlinkShield: false,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(deposit).not.toHaveBeenCalled();
    // Only the loser->winner consolidation send happened; no winner->depositor payout.
    expect(findWinnerPayoutCall(send, winner.privyWalletId!)).toBeUndefined();
    expect(payout.shield!.phase).toBe('no_destination');
    expect(payout.shield!.finalDestination).toBeUndefined();
    expect(payout.shield!.txHash).toBeUndefined();
    expect(saved.at(-1)!.shield!.phase).toBe('no_destination');
  });

  it('records withdraw_failed when the direct payout transfer throws', async () => {
    const { winner, loser, balances } = directSetup();
    const send = vi.fn(async (walletId: string) => {
      if (walletId === winner.privyWalletId) throw new Error('privy payout boom');
      return '0xhash';
    }) as unknown as PrivyService['sendTransaction'];
    const { service, deposit, saved } = buildService({
      players: [winner, loser],
      balances,
      sendTransaction: send,
      useUnlinkShield: false,
    });
    const payout = await service.executePayout(settlementFor([winner, loser], '4200000'));

    expect(deposit).not.toHaveBeenCalled();
    expect(payout.shield!.phase).toBe('withdraw_failed');
    expect(payout.shield!.finalDestination).toBe(DEPOSITORS.winner);
    expect(payout.shield!.error).toContain('privy payout boom');
    expect(payout.shield!.txHash).toBeUndefined();
    expect(saved.at(-1)!.shield!.phase).toBe('withdraw_failed');
  });

  it('skips the direct payout (phase consolidated) when the winner pot reads as zero on-chain', async () => {
    const winner = player('winner');
    const balances = { [winner.privyWalletAddress!.toLowerCase()]: '0' };
    const send = vi.fn(async () => '0xhash') as unknown as PrivyService['sendTransaction'];
    const { service, deposit } = buildService({
      players: [winner],
      balances,
      sendTransaction: send,
      useUnlinkShield: false,
    });
    const payout = await service.executePayout(settlementFor([winner], '0'));
    expect(deposit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(payout.shield!.phase).toBe('consolidated');
  });
});
