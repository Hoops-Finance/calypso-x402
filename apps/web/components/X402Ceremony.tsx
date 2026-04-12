"use client";

/**
 * X402Ceremony — the quotable hero moment.
 *
 * The Calypso Agent pays x402 on its own. The UI never signs. So the
 * ceremony is a narrative of what ALREADY happened: the agent fires
 * /plan and /simulate in sequence and reports back two X402Trace
 * structs containing real on-chain settlement tx hashes. We animate
 * that back story as a protocol-documentation modal.
 *
 * Stages:
 *   DISPATCH   — "agent is calling /plan + /simulate"  (spinner)
 *   SETTLED    — both traces received, render receipts with real tx
 *                hashes + explorer links, big PAID stamp
 *   ERROR      — show the failure detail
 *
 * The modal stays open until the user explicitly hits CONTINUE. This
 * is intentional: the whole point of the product is the payment
 * moment, so don't auto-dismiss it.
 */

import { useEffect } from "react";
import type { X402Trace, SimulateProgressEvent } from "../lib/apiClient";
import { shortHash, shortAddr, txExplorerUrl } from "../lib/apiClient";
import { PaymentStamp } from "./PaymentStamp";

export type CeremonyPhase =
  | { kind: "idle" }
  | { kind: "dispatch"; prompt: string; logs: TerminalLine[] }
  | {
      kind: "settled";
      prompt: string;
      planTrace: X402Trace | null;
      simulateTrace: X402Trace;
      sessionId: string;
      totalUsd: string;
      logs: TerminalLine[];
    }
  | { kind: "error"; prompt: string; message: string; logs: TerminalLine[] };

export interface TerminalLine {
  t: number;
  icon: "→" | "✓" | "✗" | "◆" | "…" | " ";
  text: string;
  detail?: string;
  tone?: "default" | "success" | "error" | "info" | "primary";
}

export function progressToLine(evt: SimulateProgressEvent): TerminalLine {
  switch (evt.step) {
    case "plan_start":
    case "simulate_start":
      return { t: evt.t, icon: "→", text: evt.message, tone: "info" };
    case "plan_settled":
    case "simulate_settled":
      return { t: evt.t, icon: "✓", text: evt.message, tone: "success" };
    case "plan_result":
      return { t: evt.t, icon: "◆", text: evt.message, tone: "primary" };
    case "reasoning":
      return { t: evt.t, icon: " ", text: evt.message, tone: "default" };
    case "info":
      return { t: evt.t, icon: " ", text: evt.message, tone: "default" };
    case "launching":
      return { t: evt.t, icon: "…", text: evt.message, tone: "primary" };
    case "done":
      return { t: evt.t, icon: "◆", text: evt.message, tone: "primary" };
    case "error":
      return { t: evt.t, icon: "✗", text: evt.message, tone: "error" };
    default:
      return { t: evt.t, icon: " ", text: evt.message };
  }
}

export interface X402CeremonyProps {
  phase: CeremonyPhase;
  onContinue: () => void;
  onCancel: () => void;
}

export function X402Ceremony({ phase, onContinue, onCancel }: X402CeremonyProps) {
  // ESC dismisses error state; settled state requires explicit continue
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (phase.kind === "error") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, onCancel]);

  if (phase.kind === "idle") return null;

  return (
    <div className="modal-backdrop">
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(860px,calc(100vw-48px))] max-h-[calc(100vh-80px)] overflow-y-auto modal-enter"
      >
        <div className="border border-border-strong bg-ink/95 scanlines corner-marks">
          {/* HEADER BAND */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border-strong bg-gradient-to-r from-primary/10 via-transparent to-transparent">
            <div className="flex items-center gap-3">
              <span className="ship-mark">x402 handshake</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                protocol v2 · stellar:testnet · local facilitator
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {phase.kind === "dispatch" && "IN PROGRESS"}
              {phase.kind === "settled" && (
                <span className="text-[hsl(var(--success))]">HANDSHAKE COMPLETE</span>
              )}
              {phase.kind === "error" && (
                <span className="text-destructive">HANDSHAKE FAILED</span>
              )}
            </div>
          </div>

          {/* BODY */}
          {phase.kind === "dispatch" && <TerminalBody logs={phase.logs} prompt={phase.prompt} />}
          {phase.kind === "settled" && (
            <SettledBody
              planTrace={phase.planTrace}
              simulateTrace={phase.simulateTrace}
              sessionId={phase.sessionId}
              totalUsd={phase.totalUsd}
              onContinue={onContinue}
            />
          )}
          {phase.kind === "error" && <ErrorBody message={phase.message} logs={phase.logs} onCancel={onCancel} />}

          {/* FOOTER BAND */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-border-strong text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            <span>facilitator · in-process · maxFee 5_000_000 stroops</span>
            <span>
              {phase.kind === "settled"
                ? "press CONTINUE to inspect the session"
                : phase.kind === "error"
                  ? "press ESC or CANCEL"
                  : "do not close"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH — "agent is firing the calls right now"
// ─────────────────────────────────────────────────────────────────────────────

function TerminalBody({ logs, prompt }: { logs: TerminalLine[]; prompt: string }) {
  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          agent workflow · live
        </div>
        <div className="font-display text-2xl md:text-3xl font-semibold text-paper mt-1 leading-tight">
          Running the <span className="text-primary">x402</span> handshake
        </div>
      </div>

      <div className="border border-border-strong bg-[hsl(var(--ink))]">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning)/0.6)]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success)/0.6)]" />
          </div>
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
            calypso agent terminal
          </span>
        </div>
        <div className="font-mono text-[11px] max-h-[340px] overflow-y-auto p-3 space-y-0.5">
          <div className="text-muted-foreground">
            <span className="text-primary">$</span> agent simulate --prompt &quot;{prompt.slice(0, 60)}{prompt.length > 60 ? "…" : ""}&quot;
          </div>
          {logs.map((line, i) => (
            <TermLine key={i} line={line} />
          ))}
          {logs.length === 0 && (
            <div className="text-muted-foreground animate-pulse">initializing…</div>
          )}
          {logs.length > 0 && logs[logs.length - 1]!.icon !== "◆" && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-muted-foreground">working…</span>
            </div>
          )}
        </div>
      </div>

      <div className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
        each line is a real API call or on-chain settlement
      </div>
    </div>
  );
}

function TermLine({ line }: { line: TerminalLine }) {
  const iconColor =
    line.tone === "success" ? "text-[hsl(var(--success))]"
    : line.tone === "error" ? "text-destructive"
    : line.tone === "primary" ? "text-primary"
    : line.tone === "info" ? "text-[hsl(var(--info))]"
    : "text-muted-foreground";
  const time = new Date(line.t).toISOString().slice(11, 19);
  const isReasoning = line.icon === " " && line.tone === "default";
  return (
    <div className={isReasoning ? "ml-[78px]" : ""}>
      {!isReasoning && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground shrink-0 tabular-nums w-[62px]">[{time}]</span>
          <span className={`shrink-0 w-3 text-center ${iconColor}`}>{line.icon}</span>
          <span className={
            line.tone === "error" ? "text-destructive"
            : line.tone === "success" ? "text-[hsl(var(--success))]"
            : line.tone === "primary" ? "text-primary"
            : line.tone === "info" ? "text-[hsl(var(--info))]"
            : "text-foreground"
          }>
            {line.text}
          </span>
        </div>
      )}
      {isReasoning && (
        <div className="text-muted-foreground/70 text-[10px] leading-snug">{line.text}</div>
      )}
      {line.detail && (
        <div className="ml-[78px] text-[10px] text-muted-foreground break-all">{line.detail}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTLED — two real tx hashes, big stamp, continue required
// ─────────────────────────────────────────────────────────────────────────────

function SettledBody({
  planTrace,
  simulateTrace,
  sessionId,
  totalUsd,
  onContinue,
}: {
  planTrace: X402Trace | null;
  simulateTrace: X402Trace;
  sessionId: string;
  totalUsd: string;
  onContinue: () => void;
}) {
  return (
    <div className="p-8 space-y-6">
      {/* Top row: big stamp + headline */}
      <div className="flex items-start gap-8">
        <div className="shrink-0">
          <PaymentStamp amountUsd={totalUsd} compact />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            the agent paid
          </div>
          <div className="font-display text-4xl md:text-5xl font-semibold text-paper leading-[1] mt-1">
            Two real on-chain settlements.
          </div>
          <div className="mt-3 text-[12px] text-muted-foreground leading-relaxed max-w-[560px]">
            Calypso&apos;s agent signed both payments with its own Ed25519
            keypair and settled through the in-process facilitator. These are
            normal Stellar testnet transactions — click through to see them on
            stellar.expert.
          </div>
        </div>
      </div>

      {/* Trace cards — plan trace is null for direct launches */}
      <div className={`grid grid-cols-1 ${planTrace ? "md:grid-cols-2" : ""} gap-4`}>
        {planTrace && <TraceCard label="PLAN · $0.50" trace={planTrace} />}
        <TraceCard label="SIMULATE · $2.00" trace={simulateTrace} />
      </div>

      {/* Session hint + continue */}
      <div className="flex items-center justify-between pt-4 border-t border-border/60 gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            session id
          </div>
          <div className="font-mono text-sm text-primary mt-1">{sessionId}</div>
        </div>
        <button
          onClick={onContinue}
          type="button"
          className="group relative px-6 py-4 border-2 border-primary bg-primary hover:bg-primary/90 transition-colors"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary-foreground">
            continue → live session
          </span>
        </button>
      </div>
    </div>
  );
}

function TraceCard({ label, trace }: { label: string; trace: X402Trace }) {
  const tx = trace.payment_tx_hash;
  return (
    <div className="border border-border-strong bg-background/60 p-4 corner-marks">
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary font-bold">
          {label}
        </div>
        <span className="method-badge method-200">200</span>
      </div>

      <Row label="path">
        <span className="font-mono text-foreground">{trace.path}</span>
      </Row>
      <Row label="payer">
        <span className="font-mono text-foreground">{shortAddr(trace.payer)}</span>
      </Row>
      <Row label="payee">
        <span className="font-mono text-foreground">{shortAddr(trace.payee)}</span>
      </Row>
      <Row label="network">
        <span className="font-mono text-muted-foreground">{trace.network}</span>
      </Row>
      <Row label="tx hash">
        {tx ? (
          <a
            href={txExplorerUrl(tx)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-primary hover:underline inline-flex items-center gap-1"
          >
            {shortHash(tx)}
            <span className="text-[8px] opacity-60">↗</span>
          </a>
        ) : (
          <span className="font-mono text-muted-foreground">—</span>
        )}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="text-[11px]">{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR
// ─────────────────────────────────────────────────────────────────────────────

function ErrorBody({ message, logs, onCancel }: { message: string; logs: TerminalLine[]; onCancel: () => void }) {
  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="hazard-stripes-red w-3 h-3" />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-destructive">
          handshake failed
        </span>
      </div>
      <div className="font-display text-3xl md:text-4xl font-semibold text-paper leading-tight">
        The agent could not settle this payment.
      </div>
      {logs.length > 0 && (
        <div className="border border-border-strong bg-[hsl(var(--ink))] p-3 font-mono text-[11px] max-h-[200px] overflow-y-auto space-y-0.5">
          {logs.map((line, i) => <TermLine key={i} line={line} />)}
        </div>
      )}
      <pre className="http-block" style={{ borderLeftColor: "hsl(var(--destructive))" }}>
        <span className="key">error:</span>{" "}
        <span className="str">&quot;{message}&quot;</span>
      </pre>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onCancel}
          type="button"
          className="px-5 py-3 border-2 border-destructive/70 bg-destructive/10 hover:bg-destructive/20 transition-colors"
        >
          <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-destructive">
            close
          </span>
        </button>
      </div>
    </div>
  );
}
