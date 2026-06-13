# 👑 TradeRoyale — frontend

The TradeRoyale PWA. Browse live trading **Matches**, connect a wallet, deploy a Claude AI agent,
and battle live — winner takes the pot. ETHGlobal NYC 2026.

> Project docs (brand kit, research) live at the repo root: [`../README.md`](../README.md),
> [`../BRAND.md`](../BRAND.md), [`../docs/RESEARCH.md`](../docs/RESEARCH.md).

## Stack
- **Next.js 16** (App Router) + React 19, custom server (`server.mjs`) running **Socket.IO** alongside Next
- **Tailwind CSS 4** + **Framer Motion** — dark gamified design system (`app/globals.css`); fonts **Chakra Petch** + **JetBrains Mono**
- **Privy** for auth / embedded wallets (`@privy-io/react-auth`)
- PWA: `app/manifest.ts` + `public/sw.js` (crown icon in `public/icon-crown.*`)

## Run
```bash
cd frontend
npm install
cp .env.local.example .env.local   # then fill in NEXT_PUBLIC_PRIVY_APP_ID
npm run dev                         # http://localhost:3000  (Next + Socket.IO)
```

### Privy
Set `NEXT_PUBLIC_PRIVY_APP_ID` (from https://dashboard.privy.io) in `.env.local`. Without it the
app still runs and is fully browsable — the connect button just shows a "configure Privy" notice
instead of opening the login modal. No mock identity is ever created.

## Flow (mocked data except Privy login)
1. **Splash** (`/connect`) → **Join Battle** → the dashboard (no wallet needed to browse).
2. **Dashboard** (`/dashboard`) — Matches grouped into **Ongoing** (sorted by soonest start) and
   **Live** (animated red, sorted by time remaining), with live stats. **Connect** lives in the header.
3. **Match detail** (`/match/[id]`) — banner, briefing, prize/entry/players. **Connect wallet to join**
   if disconnected; otherwise **deposit-to-join** (buy-in locked in the pool, no leaving).
4. **Agent Studio** (`/match/[id]/setup`) — name + persona + strategy prompt. No API keys (runs on our infra).
5. **The Arena** (`/match/[id]/live`) — locked full-screen once the Match starts: chat to your agent,
   live NAV/PnL (via Octav), a Polymarket-style multiplayer chart, standings, and a **Victory Royale** reveal.
6. **Profile** (`/profile`) — wallet, current Match, and **Achievements/XP** (Level button → sheet of
   metallic shield badges; the best badge sits on your avatar). Connecting unlocks "First Contact" with a
   full-screen confetti celebration.

## Architecture
- `server.mjs` — custom HTTP server: routes to Next, attaches Socket.IO (presence roster scaffold).
- `app/_lib/auth.tsx` — real Privy behind `useAuth()`; the app is browsable without connecting, login is
  triggered on demand (header **Connect** or a join attempt).
- `app/_lib/store.ts` — Zustand (persisted): joined Match + agent config (one Match at a time, no leaving).
- `app/_lib/matches.ts` — mocked Matches with live relative-time countdowns.
- `app/_lib/achievements.ts` + `app/_components/Badge.tsx` / `AchievementsSheet.tsx` / `AchievementWatcher.tsx`
  — XP/levels, rarity badges, and the unlock celebration.

## Next up
Real Claude agents wired to the LI.FI MCP, Unlink-shielded vault deposits, LI.FI Composer execution,
and Chainlink CRE settlement on Base. See [`../docs/RESEARCH.md`](../docs/RESEARCH.md).
