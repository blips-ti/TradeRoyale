import type { MiddlewareHandler } from 'hono';

import { privyService } from '../services/privyService.js';

// The verified Privy user id (DID) is stashed on the request context for handlers.
export interface AuthVariables {
  userId: string;
}

export class UnauthorizedError extends Error {}

const BEARER_PREFIX = 'Bearer ';

// Requires a valid Privy access token (Authorization: Bearer <token>); 401 otherwise.
// Sets `userId` (the verified Privy DID) for downstream ownership checks.
export function requireAuth(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;
    if (!token) throw new UnauthorizedError('Missing bearer token');
    c.set('userId', await verifyToken(token));
    await next();
  };
}

async function verifyToken(token: string): Promise<string> {
  try {
    return await privyService.verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
