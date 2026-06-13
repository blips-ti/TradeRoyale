# TradeRoyale — Sponsor & Technical Research Report

> Research for the ETHGlobal **New York 2026** build (June 12–14, Metropolitan Pavilion).
> Verified against primary docs, npm, BaseScan, and the live Octav API. Dated 2026-06-12.
> ⚠️ = fast-moving / confirm at the venue. **Both LI.FI Composer (Feb 2026) and Chainlink CRE are bleeding-edge — re-check live docs before building.**

---

## 1. Prize landscape

**Event:** ETHGlobal NYC 2026, ~500 devs, $181K+ across 16 sponsors. **Chainlink, LI.FI, and Unlink are all confirmed sponsors** (with Google Cloud, ENS, Sui, World, Hedera, Ledger, Dynamic, Privy, Canton, 1inch, Arc…).

### Chainlink — $14,000
- **Best Workflow with CRE — $6,000 (3×$2,000)** ← primary. Build a **CRE Workflow** integrating blockchain with external APIs / data / LLMs / AI agents. **CLI simulation _or_ live deployment qualifies.** (Functions & Automation are deprecated; CRE is the focus.)
- Connect the World — $2,000 (CCIP / Price Feeds / Data Streams / PoR / VRF, must change on-chain state).
- Confidential AI Attester — $4,000 · Chainlink-Powered Upgrade — $2,000.

### LI.FI — $15,000 (all tracks require **LI.FI Composer**)
- **Agentic Workflows — $4,000** ← primary. Use **Composer as the execution layer for an AI-assisted/autonomous system.**
- Most Innovative Composer App — $4,000 · Best UX — $3,500 · Best Composer Tooling — $3,500.

### Unlink — $5,000
- Best Unlink Integration into a major OSS app — $2,500 · **Add Privacy to an existing project — $1,500** (literally rewards adding `deposit/transfer/withdraw/execute`) · Private Nano Payment (joint w/ Dynamic + Arc) — $1,000.

**Our 3 sponsors:** Chainlink CRE + LI.FI Composer + Unlink. **Bonus fits:** Privy ($5K) and Dynamic ($10K) for wallet onboarding + scoped signing.

---

## 2. Chainlink CRE (settlement oracle) — *verified*

- **SDK:** `@chainlink/cre-sdk` (TypeScript, v1.11.0) — `npm i @chainlink/cre-sdk`. Go SDK also exists.
- **Model:** every workflow centers on `handler()` linking a **trigger → callback**. Triggers: **Cron** (time-based), **HTTP**, **EVM Log**. → use **Cron** at competition end (or EVM-log on `CompetitionEnded`).
- **Two execution contexts:** `Runtime` ("DON Mode", BFT-guaranteed — on-chain writes + secrets) and `NodeRuntime` ("Node Mode", via `runtime.runInNodeMode()`) for third-party API calls (the Octav NAV fetch). The DON reaches **consensus** on per-node results before writing.
- **Writing on-chain (two steps, Forwarder-delivered):**
  ```ts
  const report = runtime.report({ encodedPayload: hexToBase64(reportData),
    encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256' }).result()
  evmClient.writeReport(runtime, { receiver: VAULT, report, gasConfig: { gasLimit: '500000' } }).result()
  ```
  Workflow code never touches the forwarder — the EVM capability delivers the signed report to the **KeystoneForwarder**, which verifies DON signatures and calls your contract.
- **Consumer contract:** inherit `ReceiverTemplate(forwarderAddress)` and override `_processReport(bytes report)` (abi.decode the NAV settlement). Only the forwarder can call `onReport`. (Or implement `IReceiver` directly.)
- **KeystoneForwarder on Base (verified on BaseScan):** `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` — same address on **Base mainnet and Base Sepolia**. **CRE supports writing to Base / Base Sepolia.** ✅
- **NAV/PoR template:** `cre init --template=cre-custom-data-feed-ts` — fetches off-chain data and writes on-chain (cron or EVM-log), configured via `config.json` (`schedule`, `url`, contract addresses, `gasLimit`). This is the "Bring Your Own Data (NAV & PoR)" pattern, purpose-built for our design.
- ⚠️ **Unverified:** whether a CLI-simulation-only demo is judge-acceptable (prize text implies yes — confirm), and CRE secrets handling. Recommendation: keep the Octav key in our own proxy so CRE only hits a public endpoint.

---

## 3. LI.FI Composer (agent execution layer)

- **Composer** (launched Feb 17 2026) is a **transaction-orchestration primitive**, *not* a separate API/package. It activates automatically on the standard endpoints (`GET /quote`, `POST /advanced/routes`) when `toToken` is a supported protocol/vault token. Compiles intent → bytecode, **simulates the full path**, returns an **unsigned `transactionRequest`** (sign externally). Cross-chain = multi-block; "single transaction" = single signature.
- **SDK:** `@lifi/sdk` **v4.0.0** — `createClient({ integrator, apiKey })` (v4 replaced v3's `createConfig`). Providers via `EVM()/SolanaProvider()` + `client.setProviders([...])`; chains via `ChainId` enum.
- **MCP server (hosted, read-only):** `https://mcp.li.quest/mcp` — 15+ tools (`get-quote`, `get-chains`, `get-token`, `get-allowance`, `get-status`…). **Does NOT sign/broadcast** — `get-quote` returns an unsigned `transactionRequest`. This is why a server-side scoped signer is required.
- **Rate limits:** no key = 200 req / 2h; with key = **200 req / min** (`X-LiFi-Api-Key` header). Aggregates **58 chains / 27 bridges / 31 DEXs**; self-positions as "the execution layer that makes blockchains operable by AI agents."
- **Frame for judging (Track 4):** *"LI.FI Composer is our agents' execution layer."*

---

## 4. Unlink (privacy + anti-cheat)

- **SDK:** `@unlink-xyz/sdk@canary`. Browser (`account.fromMetaMask`) + server (`createUnlinkAdmin` + `account.fromMnemonic`). Env e.g. `base-sepolia` (chainId 84532). Chains: Ethereum, **Base**, Arbitrum, Optimism.
- **Tech:** encrypted **UTXO notes** + **Groth16 zk-proofs generated client-side**; the contract verifies without learning sender/recipient/amount.
- **Core ops:** `deposit()` / `transfer()` (full privacy) / `withdraw()` / **`execute()`**.
- **`execute()`** runs through an **ERC-4337 smart account** (paymaster-sponsored gas), batching **1–16 calls** atomically — encode `approve` + a LI.FI/Uniswap swap and the target sees the ExecutionAccount as `msg.sender`, so the agent trades DeFi **from a shielded balance**.
- ⚠️ **Honest privacy caveat:** `execute()` reveals the call + amount but **masks the funding source / private account** and keeps **holdings** hidden. → Pitch Unlink as **holdings privacy** (rivals can't identify/target/copy a vault), not invisible trades. That is exactly what the anti-cheat needs.

---

## 5. Octav (NAV / portfolio data) — *validated live*

- **`get_nav(addresses[], currency)`** → total net worth (tested live: **$1.2M** for vitalik.eth). **1 credit/address**, max 10/call. USD/EUR/GBP/JPY/CNY.
- **`get_portfolio`** (holdings + DeFi across 20+ chains), **`get_transactions`** (inbound-transfer detection for anti-cheat), **`subscribe_snapshot`** (1,200 credits, T0 baseline + history).
- CRE calls our **server-side proxy** that wraps Octav (keeps the key off-chain).

---

## 6. Anti-cheat (hackathon-pragmatic)

The realistic attack is depositing extra funds mid-Match to inflate NAV. Demo-grade defense:
1. **Deposit lock at T0** — contract ignores deposits after start.
2. **Per-user vault sub-accounts** — measure a clean, isolated NAV.
3. **Flow-adjusted NAV** (one line in the CRE workflow): `score = navAtEnd − netExternalInflowsAfterT0`, inflows from Octav `get_transactions`.
4. **Privacy-as-anti-cheat (free, via Unlink):** shielded holdings → rivals can't identify or sabotage a vault they can't link to a player.

> Full Sybil/wash-trade resistance is out of scope for a 36h hack; deposit-lock + flow-adjusted NAV covers the obvious exploit.

---

## 7. Infrastructure

- **Agents (Anthropic):** one Claude agent per user (Agent SDK), wired to the LI.FI MCP. **Prompt-cache** the system prompt (the user's strategy) + tool definitions — cache reads ≈ 0.1× input, ~80% savings across ticks; Fable 5 caches from 512 tokens. Use a 5-min TTL during a live Match. One platform key, metered per user. Models: Haiku for high-frequency ticks, Fable for headline reasoning (confirm pricing via the claude-api reference).
- **Scoped signer (trade-but-not-withdraw):** the MCP returns *unsigned* calldata, so a backend must sign without being able to drain funds. **Use Privy's policy engine** — per-signer **allowlists + calldata restrictions** (allow the LI.FI router + whitelisted DEXs, block withdrawals). Dynamic (TSS-MPC, TEE server share, <1s ECDSA) is the alternative. Both are bonus-prize sponsors. (Unlink's `execute()` already routes through an ERC-4337 account, so scoping can also live at that layer.)
- **Realtime:** Supabase Realtime (least infra) or a standalone Socket.IO server (Fly/Railway + Redis). Keep WebSockets in a separate process from Next.js.
- **Chain choice → Base.** Intersection of all sponsors (LI.FI ✓, Unlink ✓, CRE writes ✓, Octav ✓) + cheap/fast L2.

---

## 8. Recommended settlement flow

1. Users join a Match and **deposit** into their **Unlink-shielded vault** (sub-account of `CompetitionVault`). Pot = Σ deposits.
2. At **T0** the contract **locks**; Octav records the baseline.
3. For the round, each user's Claude agent trades via **LI.FI Composer**; the **Privy policy-scoped signer** signs + broadcasts on Base.
4. At **T_end**, **Chainlink CRE** (cron) reads the vault list → fetches each NAV from Octav → computes the winner → writes `settle()` via the Forwarder.
5. `CompetitionVault.settle()` verifies the DON signature and pays the **whole pot to the winner** — the on-screen **Victory Royale**.

---

## 9. Day-1 checklist (⚠️ confirm)
- LI.FI **Composer** exact SDK surface (`docs.li.fi/llms.txt`).
- CRE **Early Access** turnaround + whether CLI-sim-only demo is judge-acceptable; CRE secrets handling.
- Unlink SDK install + Base verifier addresses (`docs.unlink.xyz`).
- Anthropic model IDs / pricing (claude-api reference).
- Octav credit balance / rate limits for demo volume.

---

## Sources

ethglobal.com/events/newyork2026/prizes · docs.chain.link/cre (+ cre-templates, getting-started, forwarder-directory) · npm `@chainlink/cre-sdk@1.11.0` · BaseScan + Base-Sepolia BaseScan (KeystoneForwarder) · docs.li.fi (composer, sdk, mcp-server) + li.fi knowledge-hub · npm `@lifi/sdk@4.0.0` · docs.unlink.xyz (quickstart/execute/how-it-works) · Octav MCP/API (validated live) · platform.claude.com prompt-caching + docs.claude.com agent-sdk · docs.privy.io policy engine + agentic wallets · docs.dynamic.xyz MPC.

*Two adversarially-verified deep-research passes (25 claims at 3-0) backed the Chainlink CRE and LI.FI Composer sections; the Octav portion was validated against the live API.*
