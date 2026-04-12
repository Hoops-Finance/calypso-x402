/**
 * tx.ts — build + submit helpers for Freighter-signed user transactions.
 *
 * Why this exists: the /wallets "Fund Agent" action needs to send USDC
 * from the user's Freighter-held G-address TO the Calypso Agent's
 * G-address. We can't admin-mint (that hides the actual on-chain
 * transfer), we can't have the agent sign (it's not the sender), and
 * we can't build the Soroban contract-call tx purely in the browser
 * without bundling stellar-sdk. So:
 *
 *   1. Browser POST /tx/build-fund-agent { from, usdc_amount }
 *      → server builds+simulates+prepares the USDC transfer tx with
 *        from as source, returns XDR
 *   2. Browser calls Freighter.signTransaction(xdr, {passphrase, address})
 *   3. Browser POST /tx/submit { signed_xdr }
 *      → server sendTransaction + waitForTx, returns tx hash
 *
 * The signature flow uses Soroban "source account authorization" —
 * because the source account IS the `from` of the contract call, the
 * transaction signature also authorizes the contract invocation. No
 * separate auth-entry signing. Freighter handles this natively.
 */

import type { Request, Response } from "express";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import {
  TokenContract,
  createRpcClientForNetwork,
  waitForTx,
  toStroops,
} from "hoops-sdk-core";
import { HOOPS_NETWORK, NETWORK_PASSPHRASE, TOKENS } from "../../constants.js";
import { AgentWallet } from "../../orchestrator/agentWallet.js";
import { logger } from "../../logger.js";

const STELLAR_G_RE = /^G[A-Z0-9]{55}$/;

export async function handleBuildFundAgent(req: Request, res: Response): Promise<void> {
  const from = String(req.body?.from ?? "").trim();
  const amount = Number(req.body?.usdc_amount ?? 0);

  if (!STELLAR_G_RE.test(from)) {
    res.status(400).json({ error: "invalid from address (must be G...)" });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    res.status(400).json({ error: "usdc_amount must be > 0 and <= 10000" });
    return;
  }

  try {
    const server = createRpcClientForNetwork(HOOPS_NETWORK);
    const usdc = new TokenContract(TOKENS.usdc, server, NETWORK_PASSPHRASE);
    const agent = AgentWallet.get();

    // Build the contract-call tx with the user as source + `from`.
    const rawTx = await usdc.buildTransferTx(from, agent.publicKey, toStroops(amount));

    // Prepare it — this assembles resource footprint, fees, and any
    // auth entries. For a token transfer where source === from, Soroban
    // will use source account auth, so no extra auth signing needed.
    const prepared = await server.prepareTransaction(rawTx);

    const xdr = prepared.toXDR();
    logger.info(
      { from, to: agent.publicKey, amount, xdrLen: xdr.length },
      "tx: built fund-agent tx for Freighter signing",
    );
    res.json({
      xdr,
      network_passphrase: NETWORK_PASSPHRASE,
      from,
      to: agent.publicKey,
      amount_usdc: amount,
    });
  } catch (err) {
    logger.error({ err }, "tx: build-fund-agent failed");
    res.status(500).json({
      error: "build failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleSubmitSignedTx(req: Request, res: Response): Promise<void> {
  const signedXdr = String(req.body?.signed_xdr ?? "").trim();
  if (!signedXdr) {
    res.status(400).json({ error: "signed_xdr required" });
    return;
  }

  try {
    const server = createRpcClientForNetwork(HOOPS_NETWORK);
    const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
    const sendResp = await server.sendTransaction(tx);
    if (sendResp.status !== "PENDING") {
      logger.warn({ status: sendResp.status, sendResp }, "tx: submit rejected");
      res.status(400).json({
        error: "submission rejected",
        status: sendResp.status,
        detail: sendResp,
      });
      return;
    }
    const response = await waitForTx(server, sendResp.hash);
    logger.info({ hash: sendResp.hash }, "tx: user-signed tx landed on-chain");
    res.json({
      ok: true,
      hash: sendResp.hash,
      ledger: (response as { ledger?: number }).ledger ?? null,
    });
  } catch (err) {
    logger.error({ err }, "tx: submit failed");
    res.status(500).json({
      error: "submit failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
