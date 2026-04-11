"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "../../components/ui";
import { WalletHierarchy } from "../../components/WalletHierarchy";
import { api } from "../../lib/apiClient";
import { walletApi } from "../../lib/walletApi";
import type { SessionSummary } from "@calypso/shared";

export default function WalletsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reseeding, setReseeding] = useState(false);
  const [reseedMsg, setReseedMsg] = useState<string | null>(null);

  async function handleReseed() {
    setReseeding(true);
    setReseedMsg(null);
    const result = await walletApi.reseed();
    if (result.ok) {
      setReseedMsg("topped up ✓");
      setTimeout(() => setReseedMsg(null), 4000);
    } else {
      setReseedMsg(`error: ${result.error}`);
      setTimeout(() => setReseedMsg(null), 8000);
    }
    setReseeding(false);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await api.listSessions();
        if (!alive) return;
        setSessions(res.sessions);
        // Auto-pick the first running session on first load.
        setSelectedSessionId((prev) => {
          if (prev) return prev;
          const running = res.sessions.find((s) => s.status === "running");
          return running?.session_id ?? res.sessions[0]?.session_id ?? null;
        });
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold">wallet hierarchy</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Calypso uses three tiers of Stellar accounts. You (via Freighter) pay Calypso&apos;s
          orchestrator in USDC through x402. The orchestrator creates ephemeral bot wallets per
          session — each with its own EOA and a Hoops smart account — and those bots route trades
          through the Hoops router across every DEX on testnet.
        </p>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <div className="text-xs text-destructive">api error: {error}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Is the API running on http://localhost:9990?
          </div>
        </Card>
      )}

      {/* Session picker */}
      {sessions.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                viewing session
              </div>
              <div className="text-sm font-mono text-primary mt-1">
                {selectedSessionId ?? "none"}
              </div>
            </div>
            <Link href="/simulate" className="text-xs text-primary hover:underline">
              + new session
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => setSelectedSessionId(s.session_id)}
                className={`px-3 py-1.5 rounded-full border text-xs font-mono transition-colors ${
                  selectedSessionId === s.session_id
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s.name} · {s.status}
              </button>
            ))}
          </div>
        </Card>
      )}

      <WalletHierarchy sessionId={selectedSessionId ?? undefined} />

      {/* Orchestrator top-up control */}
      <Card className="mt-4 border-[hsl(var(--warning)/0.35)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Top up orchestrator USDC</div>
            <div className="text-xs text-muted-foreground mt-1">
              Runs another {" "}
              <code className="text-primary">fundAccountXlm(9500) → swapXlmToUsdc(8500)</code> cycle on
              the platform wallet. Use when orchestrator USDC runs low from seeding bots.
            </div>
          </div>
          <div className="flex items-center gap-3">
            {reseedMsg && (
              <span className="text-xs text-muted-foreground">{reseedMsg}</span>
            )}
            <Button onClick={() => void handleReseed()} disabled={reseeding}>
              {reseeding ? "topping up…" : "top up"}
            </Button>
          </div>
        </div>
      </Card>

      {sessions.length === 0 && !error && (
        <Card className="mt-4">
          <div className="text-sm text-muted-foreground">
            No sessions yet — just your wallet and the orchestrator above.{" "}
            <Link href="/simulate" className="text-primary hover:underline">
              launch one
            </Link>{" "}
            to populate the bot tier.
          </div>
        </Card>
      )}

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <LegendCard
          tone="primary"
          label="USER"
          desc="Your Freighter wallet. Funds Calypso with USDC via x402. Receives nothing back — this is pure simulation access."
        />
        <LegendCard
          tone="warning"
          label="ORCHESTRATOR"
          desc="Calypso's PAY_TO wallet (friendbot-funded on testnet). Collects x402 fees, creates bot wallets, seeds them with XLM + USDC."
        />
        <LegendCard
          tone="default"
          label="BOT"
          desc="Each bot has an EOA keypair + a Hoops smart account. The EOA signs; the smart account holds funds and routes swaps through the Hoops router."
        />
      </div>
    </div>
  );
}

function LegendCard({
  tone,
  label,
  desc,
}: {
  tone: "primary" | "warning" | "default";
  label: string;
  desc: string;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-[hsl(var(--warning))]"
        : "text-muted-foreground";
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Badge tone={tone === "default" ? "default" : tone}>{label}</Badge>
      </div>
      <p className={`text-xs leading-relaxed ${toneClass === "text-muted-foreground" ? "text-muted-foreground" : "text-muted-foreground"}`}>
        {desc}
      </p>
    </Card>
  );
}
