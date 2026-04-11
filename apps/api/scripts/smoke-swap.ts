/**
 * smoke-swap.ts
 * -------------
 * Minimal end-to-end validation of the Calypso → Hoops router integration.
 *
 * Creates a throwaway keypair, funds it via friendbot, deploys a
 * HoopsSession smart account, fetches the best XLM→USDC quote from the
 * router, and executes a small swap. Prints tx hash + explorer link.
 *
 * This script exists to fail LOUDLY if the router wrapper or hoops_sdk
 * integration is broken, before we write any bot code.
 */

import "dotenv/config";
import { Keypair } from "@stellar/stellar-sdk";
import {
  createBotSession,
  getBestQuote,
  swapXlmToUsdc,
  toStroops,
  fromStroops,
} from "../src/router/hoopsRouter.js";
import { FRIENDBOT_URL, TOKENS, HOOPS_NETWORK } from "../src/constants.js";

function explorerTx(hash: string): string {
  return HOOPS_NETWORK === "testnet"
    ? `https://stellar.expert/explorer/testnet/tx/${hash}`
    : `https://stellar.expert/explorer/public/tx/${hash}`;
}

async function friendbotFund(pubkey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(pubkey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`friendbot failed ${res.status}: ${body}`);
  }
}

async function main(): Promise<void> {
  console.log("=== Calypso smoke-swap ===");
  console.log(`network: ${HOOPS_NETWORK}\n`);

  const kp = Keypair.random();
  console.log(`bot pubkey: ${kp.publicKey()}`);

  console.log("→ friendbot fund…");
  await friendbotFund(kp.publicKey());
  console.log("  funded ✓\n");

  console.log("→ deploy smart account…");
  const bot = await createBotSession(kp);
  console.log(`  smartAccountId: ${bot.smartAccountId}\n`);

  console.log("→ fund smart account with XLM (so it can swap)…");
  await bot.session.fundAccountXlm(50);
  console.log("  sent 50 XLM to smart account ✓\n");

  console.log("→ get best quote: 5 XLM → USDC…");
  const quote = await getBestQuote(bot.pubkey, toStroops(5), TOKENS.xlm, TOKENS.usdc);
  if (!quote) {
    throw new Error("no quote available — router returned null");
  }
  console.log(`  adapterId:    ${quote.adapterId}`);
  console.log(`  pool:         ${quote.poolAddress}`);
  console.log(`  amountIn:     5 XLM (${quote.amountIn})`);
  console.log(`  amountOut:    ${fromStroops(quote.amountOut)} USDC (${quote.amountOut})\n`);

  console.log("→ execute swap via router…");
  const result = await swapXlmToUsdc(bot, 5);
  console.log(`  tx hash: ${result.txHash}`);
  console.log(`  adapter used: ${result.adapterId}`);
  console.log(`  expected out: ${fromStroops(result.expectedAmountOut)} USDC`);
  console.log(`  explorer: ${explorerTx(result.txHash)}\n`);

  console.log("=== OK ===");
}

main().catch((err) => {
  console.error("\nsmoke-swap FAILED:");
  console.error(err);
  process.exit(1);
});
