export const RedisKeys = {
  game: (gameId: string): string => `tr:game:${gameId}`,
  gamePlayers: (gameId: string): string => `tr:game:${gameId}:players`,
  gameTrades: (gameId: string): string => `tr:game:${gameId}:trades`,
  gameSettlement: (gameId: string): string => `tr:game:${gameId}:settlement`,
  player: (playerId: string): string => `tr:player:${playerId}`,
  openGames: (): string => 'tr:games:open',
  liveGames: (): string => 'tr:games:live',
} as const;
