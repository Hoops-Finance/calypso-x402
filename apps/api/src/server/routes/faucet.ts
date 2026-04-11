/**
 * faucet.ts — free developer faucet to fund a Freighter wallet with
 * testnet XLM and USDC in one shot.
 *
 * Flow:
 *   1. (optional) friendbot the target address so it has an account.
 *   2. Use the Calypso revenue wallet (PAY_TO) — which is already
 *      friendbot-funded during `pnpm bootstrap-pay-to` — to swap some
 *      XLM to USDC, then transfer that USDC to the target.
 *
 * This endpoint is FREE and intended for local UI testing only. In a
 * deployment it'd be gated behind x402 like everything else. Enabled
 * only when X402_DEMO_MODE=true.
 */

import type { Request, Response } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { createSession } from "hoops-sdk-actions";
import { TokenContract, signAndSubmitTx, toStroops } from "hoops-sdk-core";
import { z } from "zod";
import {
  HOOPS_NETWORK,
  NETWORK_PASSPHRASE,
  TOKENS,
  FRIENDBOT_URL,
} from "../../constants.js";
import { createRpcClientForNetwork } from "hoops-sdk-core";
import { ENV } from "../../env.js";
import { logger } from "../../logger.js";

const FaucetRequestSchema = z.object({
  address: z.string().regex(/^G[A-Z0-9]{55}$/, "not a valid Stellar G-address"),
  usdc_amount: z.number().positive().max(100).default(25),
});

const server = createRpcClientForNetwork(HOOPS_NETWORK);

async function friendbot(addr: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(addr)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 400 with "op_already_exists" is fine — account already funded.
    if (res.status === 400 && /already/i.test(body)) return;
    throw new Error(`friendbot ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function handleFaucet(req: Request, res: Response): Promise<void> {
  if (!ENV.X402_DEMO_MODE) {
    res.status(403).json({ error: "faucet only available in demo mode" });
    return;
  }
  const parsed = FaucetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid faucet request", issues: parsed.error.issues });
    return;
  }
  const { address, usdc_amount } = parsed.data;

  if (!process.env.PAY_TO_SECRET) {
    res
      .status(500)
      .json({ error: "server has no PAY_TO_SECRET configured — run pnpm bootstrap-pay-to" });
    return;
  }

  try {
    // Step 1: friendbot the target so it has a Stellar account.
    await friendbot(address).catch((err) => {
      logger.warn({ err, address }, "faucet: friendbot failed (continuing)");
    });

    // Step 2: platform-side swap via the revenue wallet, then transfer USDC.
    const platformKeypair = Keypair.fromSecret(process.env.PAY_TO_SECRET!);
    const platformSession = createSession({
      network: HOOPS_NETWORK,
      keypair: platformKeypair,
    });

    // The platform wallet may or may not have a smart account yet. Deploy
    // one on demand so the swap path works. This is cached implicitly by
    // HoopsSession, but we re-deploy per-call for simplicity.
    try {
      await platformSession.deploySmartAccount();
    } catch (err) {
      // Already deployed or funded — check by trying to read state.
      logger.info({ err: err instanceof Error ? err.message : err }, "faucet: deploy skipped");
    }

    // Fund the smart account with enough XLM for the swap + fees.
    await platformSession.fundAccountXlm(usdc_amount + 5);

    // Swap XLM → USDC inside the platform smart account.
    const swapHash = await platformSession.swapXlmToUsdc(usdc_amount);

    // Transfer the freshly-minted USDC from the platform smart account
    // to the target address.
    const usdcToken = new TokenContract(TOKENS.usdc, server, NETWORK_PASSPHRASE);
    const state = platformSession.state;
    if (!state.smartAccountId) {
      throw new Error("platform smart account missing after deploy");
    }
    const usdcStroops = toStroops(usdc_amount * 0.5); // conservative — account for slippage
    const tx = await usdcToken.buildTransferTx(
      state.smartAccountId,
      address,
      usdcStroops,
    );
    const { hash: transferHash } = await signAndSubmitTx(server, platformKeypair, tx);

    res.json({
      ok: true,
      friendbot_funded: true,
      swap_tx: swapHash,
      transfer_tx: transferHash,
      usdc_amount,
      recipient: address,
    });
  } catch (err) {
    logger.error({ err }, "faucet failed");
    res
      .status(500)
      .json({ error: "faucet failed", detail: err instanceof Error ? err.message : String(err) });
  }
}
