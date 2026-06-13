"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Real Privy auth — no mock identities.

   `useAuth()` exposes { ready, authenticated, user, login, logout, configured }.
   login() opens the real Privy modal. If NEXT_PUBLIC_PRIVY_APP_ID is missing the
   app still renders but `configured` is false so the connect screen can tell you
   to add the key (instead of silently faking a user).
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { handleFor } from "./format";
import { setAuthTokenGetter } from "./api";

export type AuthUser = {
  id: string;
  address: string | null;
  name: string;
};

type AuthCtx = {
  ready: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  configured: boolean;
};

const Ctx = React.createContext<AuthCtx | null>(null);

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!APP_ID) {
    return <Unconfigured>{children}</Unconfigured>;
  }
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#c5f72b",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: { createOnLogin: "users-without-wallets" },
        loginMethods: ["email", "wallet", "google", "farcaster"],
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();

  // Hand the API client a way to fetch the live access token for Authorization headers.
  React.useEffect(() => {
    setAuthTokenGetter(getAccessToken);
  }, [getAccessToken]);

  const value = React.useMemo<AuthCtx>(() => {
    const address =
      user?.wallet?.address ??
      (user?.linkedAccounts?.find((a) => "address" in a) as { address?: string } | undefined)?.address ??
      null;
    return {
      ready,
      authenticated,
      configured: true,
      user:
        authenticated && user
          ? { id: user.id, address, name: handleFor(address ?? user.id) }
          : null,
      login,
      logout,
    };
  }, [ready, authenticated, user, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** No Privy app id configured — render, but never fake a login. */
function Unconfigured({ children }: { children: React.ReactNode }) {
  const value = React.useMemo<AuthCtx>(
    () => ({
      ready: true,
      authenticated: false,
      configured: false,
      user: null,
      login: () => {
        // eslint-disable-next-line no-alert
        alert("Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local to enable Privy login.");
      },
      logout: () => {},
    }),
    [],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
