import { describe, expect, it, vi } from 'vitest';

import type { PlayerResult, Settlement } from '../domain/types.js';
import type { PlayerRepository } from '../repositories/playerRepository.js';
import type { SettlementRepository } from '../repositories/settlementRepository.js';
import type { UnlinkService } from '../services/unlinkService.js';
import { SettlementService } from './settlementService.js';
import { NoopSettlementValidator, type SettlementValidator } from './settlementValidator.js';

function result(playerId: string, rank: number, finalUsdc: string): PlayerResult {
  return {
    rank,
    playerId,
    displayName: playerId,
    privyWalletAddress: `0x${playerId}`,
    startingBalance: '1000000',
    finalUsdc,
    octavNavUsd: '0',
    pnl: '0',
  };
}

function buildService(validator: SettlementValidator) {
  const saved: Settlement[] = [];
  const settlements = {
    save: vi.fn(async (settlement: Settlement) => void saved.push(settlement)),
    get: vi.fn(async () => null),
  } as unknown as SettlementRepository;
  const players = { get: vi.fn(async () => null) } as unknown as PlayerRepository;
  const unlink = { depositFromPrivyWallet: vi.fn(async () => undefined) } as unknown as UnlinkService;
  const service = new SettlementService(settlements, players, unlink, validator);
  return { service, settlements, players, unlink, saved };
}

describe('SettlementService.buildSettlement', () => {
  it('sums finalUsdc into the prize pool and picks the rank-1 winner', async () => {
    const { service, saved } = buildService(new NoopSettlementValidator());
    const settlement = await service.buildSettlement('g1', [result('p1', 1, '1500000'), result('p2', 2, '900000')]);
    expect(settlement.prizePoolUsdc).toBe('2400000');
    expect(settlement.winnerPlayerId).toBe('p1');
    expect(settlement.validationStatus).toBe('pending');
    expect(settlement.payoutStatus).toBe('pending');
    expect(saved).toHaveLength(1);
  });
});

describe('SettlementService.executePayout', () => {
  it('does NOT move funds when the (noop) validator is not approved', async () => {
    const { service, unlink, settlements } = buildService(new NoopSettlementValidator());
    const settlement = await service.buildSettlement('g1', [result('p1', 1, '1500000')]);
    (settlements.save as ReturnType<typeof vi.fn>).mockClear();

    const payout = await service.executePayout(settlement);
    expect(payout.executed).toBe(false);
    expect(payout.reason).toMatch(/CRE validation pending/);
    expect(unlink.depositFromPrivyWallet).not.toHaveBeenCalled();
    // No state change persisted while unapproved.
    expect(settlements.save).not.toHaveBeenCalled();
  });

  it('runs the payout path when a validator approves (no funds moved without players)', async () => {
    const approving: SettlementValidator = { validate: async () => ({ approved: true, reason: 'ok' }) };
    const { service, settlements } = buildService(approving);
    const settlement = await service.buildSettlement('g1', []);
    (settlements.save as ReturnType<typeof vi.fn>).mockClear();

    const payout = await service.executePayout(settlement);
    expect(payout.executed).toBe(true);
    // Settlement persisted as executed.
    const lastSave = (settlements.save as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Settlement;
    expect(lastSave.payoutStatus).toBe('executed');
  });
});
