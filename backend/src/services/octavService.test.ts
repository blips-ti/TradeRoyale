import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MissingOctavCredentialsError, OctavError, OctavService } from './octavService.js';

const BASE_URL = 'https://api.octav.fi/v1';
const ADDRESS = '0x6426af179aabebe47666f345d69fd9079673f6cd';

// Minimal shape of a /wallet entry: total networth + the wallet bucket's per-chain assets.
function walletBody(overrides: { networth?: string } = {}): unknown {
  return [
    {
      address: ADDRESS,
      networth: overrides.networth ?? '1235564.43434',
      assetByProtocols: {
        wallet: {
          chains: {
            base: {
              protocolPositions: {
                WALLET: {
                  assets: [
                    { symbol: 'usdc', name: 'USD Coin', value: '0.1', balance: '0.1', price: '1', contract: '0xusdc', chainKey: 'base', imgSmall: 'http://img/usdc' },
                    // Zero-value spam token — must be filtered out of holdings.
                    { symbol: 'spam', name: 'Spam', value: '0', balance: '999', price: '0', contract: '0xspam', chainKey: 'base' },
                  ],
                },
              },
            },
          },
        },
      },
    },
  ];
}

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('OctavService.getWallet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hits /wallet (no includeImages), parses networth + holdings, and sends the Bearer key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => walletBody(),
      text: async () => '',
    } as Response);
    const result = await new OctavService(BASE_URL, 'key-123').getWallet(ADDRESS);
    expect(result.navUsd).toBe('1235564.43434');
    // Zero-value spam token dropped; only the real holding remains, with its logo.
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]).toMatchObject({ symbol: 'usdc', valueUsd: '0.1', image: 'http://img/usdc' });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE_URL}/wallet?addresses=${ADDRESS}`);
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer key-123' });
  });

  it('throws MissingOctavCredentialsError when no API key is configured', async () => {
    await expect(new OctavService(BASE_URL, undefined).getWallet(ADDRESS)).rejects.toBeInstanceOf(MissingOctavCredentialsError);
  });

  it('throws OctavError on a non-2xx response', async () => {
    mockFetchOnce({ error: 'Unauthorized' }, false, 401);
    await expect(new OctavService(BASE_URL, 'key-123').getWallet(ADDRESS)).rejects.toBeInstanceOf(OctavError);
  });

  it('defaults a missing networth field to "0"', async () => {
    mockFetchOnce([{ address: ADDRESS }]);
    const result = await new OctavService(BASE_URL, 'key-123').getWallet(ADDRESS);
    expect(result.navUsd).toBe('0');
    expect(result.holdings).toEqual([]);
  });
});
