import { PrivyClient } from '@privy-io/node';

import { env } from '../env.js';
import { logger } from '../logger.js';

export interface PlayerWallet {
  walletId: string;
  address: string;
}

export interface PrivyTransactionRequest {
  to: string;
  data: string;
  value: string;
}

export interface PrivySendOptions {
  sponsor: boolean;
}

export class MissingPrivyCredentialsError extends Error {}

// Sole adapter around @privy-io/node. Each player gets a TEE-backed server wallet that
// trades publicly on Base; gas is app-sponsored via `sponsor: true` (EIP-7702 + paymaster,
// billed to app gas credits — no master ETH-drip wallet).
export class PrivyService {
  private static instance: PrivyService;
  private client: PrivyClient | undefined;

  constructor(private readonly chainId: number = env.CHAIN_ID) {}

  static getInstance(): PrivyService {
    if (!PrivyService.instance) {
      PrivyService.instance = new PrivyService();
    }
    return PrivyService.instance;
  }

  // Lazy: a placeholder app id/secret never blocks boot; only constructs on first use.
  private getClient(): PrivyClient {
    if (this.client) return this.client;
    if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) {
      throw new MissingPrivyCredentialsError('PRIVY_APP_ID / PRIVY_APP_SECRET are not set');
    }
    this.client = new PrivyClient({ appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET });
    return this.client;
  }

  async createPlayerWallet(): Promise<PlayerWallet> {
    const wallet = await this.getClient().wallets().create({ chain_type: 'ethereum' });
    return { walletId: wallet.id, address: wallet.address };
  }

  // Sends an EVM transaction from the player's server wallet on eip155:${CHAIN_ID}. Value is
  // always "0" (we only ever call approve/swap calldata; the agent never moves native ETH).
  async sendTransaction(
    walletId: string,
    request: PrivyTransactionRequest,
    options: PrivySendOptions,
  ): Promise<string> {
    try {
      const result = await this.getClient()
        .wallets()
        .ethereum()
        .sendTransaction(walletId, {
          caip2: `eip155:${this.chainId}`,
          sponsor: options.sponsor,
          params: {
            transaction: {
              to: request.to,
              data: request.data,
              value: request.value,
              chain_id: this.chainId,
            },
          },
        });
      return result.hash;
    } catch (error) {
      logger.warn({ walletId, err: error }, '[privy] sendTransaction failed');
      throw error;
    }
  }
}

export const privyService = PrivyService.getInstance();
