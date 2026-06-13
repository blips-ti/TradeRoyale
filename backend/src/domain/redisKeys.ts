export const RedisKeys = {
  game: (gameId: string): string => `tr:game:${gameId}`,
  gamePlayers: (gameId: string): string => `tr:game:${gameId}:players`,
  gameTrades: (gameId: string): string => `tr:game:${gameId}:trades`,
  gameSettlement: (gameId: string): string => `tr:game:${gameId}:settlement`,
  player: (playerId: string): string => `tr:player:${playerId}`,
  // Maps a user's wallet address (lowercased) to their current {gameId, playerId} so a
  // returning user recovers their player after a reconnect / on a new device.
  ownerActive: (ownerAddress: string): string => `tr:owner:${ownerAddress}:active`,
  openGames: (): string => 'tr:games:open',
  liveGames: (): string => 'tr:games:live',
} as const;
