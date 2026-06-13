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

  constructor(
    private readonly chainId: number = env.CHAIN_ID,
    private client: PrivyClient | undefined = undefined,
  ) {}

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

  // Verifies a Privy access token (issued to the browser on login) and returns the Privy
  // user id (DID) — the canonical, tamper-proof user identity used to authorize actions.
  async verifyAccessToken(accessToken: string): Promise<string> {
    const result = await this.getClient().utils().auth().verifyAccessToken(accessToken);
    return result.user_id;
  }

  async createPlayerWallet(): Promise<PlayerWallet> {
    const wallet = await this.getClient().wallets().create({ chain_type: 'ethereum' });
    return { walletId: wallet.id, address: wallet.address };
  }

  // Privy requires transaction.value as a 0x-hex string. Callers pass mixed forms (decimal "0"
  // for approve/transfer, LI.FI's 0x-hex for native swaps); toHexValue canonicalizes them.
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
              value: this.toHexValue(request.value),
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

  // Canonical lowercase 0x-hex for Privy's value field. BigInt() parses both decimal ("0",
  // "1000000000000000000") and hex ("0x0", "0xde0b6b3a7640000"); empty/missing → "0x0".
  private toHexValue(value?: string): string {
    if (!value) return '0x0';
    return `0x${BigInt(value).toString(16)}`;
  }
}

export const privyService = PrivyService.getInstance();
