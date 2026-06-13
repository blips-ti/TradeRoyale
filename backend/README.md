# Trade Royal — Backend (PoC)

Backend for **Trade Royal**, a 1-hour AI-agent trading competition. Players privately stake
USDC into the [Unlink](https://docs.unlink.xyz) protocol for entry custody; at game start the
entry is released to a per-player [Privy](https://docs.privy.io) server wallet, and a
Claude-powered agent trades it **publicly on Base** with Privy-sponsored gas. The best final
USDC value wins.

- **Stack:** TypeScript (strict, ESM), Node 24, Hono + `@hono/node-server`, `@hono/node-ws`.
- **State:** Redis only (Upstash) — no Postgres. JSON values under namespaced keys.
- **Entry custody:** `@unlink-xyz/sdk` (canary) — private entry deposits + (Phase 3) private
  settlement, behind one adapter (`unlinkService`).
- **Public trading:** `@privy-io/node` server wallets (one per player, TEE-backed) that
  execute LI.FI swaps on Base; gas is app-sponsored (`sponsor: true`). All Privy drift is in
  `privyService`; swap composition lives in `tradeExecutor`.
- **Routing:** [LI.FI](https://docs.li.fi) quotes (REST + hosted MCP connector).
- **No private packages** — builds with zero npm auth.

> **Scope:** the game is **Base-only** (chainId 8453). The agent may trade **any token LI.FI
> can quote on Base** (no hard whitelist) via plain swaps, AND perform same-chain **protocol
> interactions** (deposits / staking / zaps) via LI.FI contract calls. **Bridging / cross-chain
> is out of scope** and rejected. Same-chain LI.FI contract calls are confirmed working against
> the live `POST /v1/quote/contractCalls` endpoint (`fromChain == toChain == 8453`) — note this
> endpoint is marked **BETA** by LI.FI.

---

## Player flow

1. **Join** a lobby game (`POST /games/:gameId/join`). The backend mints a fresh custodial
   Unlink account (mnemonic generated server-side, AES-256-GCM encrypted at rest) **and** a
   Privy server wallet on Base, returning the `unlinkAddress`.
2. **Deposit (browser, non-custodial).** The player privately deposits USDC into *their own*
   Unlink account via the browser SDK, authenticating through `/api/unlink/*`.
3. **Private transfer** of the exact entry amount from the player's own Unlink account to the
   game `unlinkAddress`.
4. **Auto-confirm.** A background `DepositWatcher` flips the player to `confirmed` once the
   entry-token balance covers the entry amount, snapshots the starting balance, and broadcasts
   `deposit_confirmed`.
5. **Start → release funds.** Once all players are confirmed (or an admin force-starts with ≥2
   confirmed), the game goes `live`. The entry is **withdrawn from Unlink to each player's Privy
   wallet** (`unlink.withdraw`), the player is marked funds-`released`, and `funds_released` is
   broadcast. Agent ticks for a player begin only after their funds are released.
6. **Public trading.** Each player's Claude agent trades the Privy wallet on Base via LI.FI
   swaps (gas sponsored). The `GameClock` ends the game at `endsAt`.

---

## API

Base URL defaults to `http://localhost:3000`.

### `GET /healthcheck`
```json
{ "status": "ok" }
```

### `GET /health/deep`
Checks Redis ping + Unlink admin reachability. Returns `503` if either is down.
```json
{ "status": "ok", "redis": { "ok": true }, "unlink": { "ok": true } }
```

### `POST /games`
Create a game in `lobby`. `entryAmount` is in **base units** (USDC has 6 decimals, so
`1000000` = 1 USDC). `entryToken` is taken from `ENTRY_TOKEN_ADDRESS`.

Request:
```json
{ "entryAmount": "1000000", "durationSec": 3600, "maxPlayers": 10 }
```
Response `201`:
```json
{
  "id": "f1e2...",
  "status": "lobby",
  "entryToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "entryAmount": "1000000",
  "durationSec": 3600,
  "maxPlayers": 10,
  "createdAt": "2026-06-12T19:00:00.000Z"
}
```

### `GET /games`
List open (joinable) games: `{ "games": [ ...Game ] }`.

### `GET /games/:gameId`
Game plus its players (public fields only — `encMnemonic` is never exposed):
```json
{
  "game": { "id": "f1e2...", "status": "lobby", "...": "..." },
  "players": [
    { "id": "p1", "displayName": "alice", "unlinkAddress": "unlink1...", "depositStatus": "pending" }
  ]
}
```

### `POST /games/:gameId/join`
Body `{ "displayName": "alice", "strategyPrompt": "buy WETH on dips" }`. `strategyPrompt`
is optional (max 2000 chars) and becomes the player's trading-agent directive. Mints a
custodial game account and registers the player. `409` if the game is not in `lobby` or is
full.

Response `201`:
```json
{
  "playerId": "p1",
  "unlinkAddress": "unlink1...",
  "deposit": {
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000000",
    "instructions": "Deposit into your own Unlink account, then transfer this exact amount to the unlinkAddress above"
  }
}
```

### `PUT /games/:gameId/players/:playerId/strategy`
Body `{ "strategyPrompt": "rotate into WETH when momentum is up" }` (1–2000 chars). Sets or
replaces the player's agent directive. Allowed only while the game is in `lobby` (`409`
once live). Returns `{ "player": PublicPlayer }`.

### `POST /games/:gameId/start`
Body `{ "force": false }`. Requires every player `confirmed`; with `force: true` it needs
≥2 confirmed. Transitions to `live`, sets `startedAt` / `endsAt`, broadcasts `game_started`,
**releases each confirmed player's entry from Unlink to their Privy wallet** (broadcasting
`funds_released` per player), then starts the per-player trading agents. `409` if not in
`lobby` or the confirmation rule fails.

### `GET /games/:gameId/players/:playerId`
Player public fields plus the Unlink-side entry-custody balances (keyed by lowercased token
address, base units). `privyWalletAddress`, `fundsStatus`, and `lastAgentSummary` appear as
the player progresses. (Live trading balances live on the Privy wallet — the agent reads them
internally via viem; this endpoint reflects the Unlink custody side.)
```json
{
  "player": {
    "id": "p1",
    "displayName": "alice",
    "unlinkAddress": "unlink1...",
    "depositStatus": "confirmed",
    "privyWalletAddress": "0xabc...",
    "fundsStatus": "released",
    "lastAgentSummary": "Swapped 100 USDC into WETH on a dip."
  },
  "entryToken": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "balances": { "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "1000000" }
}
```

### `GET /games/:gameId/trades`
The per-game agent trade log (most recent last): `{ "trades": Trade[] }` where
`Trade = { id, gameId, playerId, kind, fromToken, toToken, fromAmount, toAmountMin, tool, txHash, status, createdAt, description? }`
where `kind` is `'swap' | 'contract_call'` and `description` is the agent's summary of a `contract_call`.

### `GET /games/:gameId/results`
The persisted Phase-3 settlement (`null` until the game has settled): `{ "settlement": Settlement | null }`
where `Settlement = { gameId, winnerPlayerId, prizePoolUsdc, perPlayer: PlayerResult[], computedAt, payoutStatus, payouts? }`,
`payoutStatus` is `'pending'` until the winner-take-all payout runs, then `'executed' | 'partial' | 'failed'`
(see Settlement section), `payouts` is the per-transfer audit `{ playerId, amount, txHash?, ok }[]`,
and `PlayerResult = { rank, playerId, displayName, privyWalletAddress, startingBalance, finalUsdc, octavNavUsd, pnl }`.
`finalUsdc` (on-chain USDC after liquidation) is the source-of-truth score; `octavNavUsd` is an independent cross-check.

### Unlink browser-SDK auth routes
- `POST /api/unlink/register` — registers a browser user with Unlink.
- `POST /api/unlink/authorization-token` — issues a short-lived per-address token.

Both are provided by the Unlink admin SDK (`createUnlinkAuthRoutes`). For this PoC,
authentication accepts any request carrying a non-empty `x-player-id` header.

---

## WebSocket event contract (for the UI team)

Connect (upgrade) to `GET /ws/games/:gameId`. The socket receives JSON events:

```ts
type GameEvent = {
  type:
    | 'player_joined'
    | 'deposit_confirmed'
    | 'game_started'
    | 'game_tick'
    | 'game_ended'
    | 'funds_released'
    | 'agent_update'
    | 'trade_executed'
    | 'player_liquidated';
  gameId: string;
  ts: number;          // epoch ms
  data: Record<string, unknown>;
};
```

| `type`              | `data` payload                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| `player_joined`     | `{ player: PublicPlayer }`                                                 |
| `deposit_confirmed` | `{ player: PublicPlayer, startingBalance: string }`                       |
| `game_started`      | `{ startedAt: string, endsAt: string, confirmedPlayers: number }`        |
| `game_tick`         | `{ secondsRemaining: number }` — emitted every 30s while live            |
| `funds_released`    | `{ playerId: string }` — entry withdrawn from Unlink to the Privy wallet  |
| `agent_update`      | `{ playerId: string, summary: string }` — a player's agent finished a tick |
| `trade_executed`    | `{ playerId, kind, fromToken, toToken, fromAmount, toAmountMin, txHash, description? }` — `kind` is `swap` or `contract_call` |
| `player_liquidated` | `{ playerId: string, ok: boolean }` — emitted per player during settlement |
| `game_ended`        | `{ results: PlayerResult[] }` — the RANKED settlement results (Phase 3)   |

`PublicPlayer = { id, displayName, unlinkAddress, depositStatus, privyWalletAddress?, fundsStatus?, lastAgentSummary? }`.
`PlayerResult = { rank, playerId, displayName, privyWalletAddress, startingBalance, finalUsdc, octavNavUsd, pnl }`.

---

## Environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
# generate the mnemonic encryption key
openssl rand -hex 32
```

| Var                        | Required | Default                                      | Notes |
| -------------------------- | -------- | -------------------------------------------- | ----- |
| `PORT`                     | no       | `3000`                                       | |
| `REDIS_URL`                | yes      | —                                            | Upstash `rediss://` (TLS) URL |
| `UNLINK_API_KEY`           | yes      | —                                            | from `dashboard.unlink.xyz` (server-only) |
| `UNLINK_ENVIRONMENT`       | no       | `base-sepolia` (testnet)                     | hosted Unlink environment name — **still a testnet default**; see the network note below |
| `ENTRY_TOKEN_ADDRESS`      | no       | Base **mainnet** USDC `0x8335...02913`       | Base Sepolia testnet USDC is `0x036CbD...3dCF7e` |
| `MNEMONIC_ENCRYPTION_KEY`  | yes      | —                                            | 32-byte hex (`openssl rand -hex 32`) |
| `DEPOSIT_POLL_INTERVAL_MS` | no       | `5000`                                       | deposit watcher cadence |
| `LOG_LEVEL`                | no       | `info`                                       | pino level |
| `ANTHROPIC_API_KEY`        | no\*     | —                                            | required only once a game starts; client is lazy-built so boot never crashes without it |
| `AGENT_MODEL`              | no       | `claude-opus-4-8`                            | Claude model the trading agents run on |
| `MIN_LOOP_INTERVAL_MS`     | no       | `10000`                                      | hard floor between an agent's turns (cost backstop); enforced even if the agent asks to wait less |
| `DEFAULT_WAIT_SECONDS`     | no       | `30`                                         | wait applied after a turn when the agent didn't call the `wait` tool |
| `AGENT_MAX_TURNS_PER_GAME` | no       | `0`                                          | hard turn cap per player per game (`0` = unlimited) |
| `LIFI_API_KEY`             | no       | —                                            | LI.FI key — REST `x-lifi-api-key` header AND LI.FI MCP `Authorization: Bearer`. Raises the MCP rate limit (see below) |
| `AGENT_USE_LIFI_MCP`       | no       | `true`                                       | link the agent to LI.FI's hosted MCP via the Anthropic MCP connector |
| `LIFI_MCP_URL`             | no       | `https://mcp.li.quest/mcp`                   | LI.FI hosted MCP endpoint (Streamable HTTP) |
| `PRIVY_APP_ID`             | no\*     | —                                            | Privy app id (dashboard.privy.io); lazy — required once a game starts |
| `PRIVY_APP_SECRET`         | no\*     | —                                            | Privy app secret; lazy — required once a game starts |
| `BASE_RPC_URL`             | no       | `https://mainnet.base.org`                   | public Base RPC for erc20/native reads + receipt waits |
| `CHAIN_ID`                 | no       | `8453`                                       | the only chain trades run on (8453 = Base); cross-chain rejected |
| `TRADEABLE_TOKENS`         | no       | Base USDC + WETH                             | display / portfolio-seed set — NOT a whitelist (agent may trade any LI.FI token on Base) |
| `MAX_SLIPPAGE_BPS`         | no       | `auto`                                       | `auto` (default) → LI.FI liquidity-adaptive slippage on every quote (no fixed-bps reject); a positive integer (≤ 10000) pins a fixed bps cap + hard reject |
| `MAX_PRICE_IMPACT`         | no       | `0.5`                                        | auto-mode guard: LI.FI maxPriceImpact decimal (0.5 = 50%); ignored when `MAX_SLIPPAGE_BPS` is a number |
| `OCTAV_API_KEY`            | no\*     | —                                            | Octav NAV API key (`data.octav.fi`), Bearer; lazy — only hit at settlement |
| `OCTAV_API_URL`            | no       | `https://api.octav.fi/v1`                     | Octav public API base URL |
| `LIQUIDATION_MIN_USDC`     | no       | `1000000`                                    | settlement dust floor (1 USDC); smaller positions are not liquidated |

Env is validated at boot with zod (`src/env.ts`). Missing or malformed values fail fast.
`*` `ANTHROPIC_API_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, and `OCTAV_API_KEY` are enforced
lazily — the app boots without them, but the respective clients throw (`MissingAnthropicKeyError`,
`MissingPrivyCredentialsError`, `MissingOctavCredentialsError`) when first used. Phase-3
liquidation/scoring is **server-driven** and does NOT depend on the agent or Anthropic.

> **Network consistency (Base mainnet).** All network defaults are Base **mainnet**:
> `CHAIN_ID=8453`, `BASE_RPC_URL=https://mainnet.base.org`, `ENTRY_TOKEN_ADDRESS` = mainnet
> USDC, `TRADEABLE_TOKENS` = mainnet, and Octav on mainnet. **One value is intentionally NOT
> defaulted to mainnet:** `UNLINK_ENVIRONMENT` still defaults to the testnet `base-sepolia`,
> because Unlink's published [supported chains](https://docs.unlink.xyz/supported-chains) list
> only names testnet environments (no Base-mainnet env name yet). **Before a real mainnet
> game you must set `UNLINK_ENVIRONMENT` to Unlink's Base-mainnet environment name** (obtain it
> from Unlink) — otherwise the Unlink account/deposit side runs on testnet while everything
> else runs on mainnet.

## Trading agents (Phase 2)

During a live game, each player with a `strategyPrompt` gets a Claude-powered trading agent
that runs its **own continuous, autonomous loop** for the FULL game window — there is no
shared timer and no stop-before-the-end threshold; agents trade right up to the buzzer.

**Per-player loop (`AgentRunner`).** Each eligible player (`confirmed` + funds `released` +
provisioned Privy wallet + non-empty `strategyPrompt`) runs one independent async loop, keyed
`${gameId}:${playerId}` and tracked per game via an `AbortController`. A loop starts the moment
the player's funds are released (the `funds_released` path), plus a startup sweep at game start.
Each iteration is **one bounded-context agent turn** (fresh portfolio snapshot + recent-trades
summary + the agent's own previous-turn note — never one hour-long conversation, so per-turn
cost stays flat). The agent paces itself with the **`wait` tool**: calling it ends the turn and
sets the delay until the next one, clamped to `[MIN_LOOP_INTERVAL_MS, time-remaining]`; if the
agent doesn't call `wait`, `DEFAULT_WAIT_SECONDS` applies.

**Cost / safety backstops.** `MIN_LOOP_INTERVAL_MS` is a hard floor between turns (enforced even
if the agent asks for less); `AGENT_MAX_TURNS_PER_GAME` optionally caps turns per player (0 =
off). The loop's `AbortSignal` is threaded into both the inter-turn sleep AND the Anthropic
tool-runner call, so the buzzer or app shutdown stops an in-flight turn promptly. A thrown turn
is caught, logged, and retried after a short backoff; **5 consecutive failures** stop that one
player's loop (logged `[agentLoop] player loop aborted: repeated failures`) without affecting
any other player. At the deadline (and on shutdown) all loops are **aborted and awaited before
settlement liquidation** so no trade can race the liquidation.

**Intent-not-calldata security model.** For swaps the model never supplies calldata — it
expresses *intent* (`{ fromToken, toToken, fromAmount }`) and the backend re-quotes LI.FI
server-side and executes **LI.FI's own `transactionRequest`** via Privy. The agent may trade
**any token LI.FI can quote on Base** (no hard whitelist). Guards re-checked server-side on
every `execute_swap`: game is live AND not yet ended (`secondsRemaining > 0` — trades are
rejected only after the deadline, not before), `fromAmount <= actual wallet balance` (viem
read; erc20 or native), slippage policy per `MAX_SLIPPAGE_BPS` (default `auto` → LI.FI
liquidity-adaptive slippage bounded by `MAX_PRICE_IMPACT` + the quote's `toAmountMin`, no
fixed-bps reject; a number pins a fixed bps cap that hard-rejects exceeding quotes), same-chain
(Base), the native-value
rule (a non-zero tx value is allowed only when `fromToken` is the native sentinel and must
equal the quote's value; ERC-20 sources require value 0), and the player owns the wallet.
**Bridging / cross-chain is out of scope** and rejected. Ending in USDC is **not** the agent's
job — Phase-3 liquidation converts all holdings to USDC at the deadline.

**Protocol interactions (`execute_protocol_action`).** For actions a plain swap cannot express
(deposit / stake / zap), the agent supplies the target contract, calldata, gas limit, the
token it spends (`fromToken`), the token the call consumes (`toToken`), the desired `toAmount`,
and a human-readable `description`. The backend re-quotes the **BETA**
`POST /v1/quote/contractCalls` (same-chain 8453) and executes LI.FI's returned
`transactionRequest`. Note the request gives the desired `toAmount` and LI.FI **computes the
`fromAmount`** to spend (inverse of `/v1/quote`); the balance gate uses that computed value. The
quote's `estimate` (incl. `toAmount`/`toAmountMin`, which may be `"0"` because arbitrary-call
output is the *protocol's* accounting, not LI.FI's) is surfaced to the agent **verbatim** so it
can judge effect via `get_portfolio` — we do NOT slippage-gate or require `toAmountMin > 0` for
contract calls.

**Wallet isolation (denyset).** `execute_protocol_action` rejects any `toContractAddress` that
is a **game-owned wallet** — every player's Privy wallet (its own and rivals') and Unlink
address — so the agent can only touch external protocol contracts, never self-deal or drain a
sibling. It also validates 0x-hex calldata and positive `toAmount`/gas limit, and (like swaps)
that the game is live, the wallet is provisioned, and trading isn't closed (<5 min left).

`get_portfolio`, `execute_swap`, `execute_protocol_action`, `get_time_remaining`, and `wait`
are our custom tools (the security boundary). The agent's portfolio is read on Base from the
set of **touched tokens** it has traded (seeded with the entry token) plus native ETH.

**LI.FI hosted MCP (default on).** With `AGENT_USE_LIFI_MCP=true` the agent is linked to
LI.FI's hosted MCP server (`LIFI_MCP_URL`, Streamable HTTP) via the Anthropic MCP connector
(beta header `mcp-client-2025-11-20`; the request gains `mcp_servers: [{ type: "url", name:
"lifi", ... }]` and a `{ type: "mcp_toolset", mcp_server_name: "lifi" }` tool). MCP tools
run **server-side on Anthropic's infrastructure** and are **read-only** (`get-chains`,
`get-chain-by-name`, `get-token`, `get-quote`, `get-allowance`, `get-status`,
`test-api-key`) — they explore chains/tokens/quotes but cannot trade. When MCP is on, our
REST `get_market` / `get_swap_quote` tools are dropped (MCP supersedes them); when
`AGENT_USE_LIFI_MCP=false`, those REST tools are restored so the agent still works without
MCP.

**Rate limits.** LI.FI MCP allows 200 requests / 2h without a key. Set `LIFI_API_KEY` to
include `Authorization: Bearer <key>` and raise the limit to 200 requests / minute.

**Transcripts.** With MCP enabled, agent transcripts contain `mcp_tool_use` and
`mcp_tool_result` blocks (the server-side MCP calls) alongside our client-side `tool_use` /
`tool_result` blocks. Our tick logic reads the final text blocks for the summary; the
mcp_* blocks are informational.

Each tick broadcasts `agent_update` and any `trade_executed` events, and persists trades to
`tr:game:{gameId}:trades`.

## Settlement (Phase 3)

At `endsAt` the `GameClock` settles the game **server-side** (no agent / Anthropic involved):
`live → settling → ended`.

1. **Liquidate to USDC.** For each player, every non-entry **touched token** on Base is
   swapped back to the entry token (USDC) through the same `tradeExecutor` swap path (same
   `MAX_SLIPPAGE_BPS` policy — `auto` by default, so illiquid/long-tail tokens get a wider
   buffer and can actually be sold). Liquidation is crash-safe per player AND per token
   (`Promise.allSettled`) — one
   stuck swap never blocks the rest — and skips positions worth less than `LIQUIDATION_MIN_USDC`.
   Each player emits `player_liquidated { playerId, ok }`.
2. **On-chain final score.** After all players liquidate, ONE `multicall` reads `balanceOf(USDC)`
   on every player's Privy wallet (`getErc20BalancesForOwners`); each player's `finalUsdc` comes
   from that single RPC call. This is the **source-of-truth** score (authoritative, on-chain).
3. **Octav NAV cross-check.** `octavNavUsd` = Octav `/v1/nav` for the wallet — an independent
   advisory cross-check, never the score; a NAV fetch failure does not block settlement.
4. **Rank.** Players ranked by `finalUsdc` desc; `pnl = finalUsdc − startingBalance` (and
   `startingBalance` is the exact entry amount put in play, not the raw deposit). `game_ended`
   carries the ranked `PlayerResult[]`.
5. **Settlement record.** Persisted to `tr:game:{gameId}:settlement` (`Settlement`) with the
   prize pool (sum of `finalUsdc`), the rank-1 winner, and `payoutStatus: 'pending'`. Exposed via
   `GET /games/:gameId/results`.
6. **Winner-take-all payout.** `SettlementService.executePayout` runs immediately after the
   record is built (no gate, no public route). It re-reads every player's USDC in ONE multicall —
   the **authoritative** winner determination, not the rank — picks the wallet holding the most
   USDC (tie-break: lowest `playerId`), then transfers each non-winner's **full** USDC balance
   into the winner's Privy wallet via a sponsored erc20 `transfer` (`sponsor: true`). Zero-balance
   wallets and the winner are skipped; a single player is a no-op. Each loser transfer is isolated
   (`Promise.allSettled`) so one failure never blocks the rest. `payoutStatus` is set to
   `'executed'` (all succeeded), `'partial'` (some failed), or `'failed'` (all failed), and the
   per-transfer audit is stored in `payouts`. A `prize_paid` WS event carries
   `{ winnerPlayerId, winnerAddress, prizePoolUsdc, transfers }`. Funds consolidate **publicly**
   into the winner's Privy wallet — no CRE validation and no Unlink private payout.

---

## Scripts

```bash
pnpm install
pnpm dev          # tsx watch with --env-file=.env
pnpm build        # tsc -> dist/
pnpm start        # node --env-file-if-exists=.env dist/index.js (loads .env if present, else uses shell/container env)
pnpm lint         # eslint
pnpm test         # vitest run
pnpm docker:start # docker compose up --build
```

## Docker

```bash
pnpm docker:start
# or
docker compose -f docker-compose/compose.yml up --build
```

Multi-stage build (`docker/Dockerfile`) on `node:24-bookworm-slim`: a builder stage
compiles TypeScript, the runtime stage installs prod-only deps and runs `dist/index.js`.
Compose injects env from `../.env`. No secrets mounts, no private registries.

---

## Architecture

```
src/
  env.ts                  zod-validated env (fail-fast)
  logger.ts               pino (+ pino-pretty in dev)
  app.ts                  Hono app factory + error mapping + WS wiring
  index.ts                boot: server + WS inject + workers + graceful shutdown
  domain/                 types + Redis key builders
  lib/                    crypto (AES-256-GCM), redis client
  repositories/           typed Redis access (game + player)
  services/
    unlinkService.ts      the ONLY @unlink-xyz/sdk adapter (drift contained here)
    gameService.ts        game lifecycle business logic
  routes/                 health, games, unlink auth, request schemas
  ws/                     GameEventHub + WS route + event types
  workers/                DepositWatcher + GameClock (in-process setInterval loops)
```

The custodial mnemonic is encrypted with AES-256-GCM and **never** leaves the backend:
`PublicPlayer` is the only player shape returned by the API or written to logs.

---

## Roadmap status

- **Phase 1 — Game lifecycle.** Lobby → live → settling → ended, custodial Unlink entry
  accounts, deposit auto-confirmation, real-time event stream. ✅ shipped.
- **Phase 2 — Trading agent.** Per-player Claude agent trading the Privy server wallet on
  Base via LI.FI (swaps + same-chain contract calls), gas sponsored. ✅ shipped (see "Trading
  agents").
- **Phase 3 — Settlement.** Server-driven liquidate → on-chain `finalUsdc` (single multicall) +
  Octav NAV cross-check → rank → settlement record → winner-take-all USDC consolidation into the
  winner's Privy wallet. ✅ shipped (see "Settlement").
