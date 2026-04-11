"use client";

import { useEffect, type ReactNode } from "react";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "cancel",
  danger,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,calc(100vw-32px))] modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`relative border ${danger ? "border-destructive/60" : "border-border-strong"} bg-ink/95 corner-marks`}
        >
          {danger && (
            <div className="hazard-stripes-red h-1 w-full" aria-hidden />
          )}
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`font-mono text-[9px] uppercase tracking-[0.24em] px-2 py-1 border ${
                  danger
                    ? "border-destructive/50 text-destructive bg-destructive/5"
                    : "border-primary/50 text-primary bg-primary/5"
                }`}
              >
                {danger ? "destructive action" : "confirmation"}
              </div>
            </div>
            <div className="font-display text-2xl md:text-3xl font-semibold text-paper mb-3">
              {title}
            </div>
            <div className="text-sm text-muted-foreground leading-relaxed mb-6">{body}</div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground border border-border hover:border-border-strong transition-colors"
                type="button"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={
                  danger
                    ? "px-4 py-2 text-xs font-mono uppercase tracking-[0.15em] bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
                    : "px-4 py-2 text-xs font-mono uppercase tracking-[0.15em] bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                }
                type="button"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
          {danger && (
            <div className="hazard-stripes-red h-1 w-full" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}
