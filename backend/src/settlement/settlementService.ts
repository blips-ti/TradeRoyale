import { BigNumber } from "bignumber.js";
import { encodeFunctionData, erc20Abi } from "viem";

import type {
  PayoutStatus,
  PayoutTransfer,
  Player,
  PlayerResult,
  Settlement,
  ShieldPhase,
  ShieldResult,
} from "../domain/types.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { SettlementRepository } from "../repositories/settlementRepository.js";
import { privyService, PrivyService } from "../services/privyService.js";
import { unlinkService, UnlinkService } from "../services/unlinkService.js";
import { viemReader, ViemReader } from "../services/viemClient.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";

type Address = `0x${string}`;

export interface PayoutResult {
  winnerPlayerId: string | null;
  winnerAddress: string | null;
  prizePoolUsdc: string;
  transfers: PayoutTransfer[];
  shield?: ShieldResult;
}

// Builds the ranked settlement record, then runs the winner-take-all payout: read every
// player's on-chain USDC in ONE multicall, pick the richest wallet as winner, and consolidate
// all losers' USDC into it via sponsored Privy transfers. Funds land publicly in the winner.
export class SettlementService {
  constructor(
    private readonly settlements: SettlementRepository = new SettlementRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly viem: ViemReader = viemReader,
    private readonly privy: PrivyService = privyService,
    private readonly hub: GameEventHub = gameEventHub,
    private readonly unlink: UnlinkService = unlinkService,
    private readonly entryToken: string = env.ENTRY_TOKEN_ADDRESS,
    private readonly creditTimeoutMs: number = env.SHIELD_CREDIT_TIMEOUT_MS,
    private readonly creditPollMs: number = env.SHIELD_CREDIT_POLL_MS,
    private readonly useUnlinkShield: boolean = env.SETTLE_USE_UNLINK_SHIELD,
  ) {}

  // Computes the prize pool (sum of finalUsdc) + winner (rank 1), persists the record with
  // payout pending. winnerPlayerId is null when there are no results.
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
      payoutStatus: "pending",
    };
    await this.settlements.save(settlement);
    return settlement;
  }

  // Winner-take-all USDC consolidation, then the shielded route-out. Re-reads every player's USDC
  // in ONE multicall (the authoritative winner determination — not the rank), transfers each
  // loser's FULL USDC into the winner's Privy wallet, then routes the consolidated pot
  // Privy → Unlink → the winner's own funding wallet. Crash-safe per loser and per shield phase.
  async executePayout(settlement: Settlement): Promise<PayoutResult> {
    const players = await this.loadPlayers(settlement);
    const addresses = players.map((player) => player.privyWalletAddress!).filter((address) => !!address);
    const balances = await this.viem.getErc20BalancesForOwners(this.entryToken, addresses);
    const winner = this.pickWinner(players, balances);
    if (!winner?.privyWalletAddress) return this.noWinner(settlement);
    logger.info(
      { gameId: settlement.gameId, winnerPlayerId: winner.id, winnerAddress: winner.privyWalletAddress, prizePoolUsdc: settlement.prizePoolUsdc },
      "[settlement] winner determined",
    );

    const losers = players.filter((player) => player.id !== winner.id);
    const transfers = await this.transferAll(settlement.gameId, losers, winner.id, winner.privyWalletAddress, balances);
    const payoutStatus = this.deriveStatus(transfers);

    this.hub.broadcast("prize_paid", settlement.gameId, {
      winnerPlayerId: winner.id,
      winnerAddress: winner.privyWalletAddress,
      prizePoolUsdc: settlement.prizePoolUsdc,
      transfers,
    });

    // Consolidation already succeeded — the shield must never undo or block it. Its outcome is
    // recorded on the same settlement record and is surfaced as a separate event.
    const shield = await this.shieldWinnerPot(settlement.gameId, winner);
    await this.settlements.save({
      ...settlement,
      winnerPlayerId: winner.id,
      payoutStatus,
      payouts: transfers,
      shield,
    });

    return {
      winnerPlayerId: winner.id,
      winnerAddress: winner.privyWalletAddress,
      prizePoolUsdc: settlement.prizePoolUsdc,
      transfers,
      shield,
    };
  }

  // Pays the winner's consolidated pot out of the public Privy wallet. SETTLE_USE_UNLINK_SHIELD
  // (default false) selects the path: false → a direct sponsored Privy → depositor USDC transfer
  // (no Unlink/decrypt); true → the legacy Privy → Unlink → depositor privacy shield. Never throws.
  private async shieldWinnerPot(gameId: string, winner: Player): Promise<ShieldResult> {
    if (!this.useUnlinkShield) return this.directPayout(gameId, winner);
    return this.unlinkShieldWinnerPot(gameId, winner);
  }

  // Direct payout: read the winner's on-chain pot, resolve their original depositor wallet, and
  // send the FULL balance there in ONE sponsored Privy transfer. No Unlink, no mnemonic decrypt,
  // no Permit2. Records the terminal phase + tx hash on the same ShieldResult machinery.
  private async directPayout(gameId: string, winner: Player): Promise<ShieldResult> {
    if (!winner.privyWalletId) {
      logger.warn({ gameId, winnerPlayerId: winner.id }, "[settlement] winner has no Privy wallet; payout skipped");
      return this.recordShield(gameId, winner, { amount: "0", phase: "consolidated" });
    }
    const amount = await this.viem.getErc20Balance(this.entryToken, winner.privyWalletAddress!);
    logger.info({ gameId, winnerPlayerId: winner.id, amount }, "[settlement] direct payout pot read");
    if (new BigNumber(amount).lte(0)) {
      return this.recordShield(gameId, winner, { amount, phase: "consolidated" });
    }
    const destination = winner.ownerId ? await this.privy.resolveDepositorAddress(winner.ownerId) : null;
    if (!destination) {
      logger.warn({ gameId, winnerPlayerId: winner.id, ownerId: winner.ownerId ?? null }, "[settlement] no depositor wallet resolved; pot stays in the Privy wallet");
      return this.recordShield(gameId, winner, { amount, phase: "no_destination" });
    }
    return this.sendDirectPayout(gameId, winner, amount, destination);
  }

  // Sends the full pot to the resolved depositor via a sponsored erc20 transfer, then waits for the
  // receipt. Crash-safe: a failure records withdraw_failed (funds safe in the Privy wallet).
  private async sendDirectPayout(gameId: string, winner: Player, amount: string, destination: string): Promise<ShieldResult> {
    logger.info({ gameId, winnerPlayerId: winner.id, amount, finalDestination: destination }, "[settlement] direct payout attempt");
    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        // viem needs a JS bigint here — convert at this single call site from the base-unit string.
        args: [destination as Address, BigInt(new BigNumber(amount).toFixed(0))],
      });
      const hash = await this.privy.sendTransaction(winner.privyWalletId!, { to: this.entryToken, data, value: "0" }, { sponsor: true });
      await this.viem.waitForReceipt(hash);
      logger.info({ gameId, winnerPlayerId: winner.id, amount, finalDestination: destination, txHash: hash }, "[settlement] direct payout confirmed");
      return this.recordShield(gameId, winner, { amount, phase: "withdrawn", finalDestination: destination, txHash: hash });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, gameId, winnerPlayerId: winner.id, amount, finalDestination: destination }, "[settlement] direct payout failed");
      return this.recordShield(gameId, winner, { amount, phase: "withdraw_failed", finalDestination: destination, error: message });
    }
  }

  // Routes the winner's consolidated pot out of the public Privy wallet into Unlink, then back
  // out to the winner's OWN funding wallet — the Unlink hop is what shields the payout. Reads the
  // live on-chain pot first (the consolidated total), records the exact phase reached, and
  // broadcasts prize_settled. Never throws: funds stay safe in the Privy wallet or in Unlink.
  private async unlinkShieldWinnerPot(gameId: string, winner: Player): Promise<ShieldResult> {
    if (!winner.privyWalletId) {
      logger.warn({ gameId, winnerPlayerId: winner.id }, "[settlement] winner has no Privy wallet; shield skipped");
      return this.recordShield(gameId, winner, { amount: "0", phase: "consolidated" });
    }
    const amount = await this.viem.getErc20Balance(this.entryToken, winner.privyWalletAddress!);
    logger.info({ gameId, winnerPlayerId: winner.id, amount }, "[settlement] shield pot read");
    if (new BigNumber(amount).lte(0)) {
      return this.recordShield(gameId, winner, { amount, phase: "consolidated" });
    }
    const deposited = await this.depositToUnlink(gameId, winner, amount);
    if (deposited) return deposited;
    // Unlink credits the shielded note asynchronously after the deposit tx confirms; the withdraw
    // sees balance 0 until then, so wait for the credit (which records the single 'deposited' phase)
    // before attempting it.
    const credited = await this.awaitDepositCredit(gameId, winner, amount);
    if (credited.phase === "deposit_uncredited") return credited;
    return this.withdrawToDepositor(gameId, winner, amount);
  }

  // Polls the winner's shielded balance until it reflects the just-deposited amount, then returns
  // so the withdraw can proceed. Bounded by an absolute deadline (SHIELD_CREDIT_TIMEOUT_MS) so
  // settlement can never hang; on timeout records deposit_uncredited and the withdraw is skipped.
  private async awaitDepositCredit(gameId: string, winner: Player, amount: string): Promise<ShieldResult> {
    const need = new BigNumber(amount);
    const deadline = Date.now() + this.creditTimeoutMs;
    let balance = "0";
    while (Date.now() < deadline) {
      balance = await this.readShieldedBalance(winner);
      if (new BigNumber(balance).gte(need)) {
        logger.info({ gameId, winnerPlayerId: winner.id, amount, balance }, "[settlement] shield deposit credited");
        return this.recordShield(gameId, winner, { amount, phase: "deposited" });
      }
      logger.info({ gameId, winnerPlayerId: winner.id, amount, balance }, "[settlement] shield deposit not yet credited; waiting");
      await this.sleep(this.creditPollMs);
    }
    const error = `shield deposit not credited in time (have ${balance}, need ${amount})`;
    logger.error({ gameId, winnerPlayerId: winner.id, amount, balance }, "[settlement] shield deposit credit timed out");
    return this.recordShield(gameId, winner, { amount, phase: "deposit_uncredited", error });
  }

  // Reads the winner's shielded balance for the entry token. Failures return "0" so the poll keeps
  // retrying until the deadline rather than aborting on a transient SDK read error.
  private async readShieldedBalance(winner: Player): Promise<string> {
    try {
      return await this.unlink.getTokenBalance({
        playerId: winner.id,
        unlinkAddress: winner.unlinkAddress,
        encMnemonic: winner.encMnemonic,
        token: this.entryToken,
      });
    } catch (error) {
      logger.warn({ err: error, winnerPlayerId: winner.id }, "[settlement] shielded balance read failed; will retry");
      return "0";
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Confirms the on-chain deposit only. Returns a deposit_failed ShieldResult on failure, or null on
  // success — the 'deposited' phase is recorded later by awaitDepositCredit once the note is credited.
  private async depositToUnlink(gameId: string, winner: Player, amount: string): Promise<ShieldResult | null> {
    logger.info(
      { gameId, winnerPlayerId: winner.id, amount, unlinkAddress: winner.unlinkAddress },
      "[settlement] shield deposit-to-Unlink attempt",
    );
    try {
      await this.unlink.depositFromPrivyWallet({
        unlinkAddress: winner.unlinkAddress,
        encMnemonic: winner.encMnemonic,
        privyWalletId: winner.privyWalletId!,
        privyWalletAddress: winner.privyWalletAddress!,
        token: this.entryToken,
        amount,
      });
      logger.info({ gameId, winnerPlayerId: winner.id, amount, unlinkAddress: winner.unlinkAddress }, "[settlement] shield deposit-to-Unlink confirmed");
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Pass the raw error as `err` (serializer renders the full Permit2/SDK detail) — the whole
      // point of this path's logging; `message` only feeds the persisted ShieldResult.error.
      logger.error({ err: error, gameId, winnerPlayerId: winner.id, amount }, "[settlement] shield deposit failed");
      return this.recordShield(gameId, winner, { amount, phase: "deposit_failed", error: message });
    }
  }

  private async withdrawToDepositor(gameId: string, winner: Player, amount: string): Promise<ShieldResult> {
    const destination = winner.ownerId ? await this.privy.resolveDepositorAddress(winner.ownerId) : null;
    if (!destination) {
      logger.warn({ gameId, winnerPlayerId: winner.id, ownerId: winner.ownerId ?? null }, "[settlement] no depositor wallet resolved; pot stays in Unlink");
      return this.recordShield(gameId, winner, { amount, phase: "no_destination" });
    }
    logger.info(
      { gameId, winnerPlayerId: winner.id, amount, finalDestination: destination },
      "[settlement] shield withdraw-to-depositor attempt",
    );
    try {
      await this.unlink.withdrawToAddress({
        playerId: winner.id,
        unlinkAddress: winner.unlinkAddress,
        encMnemonic: winner.encMnemonic,
        recipientEvmAddress: destination,
        token: this.entryToken,
        amount,
      });
      logger.info({ gameId, winnerPlayerId: winner.id, amount, finalDestination: destination }, "[settlement] shield withdraw-to-depositor confirmed");
      return this.recordShield(gameId, winner, { amount, phase: "withdrawn", finalDestination: destination });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, gameId, winnerPlayerId: winner.id, amount, finalDestination: destination }, "[settlement] shield withdrawal failed");
      return this.recordShield(gameId, winner, { amount, phase: "withdraw_failed", finalDestination: destination, error: message });
    }
  }

  // Builds the ShieldResult and broadcasts prize_settled. Single place the phase + destination
  // reach the wire so every outcome (success or a stuck phase) is observable to the arena.
  private recordShield(
    gameId: string,
    winner: Player,
    fields: { amount: string; phase: ShieldPhase; finalDestination?: string; error?: string; txHash?: string },
  ): ShieldResult {
    const shield: ShieldResult = { winnerPlayerId: winner.id, ...fields };
    logger.info(
      { gameId, winnerPlayerId: winner.id, phase: shield.phase, amount: shield.amount, finalDestination: shield.finalDestination ?? null },
      "[settlement] shield result",
    );
    this.hub.broadcast("prize_settled", gameId, {
      winnerPlayerId: winner.id,
      amount: shield.amount,
      phase: shield.phase,
      finalDestination: shield.finalDestination ?? null,
    });
    return shield;
  }

  private async loadPlayers(settlement: Settlement): Promise<Player[]> {
    const loaded = await Promise.all(settlement.perPlayer.map((result) => this.players.get(result.playerId)));
    return loaded.filter((player): player is Player => player !== null && !!player.privyWalletAddress);
  }

  // Winner = the wallet holding the most USDC; tie-break deterministically on the lowest
  // playerId so the same inputs always crown the same winner.
  private pickWinner(players: Player[], balances: Record<string, string>): Player | null {
    return players.reduce<Player | null>((best, player) => {
      if (!best) return player;
      const current = new BigNumber(this.balanceOf(player, balances));
      const incumbent = new BigNumber(this.balanceOf(best, balances));
      if (current.gt(incumbent)) return player;
      if (current.eq(incumbent) && player.id < best.id) return player;
      return best;
    }, null);
  }

  // Only losers with a positive USDC balance get a transfer; zero-balance wallets are skipped
  // entirely (no send, no record). Each transfer is isolated so one failure never blocks the rest.
  private async transferAll(
    gameId: string,
    losers: Player[],
    winnerPlayerId: string,
    winnerAddress: string,
    balances: Record<string, string>,
  ): Promise<PayoutTransfer[]> {
    const funded = losers.filter((loser) => new BigNumber(this.balanceOf(loser, balances)).gt(0));
    const settled = await Promise.allSettled(
      funded.map((loser) => this.transferOne(loser, winnerAddress, this.balanceOf(loser, balances))),
    );
    return settled.map((result, index) =>
      this.toTransfer(gameId, winnerPlayerId, funded[index]!, this.balanceOf(funded[index]!, balances), result),
    );
  }

  // Moves a single loser's FULL USDC balance into the winner via a sponsored erc20 transfer.
  private async transferOne(loser: Player, winnerAddress: string, amount: string): Promise<string> {
    if (!loser.privyWalletId) throw new Error(`player ${loser.id} has no Privy wallet`);
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      // viem needs a JS bigint here — convert at this single call site from the base-unit string.
      args: [winnerAddress as Address, BigInt(new BigNumber(amount).toFixed(0))],
    });
    const hash = await this.privy.sendTransaction(
      loser.privyWalletId,
      { to: this.entryToken, data, value: "0" },
      { sponsor: true },
    );
    await this.viem.waitForReceipt(hash);
    return hash;
  }

  private toTransfer(
    gameId: string,
    winnerPlayerId: string,
    loser: Player,
    amount: string,
    result: PromiseSettledResult<string>,
  ): PayoutTransfer {
    if (result.status === "fulfilled") {
      logger.info(
        { gameId, fromPlayerId: loser.id, winnerPlayerId, amount, txHash: result.value },
        "[settlement] loser transfer confirmed",
      );
      return { playerId: loser.id, amount, txHash: result.value, ok: true };
    }
    logger.error(
      { err: result.reason, gameId, fromPlayerId: loser.id, winnerPlayerId, amount },
      "[settlement] loser transfer failed",
    );
    return { playerId: loser.id, amount, ok: false };
  }

  // "executed" if every attempted transfer succeeded, "failed" if every one failed, else
  // "partial". A run with no transfers (single player / all-zero balances) counts as executed.
  private deriveStatus(transfers: PayoutTransfer[]): PayoutStatus {
    if (transfers.length === 0) return "executed";
    if (transfers.every((transfer) => transfer.ok)) return "executed";
    if (transfers.every((transfer) => !transfer.ok)) return "failed";
    return "partial";
  }

  private async noWinner(settlement: Settlement): Promise<PayoutResult> {
    await this.settlements.save({ ...settlement, payoutStatus: "executed", payouts: [] });
    return { winnerPlayerId: null, winnerAddress: null, prizePoolUsdc: settlement.prizePoolUsdc, transfers: [] };
  }

  private balanceOf(player: Player, balances: Record<string, string>): string {
    return balances[(player.privyWalletAddress ?? "").toLowerCase()] ?? "0";
  }
}

export const settlementService = new SettlementService();
