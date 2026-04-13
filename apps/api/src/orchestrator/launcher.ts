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
import { teardownSession } from "./teardown.js";
import { saveSessionKeys, clearSessionKeys } from "./botKeystore.js";
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

  // Persist bot keypairs to disk so a crash can recover stranded funds.
  saveSessionKeys(session);

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
  // Clear the timer if the session is stopped early (abort signal).
  const durationMs = session.config.duration_minutes * 60_000;
  const autoEndTimer = setTimeout(() => {
    logger.info({ sessionId: session.id, bots: session.bots.length }, "auto-end: timer fired");
    void endSession(session)
      .then(() => {
        logger.info({ sessionId: session.id }, "auto-end: starting teardown");
        return teardownSession(session);
      })
      .then((td) => {
        clearSessionKeys(session.id);
        logger.info(
          { sessionId: session.id, xlm: td.recovered.xlm, usdc: td.recovered.usdc },
          "auto-end: bot funds returned to agent",
        );
      })
      .catch((err) => {
        logger.error({ err, sessionId: session.id }, "auto-end: teardown failed");
      })
      .finally(() => clearSession(session.id));
  }, durationMs);
  // If session is stopped manually before the timer fires, cancel it.
  if (!session.controller.signal.aborted) {
    session.controller.signal.addEventListener("abort", () => {
      clearTimeout(autoEndTimer);
      logger.info({ sessionId: session.id }, "auto-end timer cancelled (manual stop)");
    }, { once: true });
  }

  logger.info({ sessionId: session.id }, "launchSession: bots running");
}
