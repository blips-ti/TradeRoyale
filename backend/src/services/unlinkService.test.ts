import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrivyService } from './privyService.js';
import type { ViemReader } from './viemClient.js';

// Capture the EvmProvider the SDK receives so we can drive its callbacks directly and assert the
// Privy bridge. `evm.fromSigner` is the real SDK helper (it only wraps the options object), so the
// provider's signTypedData/sendTransaction/getErc20Allowance are exactly what unlinkService wired.
interface DepositArgs {
  token: string;
  amount: string;
  evm: {
    signTypedData: (typedData: unknown) => Promise<string>;
    sendTransaction: (tx: { to: string; data: string; value?: bigint }) => Promise<string>;
    getErc20Allowance: (params: { token: string; owner: string; spender: string }) => Promise<string>;
  };
}
interface WithdrawArgs {
  recipientEvmAddress: string;
  token: string;
  amount: string;
}
const handle = { wait: vi.fn(async () => ({ txId: 'tx', status: 'processed' })) };
const depositWithApproval = vi.fn(async (_params: DepositArgs) => handle);
const withdraw = vi.fn(async (_params: WithdrawArgs) => handle);
const ensureRegistered = vi.fn(async () => undefined);

vi.mock('@unlink-xyz/sdk/client', async () => {
  const actual = await vi.importActual<typeof import('@unlink-xyz/sdk/client')>('@unlink-xyz/sdk/client');
  return {
    ...actual,
    createUnlinkClient: vi.fn(() => ({ ensureRegistered, depositWithApproval, withdraw })),
    account: { fromMnemonic: vi.fn(() => ({ getAddress: vi.fn(async () => '0xunlink') })) },
  };
});

vi.mock('@unlink-xyz/sdk/admin', () => ({
  createUnlinkAdmin: vi.fn(() => ({ users: { register: vi.fn() }, authorizationTokens: { issue: vi.fn() } })),
  createUnlinkAuthRoutes: vi.fn(),
}));

vi.mock('../lib/crypto.js', () => ({
  decryptSecret: vi.fn(() => 'test test test test test test test test test test test junk'),
  encryptSecret: vi.fn(() => 'enc'),
}));

const { UnlinkService } = await import('./unlinkService.js');

const PERMIT2_TYPED_DATA = {
  domain: { name: 'Permit2', chainId: 8453, verifyingContract: '0xpermit2' },
  types: { PermitWitnessTransferFrom: [{ name: 'spender', type: 'address' }] },
  primaryType: 'PermitWitnessTransferFrom' as const,
  // The SDK carries the EIP-712 payload under `value`; the bridge must remap it to `message`.
  value: { spender: '0xpool', nonce: '7', deadline: '999' },
};

const DEPOSIT_REQUEST = {
  unlinkAddress: '0xunlink',
  encMnemonic: 'enc',
  privyWalletId: 'wallet-1',
  privyWalletAddress: '0xprivy',
  token: '0xtoken',
  amount: '3000000',
};

function buildService() {
  const signTypedData = vi.fn(async (_walletId: string, _typedData: unknown) => '0xsig');
  const sendTransaction = vi.fn(
    async (_walletId: string, _request: { to: string; data: string; value: string }, _options: { sponsor: boolean }) =>
      '0xtxhash',
  );
  const getErc20Allowance = vi.fn(async (_token: string, _owner: string, _spender: string) => '0');
  const privy = { signTypedData, sendTransaction } as unknown as PrivyService;
  const viem = { getErc20Allowance } as unknown as ViemReader;
  return { service: new UnlinkService(privy, viem), signTypedData, sendTransaction, getErc20Allowance };
}

beforeEach(() => {
  depositWithApproval.mockClear();
  withdraw.mockClear();
});

describe('UnlinkService.depositFromPrivyWallet', () => {
  it('forwards token + amount to depositWithApproval with the Privy-backed EvmProvider', async () => {
    const { service } = buildService();
    await service.depositFromPrivyWallet(DEPOSIT_REQUEST);
    expect(depositWithApproval).toHaveBeenCalledTimes(1);
    const params = depositWithApproval.mock.calls[0]![0];
    expect(params.token).toBe('0xtoken');
    expect(params.amount).toBe('3000000');
    expect(params.evm).toBeDefined();
  });

  it("routes the SDK Permit2 typed data through Privy, remapping the `value` field to `message`", async () => {
    const { service, signTypedData } = buildService();
    await service.depositFromPrivyWallet(DEPOSIT_REQUEST);
    const provider = depositWithApproval.mock.calls[0]![0].evm;

    const signature = await provider.signTypedData(PERMIT2_TYPED_DATA);
    expect(signature).toBe('0xsig');
    const [walletId, typedData] = signTypedData.mock.calls[0]!;
    expect(walletId).toBe('wallet-1');
    expect(typedData).toEqual({
      domain: PERMIT2_TYPED_DATA.domain,
      types: PERMIT2_TYPED_DATA.types,
      primaryType: 'PermitWitnessTransferFrom',
      message: PERMIT2_TYPED_DATA.value,
    });
  });

  it('routes the on-chain approve through Privy as a sponsored transaction', async () => {
    const { service, sendTransaction } = buildService();
    await service.depositFromPrivyWallet(DEPOSIT_REQUEST);
    const provider = depositWithApproval.mock.calls[0]![0].evm;

    const hash = await provider.sendTransaction({ to: '0xtoken', data: '0xapprove', value: 0n });
    expect(hash).toBe('0xtxhash');
    const [walletId, request, options] = sendTransaction.mock.calls[0]!;
    expect(walletId).toBe('wallet-1');
    expect(request).toMatchObject({ to: '0xtoken', data: '0xapprove', value: '0' });
    expect(options).toEqual({ sponsor: true });
  });

  it('reads the ERC-20 allowance via viem for the approval-state check', async () => {
    const { service, getErc20Allowance } = buildService();
    await service.depositFromPrivyWallet(DEPOSIT_REQUEST);
    const provider = depositWithApproval.mock.calls[0]![0].evm;

    const allowance = await provider.getErc20Allowance({ token: '0xtoken', owner: '0xprivy', spender: '0xpermit2' });
    expect(allowance).toBe('0');
    expect(getErc20Allowance).toHaveBeenCalledWith('0xtoken', '0xprivy', '0xpermit2');
  });
});

describe('UnlinkService.withdrawToAddress', () => {
  it('withdraws the shielded pot to the recipient EVM address', async () => {
    const { service } = buildService();
    await service.withdrawToAddress({
      playerId: 'winner',
      unlinkAddress: '0xunlink',
      encMnemonic: 'enc',
      recipientEvmAddress: '0xdepositor',
      token: '0xtoken',
      amount: '3000000',
    });
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(withdraw.mock.calls[0]![0]).toMatchObject({
      recipientEvmAddress: '0xdepositor',
      token: '0xtoken',
      amount: '3000000',
    });
  });
});
