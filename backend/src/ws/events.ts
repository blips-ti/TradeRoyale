export type GameEventType =
  | 'player_joined'
  | 'deposit_confirmed'
  | 'game_started'
  | 'game_tick'
  | 'game_ended'
  | 'funds_released'
  | 'agent_update'
  | 'trade_executed'
  | 'player_liquidated';

export interface GameEvent {
  type: GameEventType;
  gameId: string;
  ts: number;
  data: Record<string, unknown>;
}

export function buildGameEvent(type: GameEventType, gameId: string, data: Record<string, unknown>): GameEvent {
  return { type, gameId, ts: Date.now(), data };
}
