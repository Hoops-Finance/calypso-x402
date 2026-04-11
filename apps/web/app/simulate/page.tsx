"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanResponse, BotConfig, SessionConfig } from "@calypso/shared";
import { Button, Card, CardHeader, CardTitle, Badge, Textarea, Input } from "../../components/ui";
import { BotConfigEditor } from "../../components/BotConfigEditor";
import { api, PaymentRequiredError } from "../../lib/apiClient";
import { useWallet } from "../../components/WalletProvider";
import { WalletHierarchy } from "../../components/WalletHierarchy";

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
  const { connected, connect } = useWallet();
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
    try {
      const plan = await api.plan({ prompt });
      applyPlan(plan);
      setStep("review");
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        setError(
          `HTTP 402 — pay $0.50 USDC to planner wallet. In demo mode the server bypasses settlement; to run the real payment flow connect a funded Freighter wallet and retry.`,
        );
        setStep("error");
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  async function handleSimulate() {
    if (!sessionConfig) return;
    setError(null);
    setStep("launching");
    try {
      const sim = await api.simulate({
        session_config: sessionConfig,
        bot_configs: botConfigs,
      });
      router.push(`/sessions/${sim.session_id}`);
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        setError(
          `HTTP 402 — pay $2.00 USDC to simulator wallet. In demo mode the server bypasses settlement; to run the real payment flow connect a funded Freighter wallet and retry.`,
        );
        setStep("error");
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
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
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <Badge tone="primary">
          step {step === "prompt" ? "1 of 2" : step === "review" ? "2 of 2" : "…"}
        </Badge>
        <h1 className="mt-3 text-3xl md:text-4xl font-bold">Run a simulation</h1>
        <p className="mt-2 text-muted-foreground">
          {step === "prompt"
            ? "Describe the market conditions you want Calypso to generate. Gemma 4 will plan the swarm."
            : step === "review"
              ? "Review and edit the AI-generated bot recipe. Every field is editable before you launch."
              : step === "launching"
                ? "Launching bot wallets, deploying smart accounts, seeding USDC, wiring the swarm…"
                : "Something went wrong."}
        </p>
      </div>

      {/* Persistent wallet hierarchy summary at the top */}
      <div className="mb-8">
        <WalletHierarchy showUser={true} />
      </div>

      {!connected && (
        <Card className="mb-6 border-primary/40 calypso-glow">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Connect Freighter to pay</div>
              <div className="text-xs text-muted-foreground">
                Testnet only. The app will never touch your mainnet balance.
              </div>
            </div>
            <Button onClick={() => void connect()}>connect</Button>
          </div>
        </Card>
      )}

      {step === "prompt" && (
        <Card>
          <CardHeader>
            <CardTitle>prompt</CardTitle>
          </CardHeader>
          <Textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the market you want Calypso to generate…"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
              >
                {p.slice(0, 60)}…
              </button>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              cost: <span className="text-primary font-semibold">$0.50 USDC</span> via x402
            </div>
            <Button onClick={() => void handlePlan()} disabled={!prompt.trim()}>
              plan session →
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && sessionConfig && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>session</CardTitle>
              <Badge tone="primary">{sessionConfig.duration_minutes} min</Badge>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  name
                </div>
                <Input
                  value={sessionConfig.name}
                  onChange={(e) => updateSessionConfig("name", e.target.value)}
                />
              </label>
              <label className="block">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  duration_minutes
                </div>
                <Input
                  type="number"
                  value={sessionConfig.duration_minutes}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0 && n <= 180) {
                      updateSessionConfig("duration_minutes", n);
                    }
                  }}
                />
              </label>
              <label className="block">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  usdc_per_bot
                </div>
                <Input
                  type="number"
                  step="any"
                  value={sessionConfig.usdc_per_bot}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n > 0) {
                      updateSessionConfig("usdc_per_bot", n);
                    }
                  }}
                />
                <div className="mt-1 text-[10px] text-muted-foreground">
                  USDC the orchestrator sends to each bot on launch (LP needs ≥ 0.5)
                </div>
              </label>
              <label className="block sm:col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  target_pools
                </div>
                <div className="flex flex-wrap gap-2">
                  {sessionConfig.target_pools.map((p) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                </div>
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>bots ({botConfigs.length})</CardTitle>
              <div className="flex gap-2">
                <button
                  onClick={() => addBot("noise")}
                  className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border hover:border-primary/50 hover:text-primary transition-colors"
                >
                  + noise
                </button>
                <button
                  onClick={() => addBot("arbitrageur")}
                  className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border hover:border-primary/50 hover:text-primary transition-colors"
                >
                  + arb
                </button>
                <button
                  onClick={() => addBot("lp_manager")}
                  className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border hover:border-primary/50 hover:text-primary transition-colors"
                >
                  + lp
                </button>
              </div>
            </CardHeader>
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
          </Card>

          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              total cost:{" "}
              <span className="text-primary font-semibold">
                ${estimatedCost.toFixed(2)} USDC
              </span>{" "}
              · pays from your connected Freighter wallet
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStep("prompt")}>
                back
              </Button>
              <Button
                onClick={() => void handleSimulate()}
                disabled={botConfigs.length === 0}
              >
                pay $2.00 & launch →
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "launching" && (
        <Card className="calypso-glow">
          <div className="flex items-center gap-4">
            <div className="live-dot" />
            <div>
              <div className="text-lg font-semibold">spinning up the swarm</div>
              <div className="text-sm text-muted-foreground">
                funding bot wallets via friendbot, deploying smart accounts, seeding USDC, starting chassis loops…
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === "error" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>something went wrong</CardTitle>
            <Badge tone="danger">error</Badge>
          </CardHeader>
          <p className="text-sm text-muted-foreground mb-4">{error ?? "unknown"}</p>
          <Button onClick={() => setStep("prompt")}>try again</Button>
        </Card>
      )}
    </div>
  );
}
