import {
  createUnlinkAdmin,
  createUnlinkAuthRoutes,
  type UnlinkAdmin,
  type UnlinkAuthRouteHandlers,
} from "@unlink-xyz/sdk/admin";
import {
  account,
  createUnlinkClient,
  evm,
  type EvmProvider,
  type UnlinkClient,
} from "@unlink-xyz/sdk/client";
import { english, generateMnemonic } from "viem/accounts";

import { env } from "../env.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { logger } from "../logger.js";
import { privyService, PrivyService } from "./privyService.js";

// Derived from the client surface so it tracks canary drift without a separate import
// (the SDK does not re-export TransactionListData from its public entry points).
type UnlinkTransactions = Awaited<ReturnType<UnlinkClient["getTransactions"]>>;

export interface GameAccount {
  unlinkAddress: string;
  encMnemonic: string;
}

export interface TransferRequest {
  playerId: string;
  unlinkAddress: string;
  encMnemonic: string;
  recipientAddress: string;
  token: string;
  amount: string;
}

interface PlayerClientContext {
  unlinkAddress: string;
  encMnemonic: string;
}

// Releases entry funds out of the shielded pool to a public EVM address (the Privy wallet).
export interface WithdrawToAddressRequest {
  playerId: string;
  unlinkAddress: string;
  encMnemonic: string;
  recipientEvmAddress: string;
  token: string;
  amount: string;
}

// Phase-3 settlement: deposit winnings back into Unlink with the Privy wallet as EVM signer.
export interface DepositFromPrivyRequest {
  unlinkAddress: string;
  encMnemonic: string;
  privyWalletId: string;
  privyWalletAddress: string;
  token: string;
  amount: string;
}

// Builds an Unlink EvmProvider backed by a Privy server wallet. sendTransaction routes to
// Privy (sponsored); signTypedData is the canary-verification stub the payout depends on.
function buildPrivyEvmProvider(walletId: string, address: string, privy: PrivyService): EvmProvider {
  return evm.fromSigner({
    address,
    sendTransaction: (tx) =>
      privy.sendTransaction(
        walletId,
        { to: tx.to, data: tx.data, value: tx.value ? tx.value.toString() : "0" },
        { sponsor: true },
      ),
    // STUB: must sign Unlink's Permit2 typed data via Privy's signTypedData — verify the exact
    // typed-data shape against the canary SDK before enabling payout (currently never reached).
    signTypedData: () => {
      throw new Error("Privy Permit2 signTypedData bridge not implemented (payout disabled in v1)");
    },
  });
}

// Single adapter around the canary @unlink-xyz/sdk. All drift is contained here.
export class UnlinkService {
  private static instance: UnlinkService;
  private admin: UnlinkAdmin | undefined;
  private readonly clients = new Map<string, UnlinkClient>();

  constructor(private readonly privy: PrivyService = privyService) {}

  static getInstance(): UnlinkService {
    if (!UnlinkService.instance) {
      UnlinkService.instance = new UnlinkService();
    }
    return UnlinkService.instance;
  }

  // Lazy so a placeholder API key never blocks app boot; only constructs on first use.
  private getAdmin(): UnlinkAdmin {
    if (this.admin) return this.admin;
    this.admin = createUnlinkAdmin({
      environment: env.UNLINK_ENVIRONMENT,
      apiKey: env.UNLINK_API_KEY,
      dangerouslyAllowBrowser: false,
    });
    return this.admin;
  }

  // Browser-SDK auth routes (register + authorization-token) mounted by the HTTP layer.
  createAuthRoutes(): UnlinkAuthRouteHandlers {
    return createUnlinkAuthRoutes({
      admin: this.getAdmin(),
      authenticate: async (request) => {
        const playerId = request.headers.get("x-player-id");
        if (!playerId) throw new Error("Missing x-player-id header");
        return { playerId };
      },
      authorizeUnlinkAddress: async () => true,
    });
  }

  async createGameAccount(): Promise<GameAccount> {
    const mnemonic = generateMnemonic(english);
    const unlinkAccount = account.fromMnemonic({ mnemonic });
    const unlinkAddress = await unlinkAccount.getAddress();
    const encMnemonic = encryptSecret(mnemonic);
    const client = this.buildClient({ unlinkAddress, encMnemonic });
    await client.ensureRegistered();
    return { unlinkAddress, encMnemonic };
  }

  async getBalances(
    context: PlayerClientContext & { playerId: string },
  ): Promise<Record<string, string>> {
    const client = this.getOrBuildClient(context.playerId, context);
    const data = await client.getBalances();
    return Object.fromEntries(
      data.balances.map((balance) => [
        balance.token.toLowerCase(),
        balance.amount,
      ]),
    );
  }

  async getTokenBalance(
    context: PlayerClientContext & { playerId: string; token: string },
  ): Promise<string> {
    const client = this.getOrBuildClient(context.playerId, context);
    const balance = await client.balanceOf(context.token);
    return balance ?? "0";
  }

  async getTransactions(
    context: PlayerClientContext & { playerId: string },
  ): Promise<UnlinkTransactions> {
    const client = this.getOrBuildClient(context.playerId, context);
    return client.getTransactions();
  }

  async transfer(request: TransferRequest): Promise<void> {
    const client = this.getOrBuildClient(request.playerId, request);
    const handle = await client.transfer({
      token: request.token,
      amount: request.amount,
      recipientAddress: request.recipientAddress,
    });
    await handle.wait();
  }

  // Phase-3 settlement: deposit winnings from a player's Privy wallet back into Unlink.
  // VERIFIED against the canary .d.ts: client.depositWithApproval accepts an external `evm`
  // provider (built via evm.fromSigner) — so the Privy wallet is the signer. STUB REMAINING:
  // EvmProvider.signTypedData must sign Unlink's exact Permit2 typed-data shape via Privy's
  // signTypedData; that bridge needs canary verification before enabling. Gated upstream behind
  // the CRE validator (NoopSettlementValidator), so this never fires in v1.
  async depositFromPrivyWallet(request: DepositFromPrivyRequest): Promise<void> {
    const client = this.getOrBuildClient(request.unlinkAddress, {
      unlinkAddress: request.unlinkAddress,
      encMnemonic: request.encMnemonic,
    });
    const evm = buildPrivyEvmProvider(request.privyWalletId, request.privyWalletAddress, this.privy);
    const handle = await client.depositWithApproval({ token: request.token, amount: request.amount, evm });
    await handle.wait();
  }

  // Releases entry funds from the shielded pool to a public EVM address (the player's Privy
  // wallet) at game start. Awaits the handle so the caller knows the withdrawal is processed.
  async withdrawToAddress(request: WithdrawToAddressRequest): Promise<void> {
    const client = this.getOrBuildClient(request.playerId, request);
    const handle = await client.withdraw({
      recipientEvmAddress: request.recipientEvmAddress,
      token: request.token,
      amount: request.amount,
    });
    await handle.wait();
  }

  // Pings the Engine via the admin handle to confirm reachability for /health/deep.
  async ping(): Promise<void> {
    await this.getAdmin().environment();
  }

  private getOrBuildClient(
    playerId: string,
    context: PlayerClientContext,
  ): UnlinkClient {
    const cached = this.clients.get(playerId);
    if (cached) return cached;
    const client = this.buildClient(context);
    this.clients.set(playerId, client);
    return client;
  }

  private buildClient(context: PlayerClientContext): UnlinkClient {
    const admin = this.getAdmin();
    const mnemonic = this.decryptContext(context);
    const unlinkAccount = account.fromMnemonic({ mnemonic });
    return createUnlinkClient({
      environment: env.UNLINK_ENVIRONMENT,
      account: unlinkAccount,
      register: (payload) => admin.users.register(payload),
      authorizationToken: {
        provider: () =>
          admin.authorizationTokens.issue({
            unlinkAddress: context.unlinkAddress,
          }),
      },
    });
  }

  private decryptContext(context: PlayerClientContext): string {
    try {
      return decryptSecret(context.encMnemonic);
    } catch (error) {
      logger.error(
        { err: error, unlinkAddress: context.unlinkAddress },
        "[unlink] failed to decrypt mnemonic",
      );
      throw new Error("Unable to load custodial account");
    }
  }
}

export const unlinkService = UnlinkService.getInstance();
