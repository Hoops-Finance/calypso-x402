/**
 * reviewer.ts — periodic AI feedback loop.
 *
 * Every AI_INTERVAL_MS (default 5 min, override 60s for demo mode), walk
 * every running session, aggregate its logs, ask Gemma 4 to emit parameter
 * deltas, zod-validate them, apply to the configStore, and record the
 * summary + deltas into the session's ai_feedback trail.
 *
 * Reliability gate: the prompt asks for a JSON array. If zod parse fails
 * 3 times in a row for the SAME session, we log a warning and skip the
 * session for the next cycle (rather than corrupting its configs).
 *
 * If GEMINI_API_KEY is not set we log a one-time warning and skip all
 * reviews. This keeps local dev without a key from crashing the server.
 */

import {
  AIReviewArraySchema,
  type AIFeedbackEntry,
  type Metrics,
} from "@calypso/shared";
import { generate, allJsonCandidates } from "./gemma.js";
import { summarize } from "../aggregator/summarize.js";
import { applyDeltas } from "../orchestrator/configStore.js";
import { appendAIFeedback, type Session } from "../orchestrator/session.js";
import { ENV } from "../env.js";
import { logger } from "../logger.js";

const REVIEWER_PROMPT = `You are Calypso, a DeFi simulation orchestrator watching a bot swarm.
You will receive an aggregated metrics blob for the current 5-minute window.
Your job: emit a JSON array of parameter adjustments to improve simulation fidelity.

Output schema (array, emit ONLY this — no prose, no markdown):
[
  { "bot_id": string, "param": string, "new_value": number | string | boolean, "reason": string }
]

Rules:
- Return ONLY valid JSON. No code fences. Empty array [] is fine if everything looks healthy.
- Target realistic market conditions, not PnL optimization.
- If total_volume_usd is 0 or failed_txns >= 3, reduce interval_seconds for noise bots or
  raise their max_amount.
- If spread_distribution.p50_bps is 0, lower min_spread_bps for arbitrageurs so they fire more.
- If a bot shows zero actions_total, there's usually a config problem — flag it with a
  reason and a conservative change.
- New values must match the type of the existing param (number, string, or boolean).

Metrics blob follows:
`;

interface ReviewerState {
  consecutiveParseFailures: Map<string, number>;
  disabled: boolean;
}

const state: ReviewerState = {
  consecutiveParseFailures: new Map(),
  disabled: false,
};

export async function reviewSession(session: Session): Promise<void> {
  if (state.disabled) return;
  if (!ENV.GEMINI_API_KEY) {
    if (!state.disabled) {
      logger.warn("AI reviewer disabled: GEMINI_API_KEY not set");
      state.disabled = true;
    }
    return;
  }

  const metrics: Metrics = summarize(session.botLogs, session.botConfigs);
  const prompt = REVIEWER_PROMPT + JSON.stringify(metrics, null, 2);

  const MODELS = [ENV.AI_MODEL, "gemini-2.5-flash"];
  let deltas;
  let usedModel = ENV.AI_MODEL;

  for (const model of MODELS) {
    let raw: string;
    try {
      raw = await generate(prompt, { temperature: 0.1, model });
    } catch (err) {
      logger.warn({ err, model, sessionId: session.id }, "reviewer: generate call failed");
      continue;
    }

    const candidates = allJsonCandidates(raw);
    let found = false;
    for (const c of candidates) {
      try {
        deltas = AIReviewArraySchema.parse(JSON.parse(c));
        usedModel = model;
        state.consecutiveParseFailures.set(session.id, 0);
        found = true;
        break;
      } catch {
        // try next candidate
      }
    }
    if (found) break;
    logger.warn(
      { sessionId: session.id, model, candidates: candidates.length },
      "reviewer: no candidate matched AIReviewArraySchema",
    );
  }

  if (!deltas) {
    const n = (state.consecutiveParseFailures.get(session.id) ?? 0) + 1;
    state.consecutiveParseFailures.set(session.id, n);
    if (n >= 3) {
      logger.error({ sessionId: session.id }, "reviewer: 3 consecutive parse failures, pausing for this session");
    }
    return;
  }

  const applied = applyDeltas(session.id, deltas);
  const entry: AIFeedbackEntry = {
    t: Date.now(),
    summary_in: metrics,
    deltas_out: applied,
    model: usedModel,
    parse_attempts: 1,
  };
  appendAIFeedback(session, entry);
  logger.info(
    { sessionId: session.id, applied: applied.length, proposed: deltas.length },
    "reviewer: applied deltas",
  );
}

let tickHandle: NodeJS.Timeout | null = null;

export function startReviewerLoop(getRunningSessions: () => Session[]): void {
  if (tickHandle) return;
  const tick = async () => {
    for (const session of getRunningSessions()) {
      if (session.status !== "running") continue;
      await reviewSession(session).catch((err) => {
        logger.error({ err, sessionId: session.id }, "reviewer: unexpected error");
      });
    }
  };
  tickHandle = setInterval(() => void tick(), ENV.AI_INTERVAL_MS);
  logger.info({ intervalMs: ENV.AI_INTERVAL_MS }, "reviewer loop started");
}
