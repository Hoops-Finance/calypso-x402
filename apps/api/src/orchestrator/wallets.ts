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
import { createBotSession, type BotSession } from "../router/hoopsRouter.js";
import {
  FRIENDBOT_URL,
  BOT_DEPLOY_XLM_FUNDING,
  BOT_SELF_SEED_SWAP_XLM,
} from "../constants.js";
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

  // Step 1: fund the smart account with a big chunk of XLM (9000). This
  // is a single EOA→smart-account SAC transfer. It works the first time
  // and only the first time — the XLM SAC's EOA-side balance collapses
  // after one transfer. Which is fine: each bot is a fresh keypair with
  // a fresh SAC balance, and we only need ONE fund call per bot.
  await session.session.fundAccountXlm(BOT_DEPLOY_XLM_FUNDING);

  // Step 2: self-seed USDC by swapping a large chunk (4000 XLM) for USDC
  // inside the smart account. On the Hoops testnet Soroswap pool this
  // yields ~0.55 USDC, which is enough for the LP bot's 0.5 USDC
  // deposit threshold. Each bot does this independently — no platform
  // dependency, no keypair race conditions.
  //
  // The platform wallet still exists as the x402 revenue collector and
  // is visible in the UI as "where your payments go". It does NOT fund
  // bot USDC on testnet; that would require wrapping/unwrapping XLM
  // across the SAC, which is cursed.
  try {
    const txHash = await session.session.swapXlmToUsdc(BOT_SELF_SEED_SWAP_XLM);
    logger.info(
      { botId, txHash, xlm: BOT_SELF_SEED_SWAP_XLM },
      "wallets: bot self-seeded USDC via XLM swap",
    );
  } catch (err) {
    logger.warn(
      { botId, err: err instanceof Error ? err.message : err },
      "wallets: bot self-seed swap failed — bot will operate XLM-only",
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
