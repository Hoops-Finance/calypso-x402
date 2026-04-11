/**
 * arbitrageur.ts — spread detector + opportunistic executor.
 *
 * Each tick:
 *   1. Query getAllQuotes() across every Hoops adapter for a test amount.
 *   2. Compute spread_bps between best and worst quote.
 *   3. If spread >= config.min_spread_bps, execute a swap via the known-
 *      working Soroswap path and log the observed spread.
 *   4. If spread < threshold, log a "skip" with the observed spread so the
 *      AI reviewer can tighten the threshold if the bot is too quiet.
 *
 * v0 executes on Soroswap regardless of which adapter the best quote came
 * from. This is a known limitation documented in hoopsRouter.ts — the real
 * fix is a Soroban auth pattern that lives in the hoops_sdk repo.
 */

import {
  getAllQuotes,
  swapXlmToUsdc,
  toStroops,
  fromStroops,
  ADAPTERS_BY_ID,
} from "../router/hoopsRouter.js";
import { TOKENS } from "../constants.js";
import type { TickFn } from "./chassis.js";
import type { DexId } from "@calypso/shared";

const ADAPTER_NAME_BY_ID: Record<number, DexId> = {
  [ADAPTERS_BY_ID.aqua]: "aqua",
  [ADAPTERS_BY_ID.comet]: "comet",
  [ADAPTERS_BY_ID.phoenix]: "phoenix",
  [ADAPTERS_BY_ID.soroswap]: "soroswap",
};

interface Spread {
  bps: number;
  bestAdapterId: number;
  bestAmountOut: bigint;
  worstAmountOut: bigint;
}

function computeSpread(
  quotes: { adapterId: number; amountOut: bigint }[],
): Spread | null {
  if (quotes.length < 2) return null;
  let best = quotes[0]!;
  let worst = quotes[0]!;
  for (const q of quotes) {
    if (q.amountOut > best.amountOut) best = q;
    if (q.amountOut < worst.amountOut) worst = q;
  }
  if (worst.amountOut === 0n) return null;
  // (best - worst) / worst, in basis points.
  const diffScaled = (best.amountOut - worst.amountOut) * 10_000n;
  const bps = Number(diffScaled / worst.amountOut);
  return {
    bps,
    bestAdapterId: best.adapterId,
    bestAmountOut: best.amountOut,
    worstAmountOut: worst.amountOut,
  };
}

export const arbitrageurTick: TickFn = async ({ bot, config, log }) => {
  if (config.archetype !== "arbitrageur") return;

  const probeAmount = Math.min(config.max_position_size, 10);
  const amountIn = toStroops(probeAmount);

  const quotes = await getAllQuotes(bot.pubkey, amountIn, TOKENS.xlm, TOKENS.usdc);
  if (quotes.length === 0) {
    log({ action: "skip", note: "no quotes returned" });
    return;
  }

  const spread = computeSpread(quotes);
  if (!spread) {
    log({ action: "skip", note: `only ${quotes.length} quote(s) — need 2+` });
    return;
  }

  if (spread.bps < config.min_spread_bps) {
    log({
      action: "skip",
      note: `spread ${spread.bps}bps < threshold ${config.min_spread_bps}bps (best adapter ${ADAPTER_NAME_BY_ID[spread.bestAdapterId] ?? spread.bestAdapterId})`,
    });
    return;
  }

  const result = await swapXlmToUsdc(bot, probeAmount);
  log({
    action: "swap",
    dex: "soroswap",
    pair: "XLM/USDC",
    amount_in: probeAmount,
    amount_out: Number(fromStroops(result.expectedAmountOut)),
    tx_hash: result.txHash,
    note: `arb fire: spread=${spread.bps}bps, best=${ADAPTER_NAME_BY_ID[spread.bestAdapterId]} (executed via soroswap)`,
  });
};
