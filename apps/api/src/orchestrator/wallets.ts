/**
 * wallets.ts
 * ----------
 * Session wallet lifecycle:
 *
 *   Treasury  (1 per session, friendbot-funded on testnet)
 *     └── Bot wallets (N per session, funded from friendbot + smart account deploy)
 *
 * On session close, bots liquidate and return XLM to the treasury. For v0
 * (testnet, 48h), we keep this simple: each bot keypair is funded directly
 * by friendbot rather than routed through the treasury, because friendbot
 * gives every new keypair 10,000 XLM and we don't need real capital flow
 * to demonstrate the architecture. The `treasury -> bot -> treasury` path
 * is exposed via the same functions so a mainnet implementation drops in
 * without touching the orchestrator.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { toStroops } from "hoops-sdk-core";
import { createBotSession, type BotSession } from "../router/hoopsRouter.js";
import { FRIENDBOT_URL, BOT_DEPLOY_XLM_FUNDING } from "../constants.js";
import { PlatformWallet } from "./platformWallet.js";
import { logger } from "../logger.js";

// How much USDC the orchestrator transfers into each new bot's smart
// account. Set right above the 0.5 USDC LP deposit threshold (per
// hoops-sdk TX_DEFAULTS.minUsdcForDeposit) since orchestrator USDC is
// a scarce resource on testnet (every 1 USDC costs us ~7000 XLM of
// friendbot funds via the Hoops Soroswap pool).
const BOT_USDC_SEED_USDC = 0.55;

export interface TreasuryWallet {
  keypair: Keypair;
  pubkey: string;
}

export interface BotWallet extends BotSession {
  /** Human-facing label — matches BotConfig.bot_id. */
  botId: string;
}

async function friendbotFund(pubkey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pubkey)}`);
  if (!res.ok) {
    throw new Error(`friendbot failed ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

export async function createTreasury(): Promise<TreasuryWallet> {
  const keypair = Keypair.random();
  await friendbotFund(keypair.publicKey());
  return { keypair, pubkey: keypair.publicKey() };
}

/**
 * Creates a bot wallet: fresh keypair → friendbot → deploy smart account →
 * fund the smart account with some XLM so it can submit transactions.
 *
 * Callers should await all bot creations in parallel when spinning up a
 * session, since each deploy takes ~5s of network round-trips.
 */
export async function createBotWallet(botId: string): Promise<BotWallet> {
  const kp = Keypair.random();
  await friendbotFund(kp.publicKey());
  const session = await createBotSession(kp);
  await session.session.fundAccountXlm(BOT_DEPLOY_XLM_FUNDING);

  // Orchestrator-funded USDC seed. The platform wallet holds USDC that
  // it accumulated on startup via a large XLM→USDC seed swap. We pull
  // from it to fund this bot's smart account directly, so the bot never
  // has to figure out its own USDC acquisition. This matches the "user
  // → orchestrator → bots" mental model we show in the UI.
  //
  // If the orchestrator is out of USDC (e.g. long-running server that
  // burnt through its float) we log and continue — the bot will still
  // work for archetypes that only need XLM. The LP bot will skip its
  // deposit with a clean log.
  try {
    const platform = PlatformWallet.get();
    const amountStroops = toStroops(BOT_USDC_SEED_USDC);
    const txHash = await platform.transferUsdc(session.smartAccountId, amountStroops);
    logger.info(
      { botId, txHash, usdc: BOT_USDC_SEED_USDC },
      "wallets: funded bot USDC from orchestrator",
    );
  } catch (err) {
    logger.warn(
      { botId, err: err instanceof Error ? err.message : err },
      "wallets: orchestrator USDC funding failed — bot will operate XLM-only",
    );
  }

  return { ...session, botId };
}

/**
 * Best-effort shutdown. Today this is a no-op: testnet XLM is worthless,
 * and withdrawing LP positions races against the AI reviewer's final tick.
 * On mainnet this would liquidate LP, transfer XLM/USDC back to treasury,
 * and zero out the smart account.
 */
export async function closeBotWallet(_bot: BotWallet): Promise<void> {
  return;
}
