"use client";

/**
 * x402Client.ts — real browser-side x402 payment client for Calypso.
 *
 * Wraps globalThis.fetch so that any request hitting a Calypso gated
 * endpoint (POST /plan, /simulate, /analyze) will:
 *
 *   1. Fire the initial request unauthenticated
 *   2. Receive HTTP 402 with PAYMENT-REQUIRED header
 *   3. Sign a Stellar Soroban auth entry using the session wallet
 *   4. Retry the request with the X-PAYMENT header attached
 *   5. Server-side x402 middleware validates via the facilitator
 *   6. Facilitator settles on-chain → 200 OK with the real response
 *
 * No demo-mode bypass. No shim. Real protocol end-to-end.
 *
 * The client exposes a hook so the UI can observe each handshake
 * (the raw 402 response, the created payment header, the settlement
 * result) so the X402Ceremony component can show the ritual live.
 */

import type { Network } from "@x402/core/types";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";

const STELLAR_TESTNET: Network = "stellar:testnet" as Network;

export interface X402EventListener {
  (evt: X402Event): void;
}

export type X402Event =
  | { kind: "request-sent"; path: string }
  | { kind: "payment-required"; path: string; rawHeader: string; decoded: unknown }
  | { kind: "payment-signed"; path: string; amount: string; asset: string }
  | { kind: "settled"; path: string; txHash?: string }
  | { kind: "error"; path: string; message: string };

const listeners: Set<X402EventListener> = new Set();

export function subscribeX402(listener: X402EventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(evt: X402Event): void {
  for (const fn of listeners) {
    try {
      fn(evt);
    } catch {
      /* swallow */
    }
  }
}

/**
 * Decodes the x402 PAYMENT-REQUIRED header (base64-encoded JSON) into
 * a plain object for the UI to render.
 */
export function decodePaymentRequiredHeader(header: string | null): unknown {
  if (!header) return null;
  try {
    const decoded =
      typeof atob !== "undefined"
        ? atob(header)
        : Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return { raw: header };
  }
}

/**
 * Builds a wrapped fetch function that pays with the given Stellar
 * secret key. Every call from the client goes through this wrapper.
 */
export function buildPaidFetch(secretKey: string): typeof fetch {
  const signer = createEd25519Signer(secretKey, STELLAR_TESTNET);
  const schemeClient = new ExactStellarScheme(signer);
  const client = new x402Client().register(STELLAR_TESTNET, schemeClient);

  const baseWrapped = wrapFetchWithPayment(fetch, client);

  const paidFetch: typeof fetch = async (input, init) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    emit({ kind: "request-sent", path });
    try {
      const res = await baseWrapped(input, init);

      if (res.status === 402) {
        const raw = res.headers.get("PAYMENT-REQUIRED") ?? "";
        const decoded = decodePaymentRequiredHeader(raw);
        emit({ kind: "payment-required", path, rawHeader: raw, decoded });
      } else if (res.ok) {
        // If a payment header round-tripped, the wrap already attached
        // one and retried. Emit settled.
        const settleHeader = res.headers.get("X-PAYMENT-RESPONSE");
        emit({
          kind: "settled",
          path,
          txHash: settleHeader ? extractTxHashFromResponse(settleHeader) : undefined,
        });
      }
      return res;
    } catch (err) {
      emit({
        kind: "error",
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
  return paidFetch;
}

function extractTxHashFromResponse(headerValue: string): string | undefined {
  try {
    const decoded =
      typeof atob !== "undefined"
        ? atob(headerValue)
        : Buffer.from(headerValue, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { transaction?: string; transactionHash?: string; txHash?: string };
    return parsed.transaction ?? parsed.transactionHash ?? parsed.txHash;
  } catch {
    return undefined;
  }
}
