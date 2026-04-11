"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanResponse } from "@calypso/shared";
import { Button, Card, CardHeader, CardTitle, Badge, Textarea } from "../../components/ui";
import { api, PaymentRequiredError } from "../../lib/apiClient";
import { useWallet } from "../../components/WalletProvider";

const SAMPLE_PROMPTS = [
  "stress test USDC/XLM liquidity across Soroswap and Phoenix for 5 minutes with 3 bots",
  "quick 3 minute demo with 1 arb bot and 2 noise bots",
  "15 minute volume run on Soroswap USDC/XLM",
];

type Step = "prompt" | "review" | "launching" | "error";

export default function SimulatePage() {
  const router = useRouter();
  const { connected, address, connect } = useWallet();
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]!);
  const [step, setStep] = useState<Step>("prompt");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planPaid, setPlanPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePlan() {
    setError(null);
    try {
      const plan = await api.plan({ prompt });
      setPlan(plan);
      setPlanPaid(true);
      setStep("review");
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        // In dev mode the facilitator demands a signed payment header.
        // Show the 402 clearly so the demo video can frame the moment.
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
    if (!plan) return;
    setError(null);
    setStep("launching");
    try {
      const sim = await api.simulate({
        session_config: plan.session_config,
        bot_configs: plan.bot_configs,
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-10">
        <Badge tone="primary">step {step === "prompt" ? "1 of 2" : step === "review" ? "2 of 2" : "…"}</Badge>
        <h1 className="mt-3 text-3xl md:text-4xl font-bold">Run a simulation</h1>
        <p className="mt-2 text-muted-foreground">
          {step === "prompt"
            ? "Describe the market conditions you want Calypso to generate. Gemma 4 will plan the swarm."
            : step === "review"
              ? "Review the AI-generated bot recipe. One tap to pay and launch."
              : step === "launching"
                ? "Launching bot wallets, deploying smart accounts, wiring the swarm…"
                : "Something went wrong."}
        </p>
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
        <>
          <Card>
            <CardHeader>
              <CardTitle>prompt</CardTitle>
              {planPaid && <Badge tone="success">$0.50 paid</Badge>}
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
        </>
      )}

      {step === "review" && plan && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>session</CardTitle>
              <Badge tone="primary">{plan.session_config.duration_minutes} min</Badge>
            </CardHeader>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">name</div>
                <div className="mt-1 font-semibold">{plan.session_config.name}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">treasury</div>
                <div className="mt-1 font-mono">{plan.session_config.initial_treasury_xlm} XLM</div>
              </div>
              <div className="col-span-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">target pools</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {plan.session_config.target_pools.map((p) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>bots ({plan.bot_configs.length})</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {plan.bot_configs.map((bot) => (
                <div
                  key={bot.bot_id}
                  className="rounded-lg border border-border bg-background/50 p-3 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="font-mono text-sm text-primary">{bot.bot_id}</div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {bot.archetype}
                    </div>
                  </div>
                  <pre className="text-[11px] text-muted-foreground font-mono max-w-[60%] overflow-x-auto">
                    {JSON.stringify(bot, null, 0)}
                  </pre>
                </div>
              ))}
            </div>
          </Card>

          <div className="flex items-center justify-between gap-4 mt-6">
            <div className="text-xs text-muted-foreground">
              total cost:{" "}
              <span className="text-primary font-semibold">
                ${plan.estimated_cost_usd.toFixed(2)} USDC
              </span>{" "}
              · pay {address ? `from ${address.slice(0, 4)}…${address.slice(-4)}` : "after connect"}
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStep("prompt")}>
                back
              </Button>
              <Button onClick={() => void handleSimulate()}>
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
                funding bot wallets via friendbot, deploying smart accounts, starting chassis loops…
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
