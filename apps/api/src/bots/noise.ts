/**
 * noise.ts — a dumb volume-generating bot.
 *
 * On each tick, picks a random XLM swap size within config bounds and
 * routes it through whichever DEX has the best price. Generates background
 * volume so the AI reviewer has data and the LP bot's rebalance fires.
 */

import { swapXlmToUsdc, fromStroops } from "../router/hoopsRouter.js";
import type { TickFn } from "./chassis.js";
import type { DexId } from "@calypso/shared";

function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

export const noiseTick: TickFn = async ({ bot, config, log }) => {
  if (config.archetype !== "noise") return;
  const amount = Number(randomInRange(config.min_amount, config.max_amount).toFixed(2));

  const result = await swapXlmToUsdc(bot, amount);

  log({
    action: "swap",
    dex: result.adapterName as DexId,
    pair: "XLM/USDC",
    amount_in: amount,
    amount_out: Number(fromStroops(result.expectedAmountOut)),
    tx_hash: result.txHash,
    note: `noise swap via ${result.adapterName} (${config.target_pools.length} target pools)`,
  });
};
