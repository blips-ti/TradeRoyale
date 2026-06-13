import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LifiQuoteError, LifiService } from './lifiService.js';

const CHAIN_ID = 8453;
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH = '0x4200000000000000000000000000000000000006';
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const SEED = [USDC, WETH];
const MAX_SLIPPAGE_BPS = 100;
const MAX_PRICE_IMPACT = 0.5;

// Numeric-cap service: preserves the legacy fixed-slippage + hard-bps-reject behavior.
function buildService(): LifiService {
  return new LifiService(CHAIN_ID, SEED, MAX_SLIPPAGE_BPS, undefined, MAX_PRICE_IMPACT);
}

// Auto-mode service (the new default): defers to LI.FI's liquidity-adaptive slippage, sends a
// generous buffer + maxPriceImpact, and skips the fixed-bps reject.
function buildAutoService(): LifiService {
  return new LifiService(CHAIN_ID, SEED, "auto", undefined, MAX_PRICE_IMPACT);
}

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

const validErc20Quote = {
  tool: 'uniswap',
  transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0x0' },
  estimate: {
    approvalAddress: '0xspender',
    fromAmount: '1000000',
    toAmount: '1000000000000000',
    toAmountMin: '999900000000000',
  },
};

describe('LifiService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getQuote (erc20 source)', () => {
    it('parses a valid erc20 quote with value normalized to "0" and fromTokenIsNative false', async () => {
      mockFetchOnce(validErc20Quote);
      const quote = await buildService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' });
      expect(quote.transactionRequest).toEqual({ to: '0xrouter', data: '0xdeadbeef', value: '0' });
      expect(quote.fromTokenIsNative).toBe(false);
      expect(quote.toAmountMin).toBe('999900000000000');
      expect(quote.toolUsed).toBe('uniswap');
    });

    it('rejects an erc20 quote that carries a non-zero native value', async () => {
      mockFetchOnce({ ...validErc20Quote, transactionRequest: { ...validErc20Quote.transactionRequest, value: '0x5' } });
      await expect(
        buildService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' }),
      ).rejects.toBeInstanceOf(LifiQuoteError);
    });

    it('rejects a quote whose slippage exceeds the configured bps bound', async () => {
      mockFetchOnce({
        ...validErc20Quote,
        estimate: { ...validErc20Quote.estimate, toAmount: '1000000000000000', toAmountMin: '900000000000000' },
      });
      await expect(
        buildService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' }),
      ).rejects.toBeInstanceOf(LifiQuoteError);
    });

    it('rejects a response missing required fields', async () => {
      mockFetchOnce({ tool: 'x', transactionRequest: { to: '0xr' } });
      await expect(
        buildService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' }),
      ).rejects.toBeInstanceOf(LifiQuoteError);
    });

    it('rejects a non-2xx LI.FI response', async () => {
      mockFetchOnce({ message: 'bad request' }, false, 400);
      await expect(
        buildService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' }),
      ).rejects.toBeInstanceOf(LifiQuoteError);
    });
  });

  describe('getQuote (native source)', () => {
    it('keeps the quote value when fromToken is native and the value is non-zero', async () => {
      mockFetchOnce({
        ...validErc20Quote,
        transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0xde0b6b3a7640000' },
      });
      const quote = await buildService().getQuote({ fromToken: NATIVE, toToken: USDC, fromAmount: '1000000000000000000', fromAddress: '0xa' });
      expect(quote.fromTokenIsNative).toBe(true);
      expect(quote.transactionRequest.value).toBe(BigInt('0xde0b6b3a7640000').toString());
    });

    it('rejects a native-source quote that returns a zero value', async () => {
      mockFetchOnce({ ...validErc20Quote, transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0x0' } });
      await expect(
        buildService().getQuote({ fromToken: NATIVE, toToken: USDC, fromAmount: '1000000000000000000', fromAddress: '0xa' }),
      ).rejects.toBeInstanceOf(LifiQuoteError);
    });
  });

  describe('getQuote (auto slippage mode — the default)', () => {
    it('does not hard-reject a quote whose drop exceeds the legacy bps bound', async () => {
      // Same payload the numeric-cap service rejects (10% drop > 100 bps) — auto must accept it.
      mockFetchOnce({
        ...validErc20Quote,
        estimate: { ...validErc20Quote.estimate, toAmount: '1000000000000000', toAmountMin: '900000000000000' },
      });
      const quote = await buildAutoService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' });
      expect(quote.toAmountMin).toBe('900000000000000');
    });

    it('sends a generous slippage buffer and the maxPriceImpact guard on the request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validErc20Quote,
        text: async () => JSON.stringify(validErc20Quote),
      } as Response);
      await buildAutoService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' });
      const url = new URL(String(fetchSpy.mock.calls[0]![0]), 'https://li.quest/v1');
      expect(url.searchParams.get('maxPriceImpact')).toBe(String(MAX_PRICE_IMPACT));
      expect(url.searchParams.get('slippage')).toBe('0.05');
    });

    it('still rejects an erc20 quote that carries a non-zero native value (guards unchanged)', async () => {
      mockFetchOnce({ ...validErc20Quote, transactionRequest: { ...validErc20Quote.transactionRequest, value: '0x5' } });
      await expect(
        buildAutoService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' }),
      ).rejects.toBeInstanceOf(LifiQuoteError);
    });
  });

  describe('getQuote (numeric cap mode) sends a fixed slippage and no maxPriceImpact', () => {
    it('derives slippage from the bps cap and omits maxPriceImpact', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validErc20Quote,
        text: async () => JSON.stringify(validErc20Quote),
      } as Response);
      await buildService().getQuote({ fromToken: USDC, toToken: WETH, fromAmount: '1000000', fromAddress: '0xa' });
      const url = new URL(String(fetchSpy.mock.calls[0]![0]), 'https://li.quest/v1');
      expect(url.searchParams.get('slippage')).toBe('0.01');
      expect(url.searchParams.get('maxPriceImpact')).toBeNull();
    });
  });

  describe('getTokens', () => {
    it('returns only seed tokens with lowercased addresses', async () => {
      mockFetchOnce({
        tokens: {
          [String(CHAIN_ID)]: [
            { address: USDC.toUpperCase(), symbol: 'USDC', decimals: 6, name: 'USD Coin', priceUSD: '1' },
            { address: WETH, symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', priceUSD: '1740.38' },
            { address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', symbol: 'SPAM', decimals: 18, priceUSD: '0' },
          ],
        },
      });
      const tokens = await buildService().getTokens();
      expect(tokens.map((token) => token.address).sort()).toEqual([USDC, WETH].sort());
      expect(tokens.find((token) => token.address === USDC)?.priceUSD).toBe('1');
    });
  });

  describe('getPrices', () => {
    it('maps the requested token addresses to priceUSD', async () => {
      mockFetchOnce({
        tokens: {
          [String(CHAIN_ID)]: [
            { address: USDC, symbol: 'USDC', decimals: 6, name: 'USD Coin', priceUSD: '1' },
            { address: WETH, symbol: 'WETH', decimals: 18, name: 'Wrapped Ether', priceUSD: '1740.38' },
          ],
        },
      });
      const prices = await buildService().getPrices([USDC, WETH]);
      expect(prices[USDC]).toBe('1');
      expect(prices[WETH]).toBe('1740.38');
    });
  });

  describe('getContractCallsQuote', () => {
    const contractCallsRequest = {
      fromToken: USDC,
      toToken: WETH,
      toAmount: '1000000000000000',
      fromAddress: '0xa',
      toContractAddress: '0xprotocol',
      toContractCallData: '0xd0e30db0',
      toContractGasLimit: '200000',
    };

    it('POSTs toAmount and returns the LI.FI-computed fromAmount (input/output asymmetry)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tool: 'custom',
          action: { fromChainId: CHAIN_ID, toChainId: CHAIN_ID },
          transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0x0' },
          estimate: { approvalAddress: '0xspender', fromAmount: '1742000000', toAmount: '0', toAmountMin: '0' },
        }),
        text: async () => '',
      } as Response);

      const quote = await buildService().getContractCallsQuote(contractCallsRequest);
      // Output accounting is the protocol's: estimate toAmount/toAmountMin "0" is surfaced, not gated.
      expect(quote.fromAmount).toBe('1742000000');
      expect(quote.toAmount).toBe('0');
      expect(quote.toAmountMin).toBe('0');
      expect(quote.toolUsed).toBe('custom');

      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toContain('/quote/contractCalls');
      expect((init as RequestInit).method).toBe('POST');
      const sent = JSON.parse((init as RequestInit).body as string);
      expect(sent.fromChain).toBe(String(CHAIN_ID));
      expect(sent.toChain).toBe(String(CHAIN_ID));
      expect(sent.toAmount).toBe('1000000000000000');
      expect(sent.contractCalls[0].toContractCallData).toBe('0xd0e30db0');
      // Numeric-cap mode pins a fixed slippage and does NOT send maxPriceImpact.
      expect(sent.slippage).toBe('0.01');
      expect(sent.maxPriceImpact).toBeUndefined();
    });

    it('sends the generous slippage + maxPriceImpact in auto mode', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tool: 'custom',
          action: { fromChainId: CHAIN_ID, toChainId: CHAIN_ID },
          transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0x0' },
          estimate: { approvalAddress: '0xspender', fromAmount: '1742000000', toAmount: '0', toAmountMin: '0' },
        }),
        text: async () => '',
      } as Response);

      await buildAutoService().getContractCallsQuote(contractCallsRequest);
      const sent = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
      expect(sent.slippage).toBe('0.05');
      expect(sent.maxPriceImpact).toBe(MAX_PRICE_IMPACT);
    });

    it('rejects a quote whose action is not same-chain Base', async () => {
      mockFetchOnce({
        tool: 'custom',
        action: { fromChainId: CHAIN_ID, toChainId: 42161 },
        transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0x0' },
        estimate: { approvalAddress: '0xspender', fromAmount: '1', toAmount: '0', toAmountMin: '0' },
      });
      await expect(buildService().getContractCallsQuote(contractCallsRequest)).rejects.toBeInstanceOf(LifiQuoteError);
    });

    it('rejects a response missing the transactionRequest or approvalAddress', async () => {
      mockFetchOnce({ tool: 'custom', estimate: { fromAmount: '1' } });
      await expect(buildService().getContractCallsQuote(contractCallsRequest)).rejects.toBeInstanceOf(LifiQuoteError);
    });

    it('rejects a response missing the computed fromAmount (never falls back to 0)', async () => {
      mockFetchOnce({
        tool: 'custom',
        action: { fromChainId: CHAIN_ID, toChainId: CHAIN_ID },
        transactionRequest: { to: '0xrouter', data: '0xdeadbeef', value: '0x0' },
        // approvalAddress present but fromAmount missing — must error, not pass on "0".
        estimate: { approvalAddress: '0xspender', toAmount: '0', toAmountMin: '0' },
      });
      await expect(buildService().getContractCallsQuote(contractCallsRequest)).rejects.toBeInstanceOf(LifiQuoteError);
    });
  });
});
