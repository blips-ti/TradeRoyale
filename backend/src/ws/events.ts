export type GameEventType =
  | 'player_joined'
  | 'deposit_confirmed'
  | 'game_started'
  | 'game_tick'
  | 'game_ended'
  | 'funds_released'
  // Agent started a turn (LLM is reasoning) — drives the "thinking…" indicator in the arena.
  | 'agent_thinking'
  | 'agent_update'
  | 'trade_executed'
  | 'player_liquidated'
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
