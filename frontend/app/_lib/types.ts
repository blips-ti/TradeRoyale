/* Types mirroring the trade-royal-backend contract (REST + WS).
   All money fields are base-unit strings (USDC has 6 decimals: "1000000" = $1). */

export type GameStatus = "lobby" | "live" | "settling" | "ended";
export type DepositStatus = "pending" | "confirmed";
export type FundsStatus = "pending" | "released";
export type TradeKind = "swap" | "contract_call";

export type Game = {
  id: string;
  status: GameStatus;
  entryToken: string;
  entryAmount: string; // base-unit USDC
  durationSec: number;
  maxPlayers: number;
  createdAt: string;
  startedAt?: string;
  endsAt?: string;
  playerCount?: number; // present on list responses (GET /games?status=…)
};

export type PublicPlayer = {
  id: string;
  displayName: string; // = the agent's competing name
  unlinkAddress: string;
  depositStatus: DepositStatus;
  privyWalletAddress?: string;
  fundsStatus?: FundsStatus;
  lastAgentSummary?: string;
};

export type GameWithPlayers = { game: Game; players: PublicPlayer[] };

/** GET /games/me/:ownerAddress — the caller's active game+player, recovered on reconnect. */
export type ActivePlayerResponse = { game: Game | null; player: PublicPlayer | null };

/** Persisted achievements/XP (GET /achievements/:owner, POST …/unlock). */
export type AchievementState = { unlocked: string[]; totalXp: number; level: number };
export type UnlockResult = AchievementState & { newlyUnlocked: boolean };

export type JoinResult = {
  playerId: string;
  unlinkAddress: string;
  deposit: { token: string; amount: string; instructions: string };
};

/** Owner-only Unlink account keys (GET …/unlink-account) — used to deposit from the browser. */
export type UnlinkAccountExport = {
  version: 1;
  spendingPrivateKey: string;
  viewingPrivateKey: string;
};

export type Trade = {
  id: string;
  gameId: string;
  playerId: string;
  kind: TradeKind;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmountMin: string;
  tool: string;
  txHash: string;
  status: string;
  createdAt: string;
  description?: string;
};

export type PlayerResult = {
  rank: number;
  playerId: string;
  displayName: string;
  privyWalletAddress: string;
  startingBalance: string; // base-unit USDC
  finalUsdc: string; // base-unit USDC (source of truth)
  octavNavUsd: string; // decimal USD (Octav cross-check)
  pnl: string; // base-unit USDC (finalUsdc - startingBalance)
};

export type Settlement = {
  gameId: string;
  winnerPlayerId: string | null;
  prizePoolUsdc: string;
  perPlayer: PlayerResult[];
  computedAt: string;
  validationStatus: "pending" | "approved" | "rejected";
  payoutStatus: "pending" | "executed" | "failed";
};

export type PlayerDetail = {
  player: PublicPlayer;
  entryToken: string;
  balances: Record<string, string>; // Unlink-side custody balances
};

/* ── WebSocket events (server → client) ─────────────────────────────────────── */

export type GameEventType =
  | "player_joined"
  | "deposit_confirmed"
  | "game_started"
  | "game_tick"
  | "game_ended"
  | "funds_released"
  | "agent_update"
  | "trade_executed"
  | "player_liquidated"
  // ⬇ proposed BE addition for the live NAV chart (see integration plan §6)
  | "portfolio_update";

export type GameEvent = {
  type: GameEventType;
  gameId: string;
  ts: number;
  data: Record<string, unknown>;
};
