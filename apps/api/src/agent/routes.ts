/**
 * agent/routes.ts — the UI-facing "remote control" surface for the Agent.
 *
 * These are all FREE routes. The UI is a dumb harness that translates
 * user clicks into Agent method calls. Real x402 payments happen
 * inside the Agent when it calls the Calypso API over localhost.
 *
 *   GET  /agent                  agent identity + balance + readiness
 *   GET  /agent/balance          just the balances
 *   POST /agent/withdraw         { to, amount } → agent.withdraw()
 *   POST /agent/simulate         { prompt }     → agent.runSimulation()
 *   POST /agent/stop/:id         → agent.stopSimulation()
 *   GET  /agent/sessions         → agent.listSessions()
 *   GET  /agent/session/:id      → agent.getSessionReport()
 *   GET  /agent/session/:id/events  SSE stream of bot actions
 *
 * Naming discipline: these are the routes the UI talks to. They
 * are distinct from the API's /plan /simulate /analyze routes
 * (which are x402-gated and consumed internally by the agent).
 */

import type { Request, Response } from "express";
import { SimulateRequestSchema } from "@calypso/shared";
import { Agent } from "./agent.js";
import { subscribe, getSession, type SessionEvent } from "../orchestrator/session.js";
import { logger } from "../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET /agent — identity + balance + readiness
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentStatus(_req: Request, res: Response): Promise<void> {
  try {
    const agent = Agent.get();
    await agent.ensureReady();
    const balances = await agent.balance();
    res.json({
      address: agent.address,
      network: "stellar:testnet",
      ready: true,
      balances,
      sessions: agent.listSessions().length,
    });
  } catch (err) {
    logger.error({ err }, "GET /agent failed");
    res.status(500).json({
      error: "agent status failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /agent/balance — just the numbers
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentBalance(_req: Request, res: Response): Promise<void> {
  try {
    const agent = Agent.get();
    await agent.ensureReady();
    const balances = await agent.balance();
    res.json({ address: agent.address, balances });
  } catch (err) {
    logger.error({ err }, "GET /agent/balance failed");
    res.status(500).json({
      error: "agent balance failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /agent/withdraw — agent transfers USDC to a user-chosen address
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentWithdraw(req: Request, res: Response): Promise<void> {
  const to = String(req.body?.to ?? "").trim();
  const amount = Number(req.body?.amount ?? 0);

  if (!/^[GC][A-Z0-9]{55}$/.test(to)) {
    res.status(400).json({ error: "invalid stellar address" });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    res.status(400).json({ error: "amount must be > 0 and <= 10000" });
    return;
  }

  try {
    const agent = Agent.get();
    const result = await agent.withdraw(to, amount);
    res.json({ ok: true, ...result, recipient: to });
  } catch (err) {
    logger.error({ err }, "POST /agent/withdraw failed");
    res.status(500).json({
      error: "withdraw failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /agent/simulate — run a full simulation workflow
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentSimulate(req: Request, res: Response): Promise<void> {
  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) {
    res.status(400).json({ error: "prompt required" });
    return;
  }

  try {
    const agent = Agent.get();
    const result = await agent.runSimulation(prompt);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /agent/simulate failed");
    res.status(500).json({
      error: "runSimulation failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /agent/plan-stream — plan only ($0.01), streams progress + returns
// the AI-generated config and reasoning so the user can review/edit before
// committing the $0.05 simulate payment.
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentPlanStream(req: Request, res: Response): Promise<void> {
  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) {
    res.status(400).json({ error: "prompt required" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (data: unknown) => { res.write(JSON.stringify(data) + "\n"); };

  try {
    const a = Agent.get();
    const result = await a.planOnly(prompt, (evt) => write(evt));
    write({
      step: "result",
      plan: result.plan,
      trace: result.trace,
      reasoning: result.reasoning,
      model: result.model,
    });
    res.end();
  } catch (err) {
    write({ step: "error", message: err instanceof Error ? err.message : String(err), t: Date.now() });
    res.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /agent/simulate-stream — same as /agent/simulate but streams progress
// as NDJSON lines so the UI can show a live terminal.
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentSimulateStream(req: Request, res: Response): Promise<void> {
  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) {
    res.status(400).json({ error: "prompt required" });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (data: unknown) => {
    res.write(JSON.stringify(data) + "\n");
  };

  try {
    const a = Agent.get();
    const result = await a.runSimulation(prompt, (evt) => {
      write(evt);
    });
    write({ step: "result", ...result });
    res.end();
  } catch (err) {
    write({
      step: "error",
      message: err instanceof Error ? err.message : String(err),
      t: Date.now(),
    });
    res.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /agent/launch — direct launch with user-supplied config (skip /plan)
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentLaunch(req: Request, res: Response): Promise<void> {
  const parsed = SimulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid config", issues: parsed.error.issues });
    return;
  }
  try {
    const agent = Agent.get();
    const result = await agent.launchDirect(parsed.data.session_config, parsed.data.bot_configs);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /agent/launch failed");
    res.status(500).json({
      error: "launchDirect failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /agent/stop/:id — abort + teardown a session
// ─────────────────────────────────────────────────────────────────────────────
export async function handleAgentStop(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "session id required" });
    return;
  }
  try {
    const agent = Agent.get();
    const result = await agent.stopSimulation(id);
    res.json(result);
  } catch (err) {
    logger.error({ err, sessionId: id }, "POST /agent/stop failed");
    res.status(500).json({
      error: "stopSimulation failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /agent/sessions — list
// ─────────────────────────────────────────────────────────────────────────────
export function handleAgentSessions(_req: Request, res: Response): void {
  const agent = Agent.get();
  res.json({ sessions: agent.listSessions() });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /agent/session/:id — full report
// ─────────────────────────────────────────────────────────────────────────────
export function handleAgentSession(req: Request, res: Response): void {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "session id required" });
    return;
  }
  const agent = Agent.get();
  const report = agent.getSessionReport(id);
  if (!report) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json(report);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /agent/session/:id/events — SSE live tail
// ─────────────────────────────────────────────────────────────────────────────
export function handleAgentSessionEvents(req: Request, res: Response): void {
  const id = req.params.id;
  if (!id) {
    res.status(400).end("session id required");
    return;
  }
  const session = getSession(id);
  if (!session) {
    res.status(404).end("session not found");
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const write = (evt: SessionEvent) => {
    res.write(`event: ${evt.type}\n`);
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  // Replay historical events so late subscribers get context.
  for (const entry of session.botLogs) write({ type: "bot_action", entry });
  for (const entry of session.aiFeedback) write({ type: "ai_review", entry });
  write({ type: "status", status: session.status });

  const unsubscribe = subscribe(session, write);
  req.on("close", () => {
    unsubscribe();
    res.end();
  });
}
