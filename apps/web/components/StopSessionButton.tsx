"use client";

import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { api } from "../lib/apiClient";

export interface StopSessionButtonProps {
  sessionId: string;
  disabled?: boolean;
  onStopped?: () => void;
}

export function StopSessionButton({ sessionId, disabled, onStopped }: StopSessionButtonProps) {
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setStopping(true);
    setError(null);
    try {
      await api.stopSession(sessionId);
      setOpen(false);
      onStopped?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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
        title="Stop this session?"
        body={
          <div className="space-y-2">
            <p>
              This will abort all running bot loops, attempt to withdraw bot liquidity, and
              return any remaining XLM + USDC from the bot smart accounts back to the Calypso
              orchestrator.
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              calls POST /sessions/{sessionId.slice(0, 8)}…/stop
            </p>
            {error && <div className="font-mono text-[11px] text-destructive">{error}</div>}
          </div>
        }
        confirmLabel={stopping ? "stopping…" : "yes, stop session"}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
