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

// EIP-712 typed data in the standard `eth_signTypedData_v4` shape (matches viem/Privy field
// names). The Unlink adapter maps its Permit2 typed data into this before calling signTypedData.
export interface PrivyTypedData {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export class MissingPrivyCredentialsError extends Error {}

// Privy transaction-status values (mirrors @privy-io/node Transaction.status). A broadcasted
// hash is enough to hand off to the on-chain receipt wait; the failure set must NEVER resolve
// to an empty hash.
const BROADCASTED_STATUSES = ['broadcasted', 'confirmed', 'finalized'] as const;
const FAILED_STATUSES = ['failed', 'execution_reverted', 'provider_error', 'replaced'] as const;

// Sponsored sends return an empty hash + a transaction_id; we poll Privy for the real hash.
// Bounded so a stuck tx can never hang a caller indefinitely (the old empty-hash bug).
const POLL_INTERVAL_MS = 1_500;
const POLL_MAX_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS = 90_000;

type PrivyTxStatus =
  | 'broadcasted'
  | 'confirmed'
  | 'execution_reverted'
  | 'failed'
  | 'replaced'
  | 'finalized'
  | 'provider_error'
  | 'pending';

interface PrivyTransactionStatus {
  status: PrivyTxStatus;
  transaction_hash: string | null;
}

// The player deposits the entry from their embedded Privy login wallet (wallet_client 'privy'),
// which is where the payout returns. An external linked wallet ('unknown') is preferred when
// present; the server's trading wallet is created via wallets().create() and is NOT linked here.
const EXTERNAL_ETHEREUM_WALLET = 'unknown';
const EMBEDDED_PRIVY_WALLET = 'privy';

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
  // Sponsored sends (EIP-7702/paymaster) broadcast asynchronously: Privy returns an EMPTY hash
  // plus a transaction_id, so we poll for the real hash and NEVER hand a caller an empty string.
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
      if (result.hash) return result.hash;
      if (result.transaction_id) return await this.resolveSponsoredHash(walletId, result.transaction_id);
      throw new Error('Privy sendTransaction returned no hash and no transaction_id');
    } catch (error) {
      logger.warn({ walletId, err: error }, '[privy] sendTransaction failed');
      throw error;
    }
  }

  // Polls Privy's transaction-status API (direct get-by-id) for a sponsored tx until it has a
  // broadcasted hash, fails, or the bounded timeout elapses. Always returns a real hash or throws.
  private async resolveSponsoredHash(walletId: string, transactionId: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let interval = POLL_INTERVAL_MS;
    while (Date.now() < deadline) {
      const tx = await this.getTransactionStatus(transactionId);
      if (this.isFailedStatus(tx.status)) {
        throw new Error(`Privy sponsored tx ${transactionId} ${tx.status} (wallet ${walletId})`);
      }
      if (this.isBroadcastedStatus(tx.status) && tx.transaction_hash) {
        logger.info({ walletId, transactionId, status: tx.status }, '[privy] sponsored tx resolved');
        return tx.transaction_hash;
      }
      await this.sleep(Math.min(interval, deadline - Date.now()));
      interval = Math.min(interval * 2, POLL_MAX_INTERVAL_MS);
    }
    logger.info({ walletId, transactionId, status: 'timeout' }, '[privy] sponsored tx polling timed out');
    throw new Error(`Privy sponsored tx ${transactionId} not confirmed in time`);
  }

  // Direct get-by-id on the top-level transactions resource — cleaner than the per-wallet list
  // scan (no chain mapping, no token/asset filter required).
  private async getTransactionStatus(transactionId: string): Promise<PrivyTransactionStatus> {
    const tx = await this.getClient().transactions().get(transactionId);
    return { status: tx.status, transaction_hash: tx.transaction_hash };
  }

  private isBroadcastedStatus(status: PrivyTxStatus): boolean {
    return (BROADCASTED_STATUSES as readonly string[]).includes(status);
  }

  private isFailedStatus(status: PrivyTxStatus): boolean {
    return (FAILED_STATUSES as readonly string[]).includes(status);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Signs EIP-712 typed data with a player's server wallet (TEE-backed). Used by the Unlink
  // adapter to produce the Permit2 deposit signature. Maps the standard `primaryType`/`message`
  // shape to Privy's snake_case `primary_type` wire field; returns the 0x-hex signature.
  async signTypedData(walletId: string, typedData: PrivyTypedData): Promise<string> {
    try {
      const result = await this.getClient()
        .wallets()
        .ethereum()
        .signTypedData(walletId, {
          params: {
            typed_data: {
              domain: typedData.domain,
              types: typedData.types,
              primary_type: typedData.primaryType,
              message: typedData.message,
            },
          },
        });
      return result.signature;
    } catch (error) {
      logger.warn({ walletId, err: error }, '[privy] signTypedData failed');
      throw error;
    }
  }

  // Resolves the user's own funding wallet from their Privy DID for the shielded payout. Prefers
  // a linked EXTERNAL ethereum wallet (wallet_client 'unknown'), falling back to the embedded
  // Privy login wallet ('privy') the user deposits from. Returns null only with no ethereum wallet.
  async resolveDepositorAddress(ownerId: string): Promise<string | null> {
    try {
      const user = await this.getClient().users()._get(ownerId);
      const ethereumWallets = user.linked_accounts.filter(
        (account) =>
          account.type === 'wallet' &&
          'chain_type' in account &&
          account.chain_type === 'ethereum' &&
          'address' in account &&
          !!account.address,
      );
      const external = ethereumWallets.find(
        (account) => 'wallet_client' in account && account.wallet_client === EXTERNAL_ETHEREUM_WALLET,
      );
      const embedded = ethereumWallets.find(
        (account) => 'wallet_client' in account && account.wallet_client === EMBEDDED_PRIVY_WALLET,
      );
      const selected = external ?? embedded;
      // wallet_client values only (never addresses of unrelated accounts) so we can debug which
      // wallet was picked without leaking linked-wallet PII.
      const walletClients = user.linked_accounts
        .filter((account) => account.type === 'wallet' && 'wallet_client' in account)
        .map((account) => ('wallet_client' in account ? account.wallet_client : null));
      const source = external ? 'external' : embedded ? 'embedded' : 'none';
      logger.info({ ownerId, walletClients, source }, '[privy] resolveDepositorAddress linked accounts');
      if (selected && 'address' in selected) return selected.address;
      return null;
    } catch (error) {
      logger.warn({ ownerId, err: error }, '[privy] resolveDepositorAddress failed');
      return null;
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
