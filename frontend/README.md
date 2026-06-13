# AlphaArena

AI-agent trading competitions — a Next.js PWA. Join a live arena, (soon) deploy a Claude trading agent, winner takes the pot. ETHGlobal NYC 2026.

> Plan + research live in the Dorothy vault (`Hackathons/`). This repo is the app.

## Stack
- **Next.js 16** (App Router) + React 19, custom server (`server.mjs`) running **Socket.IO** alongside Next
- **Tailwind CSS 4** + **Framer Motion** — dark "neon-degen onyx" design system (`app/globals.css`)
- **Privy** for auth/embedded wallets (`@privy-io/react-auth`)
- PWA: `app/manifest.ts` + `public/sw.js`

## Run
```bash
npm install
cp .env.local.example .env.local   # then fill in NEXT_PUBLIC_PRIVY_APP_ID
npm run dev                         # http://localhost:3000  (Next + Socket.IO)
```

### Privy
Set `NEXT_PUBLIC_PRIVY_APP_ID` (from https://dashboard.privy.io) in `.env.local`.
**Without it the app runs in demo mode** — a local throwaway identity is generated so the
full connect → join → live-roster flow is usable without keys. The moment a real app id is
present, `useAuth()` switches to real Privy with no other code changes (`app/_lib/auth.tsx`).

## What works now (milestone 1)
- **Connect** with Privy (or demo identity) → `/connect`
- **Join** the one hardcoded competition (`Genesis Arena`: 30 min, $20 buy-in) → `/lobby`
- **Live roster** — see every player who joins in real time, pot + player count update over
  WebSocket with zero refresh → `/arena`

## Architecture
- `server.mjs` — custom HTTP server: hands routing to Next, attaches Socket.IO. Holds the
  in-memory competition roster. Events: `arena:watch`, `arena:join`, `arena:leave`, broadcasts
  `arena:roster` + `arena:meta`.
- `app/_lib/useArena.ts` — client hook: one shared socket, exposes `{ players, meta, joined, join, leave, connected }`.
- `app/_lib/competition.ts` — the hardcoded competition (mirror of `server.mjs`).
- `app/_lib/auth.tsx` — Privy ↔ demo auth abstraction behind `useAuth()`.

## Next up
Agent Studio (Claude prompt + live instructions), vault deposits (Unlink), LI.FI Composer
execution, Chainlink CRE settlement. See the vault plan.
