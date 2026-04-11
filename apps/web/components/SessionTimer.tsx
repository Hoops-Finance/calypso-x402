"use client";

/**
 * SessionTimer — shows a live elapsed clock + countdown to the session
 * auto-end time. Ticks every 500ms. Formats:
 *
 *   ELAPSED   02:14       ENDS IN   00:46
 *   STARTED   22:14:07    ENDS AT   22:19:07
 */

import { useEffect, useState } from "react";

export interface SessionTimerProps {
  startedAt: string; // ISO-8601
  durationMinutes: number;
  compact?: boolean;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmtClock(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function fmtTimeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function SessionTimer({ startedAt, durationMinutes, compact }: SessionTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const startMs = new Date(startedAt).getTime();
  const endMs = startMs + durationMinutes * 60_000;
  const elapsed = now - startMs;
  const remaining = endMs - now;
  const expired = remaining <= 0;

  if (compact) {
    return (
      <span className="font-mono text-sm tabular-nums">
        <span className="text-muted-foreground text-[9px] uppercase tracking-[0.18em] mr-2">
          elapsed
        </span>
        {fmtClock(elapsed)}
        <span className="text-muted-foreground text-[9px] uppercase tracking-[0.18em] mx-2">/</span>
        <span className={expired ? "text-[hsl(var(--info))]" : "text-primary"}>
          {expired ? "ENDED" : fmtClock(remaining)}
        </span>
      </span>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 font-mono">
      <div>
        <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          elapsed
        </div>
        <div className="text-3xl tabular-nums font-semibold text-foreground mt-1">
          {fmtClock(elapsed)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">
          started {fmtTimeOfDay(startMs)}
        </div>
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          {expired ? "status" : "ends in"}
        </div>
        <div
          className={`text-3xl tabular-nums font-semibold mt-1 ${expired ? "text-[hsl(var(--info))]" : "text-primary"}`}
        >
          {expired ? "ENDED" : fmtClock(remaining)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">
          ends at {fmtTimeOfDay(endMs)}
        </div>
      </div>
    </div>
  );
}
