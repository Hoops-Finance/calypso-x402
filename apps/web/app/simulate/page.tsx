"use client";

/**
 * /simulate — three launch modes, full process visibility.
 *
 *   PRESET  — pick a canned config, skip /plan ($2.00 only)
 *   CUSTOM  — build your own config in a form, skip /plan ($2.00 only)
 *   AI PLAN — type a prompt, Gemma 4 generates a config ($2.50 total)
 *             AND shows the LLM's chain-of-thought reasoning
 *
 * Every mode ends with the X402Ceremony modal showing real tx hashes,
 * the full API call sequence, and a required CONTINUE click.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BotConfig, SessionConfig } from "@calypso/shared";
import {
  agent,
  planStream,
  shortHash,
  txExplorerUrl,
  type AgentLaunchResponse,
  type X402Trace,
  type PlanStreamResult,
} from "../../lib/apiClient";
import { X402Ceremony, progressToLine, type CeremonyPhase, type TerminalLine } from "../../components/X402Ceremony";
import { BotConfigEditor } from "../../components/BotConfigEditor";

type Mode = "preset" | "custom" | "ai";

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS — canned configs that skip /plan entirely
// ─────────────────────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  description: string;
  sessionConfig: SessionConfig;
  botConfigs: BotConfig[];
}

const PRESETS: Preset[] = [
  {
    label: "Quick demo",
    description: "3 min, 1 arb + 1 noise + 1 LP, 15s intervals",
    sessionConfig: {
      name: "Quick Demo",
      duration_minutes: 3,
      target_pools: ["soroswap:USDC/XLM"],
      initial_treasury_xlm: 10_000,
      usdc_per_bot: 1,
      demo_mode: false,
    },
    botConfigs: [
      { archetype: "noise", bot_id: "noise-1", interval_seconds: 12, min_amount: 1, max_amount: 3, target_pools: ["soroswap:USDC/XLM"] },
      { archetype: "arbitrageur", bot_id: "arb-1", min_spread_bps: 10, max_position_size: 50, target_pairs: ["USDC/XLM"], target_dexes: ["soroswap", "aqua"], interval_seconds: 15 },
      { archetype: "lp_manager", bot_id: "lp-1", rebalance_threshold: 0.15, target_pool: "soroswap:USDC/XLM", deposit_amount: 50, interval_seconds: 25 },
    ],
  },
  {
    label: "Arb stress test",
    description: "3 min, 2 arb bots at 8s, 1 noise, aggressive spread detection",
    sessionConfig: {
      name: "Arb Stress Test",
      duration_minutes: 3,
      target_pools: ["soroswap:USDC/XLM"],
      initial_treasury_xlm: 10_000,
      usdc_per_bot: 1,
      demo_mode: false,
    },
    botConfigs: [
      { archetype: "arbitrageur", bot_id: "arb-1", min_spread_bps: 5, max_position_size: 100, target_pairs: ["USDC/XLM"], target_dexes: ["soroswap", "aqua"], interval_seconds: 8 },
      { archetype: "arbitrageur", bot_id: "arb-2", min_spread_bps: 5, max_position_size: 100, target_pairs: ["USDC/XLM"], target_dexes: ["soroswap", "aqua"], interval_seconds: 8 },
      { archetype: "noise", bot_id: "noise-1", interval_seconds: 10, min_amount: 1, max_amount: 5, target_pools: ["soroswap:USDC/XLM"] },
    ],
  },
  {
    label: "Volume generator",
    description: "5 min, 3 noise bots, high frequency, maximum swap throughput",
    sessionConfig: {
      name: "Volume Generator",
      duration_minutes: 5,
      target_pools: ["soroswap:USDC/XLM"],
      initial_treasury_xlm: 10_000,
      usdc_per_bot: 1,
      demo_mode: false,
    },
    botConfigs: [
      { archetype: "noise", bot_id: "noise-1", interval_seconds: 8, min_amount: 1, max_amount: 5, target_pools: ["soroswap:USDC/XLM"] },
      { archetype: "noise", bot_id: "noise-2", interval_seconds: 8, min_amount: 1, max_amount: 5, target_pools: ["soroswap:USDC/XLM"] },
      { archetype: "noise", bot_id: "noise-3", interval_seconds: 10, min_amount: 2, max_amount: 4, target_pools: ["soroswap:USDC/XLM"] },
    ],
  },
];

const SAMPLE_PROMPTS = [
  "stress test USDC/XLM liquidity across Soroswap and Phoenix for 3 minutes with 3 bots",
  "quick demo with 2 arb bots and 1 noise bot, tight 8 second intervals",
  "5 minute LP rebalance test on Soroswap with 1 lp manager and 2 noise bots",
];

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function SimulatePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("ai");
  const [ceremony, setCeremony] = useState<CeremonyPhase>({ kind: "idle" });

  // AI mode state — two-step: plan first, then review + launch
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]!);
  const [aiStep, setAiStep] = useState<"prompt" | "planning" | "review">("prompt");
  const [aiLogs, setAiLogs] = useState<TerminalLine[]>([]);
  const [aiPlan, setAiPlan] = useState<PlanStreamResult | null>(null);
  // Editable copies of the AI-generated config for the review step
  const [aiConfig, setAiConfig] = useState<SessionConfig | null>(null);
  const [aiBots, setAiBots] = useState<BotConfig[]>([]);

  // Custom mode state
  const [customConfig, setCustomConfig] = useState<SessionConfig>(PRESETS[0]!.sessionConfig);
  const [customBots, setCustomBots] = useState<BotConfig[]>([...PRESETS[0]!.botConfigs]);

  function storeTraces(sessionId: string, plan?: X402Trace, sim?: X402Trace, reasoning?: string | null, model?: string) {
    try {
      window.sessionStorage.setItem(
        `calypso.traces.${sessionId}`,
        JSON.stringify({
          plan: plan ?? null,
          simulate: sim ?? null,
          total_usd: plan ? "$2.50" : "$2.00",
          ai_reasoning: reasoning ?? null,
          ai_model: model ?? null,
        }),
      );
    } catch { /* non-fatal */ }
  }

  // ─── AI Step 1: ask Gemma for a plan ($0.50) ───
  async function askGemma() {
    if (!prompt.trim()) return;
    setAiStep("planning");
    setAiPlan(null);
    const logs: TerminalLine[] = [];
    setAiLogs(logs);
    try {
      const result = await planStream(prompt, (evt) => {
        const line = progressToLine(evt);
        logs.push(line);
        setAiLogs([...logs]);
      });
      setAiPlan(result);
      setAiConfig(result.plan.session_config as unknown as SessionConfig);
      setAiBots(result.plan.bot_configs as unknown as BotConfig[]);
      setAiStep("review");
    } catch (err) {
      logs.push({ t: Date.now(), icon: "✗", text: err instanceof Error ? err.message : String(err), tone: "error" });
      setAiLogs([...logs]);
      setAiStep("prompt");
    }
  }

  // ─── AI Step 2: launch with reviewed/edited config ($2.00) ───
  async function launchAIPlan() {
    if (!aiConfig || aiBots.length === 0) return;
    const logs: TerminalLine[] = [
      { t: Date.now(), icon: "→", text: `POST /simulate → agent signing x402 ($2.00 USDC)`, tone: "info" },
      { t: Date.now(), icon: " ", text: `→ HTTP 402 → sign → retry → facilitator settles on-chain`, tone: "default" },
    ];
    setCeremony({ kind: "dispatch", prompt: aiConfig.name, logs });
    try {
      const res = await agent.launch(aiConfig as Record<string, unknown>, aiBots as Record<string, unknown>[]);
      logs.push({ t: Date.now(), icon: "✓", text: `x402 settled · tx ${res.simulate_trace.payment_tx_hash?.slice(0, 12) ?? "?"}…`, tone: "success" });
      logs.push({ t: Date.now(), icon: "…", text: `Deploying ${aiBots.length} bot wallets…`, tone: "primary" });
      logs.push({ t: Date.now(), icon: "◆", text: `Session live`, tone: "primary" });
      storeTraces(res.session_id, aiPlan?.trace, res.simulate_trace, aiPlan?.reasoning, aiPlan?.model);
      setCeremony({
        kind: "settled",
        prompt: aiConfig.name,
        planTrace: aiPlan?.trace ?? null,
        simulateTrace: res.simulate_trace,
        sessionId: res.session_id,
        totalUsd: "$2.50",
        logs: [...logs],
      });
    } catch (err) {
      logs.push({ t: Date.now(), icon: "✗", text: err instanceof Error ? err.message : String(err), tone: "error" });
      setCeremony({ kind: "error", prompt: aiConfig.name, message: err instanceof Error ? err.message : String(err), logs: [...logs] });
    }
  }

  function resetAI() {
    setAiStep("prompt");
    setAiPlan(null);
    setAiConfig(null);
    setAiBots([]);
    setAiLogs([]);
  }

  // ─── Preset / Custom direct launch ───
  async function launchDirect(config: SessionConfig, bots: BotConfig[]) {
    const logs: TerminalLine[] = [
      { t: Date.now(), icon: "→", text: `POST /simulate → agent signing x402 ($2.00 USDC)`, tone: "info" },
    ];
    setCeremony({ kind: "dispatch", prompt: `direct launch: ${config.name}`, logs });
    try {
      const res = await agent.launch(config as Record<string, unknown>, bots as Record<string, unknown>[]);
      logs.push({ t: Date.now(), icon: "✓", text: `Settled on-chain · session ${res.session_id.slice(0, 8)}…`, tone: "success", detail: res.simulate_trace.payment_tx_hash ? `tx: ${res.simulate_trace.payment_tx_hash}` : undefined });
      logs.push({ t: Date.now(), icon: "◆", text: `Deploying ${bots.length} bot wallets`, tone: "primary" });
      storeTraces(res.session_id, undefined, res.simulate_trace);
      setCeremony({
        kind: "settled",
        prompt: config.name,
        planTrace: null as unknown as X402Trace,
        simulateTrace: res.simulate_trace,
        sessionId: res.session_id,
        totalUsd: "$2.00",
        logs: [...logs],
      });
    } catch (err) {
      logs.push({ t: Date.now(), icon: "✗", text: err instanceof Error ? err.message : String(err), tone: "error" });
      setCeremony({ kind: "error", prompt: config.name, message: err instanceof Error ? err.message : String(err), logs: [...logs] });
    }
  }

  function onContinue() {
    if (ceremony.kind !== "settled") return;
    const id = ceremony.sessionId;
    setCeremony({ kind: "idle" });
    router.push(`/sessions/${id}`);
  }

  function onCancel() { setCeremony({ kind: "idle" }); }

  return (
    <>
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        {/* HEADER */}
        <div className="mb-8 pb-5 border-b border-border">
          <div className="flex items-center gap-3 mb-3">
            <span className="ship-mark">simulation workflow</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold text-paper tracking-tight leading-[0.92]">
            Launch a swarm.
          </h1>
          <p className="mt-4 max-w-[640px] text-muted-foreground leading-relaxed">
            Three ways to configure. <strong className="text-primary">AI Plan</strong> asks
            Gemma 4 to design the session — you see the LLM&apos;s reasoning and the
            generated config. <strong className="text-foreground">Presets</strong> skip the
            AI and use a canned config. <strong className="text-foreground">Custom</strong> lets
            you build it from scratch. Every path ends with a real x402 payment.
          </p>
        </div>

        {/* MODE TABS */}
        <div className="flex items-center gap-1 mb-8">
          {(["ai", "preset", "custom"] as Mode[]).map((m) => {
            const labels: Record<Mode, string> = { ai: "AI plan · $2.50", preset: "presets · $2.00", custom: "custom · $2.00" };
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                type="button"
                className={`px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] border-b-2 transition-colors ${
                  mode === m
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>

        {/* ─── AI MODE — two-step conversational flow ─── */}
        {mode === "ai" && aiStep === "prompt" && (
          <div className="space-y-6">
            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
                step 1 of 2 · describe what you want
              </div>
              <div className="font-display text-2xl font-semibold text-paper mb-4">
                Tell Gemma 4 about your market.
              </div>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. aggressive arb stress test across Soroswap and Phoenix, 3 minutes, tight intervals…"
                className="w-full bg-background/60 border border-border px-4 py-3 font-mono text-sm text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((p) => (
                  <button key={p} onClick={() => setPrompt(p)} type="button"
                    className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
                    {p.slice(0, 55)}…
                  </button>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] text-muted-foreground">Gemma 4 designs the session config · you review + edit before launching</div>
                </div>
                <button onClick={() => void askGemma()} disabled={!prompt.trim()} type="button"
                  className="px-6 py-4 border-2 border-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-50 transition-colors">
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary">ask gemma · $0.50 →</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "ai" && aiStep === "planning" && (
          <div className="space-y-6">
            <div className="border border-border-strong bg-[hsl(var(--ink))]">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning)/0.6)]" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success)/0.6)]" />
                </div>
                <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-[0.2em]">
                  calypso agent · planning
                </span>
              </div>
              <div className="font-mono text-[11px] max-h-[420px] overflow-y-auto p-3 space-y-0.5">
                <div className="text-muted-foreground">
                  <span className="text-primary">$</span> agent plan --prompt &quot;{prompt.slice(0, 60)}{prompt.length > 60 ? "…" : ""}&quot;
                </div>
                {aiLogs.map((line, i) => {
                  const isReasoning = line.icon === " " && line.tone === "default";
                  const iconColor =
                    line.tone === "success" ? "text-[hsl(var(--success))]"
                    : line.tone === "error" ? "text-destructive"
                    : line.tone === "primary" ? "text-primary"
                    : line.tone === "info" ? "text-[hsl(var(--info))]"
                    : "text-muted-foreground";
                  const time = new Date(line.t).toISOString().slice(11, 19);
                  return isReasoning ? (
                    <div key={i} className="ml-[78px] text-muted-foreground/70 text-[10px] leading-snug">{line.text}</div>
                  ) : (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground shrink-0 tabular-nums w-[62px]">[{time}]</span>
                      <span className={`shrink-0 w-3 text-center ${iconColor}`}>{line.icon}</span>
                      <span className={line.tone === "success" ? "text-[hsl(var(--success))]" : line.tone === "primary" ? "text-primary" : line.tone === "info" ? "text-[hsl(var(--info))]" : "text-foreground"}>{line.text}</span>
                    </div>
                  );
                })}
                {aiLogs.length > 0 && aiLogs[aiLogs.length - 1]!.icon !== "◆" && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-muted-foreground">working…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {mode === "ai" && aiStep === "review" && aiConfig && (
          <div className="space-y-6">
            {/* AI reasoning panel */}
            {aiPlan?.reasoning && (
              <details open className="border border-primary/30 bg-primary/5 corner-marks">
                <summary className="px-5 py-3 cursor-pointer font-mono text-[10px] uppercase tracking-[0.22em] text-primary hover:text-foreground">
                  gemma 4 reasoning · model: {aiPlan.model}
                </summary>
                <pre className="px-5 pb-4 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-[280px] overflow-y-auto font-mono">
                  {aiPlan.reasoning}
                </pre>
              </details>
            )}

            {/* Editable session config */}
            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    step 2 of 2 · review and edit
                  </div>
                  <div className="font-display text-2xl font-semibold text-paper mt-1">
                    {aiConfig.name}
                  </div>
                </div>
                <button onClick={resetAI} type="button"
                  className="font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-2 border border-border text-muted-foreground hover:text-foreground">
                  ← new prompt
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="name">
                  <input type="text" value={aiConfig.name} onChange={(e) => setAiConfig({ ...aiConfig, name: e.target.value })}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60" />
                </Field>
                <Field label="duration (min)">
                  <input type="number" value={aiConfig.duration_minutes} onChange={(e) => { const n = Number(e.target.value); if (n > 0 && n <= 180) setAiConfig({ ...aiConfig, duration_minutes: n }); }}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60" />
                </Field>
                <Field label="usdc per bot">
                  <input type="number" step="any" value={aiConfig.usdc_per_bot} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setAiConfig({ ...aiConfig, usdc_per_bot: n }); }}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60" />
                </Field>
              </div>
            </div>

            {/* Editable bot configs */}
            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  bot recipe · {aiBots.length} · AI-generated, editable
                </div>
                <div className="flex gap-2">
                  {(["noise", "arbitrageur", "lp_manager"] as const).map((arch) => (
                    <button key={arch} onClick={() => setAiBots((prev) => [...prev, blankBot(arch, prev.length + 1)])} type="button"
                      className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-border hover:border-primary/50 hover:text-primary transition-colors">
                      + {arch === "lp_manager" ? "lp" : arch}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {aiBots.map((bot, idx) => (
                  <BotConfigEditor key={idx} config={bot}
                    onChange={(next) => setAiBots((prev) => { const c = [...prev]; c[idx] = next; return c; })}
                    onRemove={() => setAiBots((prev) => prev.filter((_, i) => i !== idx))} />
                ))}
              </div>
            </div>

            {/* x402 receipt for the plan payment */}
            {aiPlan?.trace?.payment_tx_hash && (
              <div className="border border-[hsl(var(--ink-stamp)/0.3)] bg-[hsl(var(--ink-stamp)/0.03)] p-4 flex items-center justify-between gap-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  plan paid · $0.50 USDC · tx{" "}
                  <a href={txExplorerUrl(aiPlan.trace.payment_tx_hash)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {shortHash(aiPlan.trace.payment_tx_hash)}
                  </a>
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--ink-stamp))]">
                  x402 settled
                </div>
              </div>
            )}

            <LaunchBar
              label="launch session"
              price="$2.00 USDC"
              sub="1 on-chain settlement · simulate · plan already paid"
              disabled={aiBots.length === 0 || ceremony.kind === "dispatch"}
              onClick={() => void launchAIPlan()}
            />
          </div>
        )}

        {/* ─── PRESET MODE ─── */}
        {mode === "preset" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PRESETS.map((p) => (
                <div key={p.label} className="border border-border bg-card/60 corner-marks p-5 flex flex-col">
                  <div className="font-display text-2xl font-semibold text-paper">{p.label}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed flex-1">{p.description}</div>
                  <div className="mt-4 pt-3 border-t border-border/60">
                    <div className="flex flex-wrap gap-1 mb-3">
                      {p.botConfigs.map((b) => (
                        <span key={b.bot_id} className="font-mono text-[9px] uppercase tracking-[0.15em] px-2 py-0.5 border border-primary/30 text-primary bg-primary/5">
                          {b.bot_id}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => void launchDirect(p.sessionConfig, p.botConfigs)}
                      disabled={ceremony.kind === "dispatch"}
                      type="button"
                      className="w-full px-4 py-3 border-2 border-primary bg-primary/10 hover:bg-primary/20 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-primary disabled:opacity-50 transition-colors"
                    >
                      launch · $2.00
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border border-border bg-card/40 corner-marks p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                what happens (presets skip the AI planner)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StepPill idx="1" label="POST /simulate" price="$2.00" desc="Session registered directly with your chosen config" />
                <StepPill idx="2" label="x402 settle" price="on-chain" desc="Agent signs auth entry, facilitator settles USDC on Stellar" />
              </div>
            </div>
          </div>
        )}

        {/* ─── CUSTOM MODE ─── */}
        {mode === "custom" && (
          <div className="space-y-6">
            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-4">
                session parameters
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="name">
                  <input type="text" value={customConfig.name} onChange={(e) => setCustomConfig({ ...customConfig, name: e.target.value })}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60" />
                </Field>
                <Field label="duration (min)">
                  <input type="number" value={customConfig.duration_minutes} onChange={(e) => { const n = Number(e.target.value); if (n > 0 && n <= 180) setCustomConfig({ ...customConfig, duration_minutes: n }); }}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60" />
                </Field>
                <Field label="usdc per bot">
                  <input type="number" step="any" value={customConfig.usdc_per_bot} onChange={(e) => { const n = Number(e.target.value); if (n > 0) setCustomConfig({ ...customConfig, usdc_per_bot: n }); }}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60" />
                </Field>
              </div>
            </div>

            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  bot recipe · {customBots.length}
                </div>
                <div className="flex gap-2">
                  {(["noise", "arbitrageur", "lp_manager"] as const).map((arch) => (
                    <button key={arch} onClick={() => setCustomBots((prev) => [...prev, blankBot(arch, prev.length + 1)])} type="button"
                      className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-border hover:border-primary/50 hover:text-primary transition-colors">
                      + {arch === "lp_manager" ? "lp" : arch}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {customBots.map((bot, idx) => (
                  <BotConfigEditor key={idx} config={bot} onChange={(next) => setCustomBots((prev) => { const c = [...prev]; c[idx] = next; return c; })}
                    onRemove={() => setCustomBots((prev) => prev.filter((_, i) => i !== idx))} />
                ))}
                {customBots.length === 0 && <div className="text-sm text-muted-foreground italic">add at least one bot above</div>}
              </div>
            </div>

            <LaunchBar
              label="launch custom session"
              price="$2.00 USDC"
              sub="1 on-chain settlement · simulate only"
              disabled={customBots.length === 0 || ceremony.kind === "dispatch"}
              onClick={() => void launchDirect(customConfig, customBots)}
            />
          </div>
        )}

        <div className="mt-10 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <Link href="/sessions" className="hover:text-foreground">← all sessions</Link>
          <Link href="/wallets" className="hover:text-foreground">manage agent wallet →</Link>
        </div>
      </div>

      <X402Ceremony phase={ceremony} onContinue={onContinue} onCancel={onCancel} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepPill({ idx, label, price, desc }: { idx: string; label: string; price: string; desc: string }) {
  return (
    <div className="border border-border/60 bg-background/50 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{idx}</span>
        <span className="font-mono text-[10px] text-primary font-bold tabular-nums">{price}</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-foreground">{label}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{desc}</div>
    </div>
  );
}

function LaunchBar({ label, price, sub, disabled, onClick }: { label: string; price: string; sub: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="border-t-2 border-primary/40 bg-gradient-to-r from-primary/5 to-transparent p-6 flex items-end justify-between gap-4">
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">payment ceremony</div>
        <div className="font-display text-4xl md:text-5xl font-semibold text-primary leading-none mt-1">{price}</div>
        <div className="font-mono text-[10px] text-muted-foreground mt-1">{sub}</div>
      </div>
      <button onClick={onClick} disabled={disabled} type="button"
        className="group relative px-7 py-5 border-2 border-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary-foreground">{label} →</span>
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function blankBot(archetype: BotConfig["archetype"], idx: number): BotConfig {
  const bot_id = `${archetype === "lp_manager" ? "lp" : archetype}-${idx}`;
  switch (archetype) {
    case "arbitrageur":
      return { archetype, bot_id, min_spread_bps: 10, max_position_size: 50, target_pairs: ["USDC/XLM"], target_dexes: ["soroswap", "aqua"], interval_seconds: 15 };
    case "noise":
      return { archetype, bot_id, interval_seconds: 12, min_amount: 1, max_amount: 4, target_pools: ["soroswap:USDC/XLM"] };
    case "lp_manager":
      return { archetype, bot_id, rebalance_threshold: 0.2, target_pool: "soroswap:USDC/XLM", deposit_amount: 50, interval_seconds: 25 };
  }
}
