"use client";

/**
 * ProtocolTicker — a fixed tickertape at the very top of the page.
 *
 * Shows a static protocol-narration loop: GET /health, POST /plan 402
 * → 200, POST /simulate 402 → 200, GET /agent, etc. It's visual
 * flavor, not live traffic — live traffic is surfaced in the ceremony
 * modal and the session log tape where it actually means something.
 */

import type { ReactNode } from "react";

interface TickerItem {
  id: number;
  method: "POST" | "GET";
  path: string;
  status: "402" | "200";
}

const LOOP: TickerItem[] = [
  { id: 0, method: "GET", path: "/health", status: "200" },
  { id: 1, method: "GET", path: "/agent", status: "200" },
  { id: 2, method: "GET", path: "/wallets/platform", status: "200" },
  { id: 3, method: "POST", path: "/plan", status: "402" },
  { id: 4, method: "POST", path: "/plan", status: "200" },
  { id: 5, method: "POST", path: "/simulate", status: "402" },
  { id: 6, method: "POST", path: "/simulate", status: "200" },
  { id: 7, method: "GET", path: "/agent/session/:id", status: "200" },
  { id: 8, method: "POST", path: "/agent/stop/:id", status: "200" },
];

export function ProtocolTicker() {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] border-b border-border/60 bg-ink/95 backdrop-blur-md"
      style={{ height: 28 }}
    >
      <div className="marquee h-full items-center">
        <div className="marquee__track h-full items-center">
          {[...LOOP, ...LOOP, ...LOOP].map((item, idx) => (
            <TickerEntry key={`${item.id}-${idx}`} item={item}>
              <span className={`method-badge method-${item.method}`}>{item.method}</span>
              <span className="text-foreground/80">{item.path}</span>
              <span className={`method-badge method-${item.status}`}>{item.status}</span>
            </TickerEntry>
          ))}
        </div>
      </div>
    </div>
  );
}

function TickerEntry({ children }: { item: TickerItem; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 font-mono text-[10px] uppercase tracking-wider">
      {children}
      <span className="w-1 h-1 rounded-full bg-border mx-2" />
    </div>
  );
}
