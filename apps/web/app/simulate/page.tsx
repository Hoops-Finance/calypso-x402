"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanResponse, BotConfig, SessionConfig } from "@calypso/shared";
import { BotConfigEditor } from "../../components/BotConfigEditor";
import { buildPaidApi, PaymentRequiredError } from "../../lib/apiClient";
import { useSessionWallet } from "../../components/SessionWalletProvider";
import { FlowDiagram } from "../../components/FlowDiagram";
import { X402Ceremony, useX402Ceremony } from "../../components/X402Ceremony";

const SAMPLE_PROMPTS = [
  "stress test USDC/XLM liquidity across Soroswap and Phoenix for 5 minutes with 3 bots",
  "quick 3 minute demo with 1 arb bot and 2 noise bots",
  "15 minute volume run on Soroswap USDC/XLM",
];

type Step = "prompt" | "review" | "launching" | "error";

function blankBot(archetype: BotConfig["archetype"], idx: number): BotConfig {
  const bot_id = `${archetype === "lp_manager" ? "lp" : archetype}-${idx}`;
  switch (archetype) {
    case "arbitrageur":
      return {
        archetype,
        bot_id,
        min_spread_bps: 15,
        max_position_size: 50,
        target_pairs: ["USDC/XLM"],
        target_dexes: ["soroswap", "aqua"],
        interval_seconds: 15,
      };
    case "noise":
      return {
        archetype,
        bot_id,
        interval_seconds: 12,
        min_amount: 1,
        max_amount: 4,
        target_pools: ["soroswap:USDC/XLM"],
      };
    case "lp_manager":
      return {
        archetype,
        bot_id,
        rebalance_threshold: 0.2,
        target_pool: "soroswap:USDC/XLM",
        deposit_amount: 50,
        interval_seconds: 25,
      };
  }
}

export default function SimulatePage() {
  const router = useRouter();
  const { paidFetch, status: walletStatus } = useSessionWallet();
  const paidApi = useMemo(() => buildPaidApi(paidFetch), [paidFetch]);
  const { state: ceremony, begin, close } = useX402Ceremony();

  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]!);
  const [step, setStep] = useState<Step>("prompt");
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [botConfigs, setBotConfigs] = useState<BotConfig[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(2.5);
  const [error, setError] = useState<string | null>(null);

  function applyPlan(plan: PlanResponse) {
    setSessionConfig(plan.session_config);
    setBotConfigs(plan.bot_configs);
    setEstimatedCost(plan.estimated_cost_usd);
  }

  async function handlePlan() {
    setError(null);
    begin("$0.50");
    try {
      const plan = await paidApi.plan({ prompt });
      applyPlan(plan);
      setStep("review");
      setTimeout(() => close(), 2200);
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        setError(`HTTP 402 — x402 handshake failed. ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setStep("error");
      setTimeout(() => close(), 1500);
    }
  }

  async function handleSimulate() {
    if (!sessionConfig) return;
    setError(null);
    setStep("launching");
    begin("$2.00");
    try {
      const sim = await paidApi.simulate({
        session_config: sessionConfig,
        bot_configs: botConfigs,
      });
      setTimeout(() => {
        close();
        router.push(`/sessions/${sim.session_id}`);
      }, 1800);
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        setError(`HTTP 402 — x402 handshake failed. ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setStep("error");
      setTimeout(() => close(), 1500);
    }
  }

  function updateBot(idx: number, next: BotConfig) {
    setBotConfigs((prev) => {
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  function addBot(archetype: BotConfig["archetype"]) {
    setBotConfigs((prev) => {
      const nextIdx = prev.filter((b) => b.archetype === archetype).length + 1;
      return [...prev, blankBot(archetype, nextIdx)];
    });
  }

  function removeBot(idx: number) {
    setBotConfigs((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSessionConfig<K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) {
    setSessionConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <>
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-10 pb-5 border-b border-border">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="ship-mark">simulation workflow</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                step {step === "prompt" ? "01 / 02" : step === "review" ? "02 / 02" : "—"}
              </span>
            </div>
            <h1 className="font-display text-5xl md:text-6xl font-semibold text-paper tracking-tight leading-[0.95]">
              {step === "prompt"
                ? "Describe the market."
                : step === "review"
                  ? "Review the swarm."
                  : step === "launching"
                    ? "Launching…"
                    : "Error."}
            </h1>
            <div className="mt-3 max-w-[600px] text-muted-foreground leading-relaxed">
              {step === "prompt"
                ? "Tell Calypso what market conditions you want. Gemma 4 turns your brief into a structured session plan. The first x402 payment ($0.50 USDC) runs the planner."
                : step === "review"
                  ? "Every field is editable before you commit. When you launch, a second x402 payment ($2.00 USDC) gets you a running swarm. Both payments settle on-chain through the real facilitator — no bypass."
                  : step === "launching"
                    ? "Orchestrator is deploying bot smart accounts and distributing USDC."
                    : null}
            </div>
          </div>
        </div>

        {/* Session wallet status strip */}
        <div className="mb-8 border border-border-strong bg-card/50 corner-marks p-4 flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              session wallet status
            </div>
            <div className="mt-1 text-sm text-foreground font-mono">
              {walletStatus === "ready"
                ? "ready to pay"
                : walletStatus === "funding"
                  ? "funding (friendbot + admin mint)…"
                  : walletStatus === "error"
                    ? "error during funding"
                    : "initializing…"}
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {walletStatus === "ready" ? (
              <span className="text-[hsl(var(--success))]">● live</span>
            ) : (
              <span>● pending</span>
            )}
          </div>
        </div>

        {step === "prompt" && (
          <div className="border border-border-strong bg-card/60 corner-marks p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
              prompt
            </div>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the market you want Calypso to generate…"
              className="w-full bg-background/60 border border-border px-4 py-3 font-mono text-sm text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  type="button"
                  className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                >
                  {p.slice(0, 55)}…
                </button>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  payment
                </div>
                <div className="font-display text-2xl md:text-3xl font-semibold text-primary">
                  $0.50 USDC
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  via x402 · stellar:testnet
                </div>
              </div>
              <button
                onClick={() => void handlePlan()}
                disabled={!prompt.trim() || walletStatus !== "ready"}
                className="group relative px-6 py-4 border-2 border-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                type="button"
              >
                <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary">
                  plan session →
                </span>
              </button>
            </div>
          </div>
        )}

        {step === "review" && sessionConfig && (
          <div className="space-y-8">
            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  session parameters
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary bg-primary/5 border border-primary/30 px-2 py-0.5">
                  {sessionConfig.duration_minutes} min
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="name">
                  <input
                    type="text"
                    value={sessionConfig.name}
                    onChange={(e) => updateSessionConfig("name", e.target.value)}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60"
                  />
                </Field>
                <Field label="duration (minutes)">
                  <input
                    type="number"
                    value={sessionConfig.duration_minutes}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0 && n <= 180) {
                        updateSessionConfig("duration_minutes", n);
                      }
                    }}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60"
                  />
                </Field>
                <Field label="usdc per bot">
                  <input
                    type="number"
                    step="any"
                    value={sessionConfig.usdc_per_bot}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0) {
                        updateSessionConfig("usdc_per_bot", n);
                      }
                    }}
                    className="w-full bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60"
                  />
                </Field>
              </div>
              <div className="mt-4 pt-4 border-t border-border/60 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mr-2">
                  target pools
                </span>
                {sessionConfig.target_pools.map((p) => (
                  <span
                    key={p}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] px-2 py-1 border border-primary/30 text-primary bg-primary/5"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="border border-border-strong bg-card/60 corner-marks p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  bot recipe · {botConfigs.length}
                </div>
                <div className="flex gap-2">
                  <AddBotButton onClick={() => addBot("noise")}>+ noise</AddBotButton>
                  <AddBotButton onClick={() => addBot("arbitrageur")}>+ arb</AddBotButton>
                  <AddBotButton onClick={() => addBot("lp_manager")}>+ lp</AddBotButton>
                </div>
              </div>
              <div className="space-y-4">
                {botConfigs.map((bot, idx) => (
                  <BotConfigEditor
                    key={idx}
                    config={bot}
                    onChange={(next) => updateBot(idx, next)}
                    onRemove={() => removeBot(idx)}
                  />
                ))}
                {botConfigs.length === 0 && (
                  <div className="text-sm text-muted-foreground italic">
                    no bots — add at least one above
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                flow of funds · preview
              </div>
              <FlowDiagram />
            </div>

            <div className="border-t-2 border-primary/40 bg-gradient-to-r from-primary/5 to-transparent p-6 flex items-center justify-between gap-4">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  payment ceremony pending
                </div>
                <div className="font-display text-3xl md:text-4xl font-semibold text-primary mt-1">
                  ${estimatedCost.toFixed(2)} USDC
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                  x402 · stellar:testnet · facilitator handshake
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep("prompt")}
                  className="font-mono text-[10px] uppercase tracking-[0.18em] px-4 py-3 border border-border text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  ← back
                </button>
                <button
                  onClick={() => void handleSimulate()}
                  disabled={botConfigs.length === 0 || walletStatus !== "ready"}
                  className="group relative px-6 py-4 border-2 border-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  type="button"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary-foreground">
                    pay $2.00 & launch →
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "launching" && (
          <div className="border-2 border-primary/60 bg-primary/5 calypso-glow p-8 flex items-center gap-5">
            <span className="live-dot" />
            <div>
              <div className="font-display text-2xl font-semibold text-paper">
                Spinning up the swarm
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mt-2">
                friendbot · deploy smart accounts · orchestrator USDC transfer · chassis loops
              </div>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="border border-destructive/60 bg-destructive/5 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="hazard-stripes-red w-3 h-3" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-destructive">
                handshake failed
              </span>
            </div>
            <div className="font-display text-2xl font-semibold text-paper mb-2">
              Something went wrong.
            </div>
            <div className="font-mono text-[11px] text-destructive mb-4 break-words">
              {error ?? "unknown"}
            </div>
            <button
              onClick={() => setStep("prompt")}
              className="px-4 py-2 border border-border text-xs font-mono uppercase tracking-[0.15em] hover:border-primary/60"
              type="button"
            >
              try again
            </button>
          </div>
        )}
      </div>

      <X402Ceremony state={ceremony} onClose={close} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

function AddBotButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 border border-border hover:border-primary/50 hover:text-primary transition-colors"
    >
      {children}
    </button>
  );
}
