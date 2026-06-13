import { describe, expect, it, vi } from 'vitest';

import type { LifiService } from './lifiService.js';
import type { PrivyService } from './privyService.js';
import { TradeExecutor } from './tradeExecutor.js';
import type { ViemReader } from './viemClient.js';

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ROUTER = '0x1111111111111111111111111111111111111111';
const SPENDER = '0x2222222222222222222222222222222222222222';
const WALLET = { privyWalletId: 'wallet-1', privyWalletAddress: '0x3333333333333333333333333333333333333333' };
const INPUT = { fromToken: USDC, toToken: WETH, fromAmount: '1000000' };
const NATIVE_INPUT = { fromToken: NATIVE, toToken: USDC, fromAmount: '1000000000000000000' };

const PROTOCOL_CALL_INPUT = {
  fromToken: USDC,
  toToken: WETH,
  toAmount: '1000000000000000',
  toContractAddress: '0x9999999999999999999999999999999999999999',
  toContractCallData: '0xd0e30db0',
  toContractGasLimit: '200000',
};

function buildExecutor(allowance: string, fromTokenIsNative = false, value = '0') {
  const quote = {
    transactionRequest: { to: ROUTER, data: '0xswapdata', value },
    approvalAddress: SPENDER,
    fromAmount: '1000000',
    toAmount: '1000000000000000',
    toAmountMin: '999000000000000',
    toolUsed: 'uniswap',
    fromTokenIsNative,
  };
  // Contract-call quote: LI.FI computes a larger fromAmount; output fields are "0".
  const contractQuote = {
    transactionRequest: { to: ROUTER, data: '0xzapdata', value },
    approvalAddress: SPENDER,
    fromAmount: '1742000000',
    toAmount: '0',
    toAmountMin: '0',
    toolUsed: 'custom',
    fromTokenIsNative,
  };
  const lifi = {
    getQuote: vi.fn(async () => quote),
    getContractCallsQuote: vi.fn(async () => contractQuote),
  } as unknown as LifiService;
  const privy = {
    sendTransaction: vi
      .fn<PrivyService['sendTransaction']>()
      .mockResolvedValueOnce('0xapprovehash')
      .mockResolvedValueOnce('0xswaphash'),
  } as unknown as PrivyService;
  const viem = {
    getErc20Allowance: vi.fn(async () => allowance),
    waitForReceipt: vi.fn(async () => undefined),
  } as unknown as ViemReader;
  return { executor: new TradeExecutor(lifi, privy, viem), lifi, privy, viem };
}

describe('TradeExecutor.executeSwap', () => {
  it('quotes with the wallet as fromAddress, approves then swaps when allowance is insufficient', async () => {
    const { executor, lifi, privy, viem } = buildExecutor('0');
    const result = await executor.executeSwap(WALLET, INPUT);

    expect(lifi.getQuote).toHaveBeenCalledWith(expect.objectContaining({ fromAddress: WALLET.privyWalletAddress }));
    expect(privy.sendTransaction).toHaveBeenCalledTimes(2);
    // First call is the approve to the token, second is the swap to the router.
    const calls = (privy.sendTransaction as ReturnType<typeof vi.fn>).mock.calls;
    const approveCall = calls[0]!;
    const swapCall = calls[1]!;
    expect(approveCall[0]).toBe('wallet-1');
    expect(approveCall[1].to).toBe(USDC);
    expect(approveCall[2]).toEqual({ sponsor: true });
    expect(swapCall[1]).toEqual({ to: ROUTER, data: '0xswapdata', value: '0' });
    expect(viem.waitForReceipt).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ txHash: '0xswaphash', status: 'confirmed', toAmountMin: '999000000000000', tool: 'uniswap' });
  });

  it('skips the approve transaction when allowance already covers the amount', async () => {
    const { executor, privy, viem } = buildExecutor('1000000');
    const result = await executor.executeSwap(WALLET, INPUT);

    expect(privy.sendTransaction).toHaveBeenCalledTimes(1);
    const swapCall = (privy.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(swapCall[1].to).toBe(ROUTER);
    expect(viem.waitForReceipt).toHaveBeenCalledTimes(1);
    expect(result.txHash).toBe('0xapprovehash');
  });

  it('skips approval and forwards the quote value for a native source', async () => {
    const { executor, privy, viem } = buildExecutor('0', true, '0xde0b6b3a7640000');
    const result = await executor.executeSwap(WALLET, NATIVE_INPUT);

    expect(viem.getErc20Allowance).not.toHaveBeenCalled();
    expect(privy.sendTransaction).toHaveBeenCalledTimes(1);
    const swapCall = (privy.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(swapCall[1]).toEqual({ to: ROUTER, data: '0xswapdata', value: '0xde0b6b3a7640000' });
    expect(result.txHash).toBe('0xapprovehash');
  });

  it('approves the LI.FI-computed quote.fromAmount, not the model-supplied input', async () => {
    // quote.fromAmount (1500000) differs from the model input (1000000); approve must use the
    // computed value (encoded as 0x...16e360) and the result reports the quote's fromAmount.
    const lifi = { getQuote: vi.fn(async () => ({
      transactionRequest: { to: ROUTER, data: '0xswapdata', value: '0' },
      approvalAddress: SPENDER,
      fromAmount: '1500000',
      toAmount: '1000000000000000',
      toAmountMin: '999000000000000',
      toolUsed: 'uniswap',
      fromTokenIsNative: false,
    })) } as unknown as LifiService;
    const privy = {
      sendTransaction: vi.fn<PrivyService['sendTransaction']>().mockResolvedValueOnce('0xapprovehash').mockResolvedValueOnce('0xswaphash'),
    } as unknown as PrivyService;
    const viem = { getErc20Allowance: vi.fn(async () => '0'), waitForReceipt: vi.fn(async () => undefined) } as unknown as ViemReader;
    const result = await new TradeExecutor(lifi, privy, viem).executeSwap(WALLET, INPUT);

    const approveCall = (privy.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(approveCall[1].data.toLowerCase()).toContain((1500000).toString(16));
    expect(result.fromAmount).toBe('1500000');
  });
});

describe('TradeExecutor.executeContractCall', () => {
  it('approves the LI.FI-computed input then executes the contract-call transactionRequest', async () => {
    const { executor, lifi, privy, viem } = buildExecutor('0');
    const result = await executor.executeContractCall(WALLET, PROTOCOL_CALL_INPUT);

    expect(lifi.getContractCallsQuote).toHaveBeenCalledWith(
      expect.objectContaining({ fromAddress: WALLET.privyWalletAddress, toAmount: PROTOCOL_CALL_INPUT.toAmount }),
    );
    // Allowance is checked against the computed fromAmount (1742000000), not the toAmount.
    expect(viem.getErc20Allowance).toHaveBeenCalledWith(USDC, WALLET.privyWalletAddress, SPENDER);
    const calls = (privy.sendTransaction as ReturnType<typeof vi.fn>).mock.calls;
    const approveCall = calls[0]!;
    const zapCall = calls[1]!;
    expect(approveCall[1].to).toBe(USDC);
    expect(zapCall[1]).toEqual({ to: ROUTER, data: '0xzapdata', value: '0' });
    expect(result).toMatchObject({ txHash: '0xswaphash', status: 'confirmed', fromAmount: '1742000000', toAmount: '0', tool: 'custom' });
  });

  it('skips approval when allowance already covers the computed input', async () => {
    const { executor, privy } = buildExecutor('2000000000');
    await executor.executeContractCall(WALLET, PROTOCOL_CALL_INPUT);
    expect(privy.sendTransaction).toHaveBeenCalledTimes(1);
  });
});
