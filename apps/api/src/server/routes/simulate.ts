import type { Request, Response } from "express";
import { SimulateRequestSchema, type SimulateResponse } from "@calypso/shared";
import { createSession } from "../../orchestrator/session.js";
import { launchSession } from "../../orchestrator/launcher.js";
import { logger } from "../../logger.js";

export async function handleSimulate(req: Request, res: Response): Promise<void> {
  const parsed = SimulateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid simulate request", issues: parsed.error.issues });
    return;
  }

  const { session_config, bot_configs } = parsed.data;
  const session = createSession({ config: session_config, botConfigs: bot_configs });

  // Kick off launch in the background. Respond immediately so the user
  // can start tailing /events while wallets are spinning up.
  void launchSession(session).catch((err) => {
    logger.error({ err, sessionId: session.id }, "launchSession crashed");
  });

  const payload: SimulateResponse = {
    session_id: session.id,
    status: session.status,
    started_at: session.startedAt,
  };
  res.json(payload);
}
