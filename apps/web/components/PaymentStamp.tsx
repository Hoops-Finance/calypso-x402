"use client";

/**
 * PaymentStamp — the red intaglio "PAID" stamp that slaps onto the UI
 * when an x402 payment clears. Used inside the X402Ceremony modal and
 * inline on the session detail page as a receipt marker.
 */

import { useEffect, useState } from "react";

interface PaymentStampProps {
  amountUsd: string;
  network?: string;
  txHash?: string;
  timestamp?: number;
  receiptId?: string;
  compact?: boolean;
}

export function PaymentStamp({
  amountUsd,
  network = "stellar:testnet",
  txHash,
  timestamp,
  receiptId,
  compact,
}: PaymentStampProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const ts = timestamp ? new Date(timestamp) : new Date();

  return (
    <div className={`inline-flex flex-col items-start gap-2 ${compact ? "" : "p-4"}`}>
      <div className={mounted ? "stamp-slap" : "opacity-0"}>
        <div className="stamp-paid">PAID · {amountUsd}</div>
      </div>

      {!compact && (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <div>{network}</div>
          <div>{ts.toISOString().replace("T", " ").slice(0, 19)} UTC</div>
          {receiptId && <div>receipt · {receiptId}</div>}
          {txHash && (
            <div className="text-[hsl(var(--ink-stamp))]">
              tx · {txHash.slice(0, 8)}…{txHash.slice(-6)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
