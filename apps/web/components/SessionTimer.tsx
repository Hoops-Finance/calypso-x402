"use client";

/**
 * SessionTimer — live elapsed + countdown. Ticks only while the session
 * is "running". When it ends (completed / failed / cancelled / stopping),
 * the elapsed clock FREEZES at the actual end time and shows a static
 * "ENDED" marker — no runaway timer after the session is over.
 */

import { useEffect, useState } from "react";
import type { SessionStatus } from "@calypso/shared";

export interface SessionTimerProps {
  startedAt: string; // ISO-8601
  endedAt?: string | null;
  status: SessionStatus | null;
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

export function SessionTimer({
  startedAt,
  endedAt,
  status,
  durationMinutes,
  compact,
}: SessionTimerProps) {
  const live = status === "running" || status === "planning";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [live]);

  const startMs = new Date(startedAt).getTime();
  const plannedEndMs = startMs + durationMinutes * 60_000;
  const actualEndMs = endedAt ? new Date(endedAt).getTime() : null;

  // Freeze elapsed at the actual end time once the session is over.
  const frozenNow = !live ? (actualEndMs ?? plannedEndMs) : now;
  const elapsed = frozenNow - startMs;
  const remaining = plannedEndMs - frozenNow;
  const expired = !live || remaining <= 0;

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
        <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">elapsed</div>
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
          className={`text-3xl tabular-nums font-semibold mt-1 ${
            expired ? "text-[hsl(var(--info))]" : "text-primary"
          }`}
        >
          {expired ? "ENDED" : fmtClock(remaining)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">
          {actualEndMs
            ? `ended ${fmtTimeOfDay(actualEndMs)}`
            : `ends at ${fmtTimeOfDay(plannedEndMs)}`}
        </div>
      </div>
    </div>
  );
}
