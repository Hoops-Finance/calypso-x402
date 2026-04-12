/**
 * agentRelay.ts — server-side x402 client that signs gated requests
 * with the Calypso agent wallet.
 *
 * Architecture:
 *
 *   Browser                Calypso API (this process)
 *      │                       │
 *      │ POST /agent/plan      │
 *      │ ─────────────────────▶│
 *      │                       │  agentRelay builds an @x402/fetch
 *      │                       │  client with the agent keypair
 *      │                       │
 *      │                       │  internal loopback call:
 *      │                       │  POST http://localhost/plan
 *      │                       │         │
 *      │                       │         │ 402 Payment Required
 *      │                       │         │ (from x402 middleware
 *      │                       │         │  in the same process)
 *      │                       │         │
 *      │                       │  @x402/fetch signs with the agent
 *      │                       │  keypair, retries with X-PAYMENT
 *      │                       │         │
 *      │                       │         │ 200 OK (facilitator
 *      │                       │         │  has settled on-chain)
 *      │                       │         │
 *      │ 200 + plan + x402 trace         │
 *      │◀──────────────────────│
 *
 * The result: the browser sees a single non-402 request, but a real
 * on-chain x402 handshake happened between the agent wallet and the
 * revenue wallet. The relay captures the entire trace (402 header,
 * payment tx hash, payer, payee, amount) and returns it alongside
 * the business response, so the ceremony UI can narrate it.
 */

import type { Request, Response } from "express";
import type { Network } from "@x402/core/types";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import { ENV } from "../env.js";
import { AgentWallet } from "../orchestrator/agentWallet.js";
import { logger } from "../logger.js";

const STELLAR_TESTNET: Network = "stellar:testnet" as Network;

export interface X402Trace {
  path: string;
  method: string;
  payment_required_raw: string | null;
  payment_required_decoded: unknown;
  payment_tx_hash: string | null;
  payer: string;
  payee: string;
  amount: string | null;
  asset: string | null;
  network: string;
  settled_at: string;
}

let cachedPaidFetch: typeof fetch | null = null;

function getAgentPaidFetch(): typeof fetch {
  if (cachedPaidFetch) return cachedPaidFetch;
  const agent = AgentWallet.get();
  const signer = createEd25519Signer(agent.secret, STELLAR_TESTNET);
  const schemeClient = new ExactStellarScheme(signer);
  const client = new x402Client().register(STELLAR_TESTNET, schemeClient);
  const paidFetch = wrapFetchWithPayment(fetch, client);
  cachedPaidFetch = paidFetch;
  return paidFetch;
}

function decodeHeader(raw: string | null): unknown {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return { raw };
  }
}

/**
 * Core relay: internally calls `POST /{path}` on this same server
 * using the agent's x402-enabled fetch. Captures the full handshake
 * trace and returns it alongside the business response.
 */
async function relayGatedPost(
  path: "plan" | "simulate" | "analyze",
  body: unknown,
): Promise<{ status: number; body: unknown; trace: X402Trace }> {
  const paidFetch = getAgentPaidFetch();
  const targetUrl = `http://127.0.0.1:${ENV.API_PORT}/${path}`;
  const startedAt = new Date().toISOString();

  // Top up before calling if the agent is low on funds.
  const agent = AgentWallet.get();
  await agent.ensureInitialized();
  await agent.topUpIfLow();

  // First call — this will likely return 402 and then be retried
  // automatically by @x402/fetch with a payment header.
  let initial402: { raw: string | null; decoded: unknown } = { raw: null, decoded: null };
  let settleHash: string | null = null;
  let paymentAmount: string | null = null;
  let paymentAsset: string | null = null;

  const res = await paidFetch(targetUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  // Try to capture the 402 trace by doing a separate probe call
  // (without the payment wrapping) — this is the same request but
  // via plain fetch so we see the 402 response directly.
  try {
    const probe = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (probe.status === 402) {
      const raw = probe.headers.get("PAYMENT-REQUIRED");
      initial402 = { raw, decoded: decodeHeader(raw) };
      const accept = (decodeHeader(raw) as { accepts?: Array<{ amount?: string; asset?: string }> })?.accepts?.[0];
      paymentAmount = accept?.amount ?? null;
      paymentAsset = accept?.asset ?? null;
    }
    // Drain the probe body so the connection is clean.
    await probe.arrayBuffer().catch(() => {});
  } catch (err) {
    logger.warn({ err }, "agentRelay: probe call failed");
  }

  // Extract settlement header from the successful response.
  const settleHeader = res.headers.get("X-PAYMENT-RESPONSE");
  if (settleHeader) {
    try {
      const decoded = Buffer.from(settleHeader, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as {
        transaction?: string;
        transactionHash?: string;
        txHash?: string;
        tx_hash?: string;
      };
      settleHash =
        parsed.transaction ??
        parsed.transactionHash ??
        parsed.txHash ??
        parsed.tx_hash ??
        null;
    } catch {
      /* swallow */
    }
  }

  const body_out = await res.json().catch(() => ({}));

  return {
    status: res.status,
    body: body_out,
    trace: {
      path: `/${path}`,
      method: "POST",
      payment_required_raw: initial402.raw,
      payment_required_decoded: initial402.decoded,
      payment_tx_hash: settleHash,
      payer: agent.publicKey,
      payee: ENV.PAY_TO,
      amount: paymentAmount,
      asset: paymentAsset,
      network: ENV.X402_NETWORK,
      settled_at: startedAt,
    },
  };
}

export async function handleAgentPlan(req: Request, res: Response): Promise<void> {
  try {
    const { status, body, trace } = await relayGatedPost("plan", req.body);
    res.status(status).json({ ...((body as object) ?? {}), _x402: trace });
  } catch (err) {
    logger.error({ err }, "agentRelay /plan failed");
    res.status(500).json({ error: "agent relay failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

export async function handleAgentSimulate(req: Request, res: Response): Promise<void> {
  try {
    const { status, body, trace } = await relayGatedPost("simulate", req.body);
    res.status(status).json({ ...((body as object) ?? {}), _x402: trace });
  } catch (err) {
    logger.error({ err }, "agentRelay /simulate failed");
    res.status(500).json({ error: "agent relay failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

export async function handleAgentAnalyze(req: Request, res: Response): Promise<void> {
  try {
    const { status, body, trace } = await relayGatedPost("analyze", req.body);
    res.status(status).json({ ...((body as object) ?? {}), _x402: trace });
  } catch (err) {
    logger.error({ err }, "agentRelay /analyze failed");
    res.status(500).json({ error: "agent relay failed", detail: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * GET /agent/status — browser-facing health of the agent wallet so
 * the UI can show "Agent wallet ready · 18.75 USDC · ready to pay".
 */
export async function handleAgentStatus(_req: Request, res: Response): Promise<void> {
  try {
    const agent = AgentWallet.get();
    await agent.ensureInitialized();
    const balance = await agent.getUsdcBalance();
    res.json({
      public_key: agent.publicKey,
      usdc_balance_stroops: balance.toString(),
      initialized: agent.state.initialized,
    });
  } catch (err) {
    res.status(500).json({ error: "agent status failed", detail: err instanceof Error ? err.message : String(err) });
  }
}
