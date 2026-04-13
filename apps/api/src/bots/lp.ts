/**
 * lp.ts — 50/50 LP manager with naive rebalance.
 *
 * On first tick with no existing position: call HoopsSession.deposit()
 * which performs addLiquidity across configured adapters.
 *
 * On subsequent ticks: read LP positions, periodically skim a small
 * amount via a swap to simulate rebalance pressure. Swap routes through
 * the best-priced adapter.
 */

import { swapXlmToUsdc, fromStroops } from "../router/hoopsRouter.js";
import type { TickFn } from "./chassis.js";
import type { DexId } from "@calypso/shared";

const REBALANCE_PROBE_XLM = 1;

export const lpTick: TickFn = async ({ bot, config, log }) => {
  if (config.archetype !== "lp_manager") return;

  const positions = await bot.session.getLpPositions();
  const hasPosition = positions.some((p) => p.shares > 0n);

  if (!hasPosition) {
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
    dex: result.adapterName as DexId,
    pair: "XLM/USDC",
    amount_in: REBALANCE_PROBE_XLM,
    amount_out: Number(fromStroops(result.expectedAmountOut)),
    tx_hash: result.txHash,
    note: `lp rebalance probe via ${result.adapterName} (threshold=${config.rebalance_threshold}, shares=${sharesLabel})`,
  });
};
