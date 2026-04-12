/**
 * withdraw.ts — POST /wallets/platform/withdraw
 *
 * Pulls USDC from the Calypso orchestrator smart account back out to
 * a user-supplied Stellar address. Demo-mode only (same gate as the
 * admin/mint and topup routes).
 */

import type { Request, Response } from "express";
import { PlatformWallet } from "../../orchestrator/platformWallet.js";
import { ENV } from "../../env.js";
import { logger } from "../../logger.js";

export async function handleWithdraw(req: Request, res: Response): Promise<void> {
  if (!ENV.X402_DEMO_MODE) {
    res.status(403).json({ error: "withdraw only available in demo mode" });
    return;
  }
  const to = String(req.body?.to ?? "").trim();
  const amount = Number(req.body?.usdc_amount ?? 0);

  if (!/^[GC][A-Z0-9]{55}$/.test(to)) {
    res.status(400).json({ error: "invalid stellar address" });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    res.status(400).json({ error: "usdc_amount must be > 0 and <= 10000" });
    return;
  }

  try {
    const platform = PlatformWallet.get();
    const { hash } = await platform.withdrawUsdc(to, amount);
    logger.info({ to, amount, hash }, "withdraw: success");
    res.json({
      ok: true,
      tx: hash,
      amount_usdc: amount,
      recipient: to,
    });
  } catch (err) {
    logger.error({ err }, "withdraw failed");
    res
      .status(500)
      .json({ error: "withdraw failed", detail: err instanceof Error ? err.message : String(err) });
  }
}
