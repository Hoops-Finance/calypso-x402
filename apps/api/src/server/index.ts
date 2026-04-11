/**
 * index.ts — Express bootstrap for Calypso Swarm.
 *
 * Order matters: we must install the x402 payment middleware BEFORE any
 * gated routes are registered, so the middleware sees them. Non-gated
 * routes (/report, /sessions, /events, /health) are registered either
 * before the middleware (unprotected) or with different verbs that the
 * middleware ignores.
 */

import express from "express";
import cors from "cors";
import { ENV } from "../env.js";
import { logger } from "../logger.js";
import { buildX402Middleware } from "./x402.js";
import { rateLimit } from "./rateLimit.js";
import { handlePlan } from "./routes/plan.js";
import { handleSimulate } from "./routes/simulate.js";
import { handleAnalyze } from "./routes/analyze.js";
import { handleReport, handleListSessions } from "./routes/report.js";
import { handleEvents } from "./routes/events.js";
import {
  handlePlatformWallet,
  handleSessionWallets,
  handleWalletByAddress,
} from "./routes/wallets.js";
import { startReviewerLoop } from "../ai/reviewer.js";
import { listSessions as sessionList, getSession } from "../orchestrator/session.js";
import { PlatformWallet } from "../orchestrator/platformWallet.js";

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(cors({ origin: ENV.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));

  // Free routes (registered before x402 middleware so they're never gated).
  app.get("/health", (_req, res) => {
    res.json({ ok: true, pay_to: ENV.PAY_TO, network: ENV.X402_NETWORK });
  });
  app.get("/sessions", handleListSessions);
  app.get("/report/:sessionId", handleReport);
  app.get("/events/:sessionId", handleEvents);
  app.get("/wallets/platform", handlePlatformWallet);
  app.get("/wallets/balance", handleWalletByAddress);
  app.get("/sessions/:sessionId/wallets", handleSessionWallets);

  // x402-gated routes. The rate limiter for /plan sits in front of x402 so
  // a hostile client can't burn our Gemma quota even if they bypass payment.
  const planRateLimit = rateLimit({ windowMs: 60_000, max: 10, label: "plan" });
  const simulateRateLimit = rateLimit({ windowMs: 60_000, max: 5, label: "simulate" });

  if (ENV.X402_DEMO_MODE) {
    logger.warn("X402_DEMO_MODE=true — gated routes are OPEN. Do not deploy.");
  } else {
    app.use(buildX402Middleware());
  }
  app.post("/plan", planRateLimit, handlePlan);
  app.post("/simulate", simulateRateLimit, handleSimulate);
  app.post("/analyze", handleAnalyze);

  app.use((_req, res) => res.status(404).json({ error: "not found" }));

  // Shared session list view for the reviewer tick.
  startReviewerLoop(() => {
    return sessionList()
      .map((s) => getSession(s.session_id))
      .filter((s): s is NonNullable<typeof s> => s !== null);
  });

  app.listen(ENV.API_PORT, () => {
    logger.info({ port: ENV.API_PORT }, "calypso api listening");
  });

  // Kick off platform wallet bootstrap in the background. We intentionally
  // don't await this so the server is listening immediately for /health
  // and the UI's wallet polls. First /simulate may hang a few seconds
  // on its first bot creation if init hasn't finished, which is fine.
  void PlatformWallet.get()
    .ensureInitialized()
    .catch((err) => logger.error({ err }, "platformWallet: initial boot failed"));
}

bootstrap().catch((err) => {
  logger.error({ err }, "bootstrap failed");
  process.exit(1);
});
