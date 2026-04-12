/**
 * sessionControl.ts — lifecycle + config endpoints for a running session.
 *
 *   POST /sessions/:id/stop           abort all bots, set status=cancelled
 *   POST /sessions/:id/teardown       drain bot balances back to orchestrator
 *   PATCH /sessions/:id/bots/:botId   live config edit (picked up next tick)
 *
 * These are free routes — no x402. Stopping and tearing down a session
 * you paid for shouldn't require another payment.
 */

import type { Request, Response } from "express";
import { getSession, endSession, setStatus } from "../../orchestrator/session.js";
import { teardownSession } from "../../orchestrator/teardown.js";
import { BotConfigSchema } from "@calypso/shared";
import { logger } from "../../logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/stop
// ─────────────────────────────────────────────────────────────────────────────
export async function handleStopSession(req: Request, res: Response): Promise<void> {
  const sessionId = req.params.id;
  if (!sessionId) {
    res.status(400).json({ error: "session id required" });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  if (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
  ) {
    res.json({
      session_id: session.id,
      status: session.status,
      stopped_at: session.endedAt,
      already_stopped: true,
    });
    return;
  }

  setStatus(session, "cancelled");
  session.controller.abort();
  await Promise.allSettled(session.botTasks);
  session.endedAt = new Date().toISOString();
  logger.info({ sessionId }, "session: stopped by user");

  res.json({
    session_id: session.id,
    status: "cancelled",
    stopped_at: session.endedAt,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/teardown
// ─────────────────────────────────────────────────────────────────────────────
export async function handleTeardownSession(req: Request, res: Response): Promise<void> {
  const sessionId = req.params.id;
  if (!sessionId) {
    res.status(400).json({ error: "session id required" });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  // Teardown only makes sense after the bots are stopped. If the session
  // is still running, stop it first so the bots aren't fighting our
  // transfers for sequence numbers.
  if (session.status === "running") {
    setStatus(session, "stopping");
    session.controller.abort();
    await Promise.allSettled(session.botTasks);
  }

  try {
    const result = await teardownSession(session);
    if (session.status !== "failed") {
      session.endedAt = session.endedAt ?? new Date().toISOString();
      setStatus(session, "completed");
    }
    res.json(result);
  } catch (err) {
    logger.error({ err, sessionId }, "teardown failed");
    res
      .status(500)
      .json({ error: "teardown failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sessions/:id/bots/:botId
// ─────────────────────────────────────────────────────────────────────────────
export async function handlePatchBotConfig(req: Request, res: Response): Promise<void> {
  const sessionId = req.params.id;
  const botId = req.params.botId;
  if (!sessionId || !botId) {
    res.status(400).json({ error: "session id and bot id required" });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  const idx = session.botConfigs.findIndex((b) => b.bot_id === botId);
  if (idx === -1) {
    res.status(404).json({ error: "bot not found in session" });
    return;
  }

  const parsed = BotConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid bot config", issues: parsed.error.issues });
    return;
  }

  const next = parsed.data;
  // Guardrail: don't allow changing the archetype or bot_id mid-session.
  const current = session.botConfigs[idx]!;
  if (next.archetype !== current.archetype || next.bot_id !== current.bot_id) {
    res
      .status(400)
      .json({ error: "cannot change archetype or bot_id on a running session" });
    return;
  }

  // Mutate in place so the chassis's next-tick re-read picks it up.
  session.botConfigs[idx] = next;
  const { applyDeltas } = await import("../../orchestrator/configStore.js");
  // The configStore holds its own copy (seeded at launch) — push the
  // full new config via a delta-like mechanism. Simplest approach:
  // compare each field and emit a delta for each changed numeric.
  const changed: Array<{ bot_id: string; param: string; new_value: unknown; reason: string }> = [];
  for (const [key, value] of Object.entries(next)) {
    const currentValue = (current as unknown as Record<string, unknown>)[key];
    if (
      typeof value === "number" &&
      typeof currentValue === "number" &&
      value !== currentValue
    ) {
      changed.push({
        bot_id: botId,
        param: key,
        new_value: value,
        reason: "user edit via PATCH",
      });
    }
  }
  applyDeltas(
    sessionId,
    changed as Parameters<typeof applyDeltas>[1],
  );

  logger.info({ sessionId, botId, changed }, "bot config patched by user");

  res.json({
    session_id: sessionId,
    bot_id: botId,
    config: next,
    applied_deltas: changed,
  });
}
