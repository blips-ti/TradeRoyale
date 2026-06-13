export type GameEventType =
  | 'player_joined'
  | 'deposit_confirmed'
  | 'game_started'
  | 'game_tick'
  | 'game_ended'
  | 'funds_released'
  // Agent started a turn (LLM is reasoning) — drives the "thinking…" indicator in the arena.
  | 'agent_thinking'
  // Live step of the agent's turn — a reasoning chunk or a tool call (LI.FI/portfolio/swap).
  | 'agent_log'
  | 'agent_update'
  | 'trade_executed'
  // A swap/contract-call the agent attempted reverted or couldn't route — surfaced in the arena.
  | 'trade_failed'
  | 'player_liquidated'
  // Winner-take-all payout completed: every loser's USDC consolidated into the winner's wallet.
  | 'prize_paid'
  // Winner's consolidated pot routed through Unlink to their own funding wallet (final, shielded).
  | 'prize_settled'
  // Per-tick NAV (USD) of a player's trading wallet — drives the live arena chart + standings.
  | 'portfolio_update';

export interface GameEvent {
  type: GameEventType;
  gameId: string;
  ts: number;
  data: Record<string, unknown>;
}

export function buildGameEvent(type: GameEventType, gameId: string, data: Record<string, unknown>): GameEvent {
  return { type, gameId, ts: Date.now(), data };
}
