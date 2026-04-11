/**
 * launcher.ts — spins up bot wallets + chassis loops for a Session.
 *
 * All bot creation is parallelized because each wallet needs a friendbot
 * round-trip + a smart account deploy, each ~5s. With 3 bots serial is
 * 15s+; parallel is one 5s wait.
 */

import { createBotWallet } from "./wallets.js";
import { runBot, BOT_TICKS } from "../bots/index.js";
import { seedSession, get as getConfig, clearSession } from "./configStore.js";
import { appendBotLog, endSession, setStatus, type Session } from "./session.js";
import { logger } from "../logger.js";

export async function launchSession(session: Session): Promise<void> {
  logger.info({ sessionId: session.id, botCount: session.botConfigs.length }, "launchSession: starting");

  // Create all bot wallets in parallel. friendbot + deploy + XLM
  // fund all work in parallel (each bot has its own keypair), but the
  // per-bot USDC transfer inside createBotWallet is serialized by the
  // platform wallet's internal txQueue so the orchestrator's sequence
  // number doesn't race.
  const usdcPerBot = session.config.usdc_per_bot;
  const bots = await Promise.all(
    session.botConfigs.map((cfg) => createBotWallet(cfg.bot_id, usdcPerBot)),
  );
  session.bots = bots;

  // Seed the config store so bots can poll by (session_id, bot_id).
  seedSession(session.id, session.botConfigs);

  setStatus(session, "running");

  // Spawn each bot's loop. Tasks run until session.controller aborts.
  for (const bot of bots) {
    const task = runBot({
      bot,
      getConfig: () => {
        const cfg = getConfig(session.id, bot.botId);
        if (!cfg) throw new Error(`bot ${bot.botId} removed from configStore`);
        return cfg;
      },
      log: (entry) => appendBotLog(session, entry),
      ticks: BOT_TICKS,
      signal: session.controller.signal,
    }).catch((err) => {
      logger.error({ err, sessionId: session.id, botId: bot.botId }, "bot loop crashed");
    });
    session.botTasks.push(task);
  }

  // Schedule automatic session end based on duration.
  const durationMs = session.config.duration_minutes * 60_000;
  setTimeout(() => {
    void endSession(session).then(() => clearSession(session.id));
  }, durationMs);

  logger.info({ sessionId: session.id }, "launchSession: bots running");
}
