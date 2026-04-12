"use client";

import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { agent, fmtStroops } from "../lib/apiClient";
import type { AgentStopResponse } from "../lib/apiClient";

export interface StopSessionButtonProps {
  sessionId: string;
  disabled?: boolean;
  onStopped?: (result: AgentStopResponse) => void;
}

export function StopSessionButton({ sessionId, disabled, onStopped }: StopSessionButtonProps) {
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [result, setResult] = useState<AgentStopResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setStopping(true);
    setError(null);
    try {
      const res = await agent.stop(sessionId);
      setResult(res);
      onStopped?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setResult(null);
          setError(null);
          setOpen(true);
        }}
        disabled={disabled || stopping}
        className="group relative inline-flex items-center gap-2 px-5 py-3 border-2 border-destructive/80 bg-destructive/10 hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        type="button"
      >
        <span
          className="w-2 h-2 bg-destructive rounded-sm"
          style={{ boxShadow: "0 0 10px hsl(var(--destructive))" }}
        />
        <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-destructive">
          stop session
        </span>
      </button>

      <ConfirmModal
        open={open}
        danger
        title={result ? "Session stopped" : "Stop this session?"}
        body={
          result ? (
            <div className="space-y-3">
              <p className="text-[12px]">
                Bots aborted. Residual funds drained back to the Calypso Agent.
              </p>
              <div className="border border-border-strong bg-background/60 p-3">
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
                  recovered
                </div>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span>
                    <span className="text-muted-foreground text-[10px]">XLM </span>
                    <span className="text-foreground">{fmtStroops(result.teardown.recovered.xlm)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground text-[10px]">USDC </span>
                    <span className="text-primary">{fmtStroops(result.teardown.recovered.usdc)}</span>
                  </span>
                </div>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
                {result.teardown.per_bot.length} bot teardowns completed
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-[12px]">
              <p>
                This aborts every running bot loop, drains each bot&apos;s smart
                account, and returns the residual XLM + USDC back to the
                Calypso Agent wallet.
              </p>
              <p className="font-mono text-[10px] text-muted-foreground">
                POST /agent/stop/{sessionId.slice(0, 8)}…
              </p>
              {error && (
                <div className="font-mono text-[10px] text-destructive break-words">{error}</div>
              )}
            </div>
          )
        }
        confirmLabel={
          result
            ? "close"
            : stopping
              ? "stopping…"
              : "yes, stop session"
        }
        onConfirm={() => {
          if (result) {
            setOpen(false);
            setResult(null);
          } else {
            void confirm();
          }
        }}
        onCancel={() => {
          if (!stopping) {
            setOpen(false);
            setResult(null);
            setError(null);
          }
        }}
      />
    </>
  );
}
