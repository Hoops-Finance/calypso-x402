"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  BotLogEntry,
  AIFeedbackEntry,
  Report,
  SessionStatus,
} from "@calypso/shared";
import { api, openEventStream } from "../../../lib/apiClient";
import { FlowDiagram } from "../../../components/FlowDiagram";
import { SessionStateBadge } from "../../../components/SessionStateBadge";
import { SessionTimer } from "../../../components/SessionTimer";
import { StopSessionButton } from "../../../components/StopSessionButton";
import { PaymentStamp } from "../../../components/PaymentStamp";
import { TickerNumber } from "../../../components/TickerNumber";

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
  const { id } = use(props.params);

  const [report, setReport] = useState<Report | null>(null);
  const [logs, setLogs] = useState<BotLogEntry[]>([]);
  const [feedback, setFeedback] = useState<AIFeedbackEntry[]>([]);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    return () => es.close();
  }, [id]);

  const allLogs = useMemo(() => {
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
        <div className="border border-destructive/40 p-6 font-mono text-destructive">
          ERROR · {error}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="border border-border p-6 font-mono text-sm text-muted-foreground">
          LOADING SESSION…
        </div>
      </div>
    );
  }

  const active = status === "running";

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-10">
      {/* Back link + meta */}
      <div className="flex items-center justify-between mb-8 gap-4">
        <Link
          href="/sessions"
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          ← all sessions
        </Link>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          session · <span className="text-foreground">{id}</span>
        </div>
      </div>

      {/* HERO — the quotable frame */}
      <div className="relative border border-border-strong bg-gradient-to-br from-primary/5 via-ink/60 to-card/60 backdrop-blur scanlines corner-marks">
        <div className="hazard-stripes h-1 w-full" aria-hidden />

        <div className="p-8 md:p-10">
          <div className="flex flex-col lg:flex-row lg:items-start gap-10">
            {/* LEFT — title + state */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-5">
                <SessionStateBadge state={status} />
                <span className="ship-mark">x402 gated · stellar testnet</span>
              </div>
              <div className="font-display text-5xl md:text-6xl font-semibold text-paper leading-[0.95] tracking-tight mb-3">
                {report.session_config.name}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground max-w-[560px]">
                {report.bot_logs.length > 0
                  ? "Live Hoops-router swap traffic across four DEXes. Every action below is a real Stellar tx."
                  : "Initializing swarm — bot wallets deploying…"}
              </div>
            </div>

            {/* RIGHT — timer + stop button */}
            <div className="flex flex-col items-end gap-5 shrink-0">
              <SessionTimer
                startedAt={report.started_at}
                durationMinutes={report.session_config.duration_minutes}
              />
              {active && <StopSessionButton sessionId={id} />}
              {status === "completed" && (
                <div className="flex flex-col items-end gap-2">
                  <PaymentStamp amountUsd="$2.00" compact />
                  <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    session paid via x402
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* METRIC STRIP */}
          <div className="mt-10 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-6">
            <Metric
              label="actions"
              value={metrics?.total_actions ?? 0}
              tone="primary"
            />
            <Metric
              label="swap volume · xlm"
              value={(summary?.gross_volume_usd ?? 0).toFixed(2)}
            />
            <Metric
              label="failed txns"
              value={metrics?.failed_txns ?? 0}
              tone={metrics && metrics.failed_txns > 0 ? "warning" : "default"}
            />
            <Metric label="ai reviews" value={allFeedback.length} tone="primary" />
          </div>
        </div>

        <div className="hazard-stripes h-1 w-full" aria-hidden />
      </div>

      {/* FLOW DIAGRAM — the money narrative */}
      <section className="mt-10">
        <SectionHeader index="A" label="money flow" sub="live on-chain state" />
        <FlowDiagram sessionId={id} />
      </section>

      {/* BOT TABLE + LOG TAIL + AI RAIL */}
      <section className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* BOT TABLE */}
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-border bg-card/60 corner-marks">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/70">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                BOTS · {metrics?.per_bot.length ?? 0} active
              </div>
              {active && <span className="live-dot" />}
            </div>
            {metrics && metrics.per_bot.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground border-b border-border/60">
                    <th className="text-left px-5 py-2">bot</th>
                    <th className="text-left py-2">type</th>
                    <th className="text-right py-2">actions</th>
                    <th className="text-right py-2">ok</th>
                    <th className="text-right py-2">fail</th>
                    <th className="text-right px-5 py-2">volume</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.per_bot.map((b) => (
                    <tr
                      key={b.bot_id}
                      className="border-b border-border/40 last:border-0 hover:bg-primary/[0.03] transition-colors"
                    >
                      <td className="px-5 py-3 font-mono font-semibold text-primary">
                        {b.bot_id}
                      </td>
                      <td className="py-3 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        {b.archetype}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums">
                        <TickerNumber value={b.actions_total} />
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-[hsl(var(--success))]">
                        {b.successes}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-destructive">
                        {b.failures}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">
                        {b.volume_usd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-5 py-6 font-mono text-[11px] text-muted-foreground">
                waiting for first tick…
              </div>
            )}
          </div>

          {/* LIVE LOG TAPE */}
          <div className="border border-border bg-ink/60 corner-marks">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/70">
              <div className="flex items-center gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  live log
                </div>
                <div className="font-mono text-[10px] text-foreground">
                  {allLogs.length} events
                </div>
              </div>
              {active && (
                <div className="flex items-center gap-2">
                  <span className="live-dot" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--success))]">
                    streaming
                  </span>
                </div>
              )}
            </div>
            <div className="font-mono text-[11px] max-h-[460px] overflow-y-auto scanlines">
              {allLogs.length === 0 && (
                <div className="px-5 py-6 text-muted-foreground">waiting for bot actions…</div>
              )}
              {allLogs.slice(-240).map((l, i) => (
                <LogRow key={`${l.t}-${i}`} entry={l} />
              ))}
            </div>
          </div>
        </div>

        {/* AI RAIL */}
        <div className="space-y-6">
          <div className="border border-border bg-card/60 corner-marks">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/70">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                ai adjustments
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 border border-primary/30 text-primary bg-primary/5">
                gemma 4
              </div>
            </div>
            <div className="p-5">
              {allFeedback.length === 0 ? (
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  Gemma hasn&apos;t reviewed yet. First review fires within the next interval.
                </div>
              ) : (
                <div className="space-y-4">
                  {allFeedback
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div
                        key={entry.t}
                        className="border border-border/60 bg-background/50 p-3 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {fmtTime(entry.t)}
                          </span>
                          <span
                            className={`font-mono text-[9px] px-2 py-0.5 border ${entry.deltas_out.length > 0 ? "border-primary/30 text-primary bg-primary/5" : "border-border text-muted-foreground"}`}
                          >
                            {entry.deltas_out.length} Δ
                          </span>
                        </div>
                        {entry.deltas_out.length === 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            No changes — the swarm looks healthy.
                          </div>
                        )}
                        <ul className="space-y-2 text-[11px]">
                          {entry.deltas_out.map((d, i) => (
                            <li key={i} className="border-l-2 border-primary/40 pl-3">
                              <div className="font-mono">
                                <span className="text-primary">{d.bot_id}</span>.{d.param} ={" "}
                                <span className="text-foreground">{String(d.new_value)}</span>
                              </div>
                              <div className="text-muted-foreground mt-0.5">{d.reason}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* RECEIPT — x402 paid-stamp sidebar block */}
          <div className="border border-[hsl(var(--ink-stamp)/0.3)] bg-[hsl(var(--ink-stamp)/0.03)] p-5 corner-marks">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
              x402 receipt
            </div>
            <PaymentStamp
              amountUsd="$2.00"
              network="stellar:testnet"
              receiptId={id.slice(0, 8).toUpperCase()}
              timestamp={new Date(report.started_at).getTime()}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "primary" | "warning";
}) {
  const color =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-[hsl(var(--warning))]"
        : "text-paper";
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-4xl md:text-5xl font-semibold tabular-nums leading-none ${color}`}
      >
        <TickerNumber value={value} />
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: BotLogEntry }) {
  const color =
    entry.action === "error"
      ? "text-destructive"
      : entry.action === "swap" ||
          entry.action === "rebalance" ||
          entry.action === "deposit_liquidity"
        ? "text-foreground"
        : "text-muted-foreground";

  return (
    <div
      className={`flex items-start gap-3 px-5 py-1 hover:bg-primary/[0.03] ${color} border-b border-border/20 last:border-0`}
    >
      <span className="text-muted-foreground shrink-0 tabular-nums">[{fmtTime(entry.t)}]</span>
      <span className="text-primary shrink-0 w-[80px]">{entry.bot_id}</span>
      <span className="uppercase text-[9px] tracking-[0.18em] shrink-0 w-[72px]">
        {entry.action}
      </span>
      {entry.tx_hash && (
        <a
          href={`${EXPLORER_BASE}/${entry.tx_hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary/80 hover:underline shrink-0"
        >
          {shortHash(entry.tx_hash)}
        </a>
      )}
      {entry.note && (
        <span className="text-muted-foreground truncate flex-1 min-w-0">{entry.note}</span>
      )}
      {entry.error && (
        <span className="text-destructive truncate flex-1 min-w-0">{entry.error}</span>
      )}
    </div>
  );
}

function SectionHeader({
  index,
  label,
  sub,
}: {
  index: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-end justify-between mb-5 pb-3 border-b border-border">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          SECTION {index}
        </span>
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-paper tracking-tight">
          {label}
        </h2>
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {sub}
      </div>
    </div>
  );
}
