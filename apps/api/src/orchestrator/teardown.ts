/**
 * teardown.ts — drains every bot wallet at the end of a session.
 *
 * For each bot we transfer its remaining USDC (and a portion of its
 * XLM, keeping enough for the transfer fee) from the bot's smart
 * account BACK to the Calypso AGENT wallet — not the API revenue
 * wallet. Residual funds are the agent's money to recover, since
 * the agent is the one that provisioned them in the first place.
 *
 * Uses SmartAccountContract.buildTransferTx signed by the bot's
 * owner keypair to push funds to the agent's classic G-address.
 */

import {
  TokenContract,
  SmartAccountContract,
  createRpcClientForNetwork,
  signAndSubmitTx,
} from "hoops-sdk-core";
import {
  HOOPS_NETWORK,
  NETWORK_PASSPHRASE,
  TOKENS,
} from "../constants.js";
import { AgentWallet } from "./agentWallet.js";
import type { Session } from "./session.js";
import { logger } from "../logger.js";

export interface TeardownResult {
  session_id: string;
  recovered: { xlm: string; usdc: string };
  per_bot: Array<{
    bot_id: string;
    xlm_sent: string;
    usdc_sent: string;
    xlm_tx?: string;
    usdc_tx?: string;
    error?: string;
  }>;
}

// Leave this much XLM on each smart account for the transfer's own
// gas fees. Without it the transfer tx itself fails.
const MIN_XLM_RESERVE_STROOPS = BigInt(20_000_000); // 2 XLM

export async function teardownSession(session: Session): Promise<TeardownResult> {
  // Residual funds flow back to the AGENT, not the API revenue wallet.
  // The agent provisioned these bots and owns the money left over.
  const agent = AgentWallet.get();
  const destAddress = agent.publicKey;

  const server = createRpcClientForNetwork(HOOPS_NETWORK);
  const xlmToken = new TokenContract(TOKENS.xlm, server, NETWORK_PASSPHRASE);
  const usdcToken = new TokenContract(TOKENS.usdc, server, NETWORK_PASSPHRASE);

  let totalXlm = BigInt(0);
  let totalUsdc = BigInt(0);
  const perBot: TeardownResult["per_bot"] = [];

  // One bot at a time — each bot signs with its own keypair via its
  // own HoopsSession, so there's no platform-side sequence contention.
  for (const bot of session.bots) {
    const entry: TeardownResult["per_bot"][number] = {
      bot_id: bot.botId,
      xlm_sent: "0",
      usdc_sent: "0",
    };

    try {
      const [xlmBal, usdcBal] = await Promise.all([
        xlmToken.balance(bot.pubkey, bot.smartAccountId),
        usdcToken.balance(bot.pubkey, bot.smartAccountId),
      ]);

      // USDC first — no reserve needed for a token that's not gas.
      if (usdcBal > 0n) {
        try {
          const smartAccount = new SmartAccountContract(
            bot.smartAccountId,
            server,
            NETWORK_PASSPHRASE,
          );
          const tx = await smartAccount.buildTransferTx(
            bot.pubkey,
            TOKENS.usdc,
            destAddress,
            usdcBal,
          );
          const { hash } = await signAndSubmitTx(server, bot.session.keypair, tx);
          entry.usdc_sent = usdcBal.toString();
          entry.usdc_tx = hash;
          totalUsdc += usdcBal;
          logger.info(
            { botId: bot.botId, hash, usdc: usdcBal.toString() },
            "teardown: usdc returned to agent",
          );
        } catch (err) {
          logger.warn(
            { botId: bot.botId, err: err instanceof Error ? err.message : err },
            "teardown: usdc transfer failed",
          );
          entry.error = err instanceof Error ? err.message : String(err);
        }
      }

      // XLM — keep a small reserve for fees.
      const xlmToSend = xlmBal > MIN_XLM_RESERVE_STROOPS ? xlmBal - MIN_XLM_RESERVE_STROOPS : 0n;
      if (xlmToSend > 0n) {
        try {
          const smartAccount = new SmartAccountContract(
            bot.smartAccountId,
            server,
            NETWORK_PASSPHRASE,
          );
          const tx = await smartAccount.buildTransferTx(
            bot.pubkey,
            TOKENS.xlm,
            destAddress,
            xlmToSend,
          );
          const { hash } = await signAndSubmitTx(server, bot.session.keypair, tx);
          entry.xlm_sent = xlmToSend.toString();
          entry.xlm_tx = hash;
          totalXlm += xlmToSend;
          logger.info(
            { botId: bot.botId, hash, xlm: xlmToSend.toString() },
            "teardown: xlm returned to agent",
          );
        } catch (err) {
          logger.warn(
            { botId: bot.botId, err: err instanceof Error ? err.message : err },
            "teardown: xlm transfer failed",
          );
          if (!entry.error) entry.error = err instanceof Error ? err.message : String(err);
        }
      }
    } catch (err) {
      logger.warn(
        { botId: bot.botId, err: err instanceof Error ? err.message : err },
        "teardown: balance read failed",
      );
      entry.error = err instanceof Error ? err.message : String(err);
    }

    perBot.push(entry);
  }

  logger.info(
    {
      sessionId: session.id,
      totalXlm: totalXlm.toString(),
      totalUsdc: totalUsdc.toString(),
    },
    "teardown: complete",
  );

  return {
    session_id: session.id,
    recovered: { xlm: totalXlm.toString(), usdc: totalUsdc.toString() },
    per_bot: perBot,
  };
}
