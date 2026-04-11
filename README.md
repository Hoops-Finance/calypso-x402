# Calypso Swarm

**Paid AI market simulation infrastructure for Stellar.**

> Agents don't just buy data anymore — they buy entire market environments.

Calypso Swarm turns DeFi market simulation into a pay-per-call capability on
Stellar. A single `POST /simulate` gated by x402 USDC micropayments spins up
a swarm of rule-based bot wallets — an arbitrageur, a noise trader, and an LP
manager — that trade real paths through the **Hoops router** across Soroswap,
Phoenix, Comet, and Aquarius on testnet. A **Gemma 4** orchestrator reviews
aggregated metrics every five minutes and retunes bot parameters live.

Built for **Stellar Hacks: Agents (x402 + Stripe MPP)** on DoraHacks.

---

## Table of contents

- [What Calypso does](#what-calypso-does)
- [Why x402 matters here](#why-x402-matters-here)
- [Architecture](#architecture)
- [What already existed (reusable stack)](#what-already-existed-reusable-stack)
- [Quick start](#quick-start)
- [API reference](#api-reference)
- [Bot archetypes](#bot-archetypes)
- [Safety bounds](#safety-bounds)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What Calypso does

1. An agent (human or autonomous) hits `POST /plan` with natural language:
   *"stress test USDC/XLM liquidity across Soroswap and Phoenix for 10 minutes"*
2. Calypso returns `HTTP 402 Payment Required` with a Stellar USDC
   requirement pointing to the platform's receiver wallet.
3. The client signs a USDC transfer via Freighter and retries with the
   payment header. The facilitator settles the payment on-chain. Calypso
   calls Gemma 4 and returns a validated `SessionConfig` + bot recipe.
4. The client calls `POST /simulate` with the plan (another `$2.00` USDC
   via x402). Calypso creates bot wallets on testnet — friendbot-funds
   them, deploys per-bot Hoops smart accounts, and starts the chassis
   loops. Each bot begins routing real swaps through the Hoops router.
5. Every five minutes the AI reviewer aggregates the session's metrics,
   asks Gemma 4 for parameter deltas, validates the response against a
   zod schema, and pushes the changes back into the live swarm.
6. A `/sessions/:id` UI page tails the action via SSE and shows the
   AI's reasoning in real time.

The whole flow is visible in the demo video: agent → 402 → pay → swarm
live on the Stellar testnet explorer → AI retunes → report.

---

## Why x402 matters here

Before Calypso, setting up a DeFi simulation required accounts, API keys,
subscriptions, and ops. After Calypso, an autonomous agent can:

- discover the `/simulate` endpoint
- see the price in the `402` response
- sign a USDC payment on Stellar in the same HTTP round-trip
- receive a running, adaptive market environment

This is what x402 was designed for: buying a **service that executes on-chain
and returns intelligence**, not gating a static resource. Calypso is the
first instance of **market-environment-as-a-service** on Stellar.

---

## Architecture

```
┌───────────────────────────┐
│  Next.js 16 UI (:3000)    │   Freighter-only (no wallet kit)
│  - /                      │
│  - /simulate              │   NL prompt → /plan → review → /simulate
│  - /sessions/[id]         │   live SSE tail, metrics, AI feedback rail
└────────────┬──────────────┘
             │ HTTP + x402
             ▼
┌───────────────────────────┐
│  Express API (:9990)      │
│  paymentMiddlewareFromConfig
│  POST /plan      $0.50    │
│  POST /simulate  $2.00    │
│  POST /analyze   $0.50    │
│  GET  /report/:id (free)  │
│  GET  /sessions (free)    │
│  GET  /events/:id (SSE)   │
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐
│  Calypso Orchestrator     │   In-memory SessionManager
│  SessionManager / Wallets │   Per-session AbortController + subscribers
│  Launcher / Aggregator    │   Mutable BotConfig store with safety clamps
│  Gemma 4 Reviewer (5 min) │   zod-validated deltas, 3-strike parse pause
└────────────┬──────────────┘
             │
     ┌───────┼───────┐
     ▼       ▼       ▼
   [arb]  [noise]  [lp]     Bot wallets (ephemeral Stellar keypairs +
     │       │       │      per-bot Hoops smart accounts)
     └───────┼───────┘
             ▼
     Hoops router → Soroswap / Phoenix / Comet / Aquarius
```

### Repository layout

```
hoops_calypso-x402/                 pnpm workspaces monorepo
├── apps/
│   ├── api/                        Express + x402 + orchestrator + bots
│   │   ├── src/
│   │   │   ├── server/             bootstrap, x402 middleware, routes
│   │   │   ├── orchestrator/       session / wallets / launcher / configStore
│   │   │   ├── bots/               chassis + arbitrageur / noise / lp archetypes
│   │   │   ├── router/             hoopsRouter wrapper over hoops-sdk
│   │   │   ├── aggregator/         summarize bot logs → Metrics
│   │   │   ├── ai/                 Gemma 4 client + planner + reviewer
│   │   │   └── constants.ts        network + address pulls from hoops-sdk-types
│   │   └── scripts/
│   │       ├── bootstrap-pay-to.ts generate + friendbot-fund the revenue wallet
│   │       ├── smoke-swap.ts       single swap via router wrapper
│   │       └── smoke-noise.ts      one noise bot running for 90s
│   └── web/                        Next.js 16 UI
│       ├── app/
│       │   ├── page.tsx            landing
│       │   ├── simulate/page.tsx   plan → pay → launch flow
│       │   └── sessions/[id]/page.tsx  live session view (SSE + polling)
│       ├── components/             WalletProvider, ConnectWallet, NavBar, ui.tsx
│       └── lib/apiClient.ts        typed fetchers + PaymentRequiredError
└── packages/
    └── shared/                     zod schemas for every API shape
```

---

## What already existed (reusable stack)

Calypso is NOT greenfield. It leans on the existing Hoops Finance infrastructure:

| Need                          | Reused from                                    | How                                                  |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Router + DEX adapters         | `hoops_contracts/deployed-contracts-testnet.json` | pulled via `hoops-sdk-types`                         |
| Swap quoting across DEXes     | `hoops_sdk` → `hoops-sdk-core`                 | `RouterContract.getAllQuotes`                        |
| Swap execution on Soroswap    | `hoops_sdk` → `hoops-sdk-actions`              | `HoopsSession.swapXlmToUsdc`                         |
| LP deposits                   | `hoops_sdk` → `hoops-sdk-actions`              | `HoopsSession.deposit`                               |
| Address book + network config | `hoops_sdk` → `hoops-sdk-types`                | `getAddressBook("testnet")`, `getNetworkConfig`      |
| UI theme + logos              | `hoops_dashboard-ui`                           | palette tokens copied, logo + protocol icons copied  |

Sibling repos under `/Users/atl4s/Developer/hoops_*` are treated as
**read-only resources** — Calypso consumes them, never modifies them.
Packages are consumed via `file:` workspace links pinned with pnpm overrides.

### What Calypso built fresh

Everything new to the Hoops ecosystem: the x402 wiring, the bot chassis +
archetypes, the Session/Launcher/Aggregator orchestrator, the Gemma 4
planner + reviewer loop, the Next.js 16 UI, and the wallet factory that
per-session ephemeral smart accounts. These are the first Gemini/Gemma
tool-calling and x402-on-Stellar code in the repo family.

---

## Quick start

**Requirements:** Node 20+, pnpm 10+, the sibling `hoops_sdk` repo
checked out at `../hoops_sdk` (Calypso `file:` links into it), a Google AI
Studio API key (optional — the reviewer runs without one, just with no
feedback trail), the [Freighter](https://freighter.app) browser extension
in testnet mode.

```bash
# 1. install everything
pnpm install

# 2. copy env template, then generate a fresh testnet revenue wallet
cp .env.example .env
pnpm bootstrap-pay-to
# → prints a Stellar secret ONCE. Save it. Public key is written to .env.

# 3. (optional) add your Gemini API key for the planner and reviewer
echo "GEMINI_API_KEY=your-key-here" >> .env

# 4. launch the api (terminal 1)
pnpm dev:api
# → listening on :9990

# 5. launch the ui (terminal 2)
pnpm dev:web
# → http://localhost:3000
```

Then open http://localhost:3000, connect Freighter, and click "run a
simulation".

### Smoke scripts

```bash
# Single swap through the router wrapper (proves the hoops_sdk
# integration works end-to-end on testnet).
pnpm smoke:swap

# One noise bot running for 90 seconds; asserts ≥1 successful swap.
pnpm smoke:noise
```

---

## API reference

All POST routes are gated by [x402](https://x402.org). The facilitator
defaults to `https://www.x402.org/facilitator`.

### `POST /plan` — `$0.50`

```jsonc
// in
{ "prompt": "stress test USDC/XLM with 3 bots for 5 minutes" }
// out
{
  "session_config": { "name": "...", "duration_minutes": 5, "target_pools": ["soroswap:USDC/XLM"], "initial_treasury_xlm": 10000, "demo_mode": false },
  "bot_configs": [ { "archetype": "noise", "bot_id": "noise-1", ... }, ... ],
  "estimated_cost_usd": 2.5,
  "target_pools": ["soroswap:USDC/XLM"]
}
```

Gemma 4 is asked for a strict JSON object matching `PlanResponseSchema`.
Parse failures retry twice before falling back to a hand-coded default
plan — the user's $0.50 is never wasted.

### `POST /simulate` — `$2.00`

```jsonc
// in: the output of /plan (or a manually-constructed equivalent)
{ "session_config": {...}, "bot_configs": [...] }
// out
{ "session_id": "uuid", "status": "running", "started_at": "ISO-8601" }
```

Creates a Session, spawns bot wallets in parallel (friendbot → deploy
smart account), starts the chassis loops, and schedules an auto-end
based on `duration_minutes`.

### `POST /analyze` — `$0.50`

```jsonc
// in
{ "contracts": { "router": "C...", "pools": ["..."], "tokens": ["..."] } }
// out
{ "pool_health": [...], "liquidity_depth_usd": 0.0, "fee_analysis": {...}, "risk_profile": {...} }
```

v0 probes each Hoops adapter with a 1-XLM quote and computes the
max/min spread ratio to classify risk.

### `GET /report/:sessionId` — free

Returns the full session snapshot: config, metrics (aggregated), bot
logs, AI feedback trail, PnL summary.

### `GET /sessions` — free

Lists every session in memory.

### `GET /events/:sessionId` — free (SSE)

Server-sent events stream. Event types: `bot_action`, `ai_review`,
`status`. Replays historical events on connect so late subscribers get
full context.

### `GET /health` — free

`{ ok, pay_to, network }` — lightweight liveness probe.

---

## Bot archetypes

Each archetype is a pure `tick()` function registered with the chassis.
The chassis handles the observe → decide → execute → log loop, exponential
backoff on errors, and live config re-reads so AI parameter changes take
effect within one tick.

### noise (`apps/api/src/bots/noise.ts`)

Random XLM swap size within `[min_amount, max_amount]` on
`interval_seconds` cadence. Generates background volume so the LP bot's
rebalance logic fires and the arbitrageur has something to work against.

### arbitrageur (`apps/api/src/bots/arbitrageur.ts`)

Every tick: query `getAllQuotes` across every Hoops adapter for a
`USDC/XLM` probe swap, compute spread in basis points between best and
worst, execute a swap if spread ≥ `min_spread_bps`. Logs the observed
spread even when skipping so the AI reviewer can tune the threshold.

### lp_manager (`apps/api/src/bots/lp.ts`)

First tick: `HoopsSession.deposit()` — 50/50 USDC/XLM into the Soroswap
pair. Subsequent ticks: read LP positions, simulate drift, execute a
small rebalance probe swap with probability equal to `rebalance_threshold`.

All execution goes through the Hoops router. Adding a new DEX means
extending the router, not every bot.

---

## Safety bounds

- **Rate limits:** 10 requests/minute/IP on `/plan`, 5 requests/minute/IP
  on `/simulate`. Protects our Gemma quota and testnet from abuse.
- **AI delta clamps:** the config store clamps every numeric delta from
  the reviewer. `interval_seconds` must stay in `[5, 300]`, `max_amount`
  and `max_position_size` are capped at 100 XLM, `min_spread_bps` at
  1000, `rebalance_threshold` at `[0, 1]`. Clamps are logged.
- **Parse failure pause:** if Gemma returns unparseable JSON 3 times in
  a row for the same session, the reviewer pauses for that session until
  restart. Malformed LLM output never corrupts a live config.
- **Session circuit breaker:** 25 errors in a session aborts all bots
  and sets status to `failed`.
- **Exponential backoff:** the chassis doubles its sleep interval on
  each consecutive error (capped at 30s) so a broken pool doesn't
  turn into a tx spam loop.
- **Missing `GEMINI_API_KEY`:** the reviewer logs a one-time warning
  and skips gracefully. The server runs fine without AI — the UI just
  won't show an "ai adjustments" rail.

---

## Known limitations

- **Soroswap-only execution:** the router wrapper currently routes all
  swaps through Soroswap via `HoopsSession.swapXlmToUsdc`, even when
  quotes show a better price on Comet or Phoenix. The Comet and Phoenix
  adapters trip a Soroban auth recording issue when invoked via the
  shared smart account wrapper — the fix lives in `hoops_sdk`'s smart
  account contract, not here. We still fetch multi-DEX quotes at every
  tick, so the arbitrageur still sees and reports cross-DEX spread.
- **No persistence:** sessions live in memory. Restarting the API
  wipes all session state. Durability is on the roadmap; for a 48-hour
  hackathon build it's out of scope.
- **Testnet only:** all funding is via friendbot. Mainnet mode would
  require real USDC flows and a user-deposit treasury; the architecture
  supports it but the demo runs on free testnet XLM.
- **No Stripe MPP:** x402 is wired end-to-end. MPP was listed as a
  stretch goal with a 4-hour timebox and was deferred in favor of UI
  and polish.
- **`RouterContract.getBestQuote` bug:** there's a latent deserialization
  bug in `hoops-sdk-core` where `getBestQuote` assumes `Option<SwapQuote>`
  is wrapped in a `Vec`. Calypso routes around it by calling
  `getAllQuotes` and picking the max `amountOut` itself.

---

## Roadmap

1. **Chat interface** — natural-language session builder over the same
   planner pipeline. SCF deliverable D8.
2. **Mainnet mode** — bots join real markets and optimize for yield
   rather than simulation fidelity. User-deposited treasury.
3. **Agent smart accounts** — bot wallets become user-owned smart
   accounts executing autonomous strategies within spending policies.
   SCF deliverable for Hoops v2.
4. **Stripe MPP** — add `@stellar/mpp` charge intent as an alt payment
   rail. Set `X-Payment-Rail: mpp` to route there.
5. **Generic multi-DEX execution** — fix the Soroban auth pattern in
   `hoops_sdk` so Calypso can route a swap through any adapter at
   runtime, not just Soroswap.
6. **Indexer stress test** — crank the swarm to 20+ bots and watch the
   Hoops indexer absorb the load. SCF deliverable D5.
7. **Protocol adapters** — Blend, DeFindex, and future Stellar DeFi
   protocols plug in at the router layer.

---

## License

MIT.

## Credits

Built by [Hoops Finance](https://hoops.finance) for the
[Stellar Hacks: Agents](https://dorahacks.io/hackathon/stellar-agents-x402-stripe-mpp)
hackathon. Calypso is part of an active SCF grant (tranche 3) and its
architecture directly advances deliverables D5 through D9.
