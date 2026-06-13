import { BigNumber } from "bignumber.js";

import type { Game, Player, PlayerResult, Settlement, SettlementDiagnostics, TokenLiquidation } from "../domain/types.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { SettlementRepository } from "../repositories/settlementRepository.js";
import { isNativeToken, lifiService, LifiService, NATIVE_TOKEN_DECIMALS } from "../services/lifiService.js";
import { octavService, OctavService } from "../services/octavService.js";
import { tradeExecutor, TradeExecutor } from "../services/tradeExecutor.js";
import { viemReader, ViemReader } from "../services/viemClient.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";
import { settlementService, SettlementService } from "./settlementService.js";

// Server-driven Phase-3 settlement: liquidate every non-entry touched token back to USDC on
// Base, wait out the settle window, then score every player by their Octav /wallet USD value
// (so un-liquidated holdings still count), rank, persist, and consolidate USDC into the winner.
// Trading (the agent) is NOT involved.
export class SettlementOrchestrator {
  constructor(
    private readonly games: GameRepository = new GameRepository(),
    private readonly players: PlayerRepository = new PlayerRepository(),
    private readonly executor: TradeExecutor = tradeExecutor,
    private readonly viem: ViemReader = viemReader,
    private readonly lifi: LifiService = lifiService,
    private readonly octav: OctavService = octavService,
    private readonly settlements: SettlementService = settlementService,
    private readonly hub: GameEventHub = gameEventHub,
    private readonly settlementRepo: SettlementRepository = new SettlementRepository(),
    private readonly entryToken: string = env.ENTRY_TOKEN_ADDRESS,
    private readonly minUsdc: string = env.LIQUIDATION_MIN_USDC,
    private readonly settleDelayMs: number = env.SETTLE_OCTAV_DELAY_MS,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  // Liquidates every player crash-safe, waits out the settle window so the chain + Octav reflect
  // the final wallet, scores each player by their Octav /wallet USD value, ranks desc, persists,
  // and runs the winner-take-all payout. Wrapped in try/catch so a thrown crash still lands
  // API-readable diagnostics before rethrow.
  async settle(game: Game): Promise<PlayerResult[]> {
    try {
      return await this.runSettlement(game);
    } catch (error) {
      await this.recordSettleError(game.id, error);
      // Rethrow so gameClock still logs the crash and marks the game ended; the error is never lost.
      throw error;
    }
  }

  private async runSettlement(game: Game): Promise<PlayerResult[]> {
    const playerIds = await this.games.listPlayerIds(game.id);
    const players = await this.players.getMany(playerIds);
    logger.info({ gameId: game.id, playerCount: players.length }, "[settlement] settle start");
    const liquidated = await Promise.allSettled(players.map((player) => this.settlePlayer(game, player)));
    const settledPlayers = liquidated
      .filter((result): result is PromiseFulfilledResult<SettledPlayer> => result.status === "fulfilled")
      .map((result) => result.value);
    const scoredResults = settledPlayers.map((settled) => settled.player);
    const liquidations = settledPlayers.flatMap((settled) => settled.liquidations);
    await this.waitForSettleWindow(game);
    const scored = await Promise.all(scoredResults.map((player) => this.scorePlayer(game, player)));
    const results = this.rank(scored);
    logger.info(
      { gameId: game.id, winnerPlayerId: results[0]?.playerId ?? null, ranking: results.map((r) => ({ rank: r.rank, playerId: r.playerId, finalUsdc: r.finalUsdc })) },
      "[settlement] ranking computed",
    );
    const built = await this.settlements.buildSettlement(game.id, results);
    const diagnostics: SettlementDiagnostics = { liquidations };
    const settlement: Settlement = { ...built, diagnostics };
    await this.settlementRepo.save(settlement);
    await this.settlements.executePayout(settlement);
    return results;
  }

  // Persists a thrown mid-settle crash as API-readable diagnostics so a failed settlement is
  // visible via GET /games/:gameId/results without log access. Merges onto any record buildSettlement
  // already wrote (keeping its liquidations), or creates a minimal one if it crashed earlier.
  private async recordSettleError(gameId: string, error: unknown): Promise<void> {
    const settleError = this.formatSettleError(error);
    logger.error({ err: error, gameId }, "[settlement] settle crashed");
    try {
      const existing = await this.settlementRepo.get(gameId);
      const base = existing ?? this.emptySettlement(gameId);
      const diagnostics: SettlementDiagnostics = { liquidations: base.diagnostics?.liquidations ?? [], settleError };
      await this.settlementRepo.save({ ...base, diagnostics });
    } catch (persistError) {
      // Diagnostics persistence is best-effort: never mask the original settle error with a Redis one.
      logger.error({ err: persistError, gameId }, "[settlement] failed to persist settle error diagnostics");
    }
  }

  // Error message + first ~3 stack lines — enough to locate the crash without dumping a full trace.
  private formatSettleError(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const stack = (error.stack ?? "").split("\n").slice(1, 4).map((line) => line.trim());
    return [error.message, ...stack].filter(Boolean).join(" | ");
  }

  private emptySettlement(gameId: string): Settlement {
    return { gameId, winnerPlayerId: null, prizePoolUsdc: "0", perPlayer: [], computedAt: new Date().toISOString(), payoutStatus: "pending" };
  }

  // Hold off the end-of-game Octav read until SETTLE_OCTAV_DELAY_MS past the deadline, so the
  // chain + Octav indexer have time to reflect the final wallet (the FE shows the countdown).
  private async waitForSettleWindow(game: Game): Promise<void> {
    if (!game.endsAt) return;
    const waitMs = new Date(game.endsAt).getTime() + this.settleDelayMs - Date.now();
    if (waitMs <= 0) return;
    logger.info({ gameId: game.id, waitMs }, "[settlement] waiting for octav settle window");
    await this.sleep(waitMs);
  }

  private async settlePlayer(game: Game, player: Player): Promise<SettledPlayer> {
    const liquidations = await this.liquidate(game, player);
    const ok = liquidations.every((liquidation) => liquidation.status !== "failed");
    this.hub.broadcast("player_liquidated", game.id, { playerId: player.id, ok });
    return { player, liquidations };
  }

  // Score = the player's full Octav /wallet USD value (un-liquidated holdings included),
  // expressed in USDC base units (6dp) so it ranks + displays like the on-chain entry amount.
  private async scorePlayer(game: Game, player: Player): Promise<ScoredPlayer> {
    const octavNavUsd = await this.fetchWalletValue(player);
    const finalUsdc = new BigNumber(octavNavUsd).times(USDC_SCALE).toFixed(0);
    logger.info({ gameId: game.id, playerId: player.id, finalUsdc, octavNavUsd }, "[settlement] player scored");
    await this.players.save({ ...player, finalUsdc, octavNavUsd });
    return {
      playerId: player.id,
      displayName: player.displayName,
      privyWalletAddress: player.privyWalletAddress ?? "",
      startingBalance: player.startingBalance ?? game.entryAmount,
      finalUsdc,
      octavNavUsd,
    };
  }

  // Liquidate each non-entry touched token (skip dust below LIQUIDATION_MIN_USDC). Per-token
  // failures are isolated so one stuck swap never blocks the rest; returns the per-token outcome
  // trail for diagnostics. Each rejected reason is logged with its token AND its message captured.
  private async liquidate(game: Game, player: Player): Promise<TokenLiquidation[]> {
    if (!player.privyWalletId || !player.privyWalletAddress) return [];
    const wallet = { privyWalletId: player.privyWalletId, privyWalletAddress: player.privyWalletAddress };
    const tokens = this.nonEntryTouchedTokens(player);
    logger.info({ gameId: game.id, playerId: player.id, tokens }, "[settlement] liquidating player tokens");
    const meta = await this.lifi.getTokenMeta(tokens);
    const settled = await Promise.allSettled(
      tokens.map((token) => this.liquidateToken(player.id, wallet, token, meta[token])),
    );
    return settled.map((result, index) => this.toLiquidation(game, player, tokens[index]!, result));
  }

  // Resolves a settled per-token result into a TokenLiquidation: a rejection carries the swap's
  // error MESSAGE (not a boolean); a fulfilled value is the already-classified outcome.
  private toLiquidation(game: Game, player: Player, token: string, result: PromiseSettledResult<TokenLiquidation>): TokenLiquidation {
    if (result.status === "rejected") {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.error({ err: result.reason, gameId: game.id, playerId: player.id, token }, "[settlement] token liquidation failed");
      return { playerId: player.id, token, status: "failed", balance: "0", error };
    }
    if (result.value.status === "liquidated") {
      logger.info({ gameId: game.id, playerId: player.id, token, fromAmount: result.value.fromAmount }, "[settlement] token liquidated");
    }
    return result.value;
  }

  // Reads the live balance, classifies skip-zero / skip-dust / liquidated, and captures the
  // SwapResult amounts when it actually swaps. The swap itself may still reject (caught upstream).
  private async liquidateToken(
    playerId: string,
    wallet: { privyWalletId: string; privyWalletAddress: string },
    token: string,
    meta: { priceUSD: string; decimals: number } | undefined,
  ): Promise<TokenLiquidation> {
    const balance = isNativeToken(token)
      ? await this.viem.getNativeBalance(wallet.privyWalletAddress)
      : await this.viem.getErc20Balance(token, wallet.privyWalletAddress);
    if (new BigNumber(balance).lte(0)) return { playerId, token, status: "skipped_zero", balance };
    if (this.isDust(balance, meta)) return { playerId, token, status: "skipped_dust", balance };
    const swap = await this.executor.executeSwap(wallet, { fromToken: token, toToken: this.entryToken, fromAmount: balance });
    return { playerId, token, status: "liquidated", balance, fromAmount: swap.fromAmount, toAmountMin: swap.toAmountMin };
  }

  // Skip when the USD value of the holding is below the configured USDC dust floor. USD value
  // = balance/10^decimals * priceUSD, scaled back to USDC base units (6 dp) for the compare.
  private isDust(balance: string, meta: { priceUSD: string; decimals: number } | undefined): boolean {
    // No price → can't value it; liquidate rather than risk stranding it (not treated as dust).
    if (!meta?.priceUSD) return false;
    const decimals = meta.decimals ?? NATIVE_TOKEN_DECIMALS;
    const price = new BigNumber(meta.priceUSD);
    if (price.isNaN() || !price.isFinite()) return false;
    const usdcValue = new BigNumber(balance)
      .times(price)
      .div(new BigNumber(10).pow(decimals))
      .times(new BigNumber(10).pow(USDC_DECIMALS));
    return usdcValue.lt(this.minUsdc);
  }

  private nonEntryTouchedTokens(player: Player): string[] {
    const entry = this.entryToken.toLowerCase();
    return (player.touchedTokens ?? []).map((token) => token.toLowerCase()).filter((token) => token !== entry);
  }

  // The player's total Octav /wallet USD value (human decimal string). On any failure returns
  // "0" — a settlement must never be blocked by an Octav hiccup.
  private async fetchWalletValue(player: Player): Promise<string> {
    if (!player.privyWalletAddress) return "0";
    try {
      const { navUsd } = await this.octav.getWallet(player.privyWalletAddress);
      return navUsd;
    } catch (error) {
      logger.warn({ err: error, playerId: player.id }, "[settlement] octav wallet fetch failed");
      return "0";
    }
  }

  // Rank by finalUsdc desc (the Octav-wallet score in USDC base units); ties keep input order.
  private rank(scored: ScoredPlayer[]): PlayerResult[] {
    const sorted = [...scored].sort((a, b) => (new BigNumber(b.finalUsdc).gt(a.finalUsdc) ? 1 : -1));
    return sorted.map((player, index) => ({
      rank: index + 1,
      playerId: player.playerId,
      displayName: player.displayName,
      privyWalletAddress: player.privyWalletAddress,
      startingBalance: player.startingBalance,
      finalUsdc: player.finalUsdc,
      octavNavUsd: player.octavNavUsd,
      pnl: new BigNumber(player.finalUsdc).minus(player.startingBalance).toFixed(0),
    }));
  }
}

const USDC_DECIMALS = 6;
// Octav reports human USD ("0.1"); multiply by 10^6 to express the score in USDC base units.
const USDC_SCALE = new BigNumber(10).pow(USDC_DECIMALS);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A liquidated player plus its per-token outcome trail, carried from settlePlayer up to settle()
// so all players' liquidations aggregate into the persisted diagnostics.
interface SettledPlayer {
  player: Player;
  liquidations: TokenLiquidation[];
}

interface ScoredPlayer {
  playerId: string;
  displayName: string;
  privyWalletAddress: string;
  startingBalance: string;
  finalUsdc: string;
  octavNavUsd: string;
}

export const settlementOrchestrator = new SettlementOrchestrator();
