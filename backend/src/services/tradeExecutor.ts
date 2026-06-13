import { BigNumber } from "bignumber.js";
import { encodeFunctionData, erc20Abi } from "viem";

import { logger } from "../logger.js";
import { isNativeToken, lifiService, LifiService } from "./lifiService.js";
import { privyService, PrivyService } from "./privyService.js";
import { viemReader, ViemReader } from "./viemClient.js";

export interface SwapInput {
  fromToken: string;
  toToken: string;
  fromAmount: string;
}

export interface SwapWalletContext {
  privyWalletId: string;
  privyWalletAddress: string;
}

export interface SwapResult {
  txHash: string;
  status: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmountMin: string;
  tool: string;
}

export interface ContractCallInput {
  fromToken: string;
  toToken: string;
  toAmount: string;
  toContractAddress: string;
  toContractCallData: string;
  toContractGasLimit: string;
}

export interface ContractCallResult {
  txHash: string;
  status: string;
  fromToken: string;
  toToken: string;
  // LI.FI-computed input the wallet spent (derived from the requested toAmount).
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  tool: string;
}

// Composes a public Base swap from an INTENT (never model-supplied calldata): LI.FI is
// re-quoted server-side with the Privy wallet as fromAddress, then LI.FI's own
// transactionRequest is executed via Privy with sponsored gas and confirmed via viem.
// ERC-20 sources get an approve first when the allowance is short; native sources carry the
// quote's value. All trade guards (balance, slippage, live game, ownership) live upstream.
export class TradeExecutor {
  private static instance: TradeExecutor;

  constructor(
    private readonly lifi: LifiService = lifiService,
    private readonly privy: PrivyService = privyService,
    private readonly viem: ViemReader = viemReader,
  ) {}

  static getInstance(): TradeExecutor {
    if (!TradeExecutor.instance) {
      TradeExecutor.instance = new TradeExecutor();
    }
    return TradeExecutor.instance;
  }

  async executeSwap(wallet: SwapWalletContext, input: SwapInput): Promise<SwapResult> {
    const quote = await this.lifi.getQuote({
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      fromAddress: wallet.privyWalletAddress,
    });
    if (!quote.fromTokenIsNative) {
      // Approve the LI.FI-computed input (quote.fromAmount), never the model-supplied amount —
      // consistent with the contractCalls path and immune to a quote that adjusts the input.
      await this.ensureAllowance(wallet, input.fromToken, quote.approvalAddress, quote.fromAmount);
    }
    const swapHash = await this.privy.sendTransaction(
      wallet.privyWalletId,
      {
        to: quote.transactionRequest.to,
        data: quote.transactionRequest.data,
        value: quote.transactionRequest.value,
      },
      { sponsor: true },
    );
    await this.viem.waitForReceipt(swapHash);
    return {
      txHash: swapHash,
      status: "confirmed",
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: quote.fromAmount,
      toAmountMin: quote.toAmountMin,
      tool: quote.toolUsed,
    };
  }

  // Same-chain protocol interaction (deposit/stake/zap) built by LI.FI from the agent's
  // intent. Re-quotes contractCalls server-side, approves the fromToken if needed (the
  // LI.FI-computed fromAmount), then executes LI.FI's own transactionRequest via Privy.
  async executeContractCall(wallet: SwapWalletContext, input: ContractCallInput): Promise<ContractCallResult> {
    const quote = await this.lifi.getContractCallsQuote({
      fromToken: input.fromToken,
      toToken: input.toToken,
      toAmount: input.toAmount,
      fromAddress: wallet.privyWalletAddress,
      toContractAddress: input.toContractAddress,
      toContractCallData: input.toContractCallData,
      toContractGasLimit: input.toContractGasLimit,
    });
    if (!quote.fromTokenIsNative) {
      await this.ensureAllowance(wallet, input.fromToken, quote.approvalAddress, quote.fromAmount);
    }
    const txHash = await this.privy.sendTransaction(
      wallet.privyWalletId,
      {
        to: quote.transactionRequest.to,
        data: quote.transactionRequest.data,
        value: quote.transactionRequest.value,
      },
      { sponsor: true },
    );
    await this.viem.waitForReceipt(txHash);
    return {
      txHash,
      status: "confirmed",
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      toAmountMin: quote.toAmountMin,
      tool: quote.toolUsed,
    };
  }

  // Approve the router only when the current allowance is below the swap amount. Never called
  // for native sources (there is nothing to approve).
  private async ensureAllowance(
    wallet: SwapWalletContext,
    token: string,
    spender: string,
    amount: string,
  ): Promise<void> {
    if (isNativeToken(token)) return;
    const allowance = await this.viem.getErc20Allowance(token, wallet.privyWalletAddress, spender);
    if (new BigNumber(allowance).gte(amount)) return;
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      // viem needs a JS bigint here — convert at this single call site from the base-unit string.
      args: [spender as `0x${string}`, BigInt(new BigNumber(amount).toFixed(0))],
    });
    const approveHash = await this.privy.sendTransaction(
      wallet.privyWalletId,
      { to: token, data: approveData, value: "0" },
      { sponsor: true },
    );
    logger.debug({ walletId: wallet.privyWalletId, approveHash }, "[tradeExecutor] approval sent");
    await this.viem.waitForReceipt(approveHash);
  }
}

export const tradeExecutor = TradeExecutor.getInstance();
