import { PrivyClient } from '@privy-io/node';
import { describe, expect, it, vi } from 'vitest';

import { PrivyService } from './privyService.js';

const CHAIN_ID = 8453;
const WALLET_ID = 'wallet-1';
const ROUTER = '0x1111111111111111111111111111111111111111';
const BASE_REQUEST = { to: ROUTER, data: '0xswapdata' };

interface CapturedPayload {
  caip2: string;
  sponsor: boolean;
  params: { transaction: { to: string; data: string; value: string; chain_id: number } };
}

type SentMock = ReturnType<typeof vi.fn<(walletId: string, payload: CapturedPayload) => Promise<{ hash: string }>>>;

// Builds a PrivyService wired to a mock client so we can assert exactly what value reaches
// Privy's wallets().ethereum().sendTransaction call.
function buildService(): { service: PrivyService; sendTransaction: SentMock } {
  const sendTransaction: SentMock = vi.fn(async () => ({ hash: '0xtxhash' }));
  const ethereum = vi.fn(() => ({ sendTransaction }));
  const wallets = vi.fn(() => ({ ethereum }));
  const client = { wallets } as unknown as PrivyClient;
  const service = new PrivyService(CHAIN_ID, client);
  return { service, sendTransaction };
}

function sentValue(sendTransaction: SentMock): string {
  return sendTransaction.mock.calls[0]![1].params.transaction.value;
}

describe('PrivyService.sendTransaction', () => {
  it('normalizes a decimal "0" value to the hex "0x0" Privy requires', async () => {
    const { service, sendTransaction } = buildService();
    await service.sendTransaction(WALLET_ID, { ...BASE_REQUEST, value: '0' }, { sponsor: true });
    expect(sentValue(sendTransaction)).toBe('0x0');
  });

  it('defaults an empty-string value to "0x0" without calling BigInt("")', async () => {
    const { service, sendTransaction } = buildService();
    await service.sendTransaction(WALLET_ID, { ...BASE_REQUEST, value: '' }, { sponsor: true });
    expect(sentValue(sendTransaction)).toBe('0x0');
  });

  it('defaults an undefined value to "0x0"', async () => {
    const { service, sendTransaction } = buildService();
    await service.sendTransaction(
      WALLET_ID,
      { ...BASE_REQUEST, value: undefined as unknown as string },
      { sponsor: true },
    );
    expect(sentValue(sendTransaction)).toBe('0x0');
  });

  it('canonicalizes a decimal wei value to its 0x-hex form', async () => {
    const { service, sendTransaction } = buildService();
    await service.sendTransaction(
      WALLET_ID,
      { ...BASE_REQUEST, value: '1000000000000000000' },
      { sponsor: true },
    );
    expect(sentValue(sendTransaction)).toBe('0xde0b6b3a7640000');
  });

  it('round-trips an already-hex LI.FI value unchanged', async () => {
    const { service, sendTransaction } = buildService();
    await service.sendTransaction(
      WALLET_ID,
      { ...BASE_REQUEST, value: '0xde0b6b3a7640000' },
      { sponsor: true },
    );
    expect(sentValue(sendTransaction)).toBe('0xde0b6b3a7640000');
  });

  it('forwards the caip2 chain, sponsor flag, to and data alongside the normalized value', async () => {
    const { service, sendTransaction } = buildService();
    const hash = await service.sendTransaction(WALLET_ID, { ...BASE_REQUEST, value: '0' }, { sponsor: true });

    expect(hash).toBe('0xtxhash');
    const [walletId, payload] = sendTransaction.mock.calls[0]!;
    expect(walletId).toBe(WALLET_ID);
    expect(payload.caip2).toBe(`eip155:${CHAIN_ID}`);
    expect(payload.sponsor).toBe(true);
    expect(payload.params.transaction).toMatchObject({ to: ROUTER, data: '0xswapdata', chain_id: CHAIN_ID });
  });
});
