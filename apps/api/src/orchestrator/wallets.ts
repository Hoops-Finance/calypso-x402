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
import {
  TokenContract,
  createRpcClientForNetwork,
  signAndSubmitTx,
} from "hoops-sdk-core";
import { createBotSession, type BotSession } from "../router/hoopsRouter.js";
import {
  FRIENDBOT_URL,
  BOT_DEPLOY_XLM_FUNDING,
  TOKENS,
  NETWORK_PASSPHRASE,
  HOOPS_NETWORK,
} from "../constants.js";
import { logger } from "../logger.js";

// How much XLM to immediately swap to USDC so the bot's smart account
// holds both sides of the book. LP bots need this to deposit 50/50
// liquidity; arb/noise bots benefit from having both directions.
const BOT_USDC_SEED_XLM = 20;

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

  // Seed the smart account with some USDC so bots that need both sides
  // of the book (LP manager, arb in both directions) can actually trade.
  //
  // IMPORTANT: the Hoops smart account's on-chain `swap` function
  // delivers the output token back to the OWNER (the EOA), not the smart
  // account itself. So after `swapXlmToUsdc` the EOA holds USDC and the
  // smart account is still 0. We then transfer the USDC from the EOA
  // back into the smart account using the token contract directly, so
  // `getBalances(smartAccount)` reflects the USDC and
  // `HoopsSession.deposit()` can pull it.
  //
  // Logs at every step so we can diagnose flow issues without attaching
  // a debugger.
  try {
    const rpcServer = createRpcClientForNetwork(HOOPS_NETWORK);
    const usdcToken = new TokenContract(TOKENS.usdc, rpcServer, NETWORK_PASSPHRASE);
    const eoa = session.pubkey;
    const smartAcct = session.smartAccountId;

    const eoaUsdcBefore = await usdcToken.balance(eoa, eoa);
    const smartUsdcBefore = await usdcToken.balance(eoa, smartAcct);

    const swapHash = await session.session.swapXlmToUsdc(BOT_USDC_SEED_XLM);

    const eoaUsdcAfter = await usdcToken.balance(eoa, eoa);
    const smartUsdcAfter = await usdcToken.balance(eoa, smartAcct);

    logger.info(
      {
        botId,
        swapHash,
        eoa_usdc_before: eoaUsdcBefore.toString(),
        smart_usdc_before: smartUsdcBefore.toString(),
        eoa_usdc_after: eoaUsdcAfter.toString(),
        smart_usdc_after: smartUsdcAfter.toString(),
      },
      "wallets: seed swap landed",
    );

    // If the EOA got the USDC (expected), push it into the smart account.
    const eoaDelta = eoaUsdcAfter - eoaUsdcBefore;
    const MIN_FORWARD = 1_000_000n; // 0.1 USDC
    if (smartUsdcAfter < MIN_FORWARD && eoaDelta >= MIN_FORWARD) {
      const transferTx = await usdcToken.buildTransferTx(eoa, smartAcct, eoaDelta);
      const { hash: transferHash } = await signAndSubmitTx(rpcServer, kp, transferTx);
      logger.info(
        { botId, transferHash, amount: eoaDelta.toString() },
        "wallets: forwarded USDC from EOA to smart account",
      );
    } else if (smartUsdcAfter >= MIN_FORWARD) {
      logger.info({ botId }, "wallets: USDC already at smart account, no forward needed");
    } else {
      logger.warn(
        { botId, eoaDelta: eoaDelta.toString() },
        "wallets: seed swap produced no USDC anywhere — check router + addresses",
      );
    }
  } catch (err) {
    logger.warn(
      { botId, err: err instanceof Error ? err.message : err },
      "wallets: USDC seed swap failed — bot will continue with XLM only",
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
