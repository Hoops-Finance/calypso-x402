"use client";

/**
 * SessionStateBadge — big stateful badge for /sessions/[id]. Covers:
 *   planning · paying · launching · running · stopping · completed · failed
 */

import type { SessionStatus } from "@calypso/shared";

export type ExtendedState = SessionStatus | "paying" | "launching";

export function SessionStateBadge({ state }: { state: ExtendedState | null }) {
  const s = state ?? "planning";
  const cls = stateClass(s);
  const dot = s === "running";
  return (
    <div className={`state-badge ${cls}`}>
      {dot ? <span className="live-dot" /> : <StateMarker state={s} />}
      <span>{s}</span>
    </div>
  );
}

function stateClass(s: string): string {
  switch (s) {
    case "running":
      return "state-running";
    case "completed":
      return "state-completed";
    case "failed":
    case "cancelled":
      return "state-failed";
    case "stopping":
      return "state-stopping";
    default:
      return "state-planning";
  }
}

function StateMarker({ state }: { state: string }) {
  const color =
    state === "completed"
      ? "bg-[hsl(var(--info))]"
      : state === "failed" || state === "cancelled"
        ? "bg-destructive"
        : state === "stopping"
          ? "bg-[hsl(var(--warning))]"
          : "bg-muted-foreground";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}
