# Calypso Swarm — Build Progress

Last updated: 2026-04-12 ~02:55 UTC (night session)

## What's working end-to-end

### x402 Payment Flow (CORE — fully working)
- **Local in-process facilitator** (`apps/api/src/server/localFacilitator.ts`) — wraps `@x402/stellar/exact/facilitator` with `maxTransactionFeeStroops: 5_000_000` (hosted x402.org caps at 50k which rejects all Soroban settles)
- Dedicated `FACILITATOR_SECRET` keypair auto-generated + friendbot-funded, separate from payer and payee
- Agent calls API over **real localhost HTTP** with `@x402/fetch` — full 402 → sign → retry → settle on every call
- Real USDC flows agent → PAY_TO EOA confirmed on stellar.expert
- `PAYMENT-RESPONSE` header captured, tx hashes surfaced in UI

### Agent Architecture (fully wired)
- **Agent singleton** (`apps/api/src/agent/agent.ts`) — owns Ed25519 keypair, signs all x402 payments
- `AGENT_SECRET` auto-generated on first boot, persisted to `.env`
- Agent auto-tops-up via admin USDC mint when balance < 6 USDC (target: 50 USDC)
- Three agent workflows:
  - `runSimulation(prompt)` — pays /plan + /simulate, spawns bots
  - `planOnly(prompt)` — pays /plan only, returns config + reasoning (for AI two-step flow)
  - `launchDirect(config, bots)` — pays /simulate only, skips planner (for presets/custom)
- All three have streaming variants (`/agent/plan-stream`, `/agent/simulate-stream`) that emit NDJSON progress events

### Agent API Routes (all free, consumed by UI)
- `GET  /agent` — identity + balance
- `GET  /agent/balance` — just balances
- `POST /agent/simulate` — full workflow (blocking JSON)
- `POST /agent/simulate-stream` — full workflow (streaming NDJSON)
- `POST /agent/plan-stream` — plan only (streaming NDJSON)
- `POST /agent/launch` — direct launch with user config ($2.00 only)
- `POST /agent/withdraw` — agent → user USDC transfer
- `POST /agent/stop/:id` — abort + teardown + drain bot funds
- `GET  /agent/sessions` — list
- `GET  /agent/session/:id` — full report
- `GET  /agent/session/:id/events` — SSE live tail

### Gated API (x402, the product)
- `POST /plan` — $0.50 USDC, Gemma 4 planner
- `POST /simulate` — $2.00 USDC, session registration
- `POST /analyze` — $0.50 USDC, protocol analysis

### User-Signed Fund Flow (real on-chain Freighter → Agent)
- `POST /tx/build-fund-agent` — builds Soroban USDC transfer XDR with user as source
- `POST /tx/submit` — submits Freighter-signed XDR, waits for confirmation
- Full round trip verified: build → Freighter sign → submit → tx on-chain

### Bot Swarm (all three archetypes working)
- **noise** — random swaps on interval, tested ~20 actions/session with 0 failures
- **arbitrageur** — polls multi-DEX quotes, fires on spread > threshold
- **lp_manager** — initial deposit + periodic rebalance probes
- All route through Hoops router → Soroswap (Comet/Phoenix blocked by SDK auth issue)
- Bot wallets: Ed25519 EOA + Hoops smart account per bot, funded from agent
- Teardown drains bot funds back to agent on stop/auto-end

### AI (Gemma 4 primary, Gemini 2.5 Flash fallback)
- **Planner**: Gemma 4 generates session configs from NL prompts on first try
  - `extractJson` with `allJsonCandidates` handles Gemma's chain-of-thought reasoning output
  - Tries every JSON candidate against the zod schema until one matches
  - Falls back to `gemini-2.5-flash` if Gemma fails twice
  - Reasoning captured and surfaced in UI
- **Reviewer**: fires every 60s (configurable via `AI_INTERVAL_MS`)
  - Same schema-aware extraction
  - Applies live parameter deltas to running configs
  - Logged with model name in the AI adjustments rail

### UI (Next.js 16, Tailwind v4, fully agent-centric)
- **Session wallet infrastructure fully removed** — no browser keypair, no x402 from browser
- `/simulate` — three modes:
  - **AI Plan** ($0.50 + $2.00): two-step conversational flow
    1. "Ask Gemma" streams live terminal showing x402 handshake + Gemma reasoning
    2. Review step shows editable config + reasoning panel + plan receipt
    3. "Launch" pays simulate only
  - **Presets** ($2.00): three canned configs, skip planner
  - **Custom** ($2.00): manual form with bot config editor
- `/sessions/[id]` — live session dashboard:
  - Hero with state badge, timer (freezes on end), stop button
  - x402 receipts with real tx hashes + explorer links
  - Gemma reasoning in collapsible panel
  - Three-tier FlowDiagram (User → Agent → Bots) + API Revenue side rail
  - Bot table with clickable rows for per-bot log filtering
  - Live SSE log tape
  - AI adjustments rail
  - Session meta sidebar
- `/wallets` — agent money-flow control:
  - FlowDiagram with live balances
  - Mint testnet USDC (to Freighter)
  - Fund Agent (real Freighter-signed on-chain transfer)
  - Withdraw from Agent (agent-signed, no user signature needed)
- `/sessions` — session list with status badges
- `/` — landing page with pricing card
- **AgentPill** in nav — live agent USDC balance
- **X402Ceremony modal** — live terminal showing streaming progress (NDJSON), not a static spinner
- **ProtocolTicker** — scrolling protocol narrative across top

### README
- Fully rewritten for agent-centric architecture
- Architecture diagram (4-party), repo layout, "Why the Agent pays"
- Quick start, API reference (free + gated), bot archetypes, safety bounds
- "Calling from a third-party agent" code snippet
- Demo script (2.5 min shot list for video)
- Known limitations, roadmap

## Environment
- `GEMINI_API_KEY` — set (Google AI Studio)
- `AI_INTERVAL_MS=60000` — 1 min for testing (restore to 300000 for production/video)
- `AI_MODEL=gemma-4-31b-it` — primary, with gemini-2.5-flash fallback
- `AGENT_SECRET` — auto-generated, persisted
- `FACILITATOR_SECRET` — auto-generated, persisted
- Agent USDC balance: ~51 USDC (topped up manually, auto-topup threshold at 6 USDC)

## Known issues / TODO for tomorrow

### Must-fix before submission
- [ ] Gemma 4 reviewer still falls back to Gemini 2.5 Flash for the review step (the array extraction finds candidates but the schema match fails — need to debug what Gemma's reviewer output actually contains vs AIReviewArraySchema)
- [ ] `gemma-4-31b-it` as primary planner works ~60% of the time (when it fails it's usually a schema mismatch on edge fields like `target_dexes` having 1 element or `demo_mode` type mismatch) — 2 retries + flash fallback covers it reliably but ideally Gemma should hit more often
- [ ] AI_INTERVAL_MS should be set back to 300000 (5 min) for the demo video — 60s is for testing

### Nice-to-have
- [ ] MPP stretch (deferred — x402 is solid, MPP adds risk for minimal judging upside)
- [ ] Demo video recording (follow the shot list in README)
- [ ] DoraHacks BUIDL page submission
- [ ] OpenAPI spec at `/openapi.json`
- [ ] Per-bot runtime config editing from the session page (currently view-only)
- [ ] Gemma reasoning shown in the reviewer AI adjustments rail (currently just shows deltas, not the model's thinking)

### Verified test results (from this session)
- 46 actions / 0 failures in a 5-min 3-bot session
- Agent USDC 34 → after paying $2.50 x402 + $3 bot funding = correct deduction
- Revenue wallet gained exactly $2.50 per session (matches plan + simulate prices)
- Stop + teardown: bot funds recovered to agent
- Withdraw: agent → arbitrary address confirmed on-chain
- Fund agent from Freighter: full build/sign/submit round trip confirmed (tx `26ccb3fd...`)
- All 5 pages return 200, both apps typecheck clean (tsc --noEmit exit 0)

## File inventory (key files changed/created in this session)

### Backend (apps/api/src/)
- `server/localFacilitator.ts` — NEW: in-process x402 facilitator
- `server/x402.ts` — async, uses local facilitator
- `server/index.ts` — full route wiring
- `server/routes/tx.ts` — NEW: build-fund-agent + submit for Freighter flow
- `server/routes/plan.ts` — returns reasoning + model in `_ai` field
- `agent/agent.ts` — Agent singleton with planOnly, runSimulation, launchDirect + streaming
- `agent/routes.ts` — all /agent/* handlers including plan-stream, simulate-stream
- `orchestrator/agentWallet.ts` — auto-topup threshold raised to 6 USDC / 50 target
- `orchestrator/teardown.ts` — drains to agent (not platform)
- `ai/gemma.ts` — extractJson with allJsonCandidates, extractReasoning
- `ai/planner.ts` — schema-aware candidate iteration, reasoning capture, model fallback
- `ai/reviewer.ts` — schema-aware candidate iteration, model fallback

### Frontend (apps/web/)
- `lib/apiClient.ts` — full rewrite: agent-centric, streaming helpers, formatting utils
- `lib/sessionWallet.ts` — DELETED
- `lib/x402Client.ts` — DELETED
- `lib/walletApi.ts` — DELETED
- `components/X402Ceremony.tsx` — live terminal with streaming progress
- `components/FlowDiagram.tsx` — 4-party diagram + revenue side rail
- `components/SessionTimer.tsx` — freezes on end
- `components/StopSessionButton.tsx` — wired to /agent/stop, shows teardown result
- `components/AgentPill.tsx` — NEW: nav chip with live agent balance
- `components/NavBar.tsx` — uses AgentPill
- `components/ProtocolTicker.tsx` — static loop (no x402Client dependency)
- `components/SessionWalletProvider.tsx` — DELETED
- `components/SessionWalletPill.tsx` — DELETED
- `components/WalletHierarchy.tsx` — DELETED (replaced by FlowDiagram)
- `components/FriendbotButton.tsx` — DELETED (moved into /wallets page)
- `app/layout.tsx` — removed SessionWalletProvider
- `app/simulate/page.tsx` — three modes (AI/preset/custom), two-step AI flow
- `app/sessions/[id]/page.tsx` — full dashboard with traces, filtering, timer freeze
- `app/wallets/page.tsx` — agent treasury control panel
- `app/sessions/page.tsx` — uses agent.listSessions
- `app/page.tsx` — copy updates for agent-centric narrative

### Shared
- `packages/shared/src/schemas.ts` — `target_dexes` min changed from 2 to 1
