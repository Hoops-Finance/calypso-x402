import type { Request, Response } from "express";
import { getSession, subscribe, type SessionEvent } from "../../orchestrator/session.js";

/**
 * GET /events/:sessionId — server-sent events stream of bot actions + AI reviews.
 *
 * UI opens this with an EventSource to get a live tail of the session.
 */
export function handleEvents(req: Request, res: Response): void {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    res.status(400).end("sessionId required");
    return;
  }
  const session = getSession(sessionId);
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

  // Flush prior logs so a late-arriving subscriber gets historical context.
  for (const entry of session.botLogs) write({ type: "bot_action", entry });
  for (const entry of session.aiFeedback) write({ type: "ai_review", entry });
  write({ type: "status", status: session.status });

  const unsubscribe = subscribe(session, write);

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
}
