# Backend changes needed for the frontend integration

For the BE engineer. These are **additive** and scoped to unblock the TradeRoyale FE wiring to real data. Ordered by priority. (Full context: vault "TradeRoyale — FE ↔ BE Integration Plan".)

> **Status:** #1 (CORS), #4 (list live/all), #5 (player counts) are **✅ DONE** (committed, `npm build/lint/test` green). Remaining: #2 (live navUsd), #3 (/instruct), #6 (display metadata, optional).

> Locked product decisions: **Base mainnet**, **interactive live chat** (talk to your agent mid-game), **full Unlink browser deposit**, every player deposits the game's `entryAmount` (no seed; admin creates games), `displayName` = the agent's competing name.

---

## 1. CORS — **blocker** 🔴

`src/app.ts` has no CORS, so the browser FE (Vercel + localhost) can't call the API or open the WS. Add `hono/cors`:

```ts
import { cors } from 'hono/cors';
// before routes:
app.use('*', cors({
  origin: (origin) => origin, // or an allowlist: [FE_VERCEL_URL, 'http://localhost:3001']
  allowHeaders: ['content-type', 'x-player-id'],
  allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  credentials: true,
}));
```
Prefer an **env-driven allowlist** (`CORS_ORIGINS`) over `*` once the Vercel URL is known.

---

## 2. Live per-player NAV broadcast — for the Arena chart 🟠

The FE Arena shows each player's **live NAV** and a multi-line PnL chart. There's currently **no live trading NAV** exposed (it's computed only inside the agent's `get_portfolio` and at settlement). Please emit it each tick. Either:

- **(preferred) new event** `portfolio_update`:
  ```ts
  { type: 'portfolio_update', gameId, ts, data: { playerId: string, navUsd: string /* decimal USD or base-unit USDC — say which */, pnlUsd?: string } }
  ```
  emit right after each agent tick computes `totalUSD` in `get_portfolio` (the value already exists), **or**
- add `navUsd` to the existing `agent_update` event payload.

The FE keys one chart series per `playerId` and derives live standings from the latest `navUsd`. Please document the **unit/decimals** of `navUsd`.

---

## 3. Live instruction endpoint — for interactive chat 🟠

Decision is **interactive** chat (operator talks to their agent mid-game). Add:

```
POST /games/:gameId/players/:playerId/instruct   body: { message: string }  (1–2000 chars)
→ { ok: true }
```
Store the **latest** instruction (e.g. `tr:player:{id}:instruction`); the agent's next-turn first-message includes it ("Live instruction from your operator: …"). Optionally broadcast `agent_message { playerId, role: 'operator'|'agent', text, ts }` so the FE chat shows both sides. Only valid while the game is `live`.

---

## 4. List live games (or all) — for the dashboard "Live" section 🟡

`GET /games` is **lobby-only**, so the FE can't show a Live section (only the user's own live game, fetched by id). Please add one of:
- `GET /games?status=live|all`, or
- `GET /games/live`, returning live `Game[]` (so people can spectate live Matches).

Not a blocker (we fall back to the user's own game), but needed for the full dashboard.

---

## 5. (nice-to-have) player count on the list 🟢

`GET /games` returns `Game[]` with no player counts; the FE currently does an N+1 `GET /games/:id` per game to count players. A `playerCount` (and maybe `confirmedCount`) field on each list item removes the extra calls.

---

## 6. (nice-to-have) display metadata on Game 🟢

The FE derives a name/tags from the gameId (no BE name). If you want real Match names/tags/description, accept optional `name`, `description`, `tags[]` on `POST /games` and return them on `Game`. Otherwise the FE keeps deriving them — fine for the demo.

---

## Dev/ops notes
- **Ports:** BE defaults to `:3000`; the FE dev server also wants `:3000`. Run the FE on a different port (`PORT=3001 next dev`) and set FE `NEXT_PUBLIC_API_URL=http://localhost:3000`. In prod, FE (Vercel) → BE (Railway URL).
- **WS on Railway:** ensure the Railway service allows WebSocket upgrades on `/ws/games/:id` (it's raw `@hono/node-ws`, not Socket.IO).
- **Network:** confirm `UNLINK_ENVIRONMENT` is set to Unlink's **Base-mainnet** env name (their docs only list testnets) so deposits and trading are on the same chain.
- The FE already mirrors your types and event names exactly (`frontend/app/_lib/{types,api,units,useGameSocket}.ts`); if any field/shape changes, ping so we keep them in sync.
