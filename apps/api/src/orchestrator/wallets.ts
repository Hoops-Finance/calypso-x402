/**
 * wallets.ts — session wallet lifecycle.
 *
 * Money flow for each bot:
 *
 *   friendbot ────▶ bot EOA (10k XLM, standard testnet plumbing)
 *                    │
 *                    │ fundAccountXlm (EOA → smart account via SAC)
 *                    ▼
 *                  bot smart account ◀── AGENT.transferUsdc
 *                                         (USDC originates at the
 *                                          Calypso AGENT wallet.
 *                                          The agent is the autonomous
 *                                          orchestrator and the sole
 *                                          source of bot working capital.)
 *
 * Bots never create USDC. They receive it from the agent.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { toStroops } from "hoops-sdk-core";
import { createBotSession, type BotSession } from "../router/hoopsRouter.js";
import { FRIENDBOT_URL, BOT_DEPLOY_XLM_FUNDING } from "../constants.js";
import { AgentWallet } from "./agentWallet.js";
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
 *   1. friendbot the fresh EOA   (XLM source, testnet free onramp)
 *   2. deploy the Hoops smart account (the worker contract)
 *   3. fund the smart account with XLM from the bot's own EOA via SAC
 *   4. pull `usdcPerBot` USDC from the AGENT's wallet — serialized
 *      via AgentWallet.transferUsdc so concurrent bot creations don't
 *      race on the agent's sequence number
 *
 * If the agent runs out of USDC the bot still launches and the LP bot
 * handles the shortage with a clean skip.
 */
export async function createBotWallet(
  botId: string,
  usdcPerBot: number,
): Promise<BotWallet> {
  const kp = Keypair.random();
  await friendbotFund(kp.publicKey());
  const session = await createBotSession(kp);

  // XLM side: EOA → smart account transfer via XLM SAC. Works once
  // per fresh keypair.
  await session.session.fundAccountXlm(BOT_DEPLOY_XLM_FUNDING);

  // USDC side: the AGENT transfers USDC to the bot's smart account.
  // The agent signs with its own keypair. Queue-serialized.
  try {
    const agent = AgentWallet.get();
    const txHash = await agent.transferUsdc(
      session.smartAccountId,
      toStroops(usdcPerBot),
    );
    logger.info(
      { botId, txHash, usdc: usdcPerBot, payer: agent.publicKey },
      "wallets: bot received USDC from agent",
    );
  } catch (err) {
    logger.warn(
      { botId, err: err instanceof Error ? err.message : err },
      "wallets: agent USDC transfer failed — bot will operate XLM-only",
    );
  }

  return { ...session, botId };
}