/**
 * wallets.ts — session wallet lifecycle.
 *
 * Money flow for each bot:
 *
 *   friendbot ────▶ bot EOA (10k XLM, standard testnet plumbing)
 *                    │
 *                    │ fundAccountXlm
 *                    ▼
 *                  bot smart account ◀── orchestrator.transferUsdc
 *                                         (USDC originates at the
 *                                          orchestrator's smart account,
 *                                          either from x402 payments in
 *                                          prod or from admin mint in
 *                                          testnet demo mode)
 *
 * Bots never create USDC. They receive it from the orchestrator. This
 * mirrors the production model where x402 payments flow in to the
 * orchestrator and are distributed to per-session bot wallets.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { toStroops } from "hoops-sdk-core";
import { createBotSession, type BotSession } from "../router/hoopsRouter.js";
import { FRIENDBOT_URL, BOT_DEPLOY_XLM_FUNDING } from "../constants.js";
import { PlatformWallet } from "./platformWallet.js";
import { logger } from "../logger.js";

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
 * Creates + funds a bot wallet end-to-end.
 *
 *   1. friendbot the fresh EOA   (XLM source)
 *   2. deploy the Hoops smart account
 *   3. fund the smart account with XLM from the EOA (SAC transfer)
 *   4. pull `usdcPerBot` USDC from the orchestrator's smart account
 *
 * Step 4's transferUsdc is serialized inside PlatformWallet via an
 * internal promise queue, so concurrent bot creations don't race on
 * the orchestrator's sequence number. If the orchestrator is out of
 * USDC the bot still launches and the LP bot handles the shortage
 * with a clean skip.
 */
export async function createBotWallet(
  botId: string,
  usdcPerBot: number,
): Promise<BotWallet> {
  const kp = Keypair.random();
  await friendbotFund(kp.publicKey());
  const session = await createBotSession(kp);

  // XLM side: one-shot EOA → smart account transfer via XLM SAC.
  // Works once per fresh keypair (the SAC tracks balance stingily
  // after the first transfer, but fresh friendbot accounts always
  // start with a clean SAC balance).
  await session.session.fundAccountXlm(BOT_DEPLOY_XLM_FUNDING);

  // USDC side: orchestrator funds the bot, not the other way around.
  // This is the architecturally correct direction — bots are pure
  // consumers of platform-held USDC.
  try {
    const platform = PlatformWallet.get();
    const txHash = await platform.transferUsdc(
      session.smartAccountId,
      toStroops(usdcPerBot),
    );
    logger.info(
      { botId, txHash, usdc: usdcPerBot },
      "wallets: bot received USDC from orchestrator",
    );
  } catch (err) {
    logger.warn(
      { botId, err: err instanceof Error ? err.message : err },
      "wallets: orchestrator USDC transfer failed — bot will operate XLM-only",
    );
  }

  return { ...session, botId };
}

/**
 * Best-effort shutdown. Today this is a no-op: testnet XLM is worthless
 * and withdrawing LP positions races the AI reviewer's final tick. On
 * mainnet this would liquidate LP, transfer XLM/USDC back to the
 * orchestrator, and zero out the smart account.
 */
export async function closeBotWallet(_bot: BotWallet): Promise<void> {
  return;
}
