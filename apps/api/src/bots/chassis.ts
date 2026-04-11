/**
 * chassis.ts
 * ----------
 * Shared bot runtime: observe → decide → execute → log.
 *
 * The chassis is DUMB by design. It has no market knowledge, no risk
 * management, no DEX opinions. It just drives a loop, catches errors, and
 * hands control to whichever archetype's `tick()` function is registered
 * for this bot's `archetype` field. All intelligence lives in the AI
 * reviewer that mutates `BotConfig` out-of-band; the chassis rereads
 * config every tick so parameter changes take effect within one cycle.
 */

import type { BotConfig, BotLogEntry } from "@calypso/shared";
import type { BotWallet } from "../orchestrator/wallets.js";

export interface TickContext {
  bot: BotWallet;
  config: BotConfig;
  log: (entry: Omit<BotLogEntry, "t" | "bot_id" | "archetype">) => void;
}

export type TickFn = (ctx: TickContext) => Promise<void>;

export interface RunBotOptions {
  bot: BotWallet;
  /** Reads the latest config from the shared store on every tick. */
  getConfig: () => BotConfig;
  /** Appends a log entry to the session's buffer. */
  log: (entry: BotLogEntry) => void;
  /** Maps archetype → tick function. */
  ticks: Record<BotConfig["archetype"], TickFn>;
  /** External cancel signal, set when the session ends. */
  signal: AbortSignal;
}

const MIN_SLEEP_MS = 500;
const MAX_BACKOFF_MS = 30_000;

export async function runBot(opts: RunBotOptions): Promise<void> {
  const { bot, getConfig, log, ticks, signal } = opts;
  let consecutiveErrors = 0;

  while (!signal.aborted) {
    const config = getConfig();
    const tick = ticks[config.archetype];

    const appendLog: TickContext["log"] = (entry) => {
      log({
        t: Date.now(),
        bot_id: bot.botId,
        archetype: config.archetype,
        ...entry,
      });
    };

    try {
      await tick({ bot, config, log: appendLog });
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      appendLog({
        action: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const intervalSec =
      "interval_seconds" in config ? config.interval_seconds : 15;
    const baseMs = Math.max(MIN_SLEEP_MS, intervalSec * 1000);
    const backoffMs = Math.min(
      MAX_BACKOFF_MS,
      baseMs * Math.pow(2, consecutiveErrors),
    );
    const sleepMs = consecutiveErrors > 0 ? backoffMs : baseMs;

    await sleepWithSignal(sleepMs, signal);
  }
}

async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort);
  });
}
