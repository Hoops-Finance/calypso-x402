/**
 * POST /simulate — x402-gated Calypso API endpoint.
 *
 * This is a paid API endpoint, not an orchestration endpoint. It
 * validates the session config, creates a session record in the
 * in-memory store, and returns the session_id. It does NOT spawn
 * bots or start loops — that's the Agent's job.
 *
 * Why still create a session record here? Because the API is the
 * single source of truth for "was this simulation paid for". A
 * third-party agent can pay, receive a session_id, and use that ID
 * to track the session without needing any Calypso-agent internal
 * state. The Agent class that runs inside Calypso's server just
 * happens to share the same session store (they're in the same
 * process), but in principle the session store could be a separate
 * database the agent reads from.
 */

import type { Request, Response } from "express";
import { SimulateRequestSchema, type SimulateResponse } from "@calypso/shared";
import { createSession } from "../../orchestrator/session.js";
import { logger } from "../../logger.js";

export async function handleSimulate(req: Request, res: Response): Promise<void> {
  const parsed = SimulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid simulate request", issues: parsed.error.issues });
    return;
  }

  const { session_config, bot_configs } = parsed.data;
  const session = createSession({ config: session_config, botConfigs: bot_configs });

  logger.info(
    { sessionId: session.id, botCount: bot_configs.length },
    "simulate: session registered (bots will be launched by the agent)",
  );

  const payload: SimulateResponse = {
    session_id: session.id,
    status: session.status,
    started_at: session.startedAt,
  };
  res.json(payload);
}
