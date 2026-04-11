"use client";

/**
 * SessionWalletPill — compact indicator in the navbar showing the
 * browser-side x402 session wallet and its current funding status.
 * Click opens a popover with address, balances, and a reset action.
 */

import { useState } from "react";
import { useSessionWallet } from "./SessionWalletProvider";
import { fmtStroops, shortAddr } from "../lib/walletApi";

export function SessionWalletPill() {
  const { publicKey, balances, status, error, reset } = useSessionWallet();
  const [open, setOpen] = useState(false);

  const usdc = balances ? fmtStroops(balances.usdc) : "…";
  const xlm = balances ? fmtStroops(balances.xlm) : "…";

  const dotColor =
    status === "ready"
      ? "bg-[hsl(var(--success))]"
      : status === "funding"
        ? "bg-[hsl(var(--warning))]"
        : status === "error"
          ? "bg-destructive"
          : "bg-muted-foreground";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-2 pr-3 py-1.5 border border-border hover:border-primary/40 bg-card/70 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors"
        type="button"
      >
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-muted-foreground">session</span>
        <span className="text-primary">{usdc}</span>
        <span className="text-muted-foreground">USDC</span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[340px] border border-border-strong bg-ink shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] z-50">
          <div className="hazard-stripes-sm h-1" aria-hidden />
          <div className="p-4">
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
              browser session wallet
            </div>
            <div className="font-mono text-[11px] text-foreground mb-3 break-all">{publicKey}</div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="border border-border p-2">
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  XLM
                </div>
                <div className="font-mono text-sm tabular-nums">{xlm}</div>
              </div>
              <div className="border border-primary/40 p-2 bg-primary/5">
                <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-primary">
                  USDC
                </div>
                <div className="font-mono text-sm tabular-nums text-primary">{usdc}</div>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground leading-relaxed mb-4">
              Throwaway keypair persisted in browser localStorage. Signs every x402
              payment for /plan, /simulate, /analyze. Auto-funded via friendbot +
              admin mint on first load.
            </div>

            {error && (
              <div className="font-mono text-[10px] text-destructive mb-3">{error}</div>
            )}

            <button
              onClick={() => {
                if (confirm("Reset session wallet? New keypair will be generated on next page load.")) {
                  reset();
                }
              }}
              className="w-full text-[10px] font-mono uppercase tracking-[0.15em] py-2 border border-border hover:border-destructive/60 hover:text-destructive transition-colors"
              type="button"
            >
              reset wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SessionWalletAddress() {
  const { publicKey } = useSessionWallet();
  return <span className="font-mono">{shortAddr(publicKey)}</span>;
}
