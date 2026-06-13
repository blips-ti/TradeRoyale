import { createPublicClient, erc20Abi, http, type PublicClient } from 'viem';
import { base, baseSepolia } from 'viem/chains';

import { env } from '../env.js';

type Address = `0x${string}`;
type Hash = `0x${string}`;

const RECEIPT_TIMEOUT_MS = 120_000;

// Thin wrapper over a viem public client for Base. Used for erc20 reads (balance/allowance,
// multicall) and confirming Privy-broadcast transactions.
export class ViemReader {
  private static instance: ViemReader;
  private client: PublicClient | undefined;

  static getInstance(): ViemReader {
    if (!ViemReader.instance) {
      ViemReader.instance = new ViemReader();
    }
    return ViemReader.instance;
  }

  // Lazy so boot never depends on RPC reachability. The chain is required so viem knows the
  // multicall3 address (getErc20Balances uses multicall) and the native currency/explorer.
  private getClient(): PublicClient {
    if (this.client) return this.client;
    const chain = env.CHAIN_ID === baseSepolia.id ? baseSepolia : base;
    this.client = createPublicClient({ chain, transport: http(env.BASE_RPC_URL) }) as PublicClient;
    return this.client;
  }

  async getErc20Balance(token: string, owner: string): Promise<string> {
    const balance = await this.getClient().readContract({
      address: token as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner as Address],
    });
    return balance.toString();
  }

  // Native (ETH on Base) balance of an address, in wei as a string.
  async getNativeBalance(owner: string): Promise<string> {
    const balance = await this.getClient().getBalance({ address: owner as Address });
    return balance.toString();
  }

  async getErc20Allowance(token: string, owner: string, spender: string): Promise<string> {
    const allowance = await this.getClient().readContract({
      address: token as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner as Address, spender as Address],
    });
    return allowance.toString();
  }

  // Multicall the erc20 balances of several tokens for one owner, keyed by lowercased token.
  async getErc20Balances(tokens: string[], owner: string): Promise<Record<string, string>> {
    const results = await this.getClient().multicall({
      contracts: tokens.map((token) => ({
        address: token as Address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [owner as Address],
      })),
    });
    const entries = tokens.map((token, index): [string, string] => {
      const result = results[index];
      const value = result && result.status === 'success' ? (result.result as bigint).toString() : '0';
      return [token.toLowerCase(), value];
    });
    return Object.fromEntries(entries);
  }

  // ONE multicall reading balanceOf(owner) of a single token for every owner, keyed by
  // lowercased owner. The single RPC call that scores every trader's wallet at settlement.
  async getErc20BalancesForOwners(token: string, owners: string[]): Promise<Record<string, string>> {
    const results = await this.getClient().multicall({
      contracts: owners.map((owner) => ({
        address: token as Address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [owner as Address],
      })),
    });
    const entries = owners.map((owner, index): [string, string] => {
      const result = results[index];
      const value = result && result.status === 'success' ? (result.result as bigint).toString() : '0';
      return [owner.toLowerCase(), value];
    });
    return Object.fromEntries(entries);
  }

  async waitForReceipt(hash: string): Promise<void> {
    await this.getClient().waitForTransactionReceipt({ hash: hash as Hash, timeout: RECEIPT_TIMEOUT_MS });
  }
}

export const viemReader = ViemReader.getInstance();
