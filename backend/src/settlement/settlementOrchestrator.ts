import { BigNumber } from "bignumber.js";

import type { Game, Player, PlayerResult } from "../domain/types.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { GameRepository } from "../repositories/gameRepository.js";
import { PlayerRepository } from "../repositories/playerRepository.js";
import { isNativeToken, lifiService, LifiService, NATIVE_TOKEN_DECIMALS } from "../services/lifiService.js";
import { octavService, OctavService } from "../services/octavService.js";
import { type SwapResult, tradeExecutor, TradeExecutor } from "../services/tradeExecutor.js";
import { viemReader, ViemReader } from "../services/viemClient.js";
import { gameEventHub, GameEventHub } from "../ws/gameEventHub.js";
import { settlementService, SettlementService } from "./settlementService.js";

// Server-driven Phase-3 settlement: liquidate every non-entry touched token back to USDC on
// Base, read authoritative on-chain final USDC via ONE multicall, cross-check Octav NAV, rank,
// persist, then consolidate all USDC into the winner. Trading (the agent) is NOT involved.
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
    private readonly entryToken: string = env.ENTRY_TOKEN_ADDRESS,
    private readonly minUsdc: string = env.LIQUIDATION_MIN_USDC,
  ) {}

  // Liquidates every player crash-safe, then scores them all with ONE multicall reading each
  // wallet's final USDC, ranks by finalUsdc desc, persists, and runs the winner-take-all payout.
  async settle(game: Game): Promise<PlayerResult[]> {
    const playerIds = await this.games.listPlayerIds(game.id);
    const players = await this.players.getMany(playerIds);
    logger.info({ gameId: game.id, playerCount: players.length }, "[settlement] settle start");
    const liquidated = await Promise.allSettled(players.map((player) => this.settlePlayer(game, player)));
    const scoredResults = liquidated
      .filter((result): result is PromiseFulfilledResult<Player> => result.status === "fulfilled")
      .map((result) => result.value);
    const finalUsdc = await this.scoreUsdc(scoredResults);
    const scored = await Promise.all(scoredResults.map((player) => this.scorePlayer(game, player, finalUsdc)));
    const results = this.rank(scored);
    logger.info(
      { gameId: game.id, winnerPlayerId: results[0]?.playerId ?? null, ranking: results.map((r) => ({ rank: r.rank, playerId: r.playerId, finalUsdc: r.finalUsdc })) },
      "[settlement] ranking computed",
    );
    const settlement = await this.settlements.buildSettlement(game.id, results);
    await this.settlements.executePayout(settlement);
    return results;
  }

  // ONE multicall reading the entry-token (USDC) balance of every player's Privy wallet — the
  // single RPC call that checks every trader's wallet. Keyed by lowercased owner address.
  private async scoreUsdc(players: Player[]): Promise<Record<string, string>> {
    const addresses = players.map((player) => player.privyWalletAddress).filter((address): address is string => !!address);
    if (addresses.length === 0) return {};
    return this.viem.getErc20BalancesForOwners(this.entryToken, addresses);
  }

  private async settlePlayer(game: Game, player: Player): Promise<Player> {
    const liquidated = await this.liquidate(game, player);
    this.hub.broadcast("player_liquidated", game.id, { playerId: player.id, ok: liquidated });
    return player;
  }

  private async scorePlayer(game: Game, player: Player, balances: Record<string, string>): Promise<ScoredPlayer> {
    const finalUsdc = balances[(player.privyWalletAddress ?? "").toLowerCase()] ?? "0";
    logger.info({ gameId: game.id, playerId: player.id, finalUsdc }, "[settlement] player scored");
    const octavNavUsd = await this.fetchNav(player);
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
  // failures are isolated so one stuck swap never blocks the rest; returns overall ok. Each
  // rejected reason is logged with its token so a swallowed failure is visible in prod logs.
  private async liquidate(game: Game, player: Player): Promise<boolean> {
    if (!player.privyWalletId || !player.privyWalletAddress) return false;
    const wallet = { privyWalletId: player.privyWalletId, privyWalletAddress: player.privyWalletAddress };
    const tokens = this.nonEntryTouchedTokens(player);
    logger.info({ gameId: game.id, playerId: player.id, tokens }, "[settlement] liquidating player tokens");
    const meta = await this.lifi.getTokenMeta(tokens);
    const settled = await Promise.allSettled(
      tokens.map((token) => this.liquidateToken(wallet, token, meta[token])),
    );
    settled.forEach((result, index) => this.logTokenOutcome(game, player, tokens[index]!, result));
    return settled.every((result) => result.status === "fulfilled");
  }

  // Logs a token's liquidation outcome: rejected reasons at error (otherwise swallowed by
  // allSettled), successful swaps at info with the on-chain fromAmount actually sold.
  private logTokenOutcome(game: Game, player: Player, token: string, result: PromiseSettledResult<SwapResult | null>): void {
    if (result.status === "rejected") {
      logger.error({ err: result.reason, gameId: game.id, playerId: player.id, token }, "[settlement] token liquidation failed");
      return;
    }
    if (!result.value) return;
    logger.info({ gameId: game.id, playerId: player.id, token, fromAmount: result.value.fromAmount }, "[settlement] token liquidated");
  }

  private async liquidateToken(
    wallet: { privyWalletId: string; privyWalletAddress: string },
    token: string,
    meta: { priceUSD: string; decimals: number } | undefined,
  ): Promise<SwapResult | null> {
    const balance = isNativeToken(token)
      ? await this.viem.getNativeBalance(wallet.privyWalletAddress)
      : await this.viem.getErc20Balance(token, wallet.privyWalletAddress);
    if (new BigNumber(balance).lte(0)) return null;
    if (this.isDust(balance, meta)) return null;
    return this.executor.executeSwap(wallet, { fromToken: token, toToken: this.entryToken, fromAmount: balance });
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

  private async fetchNav(player: Player): Promise<string> {
    if (!player.privyWalletAddress) return "0";
    try {
      const nav = await this.octav.getNav(player.privyWalletAddress);
      return nav.navUsd;
    } catch (error) {
      // NAV is an advisory cross-check, never the score — a failure must not block settlement.
      logger.warn({ err: error, playerId: player.id }, "[settlement] octav NAV fetch failed");
      return "0";
    }
  }

  // Rank by on-chain finalUsdc desc (the source-of-truth score); ties keep input order.
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

interface ScoredPlayer {
  playerId: string;
  displayName: string;
  privyWalletAddress: string;
  startingBalance: string;
  finalUsdc: string;
  octavNavUsd: string;
}

export const settlementOrchestrator = new SettlementOrchestrator();
