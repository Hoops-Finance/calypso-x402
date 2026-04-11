"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BotLogEntry, AIFeedbackEntry, Report, SessionStatus } from "@calypso/shared";
import { Badge, Card, CardHeader, CardTitle, MetricCard } from "../../../components/ui";
import { api, openEventStream } from "../../../lib/apiClient";

interface EventActionPayload {
  type: "bot_action";
  entry: BotLogEntry;
}
interface EventReviewPayload {
  type: "ai_review";
  entry: AIFeedbackEntry;
}
interface EventStatusPayload {
  type: "status";
  status: SessionStatus;
}
type IncomingEvent = EventActionPayload | EventReviewPayload | EventStatusPayload;

const EXPLORER_BASE = "https://stellar.expert/explorer/testnet/tx";

function shortHash(h: string): string {
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

function fmtTime(t: number): string {
  return new Date(t).toISOString().slice(11, 19);
}

export default function SessionDetail(props: { params: Promise<{ id: string }> }) {
  // Next 16 — params is async now.
  const { id } = use(props.params);

  const [report, setReport] = useState<Report | null>(null);
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [feedback, setFeedback] = useState<AIFeedbackEntry[]>([]);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial report fetch + polling.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await api.getReport(id);
        if (!alive) return;
        setReport(r);
        setStatus(r.status);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const interval = setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [id]);

  // SSE stream — live tail of bot actions and AI reviews.
  useEffect(() => {
    const es = openEventStream(id);

    const onBotAction = (ev: MessageEvent) => {
      const data = JSON.parse(ev.data as string) as IncomingEvent;
      if (data.type !== "bot_action") return;
      setLogs((prev) => [...prev, data.entry]);
    };
    const onAiReview = (ev: MessageEvent) => {
      const data = JSON.parse(ev.data as string) as IncomingEvent;
      if (data.type !== "ai_review") return;
      setFeedback((prev) => [...prev, data.entry]);
    };
    const onStatus = (ev: MessageEvent) => {
      const data = JSON.parse(ev.data as string) as IncomingEvent;
      if (data.type !== "status") return;
      setStatus(data.status);
    };

    es.addEventListener("bot_action", onBotAction);
    es.addEventListener("ai_review", onAiReview);
    es.addEventListener("status", onStatus);

    return () => {
      es.close();
    };
  }, [id]);

  const allLogs = useMemo(() => {
    // Combine initial report logs with SSE-streamed logs, dedup by (t, bot_id, tx_hash).
    const seen = new Set<string>();
    const combined: BotLogEntry[] = [];
    for (const entry of [...(report?.bot_logs ?? []), ...logs]) {
      const key = `${entry.t}-${entry.bot_id}-${entry.tx_hash ?? entry.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(entry);
    }
    return combined.sort((a, b) => a.t - b.t);
  }, [report, logs]);

  const allFeedback = useMemo(() => {
    const seen = new Set<number>();
    const combined: AIFeedbackEntry[] = [];
    for (const entry of [...(report?.ai_feedback ?? []), ...feedback]) {
      if (seen.has(entry.t)) continue;
      seen.add(entry.t);
      combined.push(entry);
    }
    return combined.sort((a, b) => a.t - b.t);
  }, [report, feedback]);

  const metrics = report?.metrics;
  const summary = report?.pnl_summary;

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Card className="border-destructive/40">
          <div className="text-destructive">error: {error}</div>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Card>loading session…</Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/sessions" className="text-xs text-muted-foreground hover:text-foreground">
              ← sessions
            </Link>
            {status === "running" && <span className="live-dot" />}
            <Badge tone={status === "running" ? "success" : status === "completed" ? "primary" : "default"}>
              {status ?? "…"}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold">{report.session_config.name}</h1>
          <div className="text-xs text-muted-foreground font-mono mt-1">{id}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          started {new Date(report.started_at).toLocaleTimeString()}
          <div>duration {report.session_config.duration_minutes} min</div>
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label="total actions" value={metrics?.total_actions ?? 0} tone="primary" />
        <MetricCard label="swap volume" value={(summary?.gross_volume_usd ?? 0).toFixed(2)} sublabel="xlm" />
        <MetricCard label="failed txns" value={metrics?.failed_txns ?? 0} tone={metrics && metrics.failed_txns > 0 ? "warning" : "default"} />
        <MetricCard label="ai reviews" value={allFeedback.length} tone="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bot table */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>bots</CardTitle>
              <Badge>{(metrics?.per_bot.length ?? 0)} active</Badge>
            </CardHeader>
            {metrics && metrics.per_bot.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2">bot</th>
                    <th className="text-left py-2">type</th>
                    <th className="text-right py-2">actions</th>
                    <th className="text-right py-2">successes</th>
                    <th className="text-right py-2">failures</th>
                    <th className="text-right py-2">volume</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.per_bot.map((b) => (
                    <tr key={b.bot_id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-mono text-primary">{b.bot_id}</td>
                      <td className="py-2 text-xs uppercase text-muted-foreground">{b.archetype}</td>
                      <td className="py-2 text-right font-mono">{b.actions_total}</td>
                      <td className="py-2 text-right font-mono text-[hsl(var(--success))]">{b.successes}</td>
                      <td className="py-2 text-right font-mono text-destructive">{b.failures}</td>
                      <td className="py-2 text-right font-mono">{b.volume_usd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-muted-foreground">waiting for first tick…</div>
            )}
          </Card>

          {/* Live log tail */}
          <Card>
            <CardHeader>
              <CardTitle>live log · {allLogs.length}</CardTitle>
              {status === "running" && <span className="live-dot" />}
            </CardHeader>
            <div className="font-mono text-xs space-y-1 max-h-[480px] overflow-y-auto pr-2">
              {allLogs.length === 0 && (
                <div className="text-muted-foreground">waiting for bot actions…</div>
              )}
              {allLogs.slice(-200).map((l, i) => {
                const color =
                  l.action === "error"
                    ? "text-destructive"
                    : l.action === "swap" || l.action === "rebalance" || l.action === "deposit_liquidity"
                      ? "text-foreground"
                      : "text-muted-foreground";
                return (
                  <div key={`${l.t}-${i}`} className={`flex items-start gap-2 ${color}`}>
                    <span className="text-muted-foreground">[{fmtTime(l.t)}]</span>
                    <span className="text-primary">{l.bot_id.padEnd(9)}</span>
                    <span className="uppercase text-[10px] tracking-wider">{l.action}</span>
                    {l.tx_hash && (
                      <a
                        href={`${EXPLORER_BASE}/${l.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary/80 hover:underline"
                      >
                        {shortHash(l.tx_hash)}
                      </a>
                    )}
                    {l.note && <span className="text-muted-foreground truncate">{l.note}</span>}
                    {l.error && <span className="text-destructive truncate">{l.error}</span>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* AI feedback rail */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ai adjustments</CardTitle>
              <Badge tone="primary">gemma 4</Badge>
            </CardHeader>
            {allFeedback.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Gemma hasn&apos;t reviewed yet. First review fires within the next interval.
              </div>
            ) : (
              <div className="space-y-4">
                {allFeedback
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <div key={entry.t} className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {fmtTime(entry.t)}
                        </span>
                        <Badge tone={entry.deltas_out.length > 0 ? "primary" : "default"}>
                          {entry.deltas_out.length} delta{entry.deltas_out.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                      {entry.deltas_out.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          No changes — the swarm looks healthy.
                        </div>
                      )}
                      <ul className="space-y-2 text-xs">
                        {entry.deltas_out.map((d, i) => (
                          <li key={i} className="border-l-2 border-primary/40 pl-3">
                            <div className="font-mono">
                              <span className="text-primary">{d.bot_id}</span>.{d.param} ={" "}
                              <span className="text-foreground">{String(d.new_value)}</span>
                            </div>
                            <div className="text-muted-foreground mt-1">{d.reason}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
