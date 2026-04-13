/**
 * index.ts — Express bootstrap for Calypso Swarm.
 *
 * Two logical services, one Node process:
 *
 *   1. CALYPSO API (service 1)
 *      x402-gated endpoints — this is the product.
 *        POST /plan      $0.01
 *        POST /simulate  $0.05
 *        POST /analyze   $0.01
 *      Plus free read endpoints:
 *        GET  /health
 *        GET  /wallets/platform  (API revenue wallet state)
 *
 *   2. AGENT RUNTIME (service 2)
 *      The Calypso agent — an autonomous orchestrator that the
 *      user funds and that autonomously consumes the Calypso API.
 *      All routes free; x402 payments happen internally when the
 *      agent calls the API over localhost.
 *        GET  /agent                 identity + balance
 *        GET  /agent/balance         just balances
 *        POST /agent/withdraw        agent → user classical transfer
 *        POST /agent/simulate        runSimulation workflow
 *        POST /agent/stop/:id        stop + teardown
 *        GET  /agent/sessions        list
 *        GET  /agent/session/:id     full report
 *        GET  /agent/session/:id/events  SSE live tail
 *
 *   Admin faucets (demo only):
 *        POST /admin/mint-usdc       mint USDC to any address
 *
 * Route registration order matters: free routes FIRST, then the
 * x402 middleware (which gates any downstream route matching its
 * route config). The gated routes register AFTER the middleware.
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
import {
  handlePlatformWallet,
  handleWalletByAddress,
  handleMintUsdcToAddress,
} from "./routes/wallets.js";
import { handleBuildFundAgent, handleSubmitSignedTx } from "./routes/tx.js";
import {
  handleAgentStatus,
  handleAgentBalance,
  handleAgentWithdraw,
  handleAgentSimulate,
  handleAgentSimulateStream,
  handleAgentPlanStream,
  handleAgentLaunch,
  handleAgentStop,
  handleAgentSessions,
  handleAgentSession,
  handleAgentSessionEvents,
} from "../agent/routes.js";
import { startReviewerLoop } from "../ai/reviewer.js";
import { listSessions as sessionList, getSession } from "../orchestrator/session.js";
import { PlatformWallet } from "../orchestrator/platformWallet.js";
import { AgentWallet } from "../orchestrator/agentWallet.js";
import { recoverStrandedSessions } from "../orchestrator/botKeystore.js";

async function bootstrap(): Promise<void> {
  const app = express();
  app.use(cors({ origin: ENV.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));

  // ───────────────────────────────────────────────────────────────
  // FREE routes — Calypso API readonly + admin faucets + Agent
  // ───────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      api_revenue_wallet: ENV.PAY_TO,
      network: ENV.X402_NETWORK,
      x402_gated: true,
    });
  });

  // API readonly — the revenue wallet balance (visible in the UI
  // as the API Revenue side panel).
  app.get("/wallets/platform", handlePlatformWallet);
  app.get("/wallets/balance", handleWalletByAddress);

  // Admin faucet (demo only): mint USDC to an arbitrary address so
  // the user can fund their Freighter wallet as a testnet shim.
  app.post("/admin/mint-usdc", handleMintUsdcToAddress);

  // User-signed tx helpers — browser calls /tx/build-fund-agent to
  // get an unsigned XDR, signs with Freighter, then calls /tx/submit
  // to land it on-chain. Used by the /wallets "Fund Agent" card for
  // the real Freighter → Agent USDC transfer flow.
  app.post("/tx/build-fund-agent", handleBuildFundAgent);
  app.post("/tx/submit", handleSubmitSignedTx);

  // Agent routes — the UI's remote control surface.
  app.get("/agent", handleAgentStatus);
  app.get("/agent/balance", handleAgentBalance);
  app.post("/agent/withdraw", handleAgentWithdraw);
  app.post("/agent/simulate", handleAgentSimulate);
  app.post("/agent/simulate-stream", handleAgentSimulateStream);
  app.post("/agent/plan-stream", handleAgentPlanStream);
  app.post("/agent/launch", handleAgentLaunch);
  app.post("/agent/stop/:id", handleAgentStop);
  app.get("/agent/sessions", handleAgentSessions);
  app.get("/agent/session/:id", handleAgentSession);
  app.get("/agent/session/:id/events", handleAgentSessionEvents);

  // ───────────────────────────────────────────────────────────────
  // x402-GATED routes — the Calypso API product surface.
  //
  // Always on. No demo-mode bypass. The agent (or any third-party
  // x402 client) is responsible for signing payments. The
  // facilitator settles on-chain.
  // ───────────────────────────────────────────────────────────────
  const planRateLimit = rateLimit({ windowMs: 60_000, max: 10, label: "plan" });
  const simulateRateLimit = rateLimit({ windowMs: 60_000, max: 5, label: "simulate" });
  app.use(await buildX402Middleware());
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

  // Bootstrap both wallets in the background. PlatformWallet owns
  // the API revenue wallet (x402 `payTo` sink). AgentWallet owns
  // the x402 PAYER — the autonomous Calypso agent's keypair.
  void PlatformWallet.get()
    .ensureInitialized()
    .catch((err) => logger.error({ err }, "platformWallet: initial boot failed"));
  void AgentWallet.get()
    .ensureInitialized()
    .then(() => recoverStrandedSessions())
    .catch((err) => logger.error({ err }, "agentWallet: initial boot failed"));
}

bootstrap().catch((err) => {
  logger.error({ err }, "bootstrap failed");
  process.exit(1);
});
