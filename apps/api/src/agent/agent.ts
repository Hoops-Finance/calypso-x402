/**
 * agent.ts — the Calypso Agent runtime.
 *
 * This is the autonomous orchestrator. The user funds it once; it then
 * acts on their behalf — pays x402 for Calypso API calls, spawns bots,
 * runs simulations, tears down, reports back.
 *
 * It's the economic actor in the system:
 *
 *   USER          ──fund──▶     AGENT          ──x402──▶     CALYPSO API
 *   (Freighter)                 (this class)                 (revenue wallet)
 *                                   │
 *                                   ├──fund──▶  bot wallets
 *                                   ▼
 *                               BOT SWARM
 *
 * The Agent is a long-lived singleton in the Node process (same
 * process as the Calypso API for the demo; in production it'd run
 * separately). The UI talks to free /agent/* routes which dispatch
 * to this class.
 *
 * Key invariant: the agent NEVER makes a gated call without signing
 * a real x402 payment. Even over localhost, the @x402/fetch wrapper
 * handles the full 402 → sign → retry → settle handshake through the
 * real facilitator. This is the architectural credibility that
 * proves the API works identically whether the client is local,
 * remote, or running on a separate machine.
 */

import type { Network } from "@x402/core/types";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import { toStroops, fromStroops } from "hoops-sdk-core";
import type {
  PlanRequest,
  PlanResponse,
  SimulateRequest,
  SimulateResponse,
  AnalyzeRequest,
  AnalyzeResponse,
  SessionStatus,
  SessionSummary,
} from "@calypso/shared";

import { ENV } from "../env.js";
import { AgentWallet } from "../orchestrator/agentWallet.js";
import { createSession, getSession, listSessions, endSession, setStatus, type Session } from "../orchestrator/session.js";
import { launchSession } from "../orchestrator/launcher.js";
import { teardownSession, type TeardownResult } from "../orchestrator/teardown.js";
import { summarize } from "../aggregator/summarize.js";
import { logger } from "../logger.js";

const STELLAR_TESTNET: Network = "stellar:testnet" as Network;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface X402Trace {
  path: string;
  method: "POST";
  payer: string;
  payee: string;
  amount: string | null;
  amount_usd: string | null;
  asset: string | null;
  network: string;
  payment_required_raw: string | null;
  payment_required_decoded: unknown;
  payment_tx_hash: string | null;
  settled_at: string;
}

export interface ProgressEvent {
  step: string;
  message: string;
  t: number;
  tx?: string | null;
  model?: string;
  reasoning?: string | null;
}

export interface RunSimulationResult {
  session_id: string;
  status: SessionStatus;
  started_at: string;
  plan_trace: X402Trace;
  simulate_trace: X402Trace;
  ai_reasoning: string | null;
  ai_model: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let instance: Agent | null = null;

export class Agent {
  readonly wallet: AgentWallet;
  private paidFetch: typeof fetch;
  private readonly apiBase: string;

  private constructor(wallet: AgentWallet) {
    this.wallet = wallet;
    this.apiBase = `http://127.0.0.1:${ENV.API_PORT}`;
    const signer = createEd25519Signer(wallet.secret, STELLAR_TESTNET);
    const schemeClient = new ExactStellarScheme(signer);
    const client = new x402Client().register(STELLAR_TESTNET, schemeClient);
    this.paidFetch = wrapFetchWithPayment(fetch, client);
  }

  static get(): Agent {
    if (!instance) {
      instance = new Agent(AgentWallet.get());
    }
    return instance;
  }

  async ensureReady(): Promise<void> {
    await this.wallet.ensureInitialized();
    await this.wallet.topUpIfLow();
  }

  // ───── wallet reads ─────

  get address(): string {
    return this.wallet.publicKey;
  }

  async balance(): Promise<{ xlm: string; usdc: string; xlm_human: string; usdc_human: string }> {
    const { xlm, usdc } = await this.wallet.getBalances();
    return {
      xlm: xlm.toString(),
      usdc: usdc.toString(),
      xlm_human: String(fromStroops(xlm)),
      usdc_human: String(fromStroops(usdc)),
    };
  }

  // ───── withdraw ─────

  async withdraw(toAddress: string, amountUsdc: number): Promise<{ tx: string; amount_usdc: number }> {
    await this.ensureReady();
    const amountStroops = toStroops(amountUsdc);
    const hash = await this.wallet.transferUsdc(toAddress, amountStroops);
    logger.info({ toAddress, amount: amountUsdc, hash }, "agent: withdraw success");
    return { tx: hash, amount_usdc: amountUsdc };
  }

  // ───── x402 handshake: pay Calypso for a gated call ─────

  private async payForCall<TReq, TRes>(
    path: "plan" | "simulate" | "analyze",
    body: TReq,
  ): Promise<{ response: TRes; trace: X402Trace }> {
    await this.ensureReady();

    const targetUrl = `${this.apiBase}/${path}`;
    const startedAt = new Date().toISOString();

    logger.info({ path, payer: this.wallet.publicKey }, "agent: initiating x402 paid call");

    // paidFetch intercepts the 402 automatically, signs a payment
    // authorization with the agent's Ed25519 signer, retries with
    // the X-PAYMENT header. Facilitator settles on-chain.
    const res = await this.paidFetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const rawHeader = res.headers.get("PAYMENT-REQUIRED");
      logger.error(
        {
          path,
          status: res.status,
          body: detail.slice(0, 500),
          paymentRequired: rawHeader?.slice(0, 200),
        },
        "agent: paid call failed (server did not accept payment)",
      );
      throw new Error(`agent: paid ${path} failed ${res.status}: ${detail.slice(0, 200)}`);
    }

    const settleHeader =
      res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    const txHash = extractTxHashFromResponse(settleHeader);
    const response = (await res.json()) as TRes;

    logger.info(
      { path, payer: this.wallet.publicKey, txHash, hasSettleHeader: !!settleHeader },
      "agent: x402 paid call settled",
    );

    const trace: X402Trace = {
      path: `/${path}`,
      method: "POST",
      payer: this.wallet.publicKey,
      payee: ENV.PAY_TO,
      amount: null,
      amount_usd: priceFor(path),
      asset: null,
      network: ENV.X402_NETWORK,
      payment_required_raw: null,
      payment_required_decoded: null,
      payment_tx_hash: txHash,
      settled_at: startedAt,
    };

    logger.info(
      { path, payer: trace.payer, txHash: trace.payment_tx_hash },
      "agent: x402 payment settled",
    );

    return { response, trace };
  }

  async payForPlan(req: PlanRequest): Promise<{ plan: PlanResponse; trace: X402Trace }> {
    const { response, trace } = await this.payForCall<PlanRequest, PlanResponse>("plan", req);
    return { plan: response, trace };
  }

  async payForSimulate(
    req: SimulateRequest,
  ): Promise<{ result: SimulateResponse; trace: X402Trace }> {
    const { response, trace } = await this.payForCall<SimulateRequest, SimulateResponse>(
      "simulate",
      req,
    );
    return { result: response, trace };
  }

  async payForAnalyze(
    req: AnalyzeRequest,
  ): Promise<{ result: AnalyzeResponse; trace: X402Trace }> {
    const { response, trace } = await this.payForCall<AnalyzeRequest, AnalyzeResponse>(
      "analyze",
      req,
    );
    return { result: response, trace };
  }

  // ───── the big one: full simulation workflow ─────

  /**
   * End-to-end simulation workflow:
   *   1. Pay for a plan (x402 $0.50)
   *   2. Pay for a simulation (x402 $2.00)
   *   3. Create a local session record
   *   4. Spawn bot wallets, fund them from agent
   *   5. Start bot loops
   *   6. Return the session id + both x402 traces
   *
   * The session runs asynchronously after this method returns. The
   * caller (the /agent/simulate route handler) passes the session_id
   * back to the UI, which then subscribes to the session for updates.
   */
  async runSimulation(
    prompt: string,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<RunSimulationResult> {
    const emit = onProgress ?? (() => {});
    await this.ensureReady();

    // ─── STEP 1: /plan x402 handshake ───
    emit({ step: "info", message: `Agent wallet: ${this.wallet.publicKey.slice(0, 8)}…`, t: Date.now() });
    emit({ step: "info", message: `Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}"`, t: Date.now() });
    emit({ step: "plan_start", message: `POST http://127.0.0.1:${ENV.API_PORT}/plan`, t: Date.now() });
    emit({ step: "info", message: `→ Server returns HTTP 402 Payment Required ($0.50 USDC)`, t: Date.now() });
    emit({ step: "info", message: `→ @x402/fetch signs Soroban auth entry with agent Ed25519 keypair`, t: Date.now() });
    emit({ step: "info", message: `→ Retrying POST /plan with X-PAYMENT header attached`, t: Date.now() });
    emit({ step: "info", message: `→ Facilitator verifies payment + submits USDC transfer on-chain`, t: Date.now() });
    emit({ step: "info", message: `→ Gemma 4 generating session plan (10-30s)…`, t: Date.now() });

    const { plan, trace: planTrace } = await this.payForPlan({ prompt });
    const aiReasoning = (plan as Record<string, unknown>)._ai as
      | { reasoning: string | null; model: string }
      | undefined;
    logger.info({ botCount: plan.bot_configs.length, aiModel: aiReasoning?.model }, "agent: plan received");

    emit({
      step: "plan_settled",
      message: `x402 payment settled · tx ${planTrace.payment_tx_hash?.slice(0, 12) ?? "?"}…`,
      t: Date.now(),
      tx: planTrace.payment_tx_hash,
    });

    // Show which AI model produced the plan
    const model = aiReasoning?.model ?? "default";
    emit({ step: "info", message: `AI model: ${model}`, t: Date.now() });

    // Show Gemma reasoning if available
    if (aiReasoning?.reasoning) {
      const reasoningLines = aiReasoning.reasoning.split("\n").filter((l: string) => l.trim());
      for (const line of reasoningLines.slice(0, 12)) {
        emit({ step: "reasoning", message: line.trim(), t: Date.now() });
      }
      if (reasoningLines.length > 12) {
        emit({ step: "reasoning", message: `… (${reasoningLines.length - 12} more lines)`, t: Date.now() });
      }
    }

    // Show the plan summary
    emit({ step: "plan_result", message: `Plan: "${plan.session_config.name}" · ${plan.bot_configs.length} bots · ${plan.session_config.duration_minutes} min`, t: Date.now() });
    for (const bot of plan.bot_configs) {
      emit({ step: "info", message: `  ${bot.bot_id} (${bot.archetype}) interval=${bot.interval_seconds ?? "?"}s`, t: Date.now() });
    }

    // ─── STEP 2: /simulate x402 handshake ───
    emit({ step: "simulate_start", message: `POST http://127.0.0.1:${ENV.API_PORT}/simulate`, t: Date.now() });
    emit({ step: "info", message: `→ HTTP 402 → sign → retry → facilitator settles $2.00 USDC`, t: Date.now() });

    const { result: simulateResult, trace: simulateTrace } = await this.payForSimulate({
      session_config: plan.session_config,
      bot_configs: plan.bot_configs,
    });

    emit({
      step: "simulate_settled",
      message: `x402 payment settled · tx ${simulateTrace.payment_tx_hash?.slice(0, 12) ?? "?"}…`,
      t: Date.now(),
      tx: simulateTrace.payment_tx_hash,
    });
    emit({ step: "info", message: `Session registered: ${simulateResult.session_id}`, t: Date.now() });

    // Step 3: hydrate the session state the API created
    const session = getSession(simulateResult.session_id);
    if (!session) {
      throw new Error(
        `agent: simulate returned session_id ${simulateResult.session_id} but session not found in store`,
      );
    }

    // ─── STEP 3: bot deployment ───
    emit({ step: "launching", message: `Spawning ${plan.bot_configs.length} bot wallets (friendbot + smart account + USDC)…`, t: Date.now() });

    // Step 4+5: launch bots
    void launchSession(session).catch((err) => {
      logger.error({ err, sessionId: session.id }, "agent: launchSession crashed");
    });

    emit({ step: "done", message: "Session live — redirecting to dashboard", t: Date.now() });

    return {
      session_id: session.id,
      status: session.status,
      started_at: session.startedAt,
      plan_trace: planTrace,
      simulate_trace: simulateTrace,
      ai_reasoning: aiReasoning?.reasoning ?? null,
      ai_model: aiReasoning?.model ?? "default",
    };
  }

  // ───── plan only ($0.50) — returns config + reasoning, no simulate ─────

  async planOnly(
    prompt: string,
    onProgress?: (event: ProgressEvent) => void,
  ): Promise<{
    plan: PlanResponse;
    trace: X402Trace;
    reasoning: string | null;
    model: string;
  }> {
    const emit = onProgress ?? (() => {});
    await this.ensureReady();

    emit({ step: "info", message: `Agent wallet: ${this.wallet.publicKey.slice(0, 8)}…`, t: Date.now() });
    emit({ step: "info", message: `Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}"`, t: Date.now() });
    emit({ step: "plan_start", message: `POST http://127.0.0.1:${ENV.API_PORT}/plan`, t: Date.now() });
    emit({ step: "info", message: `→ Server returns HTTP 402 Payment Required ($0.50 USDC)`, t: Date.now() });
    emit({ step: "info", message: `→ @x402/fetch signs Soroban auth entry with agent Ed25519 keypair`, t: Date.now() });
    emit({ step: "info", message: `→ Retrying POST /plan with X-PAYMENT header attached`, t: Date.now() });
    emit({ step: "info", message: `→ Facilitator verifies + submits USDC transfer on-chain`, t: Date.now() });
    emit({ step: "info", message: `→ Gemma 4 generating session plan (10-30s)…`, t: Date.now() });

    const { plan, trace } = await this.payForPlan({ prompt });
    const ai = (plan as Record<string, unknown>)._ai as
      | { reasoning: string | null; model: string }
      | undefined;

    emit({
      step: "plan_settled",
      message: `x402 payment settled · tx ${trace.payment_tx_hash?.slice(0, 12) ?? "?"}…`,
      t: Date.now(),
      tx: trace.payment_tx_hash,
    });

    const model = ai?.model ?? "default";
    emit({ step: "info", message: `AI model: ${model}`, t: Date.now() });

    if (ai?.reasoning) {
      const lines = ai.reasoning.split("\n").filter((l: string) => l.trim());
      for (const line of lines.slice(0, 15)) {
        emit({ step: "reasoning", message: line.trim(), t: Date.now() });
      }
      if (lines.length > 15) {
        emit({ step: "reasoning", message: `… (${lines.length - 15} more lines)`, t: Date.now() });
      }
    }

    emit({ step: "plan_result", message: `Plan: "${plan.session_config.name}" · ${plan.bot_configs.length} bots · ${plan.session_config.duration_minutes} min`, t: Date.now() });
    for (const bot of plan.bot_configs) {
      emit({ step: "info", message: `  ${bot.bot_id} (${bot.archetype}) interval=${bot.interval_seconds ?? "?"}s`, t: Date.now() });
    }
    emit({ step: "done", message: `Plan ready — review below and launch when ready`, t: Date.now() });

    return { plan, trace, reasoning: ai?.reasoning ?? null, model };
  }

  // ───── direct launch (skip /plan, $2.00 only) ─────

  async launchDirect(
    sessionConfig: import("@calypso/shared").SessionConfig,
    botConfigs: import("@calypso/shared").BotConfig[],
  ): Promise<{ session_id: string; status: SessionStatus; started_at: string; simulate_trace: X402Trace }> {
    await this.ensureReady();
    const { result: simulateResult, trace: simulateTrace } = await this.payForSimulate({
      session_config: sessionConfig,
      bot_configs: botConfigs,
    });
    const session = getSession(simulateResult.session_id);
    if (!session) {
      throw new Error(`agent: session ${simulateResult.session_id} not found in store`);
    }
    void launchSession(session).catch((err) => {
      logger.error({ err, sessionId: session.id }, "agent: launchSession crashed");
    });
    return {
      session_id: session.id,
      status: session.status,
      started_at: session.startedAt,
      simulate_trace: simulateTrace,
    };
  }

  // ───── stop a running session ─────

  async stopSimulation(sessionId: string): Promise<{
    session_id: string;
    status: SessionStatus;
    teardown: TeardownResult;
  }> {
    const session = getSession(sessionId);
    if (!session) {
      throw new Error(`agent: session ${sessionId} not found`);
    }

    // Abort the bot loops first so they stop fighting us for sequence
    // numbers while we drain.
    if (session.status === "running") {
      setStatus(session, "stopping");
      session.controller.abort();
      await Promise.allSettled(session.botTasks);
    }

    const teardown = await teardownSession(session);

    if (session.status !== "failed") {
      session.endedAt = session.endedAt ?? new Date().toISOString();
      setStatus(session, "completed");
    }

    return {
      session_id: session.id,
      status: session.status,
      teardown,
    };
  }

  // ───── read session state ─────

  getSession(sessionId: string): Session | null {
    return getSession(sessionId);
  }

  listSessions(): SessionSummary[] {
    return listSessions();
  }

  /**
   * For the UI — returns a "safe" view of a session (without live
   * Promises, AbortControllers, or subscriber sets) plus aggregated
   * metrics so it can be JSON-serialized.
   */
  getSessionReport(sessionId: string) {
    const session = getSession(sessionId);
    if (!session) return null;
    const metrics = summarize(session.botLogs, session.botConfigs);
    const pnl_summary = {
      gross_volume_usd: metrics.total_volume_usd,
      net_pnl_usd: metrics.per_bot.reduce((acc, b) => acc + b.pnl_usd, 0),
    };
    // Shape mirrors the shared Report schema so the UI can reuse typed
    // fetchers, with additions (name, bot_configs, bots, duration_seconds)
    // that the dashboard needs beyond the base schema.
    return {
      session_id: session.id,
      name: session.name,
      status: session.status,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      session_config: session.config,
      bot_configs: session.botConfigs,
      bots: session.bots.map((b) => ({
        bot_id: b.botId,
        eoa: b.pubkey,
        smart_account: b.smartAccountId,
      })),
      bot_logs: session.botLogs,
      ai_feedback: session.aiFeedback,
      metrics,
      pnl_summary,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function decodeHeader(raw: string | null): unknown {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return { raw };
  }
}

function extractTxHashFromResponse(header: string | null): string | null {
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      transaction?: string;
      transactionHash?: string;
      txHash?: string;
      tx_hash?: string;
    };
    return parsed.transaction ?? parsed.transactionHash ?? parsed.txHash ?? parsed.tx_hash ?? null;
  } catch {
    return null;
  }
}

function priceFor(path: "plan" | "simulate" | "analyze"): string {
  switch (path) {
    case "plan":
      return "$0.50";
    case "simulate":
      return "$2.00";
    case "analyze":
      return "$0.50";
  }
}

function formatAmountUsd(amountStroops: string): string | null {
  try {
    const n = BigInt(amountStroops);
    const whole = n / BigInt(10_000_000);
    const frac = n % BigInt(10_000_000);
    const fracStr = frac.toString().padStart(7, "0").slice(0, 2);
    return `$${whole.toString()}.${fracStr}`;
  } catch {
    return null;
  }
}
