import { z } from 'zod';

const MIN_DURATION_SEC = 60;
const MAX_DURATION_SEC = 86_400;
const MIN_MAX_PLAYERS = 2;
const MAX_MAX_PLAYERS = 100;

// Base-unit amount: a non-negative integer string, never a float.
const baseUnitAmount = z
  .string()
  .regex(/^[0-9]+$/, 'amount must be a base-unit integer string')
  .refine((value) => BigInt(value) > 0n, 'amount must be greater than zero');

export const createGameSchema = z.object({
  entryAmount: baseUnitAmount,
  durationSec: z.coerce.number().int().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC).optional(),
  maxPlayers: z.coerce.number().int().min(MIN_MAX_PLAYERS).max(MAX_MAX_PLAYERS).optional(),
});

const MAX_STRATEGY_PROMPT_CHARS = 2000;
const strategyPrompt = z.string().trim().min(1).max(MAX_STRATEGY_PROMPT_CHARS);
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 20-byte hex address');

export const joinGameSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  strategyPrompt: strategyPrompt.optional(),
  ownerAddress: evmAddress.optional(),
});

export const listGamesQuerySchema = z.object({
  status: z.enum(['open', 'live', 'all']).default('open'),
});

export const startGameSchema = z.object({
  force: z.boolean().optional(),
});

export const updateStrategySchema = z.object({
  strategyPrompt,
});

export const unlockAchievementSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export type CreateGameBody = z.infer<typeof createGameSchema>;
export type JoinGameBody = z.infer<typeof joinGameSchema>;
export type StartGameBody = z.infer<typeof startGameSchema>;
export type UpdateStrategyBody = z.infer<typeof updateStrategySchema>;
