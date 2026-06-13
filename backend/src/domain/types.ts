export type GameStatus = 'lobby' | 'live' | 'settling' | 'ended';
export type DepositStatus = 'pending' | 'confirmed';

export interface Game {
  id: string;
  status: GameStatus;
  entryToken: string;
  entryAmount: string;
  durationSec: number;
  maxPlayers: number;
  createdAt: string;
  startedAt?: string;
  endsAt?: string;
}

// Whether the player's entry funds have been released from Unlink to the Privy wallet.
export type FundsStatus = 'pending' | 'released';

export interface Player {
  id: string;
  gameId: string;
  displayName: string;
  unlinkAddress: string;
  encMnemonic: string;
  depositStatus: DepositStatus;
  startingBalance?: string;
  createdAt: string;
  // Untrusted user-supplied strategy directive for the Claude trading agent.
  strategyPrompt?: string;
  // Privy server wallet that trades publicly on Base (created at join).
  privyWalletId?: string;
  privyWalletAddress?: string;
  // Set to 'released' once entry funds are withdrawn from Unlink into the Privy wallet.
  fundsStatus?: FundsStatus;
  // Lowercased Base token addresses the player has traded (seeded with the entry token); the
  // portfolio reader balances exactly this set. The game is Base-only, so no chain tracking.
  touchedTokens?: string[];
  // Final text summary from the player's most recent agent tick.
  lastAgentSummary?: string;
  // Phase-3 settlement: authoritative on-chain USDC after liquidation (base units), and the
  // independent Octav NAV cross-check (USD decimal string). Set when the game settles.
  finalUsdc?: string;
  octavNavUsd?: string;
}

// One player's ranked settlement result. finalUsdc (on-chain) is the source-of-truth score.
export interface PlayerResult {
  rank: number;
  playerId: string;
  displayName: string;
  privyWalletAddress: string;
  startingBalance: string;
  finalUsdc: string;
  octavNavUsd: string;
  pnl: string;
}

export type ValidationStatus = 'pending' | 'approved' | 'rejected';
export type PayoutStatus = 'pending' | 'executed' | 'failed';

// Persisted settlement record (tr:game:{gameId}:settlement). Payout stays gated on
// validationStatus until the CRE on-chain validator (owned by teammates) approves it.
export interface Settlement {
  gameId: string;
  winnerPlayerId: string | null;
  prizePoolUsdc: string;
  perPlayer: PlayerResult[];
  computedAt: string;
  validationStatus: ValidationStatus;
  payoutStatus: PayoutStatus;
}

// Whether a trade is a plain swap or an arbitrary same-chain protocol interaction (zap).
export type TradeKind = 'swap' | 'contract_call';

// A single agent-executed action, persisted to the per-game trade log.
export interface Trade {
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
  // Agent's human-readable description of a contract_call (what protocol/action it performed).
  description?: string;
}

// Player shape safe to return from the API and to log. Never includes encMnemonic.
export interface PublicPlayer {
  id: string;
  displayName: string;
  unlinkAddress: string;
  depositStatus: DepositStatus;
  privyWalletAddress?: string;
  fundsStatus?: FundsStatus;
  lastAgentSummary?: string;
}

export function toPublicPlayer(player: Player): PublicPlayer {
  return {
    id: player.id,
    displayName: player.displayName,
    unlinkAddress: player.unlinkAddress,
    depositStatus: player.depositStatus,
    privyWalletAddress: player.privyWalletAddress,
    fundsStatus: player.fundsStatus,
    lastAgentSummary: player.lastAgentSummary,
  };
}
