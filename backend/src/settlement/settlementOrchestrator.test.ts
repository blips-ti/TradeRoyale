import { describe, expect, it, vi } from 'vitest';

import type { Game, Player, PlayerResult, Settlement } from '../domain/types.js';
import type { GameRepository } from '../repositories/gameRepository.js';
import type { PlayerRepository } from '../repositories/playerRepository.js';
import type { SettlementRepository } from '../repositories/settlementRepository.js';
import type { LifiService } from '../services/lifiService.js';
import type { OctavService } from '../services/octavService.js';
import type { TradeExecutor } from '../services/tradeExecutor.js';
import type { ViemReader } from '../services/viemClient.js';
import type { GameEventHub } from '../ws/gameEventHub.js';
import { SettlementOrchestrator } from './settlementOrchestrator.js';
import type { SettlementService } from './settlementService.js';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const DUST = '0xdddddddddddddddddddddddddddddddddddddddd';
const MIN_USDC = '1000000'; // 1 USDC dust floor

const game: Game = {
  id: 'g1',
  status: 'settling',
  entryToken: USDC,
  entryAmount: '1000000',
  durationSec: 3600,
  maxPlayers: 10,
  createdAt: new Date().toISOString(),
  endsAt: new Date().toISOString(),
};

function player(id: string, touched: string[]): Player {
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
    startingBalance: '1000000',
    touchedTokens: touched,
  };
}

interface Deps {
  games: GameRepository;
  players: PlayerRepository;
  executor: TradeExecutor;
  viem: ViemReader;
  lifi: LifiService;
  octav: OctavService;
  settlements: SettlementService;
  hub: GameEventHub;
  settlementRepo: SettlementRepository;
  // In-memory Redis stand-in: the last settlement the orchestrator persisted, for diagnostics asserts.
  saved: { current: Settlement | null };
  broadcasts: Array<{ type: string; data: Record<string, unknown> }>;
}

function buildDeps(options: {
  players: Player[];
  finalUsdc: Record<string, string>;
  tokenBalances: Record<string, string>;
}): Deps {
  const broadcasts: Array<{ type: string; data: Record<string, unknown> }> = [];
  const games = { listPlayerIds: vi.fn(async () => options.players.map((p) => p.id)) } as unknown as GameRepository;
  const players = {
    getMany: vi.fn(async () => options.players),
    save: vi.fn(async () => undefined),
  } as unknown as PlayerRepository;
  const executor = {
    executeSwap: vi.fn(async (_wallet: unknown, input: { fromToken: string; fromAmount: string }) => ({
      txHash: '0xliq',
      status: 'confirmed',
      fromToken: input.fromToken,
      toToken: USDC,
      fromAmount: input.fromAmount,
      toAmountMin: '1990000',
      tool: 'test-dex',
    })),
  } as unknown as TradeExecutor;
  const viem = {
    // Per-token liquidation reads stay per-call; final USDC scoring is ONE multicall across owners.
    getErc20Balance: vi.fn(async (token: string, _owner: string) => options.tokenBalances[token.toLowerCase()] ?? '0'),
    getErc20BalancesForOwners: vi.fn(async (_token: string, owners: string[]) =>
      Object.fromEntries(owners.map((owner) => [owner.toLowerCase(), options.finalUsdc[owner] ?? '0'])),
    ),
    getNativeBalance: vi.fn(async () => '0'),
  } as unknown as ViemReader;
  const lifi = {
    getTokenMeta: vi.fn(async () => ({
      [WETH]: { priceUSD: '2000', decimals: 18 },
      [DUST]: { priceUSD: '0.0001', decimals: 18 },
    })),
  } as unknown as LifiService;
  // End-of-game scoring reads each wallet's Octav /wallet USD value. The test's finalUsdc map is in
  // USDC base units, so the mock returns it back as human USD (÷1e6) for the orchestrator to rescale.
  const octav = {
    getWallet: vi.fn(async (address: string) => ({
      navUsd: (Number(options.finalUsdc[address] ?? '0') / 1e6).toString(),
      holdings: [],
      raw: {},
    })),
  } as unknown as OctavService;
  const settlements = {
    buildSettlement: vi.fn(async (gameId: string, results: PlayerResult[]): Promise<Settlement> => ({
      gameId,
      winnerPlayerId: results.find((r) => r.rank === 1)?.playerId ?? null,
      prizePoolUsdc: '0',
      perPlayer: results,
      computedAt: new Date().toISOString(),
      payoutStatus: 'pending',
    })),
    executePayout: vi.fn(async () => ({ winnerPlayerId: null, winnerAddress: null, prizePoolUsdc: '0', transfers: [] })),
  } as unknown as SettlementService;
  const hub = {
    broadcast: vi.fn((type: string, _id: string, data: Record<string, unknown>) => void broadcasts.push({ type, data })),
  } as unknown as GameEventHub;
  const saved: { current: Settlement | null } = { current: null };
  const settlementRepo = {
    save: vi.fn(async (settlement: Settlement) => void (saved.current = settlement)),
    get: vi.fn(async () => saved.current),
  } as unknown as SettlementRepository;
  return { games, players, executor, viem, lifi, octav, settlements, hub, settlementRepo, saved, broadcasts };
}

function build(deps: Deps): SettlementOrchestrator {
  return new SettlementOrchestrator(
    deps.games,
    deps.players,
    deps.executor,
    deps.viem,
    deps.lifi,
    deps.octav,
    deps.settlements,
    deps.hub,
    deps.settlementRepo,
    USDC,
    MIN_USDC,
    0, // settleDelayMs — no real wait in tests
    async () => undefined, // sleep — no-op
  );
}

describe('SettlementOrchestrator.settle', () => {
  it('liquidates non-dust tokens, skips dust, and skips the entry token', async () => {
    const p = player('p1', [USDC, WETH, DUST]);
    const deps = buildDeps({
      players: [p],
      finalUsdc: { [p.privyWalletAddress!]: '3000000' },
      // 1 WETH (non-dust at $2000) and a tiny DUST balance worth far under 1 USDC.
      tokenBalances: { [WETH]: '1000000000000000000', [DUST]: '1' },
    });
    await build(deps).settle(game);
    // Only WETH liquidated: USDC is the entry token (skipped), DUST is below the floor.
    expect(deps.executor.executeSwap).toHaveBeenCalledTimes(1);
    expect((deps.executor.executeSwap as ReturnType<typeof vi.fn>).mock.calls[0]![1].fromToken).toBe(WETH);
  });

  it('broadcasts player_liquidated and ranks players by Octav-wallet value with pnl', async () => {
    const p1 = player('p1', [USDC]);
    const p2 = player('p2', [USDC]);
    const deps = buildDeps({
      players: [p1, p2],
      finalUsdc: { [p1.privyWalletAddress!]: '1500000', [p2.privyWalletAddress!]: '900000' },
      tokenBalances: {},
    });
    const results = await build(deps).settle(game);
    expect(deps.broadcasts.filter((b) => b.type === 'player_liquidated')).toHaveLength(2);
    // p1 ($1.50 wallet) ranks above p2 ($0.90); pnl = finalUsdc - startingBalance(1000000).
    expect(results.map((r) => r.playerId)).toEqual(['p1', 'p2']);
    expect(results[0]!.rank).toBe(1);
    expect(results[0]!.pnl).toBe('500000');
    expect(results[1]!.pnl).toBe('-100000');
    expect(results[0]!.octavNavUsd).toBe('1.5');
  });

  it('isolates a per-player failure so others still settle', async () => {
    const ok = player('ok', [USDC]);
    const bad = player('bad', [USDC, WETH]);
    const deps = buildDeps({
      players: [ok, bad],
      finalUsdc: { [ok.privyWalletAddress!]: '1000000', [bad.privyWalletAddress!]: '2000000' },
      tokenBalances: { [WETH]: '1000000000000000000' },
    });
    // The bad player's liquidation swap throws; settle() must still produce the ok player.
    deps.executor.executeSwap = vi.fn(async () => {
      throw new Error('swap failed');
    }) as unknown as TradeExecutor['executeSwap'];
    const results = await build(deps).settle(game);
    // 'bad' liquidation failed but scoring still ran (its result is present); 'ok' unaffected.
    expect(results.map((r) => r.playerId).sort()).toEqual(['bad', 'ok']);
  });

  it('scores every wallet via Octav /wallet and runs the payout', async () => {
    const p1 = player('p1', [USDC]);
    const p2 = player('p2', [USDC]);
    const deps = buildDeps({
      players: [p1, p2],
      finalUsdc: { [p1.privyWalletAddress!]: '1500000', [p2.privyWalletAddress!]: '900000' },
      tokenBalances: {},
    });
    await build(deps).settle(game);
    // Each player is scored from their own Octav /wallet read (one call per player).
    expect(deps.octav.getWallet).toHaveBeenCalledTimes(2);
    const scoredAddrs = (deps.octav.getWallet as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]).sort();
    expect(scoredAddrs).toEqual([p1.privyWalletAddress, p2.privyWalletAddress].sort());
    // The payout (winner-take-all USDC consolidation) still runs.
    expect(deps.settlements.executePayout).toHaveBeenCalledTimes(1);
  });

  it('persists per-token liquidation diagnostics (liquidated / skipped_zero / skipped_dust)', async () => {
    const ZERO = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const p = player('p1', [USDC, WETH, DUST, ZERO]);
    const deps = buildDeps({
      players: [p],
      finalUsdc: { [p.privyWalletAddress!]: '3000000' },
      // WETH non-dust, DUST below floor, ZERO has no balance, USDC is the entry token (excluded).
      tokenBalances: { [WETH]: '1000000000000000000', [DUST]: '1', [ZERO]: '0' },
    });
    await build(deps).settle(game);
    expect(deps.settlementRepo.save).toHaveBeenCalled();
    const liquidations = deps.saved.current?.diagnostics?.liquidations ?? [];
    const byToken = Object.fromEntries(liquidations.map((l) => [l.token, l]));
    expect(byToken[WETH]).toMatchObject({ playerId: 'p1', status: 'liquidated', balance: '1000000000000000000', fromAmount: '1000000000000000000', toAmountMin: '1990000' });
    expect(byToken[DUST]).toMatchObject({ status: 'skipped_dust', balance: '1' });
    expect(byToken[ZERO]).toMatchObject({ status: 'skipped_zero', balance: '0' });
    // The entry token is never a liquidation candidate, so it must not appear in diagnostics.
    expect(byToken[USDC]).toBeUndefined();
  });

  it('captures a swap rejection MESSAGE as a failed TokenLiquidation, not just a boolean', async () => {
    const p = player('p1', [USDC, WETH]);
    const deps = buildDeps({
      players: [p],
      finalUsdc: { [p.privyWalletAddress!]: '1000000' },
      tokenBalances: { [WETH]: '1000000000000000000' },
    });
    deps.executor.executeSwap = vi.fn(async () => {
      throw new Error('LI.FI no route');
    }) as unknown as TradeExecutor['executeSwap'];
    await build(deps).settle(game);
    const failed = (deps.saved.current?.diagnostics?.liquidations ?? []).find((l) => l.token === WETH);
    expect(failed).toMatchObject({ playerId: 'p1', token: WETH, status: 'failed', error: 'LI.FI no route' });
  });

  it('persists settleError and rethrows when settlement crashes mid-run', async () => {
    const p = player('p1', [USDC]);
    const deps = buildDeps({
      players: [p],
      finalUsdc: { [p.privyWalletAddress!]: '1000000' },
      tokenBalances: {},
    });
    // buildSettlement throws AFTER liquidation/scoring; settle must persist the error and rethrow.
    deps.settlements.buildSettlement = vi.fn(async () => {
      throw new Error('boom in buildSettlement');
    }) as unknown as SettlementService['buildSettlement'];
    await expect(build(deps).settle(game)).rejects.toThrow('boom in buildSettlement');
    expect(deps.saved.current?.diagnostics?.settleError).toContain('boom in buildSettlement');
    expect(deps.saved.current?.gameId).toBe('g1');
  });
});
