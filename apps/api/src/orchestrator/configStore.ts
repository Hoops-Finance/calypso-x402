/**
 * configStore.ts — per-session mutable bot config store.
 *
 * Bots poll their current config every tick via `get(sessionId, botId)`.
 * The AI reviewer applies deltas via `applyDeltas(...)`, which mutates the
 * store in place. The chassis's fresh-read-per-tick invariant means
 * parameter changes take effect within one loop iteration, no signaling
 * required.
 */

import type { BotConfig, AIReviewDelta } from "@calypso/shared";
import { logger } from "../logger.js";

// --- Safety bounds on AI-issued deltas ---------------------------------
// The AI reviewer can adjust parameters to make the swarm more realistic,
// but it must not be able to:
//   - drive interval_seconds below MIN_INTERVAL_SECONDS (testnet rate cap)
//   - set max_amount above HARD_MAX_AMOUNT (runaway trade cost)
//   - make min_spread_bps or rebalance_threshold negative
// Deltas that violate these get clamped, not dropped, so the reviewer's
// intent still flows through. Clamped deltas are logged for observability.
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 300;
const HARD_MAX_AMOUNT = 100; // xlm
const MIN_SPREAD_BPS = 0;
const MAX_SPREAD_BPS = 1_000;

function clampNumber(
  param: string,
  value: number,
): { clamped: number; changed: boolean } {
  let out = value;
  if (param === "interval_seconds") {
    out = Math.max(MIN_INTERVAL_SECONDS, Math.min(MAX_INTERVAL_SECONDS, value));
  } else if (param === "max_amount" || param === "min_amount") {
    out = Math.max(0, Math.min(HARD_MAX_AMOUNT, value));
  } else if (param === "min_spread_bps") {
    out = Math.max(MIN_SPREAD_BPS, Math.min(MAX_SPREAD_BPS, value));
  } else if (param === "rebalance_threshold") {
    out = Math.max(0, Math.min(1, value));
  } else if (param === "max_position_size") {
    out = Math.max(0, Math.min(HARD_MAX_AMOUNT, value));
  }
  return { clamped: out, changed: out !== value };
}

type SessionBots = Map<string, BotConfig>;

const sessions = new Map<string, SessionBots>();

export function seedSession(sessionId: string, configs: BotConfig[]): void {
  const map: SessionBots = new Map();
  for (const cfg of configs) map.set(cfg.bot_id, cfg);
  sessions.set(sessionId, map);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function get(sessionId: string, botId: string): BotConfig | null {
  return sessions.get(sessionId)?.get(botId) ?? null;
}

export function allForSession(sessionId: string): BotConfig[] {
  const map = sessions.get(sessionId);
  return map ? [...map.values()] : [];
}

/**
 * Apply AI-issued parameter deltas to the relevant bots in a session.
 * Unknown bot_id / unknown param / wrong value type = dropped with a warn
 * so a malformed LLM response cannot silently corrupt the config.
 */
export function applyDeltas(sessionId: string, deltas: AIReviewDelta[]): AIReviewDelta[] {
  const map = sessions.get(sessionId);
  if (!map) return [];
  const applied: AIReviewDelta[] = [];

  for (const delta of deltas) {
    const cfg = map.get(delta.bot_id);
    if (!cfg) {
      logger.warn({ sessionId, delta }, "configStore: unknown bot_id, dropping");
      continue;
    }
    const current = (cfg as unknown as Record<string, unknown>)[delta.param];
    if (current === undefined) {
      logger.warn({ sessionId, delta }, "configStore: unknown param, dropping");
      continue;
    }
    if (typeof current !== typeof delta.new_value) {
      logger.warn({ sessionId, delta }, "configStore: type mismatch, dropping");
      continue;
    }

    let nextValue: unknown = delta.new_value;
    if (typeof nextValue === "number") {
      const { clamped, changed } = clampNumber(delta.param, nextValue);
      if (changed) {
        logger.warn(
          { sessionId, delta, clamped },
          "configStore: delta clamped to safety bound",
        );
      }
      nextValue = clamped;
    }

    (cfg as unknown as Record<string, unknown>)[delta.param] = nextValue;
    applied.push({ ...delta, new_value: nextValue as AIReviewDelta["new_value"] });
  }

  return applied;
}
