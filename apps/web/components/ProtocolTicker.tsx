"use client";

/**
 * ProtocolTicker — a fixed tickertape at the very top of the page that
 * shows recent HTTP traffic hitting the Calypso API. Serves as the
 * running protocol narrator: "POST /plan 402 … POST /plan 200 …
 * POST /simulate 402 …". Subscribes to the x402 client event stream.
 *
 * It's always visible. Even on pages that don't trigger calls, it
 * shows a slow base loop of health pings, so the stage never feels
 * dead. Reinforces the "this is a live protocol" narrative.
 */

import { useEffect, useState } from "react";
import { subscribeX402 } from "../lib/x402Client";

interface TickerItem {
  id: number;
  method: "POST" | "GET";
  path: string;
  status: "402" | "200" | "sent" | "err";
  t: number;
}

const SEED: TickerItem[] = [
  { id: 0, method: "GET",  path: "/health",           status: "200", t: Date.now() },
  { id: 1, method: "GET",  path: "/wallets/platform", status: "200", t: Date.now() },
  { id: 2, method: "POST", path: "/plan",             status: "402", t: Date.now() },
  { id: 3, method: "POST", path: "/plan",             status: "200", t: Date.now() },
  { id: 4, method: "POST", path: "/simulate",         status: "402", t: Date.now() },
  { id: 5, method: "POST", path: "/simulate",         status: "200", t: Date.now() },
  { id: 6, method: "GET",  path: "/report/:id",       status: "200", t: Date.now() },
];

export function ProtocolTicker() {
  const [items, setItems] = useState<TickerItem[]>(SEED);

  useEffect(() => {
    let idCounter = 100;
    const unsub = subscribeX402((evt) => {
      const status: TickerItem["status"] =
        evt.kind === "payment-required"
          ? "402"
          : evt.kind === "settled"
            ? "200"
            : evt.kind === "error"
              ? "err"
              : "sent";
      const method: "POST" | "GET" = evt.path.includes("/plan") || evt.path.includes("/simulate") || evt.path.includes("/analyze") ? "POST" : "GET";
      const path = (() => {
        try {
          return new URL(evt.path).pathname;
        } catch {
          return evt.path;
        }
      })();
      setItems((prev) =>
        [
          { id: idCounter++, method, path, status, t: Date.now() },
          ...prev.slice(0, 11),
        ].slice(0, 12),
      );
    });
    return () => {
      unsub();
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] border-b border-border/60 bg-ink/95 backdrop-blur-md"
      style={{ height: 28 }}
    >
      <div className="marquee h-full items-center">
        <div className="marquee__track h-full items-center">
          {[...items, ...items].map((item, idx) => (
            <TickerEntry key={`${item.id}-${idx}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TickerEntry({ item }: { item: TickerItem }) {
  const statusClass =
    item.status === "402"
      ? "method-402"
      : item.status === "200"
        ? "method-200"
        : item.status === "err"
          ? "method-402"
          : "method-GET";
  return (
    <div className="flex items-center gap-2 px-5 font-mono text-[10px] uppercase tracking-wider">
      <span className={`method-badge method-${item.method}`}>{item.method}</span>
      <span className="text-foreground/80">{item.path}</span>
      <span className={`method-badge ${statusClass}`}>
        {item.status === "sent" ? "…" : item.status}
      </span>
      <span className="w-1 h-1 rounded-full bg-border mx-2" />
    </div>
  );
}
