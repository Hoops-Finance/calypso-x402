/**
 * session.ts — in-memory SessionManager.
 *
 * A Session tracks:
 *   - the config the user paid to plan and run
 *   - the bot wallets launched for it
 *   - the rolling log buffer (both bot logs and AI feedback)
 *   - an AbortController that terminates all bots on end()
 *
 * There is no DB. Restarting the API wipes all sessions. That's fine for
 * the hackathon; durability is on the roadmap, not in scope.
 */

import { randomUUID } from "node:crypto";
import type {
  SessionConfig,
  BotConfig,
  BotLogEntry,
  AIFeedbackEntry,
  SessionStatus,
  SessionSummary,
} from "@calypso/shared";
import type { BotWallet } from "./wallets.js";

export interface Session {
  id: string;
  name: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  config: SessionConfig;
  botConfigs: BotConfig[];
  bots: BotWallet[];
  botLogs: BotLogEntry[];
  aiFeedback: AIFeedbackEntry[];
  controller: AbortController;
  /** Event emitter queue for SSE subscribers. Each subscriber gets its own callback. */
  subscribers: Set<(evt: SessionEvent) => void>;
  /** Bot loop promises — awaited on end() for clean teardown. */
  botTasks: Promise<void>[];
}

export type SessionEvent =
  | { type: "bot_action"; entry: BotLogEntry }
  | { type: "ai_review"; entry: AIFeedbackEntry }
  | { type: "status"; status: SessionStatus };

const sessions = new Map<string, Session>();

export function createSession(opts: {
  config: SessionConfig;
  botConfigs: BotConfig[];
}): Session {
  const id = randomUUID();
  const session: Session = {
    id,
    name: opts.config.name,
    status: "planning",
    startedAt: new Date().toISOString(),
    endedAt: null,
    config: opts.config,
    botConfigs: opts.botConfigs,
    bots: [],
    botLogs: [],
    aiFeedback: [],
    controller: new AbortController(),
    subscribers: new Set(),
    botTasks: [],
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | null {
  return sessions.get(id) ?? null;
}

export function listSessions(): SessionSummary[] {
  return [...sessions.values()].map((s) => ({
    session_id: s.id,
    name: s.name,
    status: s.status,
    started_at: s.startedAt,
    pnl_summary: {
      gross_volume_usd: s.botLogs.reduce((acc, l) => acc + (l.amount_in ?? 0), 0),
      net_pnl_usd: 0, // computed on demand by aggregator for /report
    },
  }));
}

export function setStatus(session: Session, status: SessionStatus): void {
  session.status = status;
  publish(session, { type: "status", status });
}

export function appendBotLog(session: Session, entry: BotLogEntry): void {
  session.botLogs.push(entry);
  publish(session, { type: "bot_action", entry });
}

export function appendAIFeedback(session: Session, entry: AIFeedbackEntry): void {
  session.aiFeedback.push(entry);
  publish(session, { type: "ai_review", entry });
}

export function subscribe(session: Session, cb: (e: SessionEvent) => void): () => void {
  session.subscribers.add(cb);
  return () => session.subscribers.delete(cb);
}

function publish(session: Session, evt: SessionEvent): void {
  for (const cb of session.subscribers) {
    try {
      cb(evt);
    } catch {
      session.subscribers.delete(cb);
    }
  }
}

export async function endSession(session: Session): Promise<void> {
  if (session.status === "completed" || session.status === "cancelled") return;
  session.controller.abort();
  await Promise.allSettled(session.botTasks);
  session.endedAt = new Date().toISOString();
  setStatus(session, "completed");
}
