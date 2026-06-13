import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MissingOctavCredentialsError, OctavError, OctavService } from './octavService.js';

const BASE_URL = 'https://api.octav.fi/v1';
const ADDRESS = '0x6426af179aabebe47666f345d69fd9079673f6cd';

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('OctavService.getNav', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses the nav number into an exact decimal string and sends the Bearer key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nav: 1235564.43434, currency: 'USD', conversionPrice: 1 }),
      text: async () => '',
    } as Response);
    const result = await new OctavService(BASE_URL, 'key-123').getNav(ADDRESS);
    expect(result.navUsd).toBe('1235564.43434');

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE_URL}/nav?addresses=${ADDRESS}`);
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer key-123' });
  });

  it('throws MissingOctavCredentialsError when no API key is configured', async () => {
    await expect(new OctavService(BASE_URL, undefined).getNav(ADDRESS)).rejects.toBeInstanceOf(MissingOctavCredentialsError);
  });

  it('throws OctavError on a non-2xx response', async () => {
    mockFetchOnce({ error: 'Unauthorized' }, false, 401);
    await expect(new OctavService(BASE_URL, 'key-123').getNav(ADDRESS)).rejects.toBeInstanceOf(OctavError);
  });

  it('defaults a missing nav field to "0"', async () => {
    mockFetchOnce({ currency: 'USD', conversionPrice: 1 });
    const result = await new OctavService(BASE_URL, 'key-123').getNav(ADDRESS);
    expect(result.navUsd).toBe('0');
  });
});
