import { PrivyClient } from '@privy-io/node';
import { describe, expect, it, vi } from 'vitest';

import type { PrivyTypedData } from './privyService.js';
import { PrivyService } from './privyService.js';

const CHAIN_ID = 8453;
const WALLET_ID = 'wallet-1';
const ROUTER = '0x1111111111111111111111111111111111111111';
const BASE_REQUEST = { to: ROUTER, data: '0xswapdata' };
const DID = 'did:privy:abc123';
const EXTERNAL_WALLET = '0xeeee000000000000000000000000000000000001';
const EMBEDDED_WALLET = '0xffff000000000000000000000000000000000002';

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

const PERMIT2_TYPED_DATA: PrivyTypedData = {
  domain: { name: 'Permit2', chainId: CHAIN_ID, verifyingContract: ROUTER },
  types: {
    PermitWitnessTransferFrom: [{ name: 'permitted', type: 'TokenPermissions' }],
    TokenPermissions: [{ name: 'token', type: 'address' }],
  },
  primaryType: 'PermitWitnessTransferFrom',
  message: { spender: ROUTER, nonce: '1', deadline: '999' },
};

interface CapturedTypedData {
  params: { typed_data: { domain: unknown; types: unknown; primary_type: string; message: unknown } };
}

function buildSigningService(): {
  service: PrivyService;
  signTypedData: ReturnType<typeof vi.fn<(walletId: string, input: CapturedTypedData) => Promise<{ signature: string }>>>;
} {
  const signTypedData = vi.fn(async () => ({ signature: '0xsig', encoding: 'hex' as const }));
  const ethereum = vi.fn(() => ({ signTypedData }));
  const wallets = vi.fn(() => ({ ethereum }));
  const client = { wallets } as unknown as PrivyClient;
  return { service: new PrivyService(CHAIN_ID, client), signTypedData };
}

describe('PrivyService.signTypedData', () => {
  it('maps the standard primaryType/message shape to Privy snake_case primary_type and returns the signature', async () => {
    const { service, signTypedData } = buildSigningService();
    const signature = await service.signTypedData(WALLET_ID, PERMIT2_TYPED_DATA);

    expect(signature).toBe('0xsig');
    const [walletId, input] = signTypedData.mock.calls[0]!;
    expect(walletId).toBe(WALLET_ID);
    const typed = input.params.typed_data;
    expect(typed.primary_type).toBe('PermitWitnessTransferFrom');
    expect(typed.message).toEqual(PERMIT2_TYPED_DATA.message);
    expect(typed.domain).toEqual(PERMIT2_TYPED_DATA.domain);
    expect(typed.types).toEqual(PERMIT2_TYPED_DATA.types);
  });

  it('propagates a Privy signing failure to the caller', async () => {
    const { service, signTypedData } = buildSigningService();
    signTypedData.mockRejectedValueOnce(new Error('tee down'));
    await expect(service.signTypedData(WALLET_ID, PERMIT2_TYPED_DATA)).rejects.toThrow('tee down');
  });
});

interface LinkedAccount {
  type: string;
  chain_type?: string;
  wallet_client?: string;
  address?: string;
}

function buildUsersService(linkedAccounts: LinkedAccount[]): {
  service: PrivyService;
  getUser: ReturnType<typeof vi.fn>;
} {
  const getUser = vi.fn(async () => ({ id: DID, linked_accounts: linkedAccounts }));
  const users = vi.fn(() => ({ _get: getUser }));
  const client = { users } as unknown as PrivyClient;
  return { service: new PrivyService(CHAIN_ID, client), getUser };
}

describe('PrivyService.resolveDepositorAddress', () => {
  it("prefers the user's external ethereum wallet when both external and embedded are linked", async () => {
    const { service, getUser } = buildUsersService([
      { type: 'wallet', chain_type: 'ethereum', wallet_client: 'privy', address: EMBEDDED_WALLET },
      { type: 'wallet', chain_type: 'ethereum', wallet_client: 'unknown', address: EXTERNAL_WALLET },
    ]);
    const address = await service.resolveDepositorAddress(DID);
    expect(getUser).toHaveBeenCalledWith(DID);
    expect(address).toBe(EXTERNAL_WALLET);
  });

  it('falls back to the embedded Privy login wallet when no external wallet is linked', async () => {
    const { service } = buildUsersService([
      { type: 'wallet', chain_type: 'ethereum', wallet_client: 'privy', address: EMBEDDED_WALLET },
    ]);
    expect(await service.resolveDepositorAddress(DID)).toBe(EMBEDDED_WALLET);
  });

  it('returns null when no ethereum wallet is linked at all', async () => {
    const { service } = buildUsersService([{ type: 'email' }]);
    expect(await service.resolveDepositorAddress(DID)).toBeNull();
  });

  it('returns null (never throws) when the Privy user lookup fails', async () => {
    const getUser = vi.fn(async () => {
      throw new Error('not found');
    });
    const users = vi.fn(() => ({ _get: getUser }));
    const client = { users } as unknown as PrivyClient;
    const service = new PrivyService(CHAIN_ID, client);
    expect(await service.resolveDepositorAddress(DID)).toBeNull();
  });
});
