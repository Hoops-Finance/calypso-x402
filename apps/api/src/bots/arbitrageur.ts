/**
 * arbitrageur.ts — spread detector + opportunistic executor.
 *
 * Each tick:
 *   1. Query getAllQuotes() across every Hoops adapter for a test amount.
 *   2. Compute spread_bps between best and worst quote.
 *   3. If spread >= config.min_spread_bps, execute a swap via the best-
 *      priced adapter (falls back to Soroswap if auth fails).
 *   4. If spread < threshold, log a "skip" with the observed spread so the
 *      AI reviewer can tighten the threshold if the bot is too quiet.
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

const MAX_DISPLAY_BPS = 10_000;

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
  const diffScaled = (best.amountOut - worst.amountOut) * 10_000n;
  const rawBps = Number(diffScaled / worst.amountOut);
  const bps = Number.isFinite(rawBps) && rawBps < MAX_DISPLAY_BPS ? rawBps : MAX_DISPLAY_BPS;
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

  const spreadLabel = spread.bps >= MAX_DISPLAY_BPS ? `>${MAX_DISPLAY_BPS}` : String(spread.bps);

  if (spread.bps < config.min_spread_bps) {
    log({
      action: "skip",
      note: `spread ${spreadLabel}bps < threshold ${config.min_spread_bps}bps (best adapter ${ADAPTER_NAME_BY_ID[spread.bestAdapterId] ?? spread.bestAdapterId})`,
    });
    return;
  }

  const result = await swapXlmToUsdc(bot, probeAmount);
  log({
    action: "swap",
    dex: result.adapterName as DexId,
    pair: "XLM/USDC",
    amount_in: probeAmount,
    amount_out: Number(fromStroops(result.expectedAmountOut)),
    tx_hash: result.txHash,
    note: `arb fire: spread=${spreadLabel}bps, best=${ADAPTER_NAME_BY_ID[spread.bestAdapterId]}, executed via ${result.adapterName}`,
  });
};
