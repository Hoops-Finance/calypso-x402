/**
 * noise.ts — a dumb volume-generating bot.
 *
 * On each tick, picks a random XLM swap size within config bounds and
 * routes it through Hoops. The purpose is to generate realistic
 * background volume so the AI reviewer has something to look at and so
 * the LP bot's rebalance logic actually fires.
 *
 * No directional strategy. No PnL tracking beyond what the router returns.
 * If this bot makes money on testnet that's an accident of the pricing
 * curves, not a feature.
 */

import { swapXlmToUsdc, fromStroops } from "../router/hoopsRouter.js";
import type { TickFn } from "./chassis.js";

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
    dex: "soroswap",
    pair: "XLM/USDC",
    amount_in: amount,
    amount_out: Number(fromStroops(result.expectedAmountOut)),
    tx_hash: result.txHash,
    note: `random noise swap (${config.target_pools.length} target pools in scope)`,
  });
};
