# Calypso Swarm

**Paid AI market simulation infrastructure for Stellar.**

> Agents don't just buy data anymore — they buy entire market environments.

Calypso Swarm turns DeFi market simulation into a pay-per-call capability on
Stellar. An HTTP `POST /simulate` secured by x402 USDC micropayments spins up
a swarm of rule-based bot wallets (arbitrageur, noise trader, LP manager) that
trade through the **Hoops router** across Soroswap, Phoenix, Comet, and
Aquarius on testnet. A Gemma 4 orchestrator reviews aggregated metrics every
five minutes and re-tunes bot parameters on the fly.

Built for **Stellar Hacks: Agents (x402 + Stripe MPP)** on DoraHacks.

## Status

🏗 Hackathon build in progress. This README is a stub — full documentation,
setup guide, architecture diagrams, API reference, and demo video land during
Block 3 (see `/Users/atl4s/.claude/plans/delegated-questing-flute.md`).

## Prerequisites

- Node 20+
- pnpm 10+
- The sibling [`hoops_sdk`](https://github.com/Hoops-Finance) repo checked out
  at `../hoops_sdk` (Calypso `file:` links into it).
- A Google AI Studio API key (for Gemma 4 via the Gemini API).
- The [Freighter](https://freighter.app) browser extension, testnet mode enabled.

## Quick start (preview)

```bash
pnpm install
pnpm bootstrap-pay-to      # generates a testnet keypair, funds via friendbot
pnpm dev:api               # Express + x402 on :9990
pnpm dev:web               # Next.js 16 UI on :3000
```

## License

MIT
