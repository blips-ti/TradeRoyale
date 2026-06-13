import { BigNumber } from "bignumber.js";

import type { PlayerResult, Settlement } from "../domain/types.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { SettlementRepository } from "../repositories/settlementRepository.js";
import { unlinkService, UnlinkService } from "../services/unlinkService.js";
import {
  noopSettlementValidator,
  type SettlementValidator,
} from "./settlementValidator.js";

export interface PayoutResult {
  executed: boolean;
  reason: string;
}

// Builds the settlement record from ranked results and gates payout behind the validator. The
// default NoopSettlementValidator never approves, so executePayout never moves funds in v1.
export class SettlementService {
  constructor(
    private readonly settlements: SettlementRepository = new SettlementRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly unlink: UnlinkService = unlinkService,
    private readonly validator: SettlementValidator = noopSettlementValidator,
  ) {}

  // Computes the prize pool (sum of finalUsdc) + winner (rank 1), persists the record with
  // payout/validation pending. winnerPlayerId is null when there are no results.
  async buildSettlement(gameId: string, results: PlayerResult[]): Promise<Settlement> {
    const prizePoolUsdc = results
      .reduce((sum, result) => sum.plus(result.finalUsdc), new BigNumber(0))
      .toFixed(0);
    const winner = results.find((result) => result.rank === 1) ?? null;
    const settlement: Settlement = {
      gameId,
      winnerPlayerId: winner?.playerId ?? null,
      prizePoolUsdc,
      perPlayer: results,
      computedAt: new Date().toISOString(),
      validationStatus: "pending",
      payoutStatus: "pending",
    };
    await this.settlements.save(settlement);
    return settlement;
  }

  // Internal/admin-only winner-take-all payout. GATED on validator.approved — with the noop
  // validator it returns early and moves NO funds. There is deliberately no public route to
  // this. When a CRE validator approves: deposit each player's finalUsdc from their Privy wallet
  // back into Unlink, then privately transfer the pooled prize to the winner's Unlink account.
  async executePayout(settlement: Settlement): Promise<PayoutResult> {
    const validation = await this.validator.validate(settlement);
    if (!validation.approved) {
      logger.info({ gameId: settlement.gameId, reason: validation.reason }, "[settlement] payout not approved");
      return { executed: false, reason: validation.reason };
    }
    try {
      await this.depositAllBack(settlement);
      await this.transferPrizeToWinner(settlement);
      await this.settlements.save({ ...settlement, validationStatus: "approved", payoutStatus: "executed" });
      return { executed: true, reason: "payout executed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ gameId: settlement.gameId, err: message }, "[settlement] payout failed");
      await this.settlements.save({ ...settlement, validationStatus: "approved", payoutStatus: "failed" });
      return { executed: false, reason: message };
    }
  }

  private async depositAllBack(settlement: Settlement): Promise<void> {
    for (const result of settlement.perPlayer) {
      const player = await this.players.get(result.playerId);
      if (!player?.privyWalletId || !player.privyWalletAddress) continue;
      if (new BigNumber(result.finalUsdc).lte(0)) continue;
      await this.unlink.depositFromPrivyWallet({
        unlinkAddress: player.unlinkAddress,
        encMnemonic: player.encMnemonic,
        privyWalletId: player.privyWalletId,
        privyWalletAddress: player.privyWalletAddress,
        token: env.ENTRY_TOKEN_ADDRESS,
        amount: result.finalUsdc,
      });
    }
  }

  private async transferPrizeToWinner(settlement: Settlement): Promise<void> {
    if (!settlement.winnerPlayerId) return;
    const winner = await this.players.get(settlement.winnerPlayerId);
    if (!winner) throw new Error("Winner player not found");
    logger.info(
      { gameId: settlement.gameId, winner: winner.id, prize: settlement.prizePoolUsdc },
      "[settlement] prize transfer (winner-take-all) — Unlink private transfer",
    );
    // The pooled prize is transferred to the winner's Unlink account; the per-player deposits
    // above land the funds in Unlink first. Wired through unlinkService.transfer at enable-time.
  }
}

export const settlementService = new SettlementService();
