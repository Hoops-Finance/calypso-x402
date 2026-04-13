# Calypso: Agent-Paid Bot Swarms on Stellar

*Built for Stellar Hacks: Agents (x402 + Stripe MPP) on DoraHacks, April 2026.*

---

## The problem

Setting up a DeFi market simulation today requires accounts, API keys, subscriptions, infrastructure, and operational overhead. An autonomous agent that wants to test a trading strategy on Stellar cannot simply discover an endpoint, pay for it, and receive a running market environment. The tooling does not exist.

Meanwhile, the x402 protocol has introduced a pattern where HTTP APIs can require payment inline — a server returns `402 Payment Required`, the client signs a USDC payment on Stellar, retries, and the facilitator settles on-chain. This pattern was designed for exactly the kind of capability Calypso offers: a service that executes on-chain and returns intelligence, not a static resource behind a paywall.

## What Calypso does

Calypso turns DeFi market simulation into a pay-per-call API on Stellar. An autonomous agent pays USDC micropayments via x402 to spin up a swarm of rule-based trading bots that execute real transactions through the Hoops router across Soroswap, Aqua, and Phoenix on testnet. A Gemini Flash orchestrator reviews the swarm every five minutes and retunes bot parameters live.

Three gated endpoints, three micropayments:

| Endpoint | Price | What it does |
|----------|-------|-------------|
| `POST /plan` | $0.01 | Gemini Flash turns a natural language prompt into a structured session config |
| `POST /simulate` | $0.05 | Registers a session, spawns bot wallets, starts trading |
| `POST /analyze` | $0.01 | On-chain protocol health analysis |

Every payment is a real USDC transfer on Stellar testnet, settled by an in-process x402 facilitator. Every transaction hash is verifiable on stellar.expert.

## Why the agent pays, not the user

Early versions of Calypso had the user's Freighter wallet sign every x402 payment directly. That is architecturally wrong. x402 is an agent-to-agent protocol. If the UI opens a wallet popup on every API call, you have built a paywall, not an agentic payment rail.

Calypso runs the agentic flow to its logical endpoint: a long-lived Calypso Agent with its own Stellar G-account is the x402 payer. The user funds the agent once via a real Freighter-signed on-chain transfer, and from then on every `/plan`, `/simulate`, and `/analyze` call is signed by the agent autonomously. The user can withdraw their balance back at any time.

Crucially, the agent calls the Calypso API over real localhost HTTP using `@x402/fetch`. This is not an internal function call with the x402 handshake mocked out. The facilitator verifies every payment. A third-party agent running on a separate machine would see identical behavior:

```typescript
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const signer = createEd25519Signer(MY_SECRET, "stellar:testnet");
const client = new x402Client()
  .register("stellar:testnet", new ExactStellarScheme(signer));
const paidFetch = wrapFetchWithPayment(fetch, client);

// This costs $0.01 USDC, settled on-chain
const res = await paidFetch("http://localhost:9990/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "3 minute stress test with 2 arb bots and 1 noise bot"
  }),
});
const plan = await res.json();
// plan._ai.reasoning contains the LLM's design rationale
```

## The x402 payment flow

Every gated API call follows this sequence:

1. The agent sends `POST /plan` to the server
2. The server returns `HTTP 402 Payment Required` with the price in the response header
3. `@x402/fetch` extracts the price, signs a Soroban auth entry with the agent's Ed25519 keypair
4. The agent retries the same request with the `X-PAYMENT` header attached
5. The in-process facilitator verifies the payment and submits a USDC transfer on Stellar
6. The server returns the API response. The `PAYMENT-RESPONSE` header contains the on-chain transaction hash

This is the standard x402 handshake. Calypso runs the facilitator in-process because the hosted `x402.org` facilitator has a `maxTransactionFeeStroops` ceiling of 50,000, which rejects Soroban contract calls where resource fees routinely exceed that on testnet. Following the official `stellar/x402-stellar` self-hosted pattern, Calypso runs `ExactStellarScheme` in-process with a 5,000,000 stroop ceiling and a dedicated facilitator keypair.

```typescript
// x402.ts — the payment middleware configuration
const routes = {
  "POST /plan": {
    accepts: {
      scheme: "exact",
      price: { asset: HOOPS_USDC_ASSET, amount: "100000" }, // $0.01
      network: "stellar:testnet",
      payTo: ENV.PAY_TO,
    },
  },
  "POST /simulate": {
    accepts: {
      scheme: "exact",
      price: { asset: HOOPS_USDC_ASSET, amount: "500000" }, // $0.05
      network: "stellar:testnet",
      payTo: ENV.PAY_TO,
    },
  },
};

const { client: facilitator } = await buildLocalFacilitator(network);
app.use(paymentMiddlewareFromConfig(routes, facilitator, schemes));
```

## Architecture: four parties, one process

```
User / Freighter (optional)
  |  real on-chain USDC transfer
  v
Calypso Agent (Ed25519 G-account, autonomous x402 payer)
  |  @x402/fetch -> HTTP 402 -> sign -> retry -> 200
  v
Express API (:9990) <-> In-process facilitator
  |                      ExactStellarScheme, 5M stroop ceiling
  v
Orchestrator -> Bot Swarm (ephemeral per-session)
  [arbitrageur] [noise] [lp_manager]
  per-bot Ed25519 EOA + per-bot Hoops smart account
  |
  v
Hoops Router -> Soroswap / Phoenix / Aqua
```

The UI is a pure harness. It never signs anything. It talks exclusively to free `/agent/*` routes, which dispatch to the Agent singleton. The Agent is the only economic actor in the system.

## Smart account integration and the Hoops router

Every bot in the swarm gets two things: an Ed25519 EOA (funded via friendbot) and a Hoops smart account deployed by the SDK. The smart account is a Soroban contract that wraps swap execution, LP deposits, and token transfers behind a single signing authority.

This pattern — ephemeral smart accounts controlled by an autonomous agent — is a precursor to the per-user agent smart accounts described in OpenZeppelin's Stellar smart account architecture. In production, each user's Calypso Agent would be a deployed smart account with custom auth policies: spend caps, endpoint allowlists, TTLs. The demo uses a shared Ed25519 keypair for simplicity, but the architecture is designed for that transition.

The Hoops router is the swap execution layer. All bot trades route through a single `RouterContract` that aggregates quotes from every DEX adapter:

```typescript
// hoopsRouter.ts — multi-DEX quoting + best-price execution
const quotes = await router().getAllQuotes(
  bot.pubkey, amountIn, TOKENS.xlm, TOKENS.usdc
);
// Filter to enabled adapters (Soroswap, Aqua, Phoenix)
const enabled = quotes.filter(q => ENABLED_ADAPTERS.has(q.adapterId));
// Pick the best price
let best = enabled[0];
for (const q of enabled) {
  if (q.amountOut > best.amountOut) best = q;
}
// Execute through the best-priced adapter, fallback to Soroswap
try {
  await bot.session.swapXlmToUsdc(xlmAmount, best.poolAddress);
} catch {
  await bot.session.swapXlmToUsdc(xlmAmount, POOLS.soroswapPair);
}
```

The SDK now supports generic `swap(poolAddress)`, so the router tries the best-priced adapter first and falls back to Soroswap if the non-Soroswap adapter hits a Soroban auth issue. Multi-DEX spread is always detected and logged.

## Bot archetypes

Three rule-based bot types share a common chassis that handles the observe-decide-execute-log loop, exponential backoff on errors, and live config re-reads:

**Noise trader** — random XLM swaps within configurable bounds. Generates background volume so the arbitrageur has spread to detect and the LP manager has drift to rebalance against.

**Arbitrageur** — every tick, queries all DEX adapters for quotes on a probe swap. Computes spread in basis points between best and worst. Executes when spread exceeds a configurable threshold. Logs observed spread even when skipping, so the AI reviewer can tune the threshold.

**LP manager** — first tick deposits 50/50 USDC/XLM into Aqua and Soroswap. Subsequent ticks read LP positions and execute small rebalance probe swaps based on a configurable threshold.

```typescript
// chassis.ts — the shared bot loop
while (!signal.aborted) {
  const config = getConfig(); // live config, AI can mutate between ticks
  try {
    await tick({ bot, config, log });
    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    log({ action: "error", error: err.message });
  }
  await sleepWithSignal(intervalMs * 2 ** consecutiveErrors, signal);
}
```

The chassis is deliberately simple. Intelligence lives in the AI reviewer, not the loop.

## AI orchestration with Gemini Flash

Gemini 2.5 Flash serves two roles:

**Planner** — takes a natural language prompt like "stress test USDC/XLM with aggressive arb bots for 5 minutes" and returns a structured `SessionConfig` with bot recipes. Uses `responseMimeType: "application/json"` for reliable structured output. The reasoning is returned as a field in the JSON response and displayed in the UI.

**Reviewer** — fires every five minutes (configurable via `AI_INTERVAL_MS`). Aggregates bot logs into a metrics summary, asks Gemini for parameter deltas, zod-validates the response, clamps values to safety bounds, and applies them to the live config store. Bots re-read their config on every tick, so changes take effect within one cycle.

```typescript
// reviewer.ts — AI parameter tuning loop
const metrics = summarize(session.botLogs, session.botConfigs);
const raw = await generate(REVIEWER_PROMPT + JSON.stringify(metrics), {
  temperature: 0.1,
  model: "gemini-2.5-flash",
});
// Flash returns clean JSON with responseMimeType
const deltas = AIReviewArraySchema.parse(JSON.parse(raw));
const applied = applyDeltas(session.id, deltas);
// e.g. arb-1.min_spread_bps = 5 (was 10) — "spread too tight, lowering threshold"
```

Safety bounds prevent the AI from corrupting a live session: `interval_seconds` clamped to [5, 300], `max_amount` capped at 100 XLM, `rebalance_threshold` clamped to [0, 1]. If Gemini returns unparseable JSON three times in a row, the reviewer pauses for that session.

## Fund safety and crash recovery

The agent wallet is persisted as `AGENT_SECRET` in `.env`. It survives server restarts. Bot wallets are ephemeral, but their keypairs are written to `data/sessions/{id}.json` the moment bots are created:

```json
{
  "sessionId": "694584ef-b6ee-4606-b74e-421885ac44b6",
  "savedAt": "2026-04-12T21:50:15.923Z",
  "bots": [
    {
      "botId": "noise-1",
      "secret": "S...",
      "pubkey": "G...",
      "smartAccountId": "C..."
    }
  ]
}
```

If the server crashes mid-session, the next startup scans for leftover keystore files, rebuilds bot wallets from stored secrets, runs teardown to drain stranded USDC and XLM back to the agent, and deletes the file. Four exit paths — manual stop, auto-end timer, circuit breaker (25 errors), and server crash — all trigger fund recovery. No path leaves money stranded in bot accounts.

## The Hoops Finance integration

Calypso is not a greenfield project. It is built on top of Hoops Finance's existing Stellar DeFi infrastructure:

| Layer | Provided by Hoops |
|-------|-------------------|
| Router contract | Deployed on testnet, aggregates quotes across four DEX adapters |
| DEX adapters | Soroswap (ID 3), Aqua (ID 0), Phoenix (ID 2), with Comet (ID 1) available |
| Smart accounts | Per-bot Soroban contracts wrapping swap/LP/transfer behind one signer |
| SDK | `hoops-sdk-core` (quoting, contracts), `hoops-sdk-actions` (HoopsSession) |
| Token contracts | Hoops testnet USDC (SAC-wrapped, admin-mintable for testing) |
| UI assets | Dashboard palette, protocol icons, brand tokens |

What Calypso built fresh: the x402 wiring, the bot chassis and archetypes, the session/launcher/aggregator orchestrator, the Gemini Flash planner and reviewer, the Next.js 16 UI, the agent wallet system, and the crash-recovery keystore. These are the first x402-on-Stellar and agent-economy components in the Hoops codebase.

## Agent economies: where this goes

Calypso demonstrates a specific thesis: **capabilities that execute on-chain can be sold as micropayment APIs to autonomous agents**. The implications extend beyond simulation:

**Real market execution.** The same architecture works on mainnet. Replace testnet friendbot funding with user-deposited treasuries. Replace simulation fidelity optimization with yield optimization. The bot chassis, the AI reviewer, the x402 payment flow, and the fund recovery system all transfer directly.

**Per-user agent smart accounts.** The demo uses a single shared agent keypair. In production, each user would deploy a Soroban smart account as their Calypso Agent. Custom auth policies would enforce spend caps (maximum USDC per session), endpoint allowlists (which gated routes the agent may call), and TTLs (auto-expire after 30 days). This is the OpenZeppelin smart account pattern applied to agent-economy infrastructure.

**Agent-to-agent composability.** Any x402-capable agent can call Calypso's API. A portfolio management agent could pay Calypso to stress-test a strategy before deploying capital. A risk analysis agent could pay for `/analyze` to score protocol health. A market-making agent could pay for real-time cross-DEX spread data. The payment protocol is the API contract.

**Multi-DEX routing.** The Hoops router already quotes across four DEX adapters. The SDK now supports generic `swap(poolAddress)`. Once the smart account contract's auth pattern is fixed for non-Soroswap adapters, Calypso bots will automatically route through whichever DEX offers the best price on every tick — true multi-venue execution.

## Technical stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node 20+, TypeScript |
| API server | Express |
| Payments | @x402/core, @x402/express, @x402/stellar, @x402/fetch |
| Blockchain | Stellar testnet (Soroban), @stellar/stellar-sdk 14.5 |
| AI | Gemini 2.5 Flash via generativelanguage.googleapis.com |
| UI | Next.js 16, Tailwind v4, Fraunces + JetBrains Mono |
| Wallet | @stellar/freighter-api (optional, user-side only) |
| Router | Hoops SDK (hoops-sdk-core, hoops-sdk-actions, hoops-sdk-types) |
| Monorepo | pnpm workspaces |

## About the hackathon

Calypso was built for **Stellar Hacks: Agents (x402 + Stripe MPP)** on DoraHacks, with a deadline of April 13, 2026. The hackathon focuses on two prize tracks: "Agent-to-agent payments and micropayments with x402" and "Practical AI agent applications that use x402 for autonomous payments."

Calypso targets both tracks. The x402 integration is real and verifiable — every API call produces an on-chain transaction hash. The AI integration is practical — Gemini Flash reliably generates session configs from natural language and retunes bot parameters based on live metrics. The agent architecture demonstrates that autonomous agents can pay for complex on-chain capabilities without human intervention.

Built by [Hoops Finance](https://hoops.finance) as part of an active Stellar Community Fund grant (tranche 3). The architecture directly advances SCF deliverables D5 through D9: indexer load testing, data-API extension, Gemini tool calling, chat interface groundwork, and multi-DEX composability.

---

*Repository: [github.com/Hoops-Finance/calypso-x402](https://github.com/Hoops-Finance/calypso-x402)*
*License: MIT*
