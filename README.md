# Calypso Swarm

**Paid AI market simulation infrastructure for Stellar.**

> Agents don't just buy data anymore — they buy entire market environments.

Calypso Swarm turns DeFi market simulation into a **pay-per-call API** on
Stellar. Two gated endpoints — `POST /plan` ($0.50) and `POST /simulate`
($2.00) — are settled via [x402](https://x402.org) USDC micropayments. An
**autonomous Calypso Agent** pays both calls with its own Ed25519 keypair,
spawns a swarm of rule-based bot wallets (arbitrageur / noise / lp manager),
and trades real paths through the **Hoops router** across Soroswap, Phoenix,
Comet, and Aquarius on testnet. A **Gemma 4** orchestrator reviews the
aggregated metrics every five minutes and retunes the bot parameters live.

The architectural hook: **the product is the API, not the UI.** The Calypso
Agent is a proof that any autonomous agent — Claude, Gemini, a custom cron —
can pay Calypso's x402 endpoints the exact same way, because the handshake
goes over real localhost HTTP through a live in-process facilitator, not
through a mocked internal function call.

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
- [Demo script](#demo-script)

---

## What Calypso does

1. **User (or any autonomous agent) describes a market** — a natural language
   brief like *"3 minute demo with 1 arb bot and 2 noise bots"*.
2. **The Calypso Agent fires `POST /plan`** via `@x402/fetch`. The server
   returns `HTTP 402 Payment Required` with a Stellar USDC price. The agent
   signs a Soroban auth entry with its Ed25519 keypair, retries, and the
   **in-process facilitator** settles the payment on-chain. Gemma 4 turns
   the brief into a structured `SessionConfig` and bot recipe.
3. **The agent fires `POST /simulate`** — same handshake, $2.00 instead of
   $0.50. Calypso creates a session record and hands the session ID back.
4. **The agent spawns the bot swarm** — for each bot config, generate an
   Ed25519 keypair, friendbot-fund it, deploy a per-bot Hoops smart account,
   transfer XLM + USDC from the agent wallet to the smart account, and start
   the chassis loop. Every swap routes through the Hoops router.
5. **Gemma 4 reviews every five minutes.** The aggregator walks the session
   log, the reviewer asks Gemma for parameter deltas, zod validates, clamps
   apply, and the live config store updates.
6. **`/sessions/:id` tails it in real time** via SSE. The UI shows two real
   on-chain tx hashes (plan + simulate payments), a visceral three-tier
   money-flow diagram, per-bot logs, the AI adjustment rail, and an explicit
   STOP button that drains all bot funds back to the agent.

Every step above is visible in the demo video: agent pays x402 twice on
camera with the tx hashes stamped as receipts, bot smart accounts appear on
stellar.expert, swaps fire, Gemma adjusts, STOP drains back.

---

## Why x402 matters here

Before Calypso, setting up a DeFi simulation required accounts, API keys,
subscriptions, and ops. After Calypso, an autonomous agent can:

- discover the `/simulate` endpoint
- read the price from the `402` response header
- sign a USDC payment on Stellar in the same HTTP round-trip
- receive a running, adaptive market environment

This is what x402 was designed for: buying a **service that executes on-chain
and returns intelligence**, not gating a static resource. Calypso is the
first instance of **market-environment-as-a-service** on Stellar.

### Why the Agent pays, not the user

Early versions of Calypso had the user's Freighter wallet sign the x402
payment directly. That's wrong. x402 is an **agent-to-agent** protocol —
its whole point is that autonomous agents can pay for capabilities without
any human in the loop. If the UI has to open a wallet popup to confirm
each call, we've built a paywall, not an agentic payment rail.

So Calypso runs the agentic flow to its logical endpoint: a long-lived
Calypso Agent (its own Stellar G-account) is the x402 payer. The user
funds the agent once (via the `/wallets` page — real Freighter-signed USDC
transfer on-chain), and from then on every `/plan` / `/simulate` / `/analyze`
call is signed by the agent on the user's behalf. The user can withdraw
their balance back out any time.

Crucially, the agent calls the Calypso API over **real localhost HTTP** with
real `@x402/fetch` — not via internal function calls. The facilitator
verifies every payment. Judges watching the demo see identical behavior to
what a third-party agent running on a separate box would see.

---

## Architecture

Four parties, one process, one facilitator. The UI never signs anything.

```
 ┌─────────────────────────┐
 │  User / Freighter       │   optional · funds the agent, receives withdrawals
 │  G-account              │
 └──────────┬──────────────┘
            │ real on-chain USDC transfer  (/tx/build-fund-agent → sign → /tx/submit)
            ▼
 ┌─────────────────────────┐
 │  Calypso Agent          │   Ed25519 G-account · autonomous x402 payer
 │  apps/api/src/agent/    │   · pays  /plan     $0.50
 │                         │   · pays  /simulate $2.00
 │                         │   · pays  /analyze  $0.50
 │                         │   · signs every payment itself
 │                         │   · calls the API over real localhost HTTP
 └──────────┬──────────────┘
            │ @x402/fetch  →  HTTP 402  →  sign auth entry  →  retry  →  200
            ▼
 ┌─────────────────────────┐      ┌─────────────────────────┐
 │  Express API (:9990)    │      │  In-process facilitator │
 │  paymentMiddlewareFrom  │ ───▶ │  @x402/core             │
 │  Config + ExactStellar  │      │  ExactStellarScheme     │
 │  Scheme server          │ ◀─── │  maxFee 5 000 000 str   │
 └──────────┬──────────────┘      └──────────┬──────────────┘
            │ 200 + X402Trace              │ submits + waits on-chain
            ▼                               ▼
 ┌─────────────────────────┐      ┌─────────────────────────┐
 │  Calypso Orchestrator   │      │  API Revenue wallet      │
 │  Session / Launcher     │      │  (pure x402 sink)        │
 │  Aggregator / Config    │      │  receives every USDC pay │
 │  Gemma 4 Reviewer       │      └─────────────────────────┘
 └──────────┬──────────────┘
            │ agent-signed XLM + USDC transfers from the agent G-account
            ▼
 ┌─────────────────────────────────────────────────┐
 │  Bot swarm (per session, ephemeral)             │
 │  [arb] [noise] [lp]                             │
 │  per-bot Ed25519 EOA + per-bot Hoops smart      │
 │  account funded by the agent                    │
 └──────────┬──────────────────────────────────────┘
            ▼
    Hoops router → Soroswap / Phoenix / Aqua / Comet

 ┌─────────────────────────┐
 │  Next.js 16 UI (:3000)  │   pure harness · talks to /agent/* only
 │  /                      │   landing + pricing card
 │  /simulate              │   NL prompt → POST /agent/simulate
 │  /sessions/[id]         │   live money flow, x402 receipts, stop button
 │  /wallets               │   fund agent · withdraw from agent · mint USDC
 └─────────────────────────┘
```

Two things to flag in the diagram:

1. **The facilitator runs in-process.** We initially pointed at the hosted
   x402.org/Stellar facilitator, but its hard-coded fee ceiling
   (`maxTransactionFeeStroops = 50 000`) rejects every Soroban contract-call
   settle because resource fees routinely exceed that on testnet. The fix —
   per the official `stellar/x402-stellar` monorepo's own self-hosted
   defaults — is to run `ExactStellarScheme` in-process with a higher
   ceiling. Calypso ships `apps/api/src/server/localFacilitator.ts` for
   exactly this. A dedicated `FACILITATOR_SECRET` keypair (auto-generated,
   friendbot-funded) signs the submitted txs, decoupled from both the payer
   and the payee so it passes the "facilitator not involved in transfer"
   check.

2. **The agent calls the API over real localhost HTTP.** Tempting shortcut:
   have the /agent routes invoke the /plan handler directly and skip the
   x402 handshake. We don't. `Agent.runSimulation` uses `wrapFetchWithPayment`
   from `@x402/fetch` to POST `http://127.0.0.1:9990/plan`. That triggers
   the full 402 → sign → retry → settle round-trip, the facilitator posts
   a real Stellar tx, the Agent gets back the tx hash in the
   `PAYMENT-RESPONSE` header, and we stamp it onto the UI. This is the
   architectural credibility that proves the API is agent-ready.

### Repository layout

```
hoops_calypso-x402/                 pnpm workspaces monorepo
├── apps/
│   ├── api/                        Express + x402 + agent + orchestrator + bots
│   │   ├── src/
│   │   │   ├── server/             bootstrap, local x402 facilitator, routes
│   │   │   │   ├── index.ts              Express wiring (free + /agent/* + gated)
│   │   │   │   ├── localFacilitator.ts   in-process x402 facilitator (elevated fee)
│   │   │   │   ├── x402.ts               paymentMiddlewareFromConfig wiring
│   │   │   │   └── routes/               plan / simulate / analyze / wallets / tx
│   │   │   ├── agent/              THE autonomous x402 payer
│   │   │   │   ├── agent.ts              runSimulation(), stopSimulation(), withdraw()
│   │   │   │   └── routes.ts             UI-facing remote-control surface
│   │   │   ├── orchestrator/       session / wallets / launcher / configStore
│   │   │   │   ├── agentWallet.ts        Calypso Agent Ed25519 singleton
│   │   │   │   ├── platformWallet.ts     API revenue wallet (x402 payTo sink)
│   │   │   │   ├── wallets.ts            per-bot EOA + smart account factory
│   │   │   │   ├── launcher.ts           bot spawn + fund + start chassis
│   │   │   │   ├── teardown.ts           drain bot funds back to agent
│   │   │   │   └── session.ts            in-memory SessionManager + event subs
│   │   │   ├── bots/               chassis + arbitrageur / noise / lp archetypes
│   │   │   ├── router/             Hoops router wrapper
│   │   │   ├── aggregator/         bot logs → Metrics
│   │   │   ├── ai/                 Gemma 4 planner + reviewer
│   │   │   └── constants.ts        addresses from hoops-sdk-types
│   │   └── scripts/                bootstrap, smoke scripts
│   └── web/                        Next.js 16 UI — pure harness
│       ├── app/
│       │   ├── page.tsx            landing + published prices
│       │   ├── simulate/page.tsx   NL prompt → POST /agent/simulate → ceremony
│       │   ├── sessions/[id]/page.tsx  live view · traces · stop · per-bot logs
│       │   └── wallets/page.tsx    fund agent · withdraw · mint testnet USDC
│       ├── components/
│       │   ├── WalletProvider.tsx      Freighter-only (optional)
│       │   ├── AgentPill.tsx           nav chip · live agent USDC balance
│       │   ├── FlowDiagram.tsx         4-party money flow + revenue side rail
│       │   ├── X402Ceremony.tsx        trace-driven modal · Continue required
│       │   ├── SessionTimer.tsx        freezes on stop / end
│       │   ├── StopSessionButton.tsx   POST /agent/stop/:id + confirmation
│       │   └── PaymentStamp.tsx        red intaglio PAID stamp
│       └── lib/apiClient.ts        agent + wallets + admin + tx + SSE helpers
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

**Requirements:** Node 20+, pnpm 10+, the sibling `hoops_sdk` repo checked
out at `../hoops_sdk` (Calypso `file:` links into it), a Google AI Studio
API key (optional — the reviewer logs a one-time warning and skips if unset),
and the [Freighter](https://freighter.app) browser extension in testnet mode
if you want to use the `/wallets` fund/withdraw flows.

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
# → :9990 · auto-generates AGENT_SECRET and FACILITATOR_SECRET on first boot
# → friendbot-funds both + admin-mints starter USDC to the agent

# 5. launch the ui (terminal 2)
pnpm dev:web
# → http://localhost:3000
```

Then open http://localhost:3000 and click **run a simulation**. No wallet
required — the Calypso Agent pays for itself out of its startup USDC top-up.
Connect Freighter only if you want to fund the agent from your own wallet or
withdraw its balance out.

### Smoke scripts

```bash
# Single swap through the Hoops router wrapper.
pnpm smoke:swap

# One noise bot running for 90 seconds; asserts ≥1 successful swap.
pnpm smoke:noise

# Full agent workflow — POST /agent/simulate, wait, report, stop.
pnpm smoke:session
```

### Calling the API from a third-party agent

Any x402-capable agent can use Calypso without touching the UI. The
handshake is the standard `@x402/fetch` pattern:

```ts
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const signer = createEd25519Signer(MY_STELLAR_SECRET, "stellar:testnet");
const client = new x402Client().register("stellar:testnet", new ExactStellarScheme(signer));
const paidFetch = wrapFetchWithPayment(fetch, client);

const res = await paidFetch("http://localhost:9990/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: "3 minute demo with 1 arb bot" }),
});
const plan = await res.json();
```

The 402 → sign → retry → settle loop is handled automatically. The agent's
wallet needs XLM (friendbot) and a trustline-free Hoops USDC balance (admin
mint via `POST /admin/mint-usdc` for testnet).

---

## API reference

Two surfaces: the **gated API** (what x402 agents pay for) and the **free
agent remote-control surface** (what the UI talks to). The facilitator runs
in-process; the default `X402_FACILITATOR_URL` in `.env.example` is kept for
reference but no longer used.

### Free: agent remote control

All free, consumed by the UI. The agent is the one calling the gated
routes behind the scenes, so these endpoints are the UI's sole entry
point into Calypso functionality.

- `GET  /agent` — identity + live balances + session count
- `GET  /agent/balance` — just the balances
- `POST /agent/simulate` — `{ prompt }` → runs the full workflow:
   pay /plan, pay /simulate, spawn bots, return `{ session_id, plan_trace,
   simulate_trace }` with real on-chain tx hashes
- `POST /agent/stop/:id` — abort bots + teardown + return residuals
- `POST /agent/withdraw` — `{ to, amount }` → agent-signed USDC transfer
- `GET  /agent/sessions` — list
- `GET  /agent/session/:id` — full report
- `GET  /agent/session/:id/events` — SSE stream

### Free: wallet inspection + testnet faucets

- `GET  /wallets/platform` — API revenue wallet balances
- `GET  /wallets/balance?address=G...` — any Stellar address
- `POST /admin/mint-usdc` — `{ address, usdc_amount }` testnet USDC faucet
- `POST /tx/build-fund-agent` — `{ from, usdc_amount }` → returns unsigned
   XDR for a user → agent Soroban token transfer. Freighter signs. Used
   by the /wallets "Fund Agent" card for the real on-chain flow.
- `POST /tx/submit` — `{ signed_xdr }` → submits + waits for confirmation

### Gated: the product

All three are gated by `@x402/express`'s `paymentMiddlewareFromConfig`
against the local in-process facilitator.

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

### `GET /health` — free

`{ ok, api_revenue_wallet, network, x402_gated: true }` — lightweight
liveness probe.

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
- **Local-only facilitator:** the hosted `x402.org/facilitator` has
  `maxTransactionFeeStroops = 50 000`, which rejects Soroban contract
  settles because resource fees routinely exceed that. Calypso runs a
  local in-process facilitator (following the official
  `stellar/x402-stellar` self-hosted pattern) with a 5 000 000 stroop
  ceiling. Pointing at the hosted facilitator fails fast with
  `invalid_exact_stellar_payload_fee_exceeds_maximum`.
- **No persistence:** sessions live in memory. Restarting the API
  wipes all session state. Durability is on the roadmap; for a 48-hour
  hackathon build it's out of scope.
- **Testnet only:** all funding is via friendbot. Mainnet mode would
  require a real USDC on-ramp and a user-deposit treasury; the
  architecture supports it but the demo runs on free testnet XLM.
- **No Stripe MPP:** x402 is wired end-to-end. MPP was listed as a
  stretch goal with a 4-hour timebox and was deferred in favor of the
  agent-centric UX + real on-chain fund/withdraw flows.
- **`RouterContract.getBestQuote` bug:** there's a latent deserialization
  bug in `hoops-sdk-core` where `getBestQuote` assumes `Option<SwapQuote>`
  is wrapped in a `Vec`. Calypso routes around it by calling
  `getAllQuotes` and picking the max `amountOut` itself.
- **Single shared agent:** the Calypso Agent is one Stellar G-account
  for the whole deployment, persisted as `AGENT_SECRET` in `.env`. In
  production each user would get their own agent — likely as a
  user-owned Soroban smart account with custom auth policies (see
  OpenZeppelin's smart-account pattern) — so a user's x402 spend is
  bounded by their own balance, not shared.

---

## Roadmap

1. **Per-user Calypso Agents.** Replace the single shared `AGENT_SECRET`
   with a deployed Soroban smart account per user (OpenZeppelin's
   smart-account pattern with custom auth policies). Spend caps, allow-
   lists on which gated endpoints the agent may call, TTLs. This is the
   durable form of the demo agent.
2. **Stripe MPP.** Add `@stellar/mpp` charge intent as an alt payment
   rail. `X-Payment-Rail: mpp` header switches the middleware.
3. **Chat interface** — natural-language session builder on top of the
   same planner pipeline. SCF deliverable D8.
4. **Mainnet mode** — bots join real markets and optimize for yield
   rather than simulation fidelity. User-deposited treasury.
5. **Generic multi-DEX execution** — fix the Soroban auth pattern in
   `hoops_sdk` so Calypso can route a swap through any adapter at
   runtime, not just Soroswap.
6. **Indexer stress test** — crank the swarm to 20+ bots and watch the
   Hoops indexer absorb the load. SCF deliverable D5.
7. **Protocol adapters** — Blend, DeFindex, and future Stellar DeFi
   protocols plug in at the router layer.

---

## Demo script

Two-and-a-half-minute shot list for the submission video. Every claim
below corresponds to a visible UI moment or a tx hash on stellar.expert.

**00:00 · Cold open — the pitch.**
Land on `http://localhost:3000`. Big display headline:
*"Market environments are a paid API."* Narrate: "Calypso turns Stellar
DeFi market simulation into a pay-per-call capability. Every call is
settled on-chain via x402."

**00:15 · Show the published prices.**
Point at the right-rail pricing card — POST `/plan` $0.50, POST `/simulate`
$2.00, POST `/analyze` $0.50. Say: "Three gated endpoints. An autonomous
Calypso Agent pays all three."

**00:25 · Walk into /wallets.**
Scroll through the FlowDiagram. Three tiers — User → Agent → Bots — and a
side rail showing the API Revenue sink. Narrate: "Four parties. The agent
is the economic actor. The user only shows up to fund or withdraw."

**00:40 · Real on-chain fund flow.**
Click **Fund Agent**, enter 5 USDC, press sign & send. Freighter popup
lands, user approves. Explorer tx hash confirms. Narrate: "Real USDC
transfer on Stellar testnet, signed by my Freighter, source-account auth
on the Soroban contract call."

**01:00 · Launch a simulation.**
Navigate to `/simulate`, pick the 3-minute prompt, click **launch session**.
The X402Ceremony modal opens with a dispatch spinner: *"Agent is calling
/plan and /simulate."*

**01:10 · The hero frame.**
Modal flips to SETTLED. The big red PAID stamp slaps onto the screen.
Two trace cards show **real tx hashes**: `/plan` $0.50 and `/simulate`
$2.00. Click one — it opens stellar.expert with the real Soroban contract
call. Narrate: "Both payments settled through an in-process x402
facilitator. The agent pays itself, I never signed anything."

**01:35 · Click CONTINUE.**
Navigate to the live session page. FlowDiagram lights up with the bot
tier — three bot cards, each with a per-bot EOA and Hoops smart account,
each with live balances flowing in from the agent. Narrate: "The agent
just funded three bot smart accounts with USDC."

**01:50 · Watch the log tape stream.**
Point at the live log — SSE-streamed swap actions, tx hashes, pool
interactions. Click one bot's row to filter the log. Show the AI
adjustments rail. Narrate: "Real Soroswap swaps through the Hoops router,
every five minutes Gemma 4 reviews and retunes."

**02:10 · Stop.**
Click **STOP SESSION**. Confirm in the modal. Drain happens — the modal
flips to a success state showing the recovered XLM + USDC. Narrate:
"Explicit teardown. All bot funds drain back to the agent via real
on-chain transfers."

**02:25 · Withdraw.**
Back to `/wallets`. Click **Withdraw from Agent**, pull 2 USDC out. Show
the returned tx hash. Narrate: "And I can pull my money back out any
time. End-to-end agentic payment, real on-chain, no UI signatures
required during the simulation itself."

**02:40 · Close card.**
Cut back to the landing page. *"Market environments are a paid API. This
is infrastructure autonomous agents can pay to think."*

The whole flow touches: local x402 facilitator, real Stellar testnet tx
settlement, Soroban contract calls, Ed25519 auth, the Hoops router,
rule-based chassis, and the Gemma 4 reviewer. Everything you'd expect
from a Stellar Agents x402 + MPP submission except MPP itself.

---

## License

MIT.

## Credits

Built by [Hoops Finance](https://hoops.finance) for the
[Stellar Hacks: Agents](https://dorahacks.io/hackathon/stellar-agents-x402-stripe-mpp)
hackathon. Calypso is part of an active SCF grant (tranche 3) and its
architecture directly advances deliverables D5 through D9.
