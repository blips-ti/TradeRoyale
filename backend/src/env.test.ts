import { describe, expect, it } from 'vitest';

import { envSchema } from './env.js';

// Minimal set of REQUIRED env vars so the schema parses; everything else falls back to defaults.
const BASE_ENV = {
  REDIS_URL: 'rediss://default:pw@host:6379',
  UNLINK_API_KEY: 'unlink-key',
  MNEMONIC_ENCRYPTION_KEY: 'a'.repeat(64),
} as const;

function parseWith(overrides: Record<string, string>): ReturnType<typeof envSchema.parse> {
  return envSchema.parse({ ...BASE_ENV, ...overrides });
}

describe('env MAX_SLIPPAGE_BPS', () => {
  it("defaults to 'auto' when unset", () => {
    expect(parseWith({}).MAX_SLIPPAGE_BPS).toBe('auto');
  });

  it("parses the literal 'auto'", () => {
    expect(parseWith({ MAX_SLIPPAGE_BPS: 'auto' }).MAX_SLIPPAGE_BPS).toBe('auto');
  });

  it("parses 'AUTO' case-insensitively to 'auto'", () => {
    expect(parseWith({ MAX_SLIPPAGE_BPS: 'AUTO' }).MAX_SLIPPAGE_BPS).toBe('auto');
  });

  it('parses a positive integer bps value to a number', () => {
    expect(parseWith({ MAX_SLIPPAGE_BPS: '250' }).MAX_SLIPPAGE_BPS).toBe(250);
  });

  it('rejects a non-auto, out-of-range value', () => {
    expect(() => parseWith({ MAX_SLIPPAGE_BPS: '20000' })).toThrow();
  });

  it('rejects a non-auto, non-integer value', () => {
    expect(() => parseWith({ MAX_SLIPPAGE_BPS: '1.5' })).toThrow();
  });
});

describe('env MAX_PRICE_IMPACT', () => {
  it('defaults to a generous 0.5 decimal fraction', () => {
    expect(parseWith({}).MAX_PRICE_IMPACT).toBe(0.5);
  });

  it('parses a decimal fraction override', () => {
    expect(parseWith({ MAX_PRICE_IMPACT: '0.15' }).MAX_PRICE_IMPACT).toBe(0.15);
  });

  it('rejects a value above 1', () => {
    expect(() => parseWith({ MAX_PRICE_IMPACT: '2' })).toThrow();
  });
});
