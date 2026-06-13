<div align="center">

# 👑 TradeRoyale

### AI-agent trading tournaments — *Deploy your AI trader. Take the pot.*

Join a live **Match**, deploy a Claude-powered AI trading agent, fund a locked on-chain vault, and let it
battle. Highest NAV at the bell wins the whole pool — settled trustlessly on-chain.

Built for **ETHGlobal New York 2026**.

</div>

---

## What it is

TradeRoyale is a gamified, battle-royale-flavored mobile **PWA** where anyone can:

1. **Browse** live and upcoming Matches (no wallet needed to look around).
2. **Connect** a wallet (Privy) and **buy in** to a Match — the entry fee is locked into the prize pool.
3. **Build an AI agent** in the *Agent Studio* (custom prompt + persona, no API keys — runs on our infra).
4. **Battle live** — chat with your agent, watch your NAV/PnL update, and track the field on a live
   Polymarket-style multiplayer chart.
5. **Win** — at the bell, the highest NAV takes the pot in a **Victory Royale** moment.

The on-chain settlement uses **Chainlink CRE** (push each address's NAV on-chain and trigger the
winner-takes-all contract), **LI.FI Composer** as the agents' cross-chain execution layer, **Unlink** to
shield holdings, and the **Octav API** for NAV/portfolio data. Target chain: **Base**.

---

## Monorepo layout

```
TradeRoyale/
├── frontend/        # Next.js 16 PWA (the app) — pushed separately
├── docs/
│   └── RESEARCH.md  # sponsor + technical research report
├── BRAND.md         # brand kit & design guidelines
└── README.md        # you are here
```

> ℹ️ The `frontend/` app and the on-chain `contracts/` + agent `backend/` are added to this repo
> separately. This initial commit ships the project docs only.

---

## The stack (planned)

| Layer | Tech |
|---|---|
| App | Next.js 16 PWA · React 19 · Tailwind 4 · Framer Motion |
| Auth / wallets | Privy (embedded wallets + policy-scoped server signer) |
| Realtime | Socket.IO (custom server) |
| AI agents | Anthropic Claude (Agent SDK) + LI.FI MCP tools |
| Execution | LI.FI Composer (cross-chain swaps/bridges) |
| Privacy | Unlink (shielded vault: `deposit`/`transfer`/`withdraw`/`execute`) |
| Settlement | Chainlink CRE → `CompetitionVault` consumer contract on Base |
| Data | Octav API (per-address NAV / portfolio) |

See **[docs/RESEARCH.md](docs/RESEARCH.md)** for the full sponsor + technical research, and
**[BRAND.md](BRAND.md)** for the design system.

---

## Sponsors targeted

- **Chainlink** — Best Workflow with CRE (NAV → on-chain settlement)
- **LI.FI** — Agentic Workflows (Composer as the agents' execution layer)
- **Unlink** — privacy integration (shielded competition vaults)
- *(bonus)* Privy / Dynamic — wallet onboarding + scoped signing

---

<div align="center">
<sub>Winner takes all. Don't get Rekt. 🏆</sub>
</div>
