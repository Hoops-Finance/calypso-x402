# CLAUDE.md — Calypso Swarm

## Project Context
AI-orchestrated bot swarm for Stellar DeFi market simulation.
Hackathon submission for Stellar Agents x402 + Stripe MPP.

## Stack
- Runtime: Node 20+
- Language: TypeScript
- Blockchain: Stellar testnet (Soroban)
- SDK: @stellar/stellar-sdk
- Payments: @x402/core, @x402/express, @x402/stellar, @x402/fetch
- AI: Gemini 2.5 Flash (`gemini-2.5-flash`) via generativelanguage.googleapis.com
- Server: Express
- UI: Next.js 16 + Tailwind 4 (hand-rolled components, no shadcn)
- Wallet: @stellar/freighter-api (no StellarWalletsKit, no WalletConnect)

## Architecture Rules
- Bots are RULE-BASED. No LLM calls in bot execution loops.
- AI orchestrator fires ONLY on 5-minute schedule or anomaly flags.
- All swaps route through Hoops router abstraction. Never call DEX contracts directly from bots.
- Bot configs are JSON objects. Bots poll config from shared store.
- Wallet lifecycle: treasury funds bots, bots return funds on session close.

## Code Rules
- Keep bot archetypes under 200 lines each.
- Shared chassis (observe/decide/execute/log) is one file.
- No unnecessary abstractions. This ships in 48 hours.
- Error handling on every Stellar transaction (they can fail).
- Log every bot action with timestamp, bot ID, action type, result.

## Do NOT
- Add a database. In-memory session store is fine.
- Optimize for performance. Correctness first.
- Build mainnet mode. Testnet only for the hackathon.
- Build the chat interface. Document it as roadmap.
- Modify files in sibling hoops_* repos under /Users/atl4s/Developer/. They are READ-ONLY resources. Copy content into this repo; never edit/commit/install in those.
