"use client";

import { useState } from "react";
import Link from "next/link";

type Section = "overview" | "architecture" | "x402" | "api" | "bots" | "safety" | "agent-sdk";

const NAV: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "x402", label: "x402 Payments" },
  { id: "api", label: "API Reference" },
  { id: "bots", label: "Bot Archetypes" },
  { id: "safety", label: "Safety Bounds" },
  { id: "agent-sdk", label: "Agent SDK" },
];

export default function DocsPage() {
  const [active, setActive] = useState<Section>("overview");

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          ← home
        </Link>
        <span className="ship-mark">documentation</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        {/* Sidebar nav */}
        <nav className="lg:sticky lg:top-[140px] lg:self-start space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              type="button"
              className={`block w-full text-left px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors ${
                active === item.id
                  ? "text-primary border-l-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="min-w-0">
          {active === "overview" && <OverviewSection />}
          {active === "architecture" && <ArchitectureSection />}
          {active === "x402" && <X402Section />}
          {active === "api" && <ApiSection />}
          {active === "bots" && <BotsSection />}
          {active === "safety" && <SafetySection />}
          {active === "agent-sdk" && <AgentSdkSection />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function OverviewSection() {
  return (
    <article>
      <DocH1>Overview</DocH1>
      <DocP>
        Calypso is DeFi market simulation as a paid API on Stellar. An autonomous
        agent pays USDC micropayments via x402 to spin up trading bot swarms
        across Soroswap, Aqua, and Phoenix. Gemini Flash reviews the swarm every
        5 minutes and retunes bot parameters live.
      </DocP>

      <DocH2>How it works</DocH2>
      <div className="space-y-4 mt-4">
        <Step n="1" title="Agent pays">
          The Calypso Agent fires <Code>POST /plan</Code> via <Code>@x402/fetch</Code>.
          The server returns HTTP 402 with a USDC price. The agent signs a Soroban auth
          entry, retries, and the in-process facilitator settles on-chain. Gemini Flash
          turns the prompt into a session config.
        </Step>
        <Step n="2" title="Bots deploy">
          The agent fires <Code>POST /simulate</Code> ($0.05). Calypso spawns ephemeral
          bot wallets (Ed25519 EOA + Hoops smart account per bot), funds them with USDC
          from the agent, and starts the chassis loops.
        </Step>
        <Step n="3" title="Watch and stop">
          SSE streams every bot action to the session page. Hit STOP to abort and
          drain all bot funds back to the agent. Sessions also auto-end after
          their configured duration, with automatic fund recovery.
        </Step>
      </div>

      <DocH2>Key design choice</DocH2>
      <DocP>
        The agent calls the API over real localhost HTTP with real{" "}
        <Code>@x402/fetch</Code> — not via internal function calls. The facilitator
        verifies every payment. A third-party agent running on a separate machine
        would see identical behavior.
      </DocP>
    </article>
  );
}

function ArchitectureSection() {
  return (
    <article>
      <DocH1>Architecture</DocH1>
      <DocP>
        Four parties, one process, one facilitator. The UI never signs anything.
      </DocP>

      <CodeBlock title="System diagram">{`User / Freighter (optional)
  │  real on-chain USDC transfer
  ▼
Calypso Agent (Ed25519 G-account)
  │  pays /plan $0.01  ·  pays /simulate $0.05
  │  @x402/fetch → HTTP 402 → sign → retry → 200
  ▼
Express API (:9990)  ←→  In-process facilitator
  │                       ExactStellarScheme · maxFee 5M stroops
  ▼
Orchestrator → Bot Swarm (ephemeral)
  [arb] [noise] [lp]
  per-bot EOA + Hoops smart account
  │
  ▼
Hoops Router → Soroswap / Phoenix / Aqua`}</CodeBlock>

      <DocH2>Why the agent pays, not the user</DocH2>
      <DocP>
        x402 is an agent-to-agent protocol. If the UI opens a wallet popup on
        every call, we have built a paywall, not an agentic payment rail. So the
        agent is the x402 payer. The user funds the agent once via Freighter, and
        from then on every API call is signed autonomously.
      </DocP>

      <DocH2>In-process facilitator</DocH2>
      <DocP>
        The hosted x402.org facilitator caps <Code>maxTransactionFeeStroops</Code>{" "}
        at 50,000, which rejects Soroban contract settles. Calypso runs{" "}
        <Code>ExactStellarScheme</Code> in-process with a 5,000,000 stroop ceiling.
        A dedicated <Code>FACILITATOR_SECRET</Code> keypair (auto-generated,
        friendbot-funded) signs the submitted transactions.
      </DocP>

      <DocH2>Wallet model</DocH2>
      <div className="mt-4 space-y-2">
        <Tier label="User" desc="Optional Freighter wallet. Funds the agent, receives withdrawals." />
        <Tier label="Agent" desc="Ed25519 G-account. Autonomous x402 payer. Persisted in AGENT_SECRET." />
        <Tier label="Bots" desc="Ephemeral per-session. EOA + Hoops smart account. Funded by agent, drained on end. Keypairs persisted to disk for crash recovery." />
        <Tier label="Revenue" desc="PAY_TO wallet. Pure x402 sink. Receives every micropayment." />
      </div>
    </article>
  );
}

function X402Section() {
  return (
    <article>
      <DocH1>x402 Payments</DocH1>
      <DocP>
        Every gated API call follows the standard x402 handshake. The agent
        discovers the price from the 402 response, signs a Soroban auth entry,
        and retries with the payment header attached.
      </DocP>

      <DocH2>Payment flow</DocH2>
      <div className="space-y-3 mt-4">
        <FlowStep n="1" label="402">Agent calls <Code>POST /plan</Code>. Server returns HTTP 402 with price in header.</FlowStep>
        <FlowStep n="2" label="sign">Agent extracts price, signs a Soroban auth entry with its Ed25519 keypair.</FlowStep>
        <FlowStep n="3" label="retry">Agent retries the same request with <Code>X-PAYMENT</Code> header attached.</FlowStep>
        <FlowStep n="4" label="settle">In-process facilitator verifies the payment and submits the USDC transfer on-chain.</FlowStep>
        <FlowStep n="5" label="200">Server returns the API response. <Code>PAYMENT-RESPONSE</Code> header contains the tx hash.</FlowStep>
      </div>

      <DocH2>Prices</DocH2>
      <div className="mt-4 border border-border bg-card/40">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              <th className="text-left px-4 py-2">endpoint</th>
              <th className="text-left py-2">method</th>
              <th className="text-right px-4 py-2">price</th>
              <th className="text-right px-4 py-2">stroops</th>
            </tr>
          </thead>
          <tbody>
            <PriceTableRow path="/plan" price="$0.01" stroops="100,000" />
            <PriceTableRow path="/simulate" price="$0.05" stroops="500,000" />
            <PriceTableRow path="/analyze" price="$0.01" stroops="100,000" />
          </tbody>
        </table>
      </div>

      <DocH2>Packages used</DocH2>
      <CodeBlock title="x402 stack">{`@x402/core       — payment types, header encoding
@x402/express    — paymentMiddlewareFromConfig
@x402/stellar    — ExactStellarScheme (client + server)
@x402/fetch      — wrapFetchWithPayment`}</CodeBlock>
    </article>
  );
}

function ApiSection() {
  return (
    <article>
      <DocH1>API Reference</DocH1>
      <DocP>
        Two surfaces: the gated product API (x402-protected) and the free agent
        remote-control surface (consumed by the UI).
      </DocP>

      <DocH2>Gated endpoints (x402)</DocH2>

      <Endpoint method="POST" path="/plan" price="$0.01">
        <CodeBlock title="Request">{`{ "prompt": "stress test USDC/XLM with 3 bots for 5 minutes" }`}</CodeBlock>
        <CodeBlock title="Response">{`{
  "session_config": {
    "name": "...",
    "duration_minutes": 5,
    "target_pools": ["soroswap:USDC/XLM"],
    "initial_treasury_xlm": 10000,
    "demo_mode": false
  },
  "bot_configs": [
    { "archetype": "noise", "bot_id": "noise-1", ... }
  ],
  "estimated_cost_usd": 0.06,
  "target_pools": ["soroswap:USDC/XLM"],
  "_ai": { "reasoning": "...", "model": "gemini-2.5-flash" }
}`}</CodeBlock>
      </Endpoint>

      <Endpoint method="POST" path="/simulate" price="$0.05">
        <CodeBlock title="Request">{`{ "session_config": {...}, "bot_configs": [...] }`}</CodeBlock>
        <CodeBlock title="Response">{`{
  "session_id": "uuid",
  "status": "running",
  "started_at": "2026-04-12T16:16:37Z"
}`}</CodeBlock>
      </Endpoint>

      <Endpoint method="POST" path="/analyze" price="$0.01">
        <CodeBlock title="Request">{`{
  "contracts": {
    "router": "C...",
    "pools": ["C..."],
    "tokens": ["C..."]
  }
}`}</CodeBlock>
        <CodeBlock title="Response">{`{
  "pool_health": [...],
  "liquidity_depth_usd": 0.0,
  "fee_analysis": {...},
  "risk_profile": {...}
}`}</CodeBlock>
      </Endpoint>

      <DocH2>Free endpoints — agent remote control</DocH2>
      <div className="mt-4 space-y-2">
        <EndpointRow method="GET" path="/agent" desc="Identity + live balances + session count" />
        <EndpointRow method="GET" path="/agent/balance" desc="Just the balances" />
        <EndpointRow method="POST" path="/agent/simulate" desc="Full workflow: plan + simulate + spawn bots" />
        <EndpointRow method="POST" path="/agent/plan-stream" desc="Plan only, NDJSON streaming progress" />
        <EndpointRow method="POST" path="/agent/launch" desc="Direct launch with user-supplied config" />
        <EndpointRow method="POST" path="/agent/stop/:id" desc="Abort + teardown + drain bot funds" />
        <EndpointRow method="POST" path="/agent/withdraw" desc="Agent-signed USDC transfer to any address" />
        <EndpointRow method="GET" path="/agent/sessions" desc="List all sessions" />
        <EndpointRow method="GET" path="/agent/session/:id" desc="Full session report with traces" />
        <EndpointRow method="GET" path="/agent/session/:id/events" desc="SSE live stream of bot actions" />
      </div>

      <DocH2>Free endpoints — wallets + faucets</DocH2>
      <div className="mt-4 space-y-2">
        <EndpointRow method="GET" path="/wallets/platform" desc="API revenue wallet balances" />
        <EndpointRow method="GET" path="/wallets/balance" desc="Any Stellar address balance (?address=G...)" />
        <EndpointRow method="POST" path="/admin/mint-usdc" desc="Testnet USDC faucet" />
        <EndpointRow method="POST" path="/tx/build-fund-agent" desc="Build unsigned XDR for Freighter signing" />
        <EndpointRow method="POST" path="/tx/submit" desc="Submit Freighter-signed XDR" />
        <EndpointRow method="GET" path="/health" desc="Liveness probe" />
      </div>
    </article>
  );
}

function BotsSection() {
  return (
    <article>
      <DocH1>Bot Archetypes</DocH1>
      <DocP>
        Each archetype is a pure <Code>tick()</Code> function registered with the
        shared chassis. The chassis handles observe, decide, execute, log — plus
        exponential backoff on errors and live config re-reads so AI parameter
        changes take effect within one cycle.
      </DocP>

      <BotCard
        name="noise"
        file="apps/api/src/bots/noise.ts"
        desc="Random volume generator. Picks a random XLM swap size within [min_amount, max_amount] on each tick. Routes through the best-priced adapter. Generates background volume for the other bots to work against."
        params={[
          ["interval_seconds", "5-300", "Time between ticks"],
          ["min_amount", "number", "Minimum XLM swap size"],
          ["max_amount", "number", "Maximum XLM swap size"],
          ["target_pools", "string[]", "Pool references (e.g. soroswap:USDC/XLM)"],
        ]}
      />

      <BotCard
        name="arbitrageur"
        file="apps/api/src/bots/arbitrageur.ts"
        desc="Spread hunter. Every tick: queries all adapters (Soroswap, Phoenix, Aqua) for quotes, computes spread in basis points, executes if spread exceeds threshold. Logs observed spread even when skipping so the AI reviewer can tune."
        params={[
          ["interval_seconds", "5-300", "Time between ticks"],
          ["min_spread_bps", "1-1000", "Minimum spread to trigger execution"],
          ["max_position_size", "number", "Max XLM per swap"],
          ["target_pairs", "string[]", "Token pairs to monitor"],
          ["target_dexes", "string[]", "DEX adapters to query"],
        ]}
      />

      <BotCard
        name="lp_manager"
        file="apps/api/src/bots/lp.ts"
        desc="Liquidity manager. First tick deposits 50/50 USDC/XLM across Aqua and Soroswap. Subsequent ticks read LP positions and execute small rebalance probe swaps based on the rebalance_threshold."
        params={[
          ["interval_seconds", "5-300", "Time between ticks"],
          ["rebalance_threshold", "0-1", "Probability of rebalance probe per tick"],
          ["target_pool", "string", "Primary pool reference"],
          ["deposit_amount", "number", "Initial deposit USDC amount"],
        ]}
      />
    </article>
  );
}

function SafetySection() {
  return (
    <article>
      <DocH1>Safety Bounds</DocH1>

      <div className="space-y-6 mt-6">
        <SafetyItem title="Rate limits">
          10 requests/minute/IP on <Code>/plan</Code>, 5 requests/minute/IP on{" "}
          <Code>/simulate</Code>. Protects the Gemini quota and testnet from abuse.
        </SafetyItem>

        <SafetyItem title="AI delta clamps">
          The config store clamps every numeric delta from the AI reviewer.{" "}
          <Code>interval_seconds</Code> stays in [5, 300],{" "}
          <Code>max_amount</Code> and <Code>max_position_size</Code> capped at 100 XLM,{" "}
          <Code>min_spread_bps</Code> at 1000, <Code>rebalance_threshold</Code> at [0, 1].
        </SafetyItem>

        <SafetyItem title="Parse failure pause">
          If Gemini returns unparseable JSON 3 times in a row for the same session,
          the reviewer pauses for that session. Malformed LLM output never corrupts
          a live config.
        </SafetyItem>

        <SafetyItem title="Session circuit breaker">
          25 errors in a session aborts all bots, sets status to failed, and
          triggers automatic fund recovery back to the agent.
        </SafetyItem>

        <SafetyItem title="Exponential backoff">
          The chassis doubles sleep interval on each consecutive error (capped at
          30s). A broken pool does not turn into a transaction spam loop.
        </SafetyItem>

        <SafetyItem title="Auto-end teardown">
          When a session&apos;s duration expires, bots stop and all funds (USDC + XLM)
          are automatically drained back to the agent wallet.
        </SafetyItem>

        <SafetyItem title="Crash recovery (bot keystore)">
          Bot keypairs are persisted to <Code>data/sessions/&lbrace;id&rbrace;.json</Code> the
          moment bots are created. If the server crashes mid-session, the next
          startup detects leftover keystore files, rebuilds the bot wallets from
          the stored secrets, runs teardown to drain stranded funds back to the
          agent, and deletes the file. The agent never loses money — the only
          cost is the x402 API fee, which is the product working as designed.
        </SafetyItem>

        <SafetyItem title="Fund recovery on all exit paths">
          Three paths end a session — manual stop, auto-end timer, and circuit
          breaker. All three trigger teardown and fund recovery. A fourth path
          (server crash) is covered by the bot keystore. No exit leaves funds
          stranded in bot accounts.
        </SafetyItem>
      </div>
    </article>
  );
}

function AgentSdkSection() {
  return (
    <article>
      <DocH1>Calling from a third-party agent</DocH1>
      <DocP>
        Any x402-capable agent can use Calypso without touching the UI. The
        handshake is the standard <Code>@x402/fetch</Code> pattern:
      </DocP>

      <CodeBlock title="TypeScript — third-party agent">{`import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const signer = createEd25519Signer(MY_STELLAR_SECRET, "stellar:testnet");
const client = new x402Client()
  .register("stellar:testnet", new ExactStellarScheme(signer));
const paidFetch = wrapFetchWithPayment(fetch, client);

// Plan a session ($0.01)
const planRes = await paidFetch("http://localhost:9990/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "3 minute demo with 1 arb bot and 2 noise bots"
  }),
});
const plan = await planRes.json();

// Launch the session ($0.05)
const simRes = await paidFetch("http://localhost:9990/simulate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    session_config: plan.session_config,
    bot_configs: plan.bot_configs
  }),
});
const { session_id } = await simRes.json();

// Stream live events
const events = new EventSource(
  \`http://localhost:9990/agent/session/\${session_id}/events\`
);
events.addEventListener("bot_action", (e) => {
  console.log(JSON.parse(e.data));
});`}</CodeBlock>

      <DocH2>Requirements</DocH2>
      <DocP>
        The agent wallet needs XLM (friendbot) and a Hoops USDC balance (admin
        mint via <Code>POST /admin/mint-usdc</Code> for testnet). No trustline
        setup required — the Hoops USDC contract handles it.
      </DocP>

      <DocH2>Environment</DocH2>
      <CodeBlock title=".env">{`SOROBAN_NETWORK=testnet
RPC_URL=https://soroban-testnet.stellar.org
API_PORT=9990
GEMINI_API_KEY=your-key     # optional — AI planner + reviewer
AI_MODEL=gemini-2.5-flash   # default
AI_INTERVAL_MS=300000       # 5 min between AI reviews`}</CodeBlock>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

function DocH1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-4xl md:text-5xl font-semibold text-paper tracking-tight mb-6">
      {children}
    </h1>
  );
}

function DocH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl font-semibold text-paper tracking-tight mt-10 mb-3 pt-6 border-t border-border/60">
      {children}
    </h2>
  );
}

function DocP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] text-muted-foreground leading-relaxed max-w-[720px]">
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[13px] text-primary bg-primary/10 px-1.5 py-0.5">
      {children}
    </code>
  );
}

function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="mt-4 border border-border bg-ink/60 corner-marks">
      <div className="px-4 py-2 border-b border-border/60 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </div>
      <pre className="px-4 py-3 font-mono text-[12px] text-foreground/90 leading-relaxed overflow-x-auto whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start border border-border bg-card/30 p-4">
      <div className="font-display text-3xl font-semibold text-primary leading-none shrink-0 w-8 tabular-nums">
        {n}
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground mb-1">
          {title}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Tier({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary shrink-0 w-[72px] pt-0.5">
        {label}
      </span>
      <span className="text-sm text-muted-foreground">{desc}</span>
    </div>
  );
}

function FlowStep({ n, label, children }: { n: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 shrink-0 w-[72px]">
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{n}.</span>
        <span className="method-badge method-402 text-[8px]">{label}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function PriceTableRow({ path, price, stroops }: { path: string; price: string; stroops: string }) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="px-4 py-2 text-foreground">{path}</td>
      <td className="py-2"><span className="method-badge method-POST">POST</span></td>
      <td className="px-4 py-2 text-right text-primary font-semibold">{price}</td>
      <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{stroops}</td>
    </tr>
  );
}

function Endpoint({ method, path, price, children }: { method: string; path: string; price: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border border-border-strong bg-card/40 corner-marks">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <span className="method-badge method-POST">{method}</span>
          <span className="font-mono text-sm text-foreground">{path}</span>
        </div>
        <span className="font-mono text-sm text-primary font-semibold">{price}</span>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  );
}

function EndpointRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
      <span className={`method-badge ${method === "GET" ? "method-GET" : "method-POST"} shrink-0`}>
        {method}
      </span>
      <span className="font-mono text-xs text-foreground shrink-0 min-w-[200px]">{path}</span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  );
}

function BotCard({
  name,
  file,
  desc,
  params,
}: {
  name: string;
  file: string;
  desc: string;
  params: [string, string, string][];
}) {
  return (
    <div className="mt-6 border border-border bg-card/40 corner-marks">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="font-mono text-sm font-semibold text-primary">{name}</div>
        <div className="font-mono text-[9px] text-muted-foreground">{file}</div>
      </div>
      <div className="p-5">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{desc}</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground border-b border-border/60">
              <th className="text-left py-1.5">param</th>
              <th className="text-left py-1.5">type/range</th>
              <th className="text-left py-1.5">description</th>
            </tr>
          </thead>
          <tbody>
            {params.map(([param, type, description]) => (
              <tr key={param} className="border-b border-border/30 last:border-0">
                <td className="py-1.5 font-mono text-primary">{param}</td>
                <td className="py-1.5 font-mono text-foreground/70">{type}</td>
                <td className="py-1.5 text-muted-foreground">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SafetyItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-primary/40 pl-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary mb-1">
        {title}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
