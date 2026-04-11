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
import { mintUsdcTo, canMintUsdc } from "./usdcAdmin.js";
import { logger } from "../logger.js";

// How much USDC to mint directly to each new bot's smart account when
// the USDC admin key is available. Much more than the LP deposit
// threshold so there's plenty of headroom for multiple rebalance
// probes across a session.
const BOT_USDC_MINT_AMOUNT = 5;

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

  // Step 1: fund the smart account with XLM. One shot from EOA to
  // smart account via the XLM SAC. Works once per fresh keypair.
  await session.session.fundAccountXlm(BOT_DEPLOY_XLM_FUNDING);

  // Step 2: get USDC onto the smart account. Two paths:
  //   (a) if USDC_ADMIN_SECRET is set we own the test token contract,
  //       so we mint fresh USDC directly to the smart account. This
  //       bypasses the broken-pool XLM→USDC swap entirely.
  //   (b) fall back to the self-swap path for environments where we
  //       don't have admin access.
  if (canMintUsdc()) {
    try {
      const txHash = await mintUsdcTo(session.smartAccountId, BOT_USDC_MINT_AMOUNT);
      logger.info(
        { botId, txHash, usdc: BOT_USDC_MINT_AMOUNT },
        "wallets: minted USDC directly to bot smart account",
      );
    } catch (err) {
      logger.warn(
        { botId, err: err instanceof Error ? err.message : err },
        "wallets: USDC mint failed, falling back to self-swap",
      );
      await trySelfSeedSwap(session, botId);
    }
  } else {
    await trySelfSeedSwap(session, botId);
  }

  return { ...session, botId };
}

async function trySelfSeedSwap(session: BotSession, botId: string): Promise<void> {
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
