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
  type AccountExportPayload,
  type EvmProvider,
  type UnlinkClient,
} from "@unlink-xyz/sdk/client";
import { english, generateMnemonic } from "viem/accounts";

import { env } from "../env.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { logger } from "../logger.js";
import { privyService, PrivyService } from "./privyService.js";
import { viemReader, ViemReader } from "./viemClient.js";

// Derived from the client surface so it tracks canary drift without a separate import
// (the SDK does not re-export TransactionListData from its public entry points).
type UnlinkTransactions = Awaited<ReturnType<UnlinkClient["getTransactions"]>>;

// Re-exported so callers stay decoupled from the SDK entry point (all drift contained here).
export type { AccountExportPayload } from "@unlink-xyz/sdk/client";

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

interface PrivyEvmProviderDeps {
  walletId: string;
  address: string;
  privy: PrivyService;
  viem: ViemReader;
}

// Builds an Unlink EvmProvider backed by a Privy server wallet: sponsored sendTransaction (the
// Permit2 approve), TEE signTypedData (the Permit2 witness), and a viem-backed allowance read.
function buildPrivyEvmProvider(deps: PrivyEvmProviderDeps): EvmProvider {
  return evm.fromSigner({
    address: deps.address,
    sendTransaction: (tx) =>
      deps.privy.sendTransaction(
        deps.walletId,
        { to: tx.to, data: tx.data, value: tx.value ? tx.value.toString() : "0" },
        { sponsor: true },
      ),
    // The SDK's typed data carries the EIP-712 payload under `value`; Privy/eth_signTypedData_v4
    // expect it under `message`, so remap that single field. domain/types/primaryType pass through.
    signTypedData: (typedData) =>
      deps.privy.signTypedData(deps.walletId, {
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.value,
      }),
    getErc20Allowance: async (params) => deps.viem.getErc20Allowance(params.token, params.owner, params.spender),
  });
}

// Single adapter around the canary @unlink-xyz/sdk. All drift is contained here.
export class UnlinkService {
  private static instance: UnlinkService;
  private admin: UnlinkAdmin | undefined;
  private readonly clients = new Map<string, UnlinkClient>();

  constructor(
    private readonly privy: PrivyService = privyService,
    private readonly viem: ViemReader = viemReader,
  ) {}

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

  // Exports the player's Unlink account keys so the OWNER can fund their own vault from the
  // browser (deposit-only use; auth-gated to the owner upstream). Custody is unchanged — the BE
  // keeps the encrypted secret and still reads balances / withdraws to the agent wallet.
  async exportAccount(context: PlayerClientContext): Promise<AccountExportPayload> {
    const mnemonic = this.decryptContext(context);
    const unlinkAccount = account.fromMnemonic({ mnemonic });
    const keys = await unlinkAccount.getAccountKeys();
    return account.export(keys);
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

  // Deposits funds from a player's Privy wallet into Unlink (Phase-3 winner shielding). The SDK
  // runs an on-chain ERC-20 approve to Permit2 (sponsored Privy tx), then the relayer pulls the
  // funds via Permit2 PermitWitnessTransferFrom — which requires the Privy wallet's EIP-712
  // signature over the witness typed data. depositWithApproval needs getErc20Allowance, so the
  // provider supplies a viem-backed reader; it sequences approve→sign→deposit internally.
  async depositFromPrivyWallet(request: DepositFromPrivyRequest): Promise<void> {
    const client = this.getOrBuildClient(request.unlinkAddress, {
      unlinkAddress: request.unlinkAddress,
      encMnemonic: request.encMnemonic,
    });
    const evm = buildPrivyEvmProvider({
      walletId: request.privyWalletId,
      address: request.privyWalletAddress,
      privy: this.privy,
      viem: this.viem,
    });
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
