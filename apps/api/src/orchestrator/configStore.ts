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
    (cfg as unknown as Record<string, unknown>)[delta.param] = delta.new_value;
    applied.push(delta);
  }

  return applied;
}
