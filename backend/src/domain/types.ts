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
  // Verified Privy user id (DID) of the user who joined — their tamper-proof identity from
  // the access token. Authorizes their actions and lets them recover this player. Never
  // exposed in PublicPlayer.
  ownerId?: string;
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
  // A live instruction the owner sent from the arena chat; injected into the next agent turn
  // then cleared. Lets the player nudge their agent mid-game without changing the base strategy.
  pendingInstruction?: string;
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

export type PayoutStatus = 'pending' | 'executed' | 'partial' | 'failed';

// Phase the winner's shielded payout reached. Crash-safe ordering: funds are consolidated into
// the winner's Privy wallet, deposited into Unlink, then withdrawn to the winner's own wallet.
// A failure records the LAST phase reached so the operator knows exactly where the pot sits.
export type ShieldPhase =
  | 'consolidated' // pot is in the winner's Privy wallet (deposit not yet attempted)
  | 'deposited' // pot is inside Unlink (withdrawal not yet attempted)
  | 'withdrawn' // pot delivered to the winner's depositor wallet (terminal success)
  | 'deposit_failed' // deposit threw; funds safe in the Privy wallet
  | 'deposit_uncredited' // deposit confirmed but Unlink never credited the shielded note in time
  | 'withdraw_failed' // withdrawal threw; funds safe inside Unlink
  | 'no_destination'; // no resolvable depositor wallet; pot left in the Privy wallet

// Audit record of routing the winner's pot through Unlink to their own funding wallet. amount is
// the consolidated pot moved (base units). finalDestination is the resolved depositor wallet when
// known; error carries the failure message for the phase that did not complete.
export interface ShieldResult {
  winnerPlayerId: string;
  amount: string;
  phase: ShieldPhase;
  finalDestination?: string;
  error?: string;
  // The payout tx hash on the terminal 'withdrawn' phase. Set by the direct-payout path (one
  // sponsored Privy → depositor transfer); the Unlink shield path leaves it undefined.
  txHash?: string;
}

// One loser->winner USDC transfer in the winner-take-all consolidation. amount is the full
// loser balance moved (base units); txHash is undefined when the send threw before broadcast.
export interface PayoutTransfer {
  playerId: string;
  amount: string;
  txHash?: string;
  ok: boolean;
}

// Outcome of one (playerId, token) liquidation attempt during Phase-3 settlement, captured for
// API-readable diagnostics. 'liquidated' swapped to USDC; 'skipped_zero'/'skipped_dust' held no
// liquidatable balance; 'failed' carries the swap-rejection error message (not just a boolean).
export type TokenLiquidationStatus = 'liquidated' | 'skipped_zero' | 'skipped_dust' | 'failed';

export interface TokenLiquidation {
  playerId: string;
  token: string;
  status: TokenLiquidationStatus;
  balance: string;
  fromAmount?: string;
  toAmountMin?: string;
  error?: string;
}

// API-readable settlement diagnostics persisted on the record so settlement failures are visible
// via GET /games/:gameId/results without log access. liquidations is the per-token outcome trail;
// settleError captures a thrown mid-settle crash (message + first stack lines).
export interface SettlementDiagnostics {
  liquidations: TokenLiquidation[];
  settleError?: string;
}

// Persisted settlement record (tr:game:{gameId}:settlement). After scoring, executePayout
// consolidates every loser's USDC into the winner's Privy wallet (winner-take-all, public).
export interface Settlement {
  gameId: string;
  winnerPlayerId: string | null;
  prizePoolUsdc: string;
  perPlayer: PlayerResult[];
  computedAt: string;
  payoutStatus: PayoutStatus;
  // Per-transfer audit trail of the winner-take-all consolidation; set by executePayout.
  payouts?: PayoutTransfer[];
  // Audit of routing the winner's pot through Unlink to their own funding wallet; set by
  // executePayout after consolidation. Absent when there is no winner.
  shield?: ShieldResult;
  // API-readable settlement diagnostics: per-token liquidation outcomes + any thrown settle error.
  diagnostics?: SettlementDiagnostics;
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
  // Deposit confirmed AND a strategy set — i.e. the player is fully ready for the match to start.
  // Public boolean (no strategy content), so the lobby can show a live "ready" count.
  agentReady?: boolean;
  // Populated ONLY on the owner's own-player views (GET /games/me, strategy PUT) so they can
  // prefill Agent Studio. Never set by toPublicPlayer, so opponents can't read your strategy.
  strategyPrompt?: string;
}

export function isAgentReady(player: Player): boolean {
  return player.depositStatus === 'confirmed' && !!player.strategyPrompt?.trim();
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
    agentReady: isAgentReady(player),
  };
}

// The owner's view of their OWN player — adds their private strategy for prefill.
export function toOwnPlayer(player: Player): PublicPlayer {
  return { ...toPublicPlayer(player), strategyPrompt: player.strategyPrompt };
}
