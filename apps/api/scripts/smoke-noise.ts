/**
 * smoke-noise.ts — launches one noise bot on testnet for 90 seconds and
 * asserts at least one successful swap was logged. Validates chassis +
 * wallet factory + router wrapper under continuous operation.
 */

import "dotenv/config";
import { createBotWallet } from "../src/orchestrator/wallets.js";
import { runBot, BOT_TICKS } from "../src/bots/index.js";
import type { BotConfig, BotLogEntry } from "@calypso/shared";
import { HOOPS_NETWORK } from "../src/constants.js";

function explorerTx(hash: string): string {
  return HOOPS_NETWORK === "testnet"
    ? `https://stellar.expert/explorer/testnet/tx/${hash}`
    : `https://stellar.expert/explorer/public/tx/${hash}`;
}

async function main(): Promise<void> {
  console.log("=== Calypso smoke-noise ===");
  console.log(`network: ${HOOPS_NETWORK}`);

  const botId = "noise-1";
  console.log("→ create bot wallet (friendbot + smart account)…");
  const bot = await createBotWallet(botId);
  console.log(`   pubkey:  ${bot.pubkey}`);
  console.log(`   account: ${bot.smartAccountId}`);

  const config: BotConfig = {
    archetype: "noise",
    bot_id: botId,
    interval_seconds: 15,
    min_amount: 1,
    max_amount: 3,
    target_pools: ["soroswap:USDC/XLM"],
  };

  const logs: BotLogEntry[] = [];
  const controller = new AbortController();

  console.log("\n→ running noise bot for 90s…\n");
  const deadline = Date.now() + 90_000;
  const stopper = setTimeout(() => controller.abort(), 90_000);

  const task = runBot({
    bot,
    getConfig: () => config,
    log: (entry) => {
      logs.push(entry);
      const shortHash = entry.tx_hash ? entry.tx_hash.slice(0, 10) : "";
      const suffix = entry.error ? ` — ERROR: ${entry.error}` : entry.note ? ` — ${entry.note}` : "";
      process.stdout.write(
        `  [${new Date(entry.t).toISOString().slice(11, 19)}] ${entry.action.padEnd(8)} ${shortHash}${suffix}\n`,
      );
    },
    ticks: BOT_TICKS,
    signal: controller.signal,
  });

  await task;
  clearTimeout(stopper);

  const swaps = logs.filter((l) => l.action === "swap" && l.tx_hash);
  const errors = logs.filter((l) => l.action === "error");

  console.log(`\n=== smoke-noise done ===`);
  console.log(`  successful swaps: ${swaps.length}`);
  console.log(`  errors:           ${errors.length}`);
  if (swaps.length > 0) {
    console.log(`  first swap:       ${explorerTx(swaps[0]!.tx_hash!)}`);
  }

  if (swaps.length < 1) {
    console.error("\nFAIL: expected >= 1 successful swap in 90s");
    process.exit(1);
  }
  console.log("\nOK");
  void deadline;
}

main().catch((err) => {
  console.error("smoke-noise failed:", err);
  process.exit(1);
});
