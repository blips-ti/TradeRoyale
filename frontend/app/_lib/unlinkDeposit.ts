"use client";

/**
 * Real Unlink deposit, run entirely in the browser. The backend custodies the player's
 * shielded account; it hands the OWNER the account keys (GET …/unlink-account, auth-gated),
 * and here we rebuild that account client-side and deposit the entry funds into it from the
 * user's Privy wallet (one approve+deposit). The backend's DepositWatcher then confirms.
 *
 * The SDK is imported dynamically so its WASM/proving code never enters the SSR/initial bundle.
 */

import { API_URL } from "./api";
import type { UnlinkAccountExport } from "./types";

const UNLINK_ENV = process.env.NEXT_PUBLIC_UNLINK_ENVIRONMENT || "base-sepolia";

/** Minimal EIP-1193 surface (what Privy's wallet provider exposes). */
export type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export type DepositPhase = "preparing" | "registering" | "depositing" | "confirming";

export async function depositEntry(opts: {
  playerId: string;
  token: string;
  amount: string; // base-unit string
  exported: UnlinkAccountExport;
  provider: Eip1193;
  onPhase?: (p: DepositPhase) => void;
}): Promise<{ txId: string; txHash?: string | null }> {
  const { playerId, token, amount, exported, provider, onPhase } = opts;
  onPhase?.("preparing");

  const { account, evm, createUnlinkClient } = await import("@unlink-xyz/sdk/client");

  // Rebuild the BE-custodied account in-browser (deposit-only use of the keys).
  const keys = await account.import(exported);
  const unlinkAccount = account.fromKeys(keys);

  // Registration + auth-token go through our backend; tag the player via x-player-id.
  const customFetch: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (url.includes("/api/unlink/")) headers.set("x-player-id", playerId);
    return fetch(input, { ...init, headers });
  };

  const client = createUnlinkClient({
    environment: UNLINK_ENV,
    account: unlinkAccount,
    registerUrl: `${API_URL}/api/unlink/register`,
    authorizationToken: { url: `${API_URL}/api/unlink/authorization-token` },
    customFetch,
  });

  onPhase?.("registering");
  await client.ensureRegistered();

  // The user's Privy wallet is the source of public funds — it signs approve + deposit.
  onPhase?.("depositing");
  const handle = await client.depositWithApproval({
    token,
    amount,
    evm: evm.fromEip1193({ provider }),
  });

  onPhase?.("confirming");
  const result = await handle.wait();
  return { txId: result.txId, txHash: result.txHash };
}
