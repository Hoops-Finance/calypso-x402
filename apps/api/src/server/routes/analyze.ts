import type { Request, Response } from "express";
import {
  AnalyzeRequestSchema,
  type AnalyzeResponse,
} from "@calypso/shared";
import { getAllQuotes, toStroops } from "../../router/hoopsRouter.js";
import { TOKENS, ADDRESS_BOOK } from "../../constants.js";
import { logger } from "../../logger.js";

/**
 * /analyze — protocol health snapshot.
 *
 * v0 uses the Hoops router's getAllQuotes to probe each adapter's
 * effective liquidity for a 1-XLM sample swap. The idea: an adapter that
 * returns a much higher amountOut than peers is either thinly-priced or
 * mispriced, both of which matter for risk scoring. This is deliberately
 * a read-only hit on RPC — the fee for /analyze is justified by the
 * synthesis step, not compute cost.
 */
export async function handleAnalyze(req: Request, res: Response): Promise<void> {
  const parsed = AnalyzeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid analyze request", issues: parsed.error.issues });
    return;
  }

  try {
    const quotes = await getAllQuotes(ADDRESS_BOOK.router, toStroops(1), TOKENS.xlm, TOKENS.usdc);
    const amounts = quotes.map((q) => Number(q.amountOut));
    const sum = amounts.reduce((a, b) => a + b, 0);
    const max = amounts.length ? Math.max(...amounts) : 0;
    const min = amounts.length ? Math.min(...amounts) : 0;
    const avg = quotes.length ? sum / quotes.length : 0;
    const spreadRatio = max && min ? max / min - 1 : 0;

    const response: AnalyzeResponse = {
      pool_health: quotes.map((q) => ({
        pool: q.poolAddress,
        reserves_a: 0,
        reserves_b: 0,
        fee_bps: 30,
      })),
      liquidity_depth_usd: avg / 10_000_000,
      fee_analysis: {
        avg_fee_bps: 30,
        fee_24h_usd: 0,
      },
      risk_profile: {
        concentration: spreadRatio > 10 ? "high" : spreadRatio > 2 ? "medium" : "low",
        stale_pools: 0,
        notes: [
          `${quotes.length} Hoops adapter(s) responded`,
          `spread ratio (max/min - 1) = ${spreadRatio.toFixed(2)}`,
        ],
      },
    };
    res.json(response);
  } catch (err) {
    logger.error({ err }, "analyze crashed");
    res.status(500).json({ error: "analyze failed" });
  }
}
