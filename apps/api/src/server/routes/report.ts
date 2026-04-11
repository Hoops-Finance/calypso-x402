import type { Request, Response } from "express";
import type { Report } from "@calypso/shared";
import { getSession, listSessions } from "../../orchestrator/session.js";
import { summarize } from "../../aggregator/summarize.js";

export function handleReport(req: Request, res: Response): void {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }

  const metrics = summarize(session.botLogs, session.botConfigs);
  const report: Report = {
    session_id: session.id,
    status: session.status,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    session_config: session.config,
    metrics,
    bot_logs: session.botLogs,
    ai_feedback: session.aiFeedback,
    pnl_summary: {
      gross_volume_usd: metrics.total_volume_usd,
      net_pnl_usd: metrics.per_bot.reduce((acc, b) => acc + b.pnl_usd, 0),
    },
  };
  res.json(report);
}

export function handleListSessions(_req: Request, res: Response): void {
  res.json({ sessions: listSessions() });
}
