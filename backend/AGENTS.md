# AGENTS.md

Guidance for AI coding tools working in this repo. `CLAUDE.md` is a symlink to this file.

**Default branch:** main

## What this is

`trade-royal-backend` — a standalone PoC backend for the Trade Royal trading competition.
Plain Hono on Node 24, ESM, Redis-only state, Unlink privacy SDK behind one adapter.

This repo is intentionally **decoupled from the Octav fleet**: NO `@octavlabs/*`
dependencies, no private npm packages, no shared CI composite actions. It builds with zero
npm auth. Do not introduce private packages or `getSecret`/`OctavError`-style fleet
helpers — use plain env + local error classes.

## Conventions

Follow `code-orchestrator/skills/code-conventions/SKILL.md` (no boolean params, avoid
`else`, constructor-initialized deps, named exports, explicit public return types, private
readonly, template literals, ≤2-line comments for non-obvious constraints only).

**Money math uses `bignumber.js`** (matches the fleet BigNumber rule). Base-unit STRINGS are
the storage/transport form (Redis values, LI.FI/Privy/Unlink payloads, tool params, JSON
shapes) — never change those. BigNumber is for in-memory arithmetic only; serialize back to
base-unit strings via `.toFixed(0)` (never `toNumber()`) at the boundaries. Keep viem/ethers
bigints ONLY where a call literally needs a JS bigint arg (e.g. `encodeFunctionData` approve
amount), converted at that exact call site via `BigInt(bn.toFixed(0))`.

Fleet-specific exceptions that do NOT apply here: `@octavlabs/secrets`,
`@octavlabs/address-utils`, Jest (we use vitest). Validation is zod (Hono service), not Joi.

## Architecture

- `src/env.ts` — zod-validated env, fail-fast at boot.
- `src/services/unlinkService.ts` — the ONLY `@unlink-xyz/sdk` adapter. All SDK drift is
  contained here. The SDK is canary; treat its `.d.ts` types as source of truth over the
  docs.
- `src/services/gameService.ts` — game lifecycle.
- `src/repositories/` — typed Redis access.
- `src/workers/` — `DepositWatcher` + `GameClock`, in-process `setInterval` loops, crash-
  safe per iteration.
- `src/agent/` — `AgentRunner` drives ONE continuous, autonomous, per-player async loop
  (AbortController per `${gameId}:${playerId}`) for the full game window; agents pace
  themselves via the `wait` tool. Loops are aborted + awaited before settlement liquidation.
- `src/settlement/` — server-driven Phase-3 liquidation/scoring + winner-take-all payout.
  After liquidation, ONE multicall (`getErc20BalancesForOwners`) reads every trader's USDC; the
  richest wallet wins (tie-break: lowest playerId) and every loser's full USDC is transferred
  into the winner's Privy wallet via sponsored sends. Funds consolidate publicly (no CRE/Unlink).
- `src/ws/` — `GameEventHub` + WebSocket route.

## Security notes

- `encMnemonic` (AES-256-GCM, `MNEMONIC_ENCRYPTION_KEY`) must NEVER appear in any API
  response or log. `toPublicPlayer()` is the only player serializer for external surfaces.
- `UNLINK_API_KEY` is admin/server-only (`dangerouslyAllowBrowser: false`); never ship it
  to a browser bundle.

## Verify before "done"

```bash
pnpm install
pnpm build   # tsc, must pass clean
pnpm lint    # eslint, must pass
pnpm test    # vitest run
```

## Agents & Skills

- BE Coder, BE Tester, Code Reviewer.
- Skills: `code-conventions`, `security`, `backend-hono`, `redis-patterns`,
  `real-time-patterns`, `error-and-validation`, `observability` (Hono section).
