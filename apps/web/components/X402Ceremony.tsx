"use client";

/**
 * X402Ceremony — the modal overlay that appears when the user triggers
 * a paid call (POST /plan, /simulate, /analyze). It narrates the full
 * x402 handshake in three staged panels:
 *
 *   1. REQUEST SENT      → "GET /plan — no payment attached"
 *   2. PAYMENT REQUIRED  → raw decoded PAYMENT-REQUIRED header block
 *                          with price, asset, payTo, network, etc.
 *   3. PAYMENT SIGNED    → Stellar auth entry signed with session wallet
 *   4. SETTLED           → PaymentStamp (red intaglio "PAID" stamp)
 *                          with on-chain tx hash
 *
 * It's intentionally LOUD — this is the hackathon's hero moment. The
 * UI here is designed to be screenshottable.
 */

import { useEffect, useState } from "react";
import { subscribeX402, type X402Event } from "../lib/x402Client";
import { PaymentStamp } from "./PaymentStamp";

type Phase = "idle" | "requesting" | "required" | "signing" | "settled" | "error";

export interface X402CeremonyState {
  open: boolean;
  phase: Phase;
  path: string;
  priceDisplay?: string;
  rawHeader?: string;
  decodedHeader?: unknown;
  txHash?: string;
  error?: string;
}

const INITIAL: X402CeremonyState = { open: false, phase: "idle", path: "" };

/**
 * Opens the ceremony and auto-closes after completion. Returns a state
 * hook the caller can use inside its components.
 */
export function useX402Ceremony() {
  const [state, setState] = useState<X402CeremonyState>(INITIAL);

  useEffect(() => {
    return subscribeX402((evt: X402Event) => {
      setState((prev) => {
        // Only react to events for the currently-open path, to avoid
        // bleeding if the ticker triggers listeners from the background.
        if (!prev.open) return prev;
        switch (evt.kind) {
          case "request-sent":
            if (prev.phase !== "idle") return prev;
            return { ...prev, phase: "requesting", path: evt.path };
          case "payment-required":
            return {
              ...prev,
              phase: "required",
              rawHeader: evt.rawHeader,
              decodedHeader: evt.decoded,
            };
          case "payment-signed":
            return { ...prev, phase: "signing" };
          case "settled":
            return { ...prev, phase: "settled", txHash: evt.txHash };
          case "error":
            return { ...prev, phase: "error", error: evt.message };
        }
      });
    });
  }, []);

  const begin = (priceDisplay: string) =>
    setState({ open: true, phase: "requesting", path: "", priceDisplay });
  const close = () => setState(INITIAL);

  return { state, begin, close };
}

export function X402Ceremony({
  state,
  onClose,
}: {
  state: X402CeremonyState;
  onClose: () => void;
}) {
  if (!state.open) return null;

  const decoded = state.decodedHeader as
    | {
        x402Version?: number;
        error?: string;
        resource?: { url?: string; description?: string };
        accepts?: Array<{
          scheme: string;
          network: string;
          amount: string;
          asset?: string;
          payTo?: string;
          maxTimeoutSeconds?: number;
        }>;
      }
    | null
    | undefined;

  const accept = decoded?.accepts?.[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(780px,calc(100vw-48px))] modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border border-border-strong bg-ink/95 scanlines corner-marks">
          {/* Header band */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-strong bg-gradient-to-r from-primary/10 via-transparent to-transparent">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em]">
              <span className="ship-mark">x402 handshake</span>
              <span className="text-muted-foreground">protocol v2 · stellar:testnet</span>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs font-mono"
              type="button"
            >
              [esc] close
            </button>
          </div>

          {/* Body — pipeline of phases */}
          <div className="p-6 space-y-5">
            {/* Stage 1 */}
            <PhaseRow
              label="01 · REQUEST SENT"
              active={state.phase === "requesting"}
              done={["required", "signing", "settled"].includes(state.phase)}
            >
              <div className="font-mono text-xs text-foreground/90">
                <span className="method-badge method-POST">POST</span>{" "}
                <span className="text-primary">{state.path || "/plan"}</span>{" "}
                <span className="text-muted-foreground">— no payment attached</span>
              </div>
            </PhaseRow>

            {/* Stage 2 — the 402 response */}
            <PhaseRow
              label="02 · 402 PAYMENT REQUIRED"
              active={state.phase === "required"}
              done={["signing", "settled"].includes(state.phase)}
            >
              {decoded ? (
                <pre className="http-block">
                  <span className="key">HTTP/1.1</span>{" "}
                  <span className="num">402</span>{" "}
                  <span className="key">Payment Required</span>
                  {"\n"}
                  <span className="key">x402Version:</span>{" "}
                  <span className="num">{decoded.x402Version ?? 2}</span>
                  {"\n"}
                  <span className="key">accepts:</span>
                  {"\n"}
                  <span className="comment">  # payment requirements</span>
                  {"\n"}
                  <span className="key">  scheme:</span>{" "}
                  <span className="str">&quot;{accept?.scheme ?? "exact"}&quot;</span>
                  {"\n"}
                  <span className="key">  network:</span>{" "}
                  <span className="str">&quot;{accept?.network ?? "stellar:testnet"}&quot;</span>
                  {"\n"}
                  <span className="key">  amount:</span>{" "}
                  <span className="num">{accept?.amount ?? "?"}</span>
                  {"\n"}
                  <span className="key">  asset:</span>{" "}
                  <span className="str">
                    &quot;{(accept?.asset ?? "USDC").slice(0, 20)}
                    {(accept?.asset ?? "").length > 20 ? "…" : ""}&quot;
                  </span>
                  {"\n"}
                  <span className="key">  payTo:</span>{" "}
                  <span className="str">
                    &quot;{(accept?.payTo ?? "").slice(0, 10)}…{(accept?.payTo ?? "").slice(-6)}&quot;
                  </span>
                </pre>
              ) : (
                <div className="text-xs text-muted-foreground">waiting for server response…</div>
              )}
            </PhaseRow>

            {/* Stage 3 — signing */}
            <PhaseRow
              label="03 · SIGNING WITH SESSION WALLET"
              active={state.phase === "signing"}
              done={state.phase === "settled"}
            >
              <div className="font-mono text-xs text-muted-foreground">
                Creating Soroban auth entry via Ed25519 session signer…{" "}
                <span className="text-primary">offline</span>
              </div>
            </PhaseRow>

            {/* Stage 4 — settled */}
            <PhaseRow
              label="04 · SETTLED ON STELLAR"
              active={state.phase === "settled"}
              done={state.phase === "settled"}
              last
            >
              {state.phase === "settled" ? (
                <PaymentStamp
                  amountUsd={state.priceDisplay ?? "$?"}
                  txHash={state.txHash}
                  timestamp={Date.now()}
                />
              ) : (
                <div className="text-xs text-muted-foreground">
                  facilitator awaits… settlement typically lands in ~5 seconds
                </div>
              )}
            </PhaseRow>

            {state.phase === "error" && (
              <div className="border border-destructive/50 bg-destructive/10 p-3 font-mono text-xs text-destructive">
                error · {state.error}
              </div>
            )}
          </div>

          {/* Footer band */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-border-strong text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span>facilitator · www.x402.org/facilitator</span>
            <span>
              {state.phase === "settled"
                ? "HANDSHAKE COMPLETE"
                : state.phase === "error"
                  ? "HANDSHAKE FAILED"
                  : "HANDSHAKE IN PROGRESS"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseRow({
  label,
  children,
  active,
  done,
  last,
}: {
  label: string;
  children: React.ReactNode;
  active: boolean;
  done: boolean;
  last?: boolean;
}) {
  const state = done ? "done" : active ? "active" : "pending";
  const markerColor =
    state === "done"
      ? "bg-[hsl(var(--success))]"
      : state === "active"
        ? "bg-primary animate-pulse"
        : "bg-border-strong";
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center pt-1">
        <div className={`w-2 h-2 rounded-full ${markerColor}`} />
        {!last && <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 30 }} />}
      </div>
      <div className="flex-1 pb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}
