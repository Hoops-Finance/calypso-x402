/**
 * lp.ts — 50/50 LP manager with naive rebalance.
 *
 * On first tick with no existing position: call HoopsSession.deposit()
 * which performs addLiquidity50_50 on the Soroswap USDC/XLM pair using
 * whatever balance the smart account holds.
 *
 * On subsequent ticks: read LP positions. If we're holding a position,
 * log its size and periodically skim a small amount back via a swap to
 * simulate rebalance pressure. For v0 we do NOT actually withdraw and
 * re-deposit — that path involves redeem() + deposit() which takes
 * multiple transactions and is fragile on testnet during a 3-minute demo.
 * The AI reviewer can bump rebalance_threshold to see visible behavior
 * shifts regardless.
 */

import { swapXlmToUsdc, fromStroops } from "../router/hoopsRouter.js";
import type { TickFn } from "./chassis.js";

const REBALANCE_PROBE_XLM = 1;

export const lpTick: TickFn = async ({ bot, config, log }) => {
  if (config.archetype !== "lp_manager") return;

  const positions = await bot.session.getLpPositions();
  const hasPosition = positions.some((p) => p.shares > 0n);

  if (!hasPosition) {
    // Defensive: addLiquidity50_50 requires USDC in the smart account.
    // The wallet factory seeds some via an initial XLM→USDC swap, but
    // that can fail silently. Skip gracefully instead of error-looping.
    const balances = await bot.session.getBalances();
    const usdcHuman = Number(balances.usdc) / 10_000_000;
    const MIN_USDC_FOR_DEPOSIT = 0.5;
    if (usdcHuman < MIN_USDC_FOR_DEPOSIT) {
      log({
        action: "skip",
        note: `lp waiting on USDC seed: ${usdcHuman.toFixed(2)} available, need >= ${MIN_USDC_FOR_DEPOSIT}`,
      });
      return;
    }
    await bot.session.deposit();
    log({
      action: "deposit_liquidity",
      note: `initial 50/50 deposit (${usdcHuman.toFixed(2)} USDC available) to ${config.target_pool}`,
    });
    return;
  }

  const totalShares = positions.reduce((acc, p) => acc + p.shares, 0n);
  const sharesLabel = fromStroops(totalShares);

  // Proxy "drift" with a time-random probe: if we're past the rebalance
  // threshold the AI can lower, we do a token rebalance swap. The swap
  // size is intentionally tiny so we don't blow up our LP position.
  const shouldProbe = Math.random() < config.rebalance_threshold;
  if (!shouldProbe) {
    log({
      action: "skip",
      note: `lp holding ${sharesLabel} shares across ${positions.length} pool(s), no rebalance`,
    });
    return;
  }

  const result = await swapXlmToUsdc(bot, REBALANCE_PROBE_XLM);
  log({
    action: "rebalance",
    dex: "soroswap",
    pair: "XLM/USDC",
    amount_in: REBALANCE_PROBE_XLM,
    amount_out: Number(fromStroops(result.expectedAmountOut)),
    tx_hash: result.txHash,
    note: `lp rebalance probe (threshold=${config.rebalance_threshold}, shares=${sharesLabel})`,
  });
};
