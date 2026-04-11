"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Input } from "../../components/ui";
import { WalletHierarchy } from "../../components/WalletHierarchy";
import { useWallet } from "../../components/WalletProvider";
import { api } from "../../lib/apiClient";
import { walletApi } from "../../lib/walletApi";
import type { SessionSummary } from "@calypso/shared";

export default function WalletsPage() {
  const { address: userAddr, connected } = useWallet();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mintAmount, setMintAmount] = useState("100");
  const [minting, setMinting] = useState(false);
  const [mintMsg, setMintMsg] = useState<string | null>(null);

  const [fundAmount, setFundAmount] = useState("10");
  const [funding, setFunding] = useState(false);
  const [fundMsg, setFundMsg] = useState<string | null>(null);

  async function handleMintToMe() {
    if (!userAddr) {
      setMintMsg("connect Freighter first");
      setTimeout(() => setMintMsg(null), 4000);
      return;
    }
    const amount = Number(mintAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMintMsg("invalid amount");
      return;
    }
    setMinting(true);
    setMintMsg(null);
    const result = await walletApi.mintUsdcToAddress(userAddr, amount);
    if (result.ok) {
      setMintMsg(`✓ minted ${amount} USDC to your wallet`);
      setTimeout(() => setMintMsg(null), 4000);
    } else {
      setMintMsg(`error: ${result.error}`);
      setTimeout(() => setMintMsg(null), 8000);
    }
    setMinting(false);
  }

  async function handleFundCalypso() {
    const amount = Number(fundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFundMsg("invalid amount");
      return;
    }
    setFunding(true);
    setFundMsg(null);
    const result = await walletApi.topUp(amount);
    if (result.ok) {
      setFundMsg(`✓ orchestrator topped up with ${amount} USDC`);
      setTimeout(() => setFundMsg(null), 4000);
    } else {
      setFundMsg(`error: ${result.error}`);
      setTimeout(() => setFundMsg(null), 8000);
    }
    setFunding(false);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await api.listSessions();
        if (!alive) return;
        setSessions(res.sessions);
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
          Three tiers of Stellar accounts. You fund Calypso&apos;s orchestrator with USDC (via x402
          in production; via admin mint on testnet). The orchestrator holds working capital and
          distributes XLM + USDC to each bot wallet at session launch.
        </p>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40">
          <div className="text-xs text-destructive">api error: {error}</div>
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

      {/* Admin actions */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mint USDC to user */}
        <Card className="border-primary/40">
          <div className="mb-3">
            <div className="text-sm font-semibold">1. Mint test USDC to your wallet</div>
            <div className="text-xs text-muted-foreground mt-1">
              Testnet shim for &quot;user has money&quot;. Uses the USDC admin key to mint directly
              to your connected Freighter address.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">USDC</span>
            <Button onClick={() => void handleMintToMe()} disabled={minting || !connected}>
              {minting ? "minting…" : "mint →"}
            </Button>
          </div>
          {!connected && (
            <div className="text-[11px] text-muted-foreground mt-2">connect Freighter first</div>
          )}
          {mintMsg && <div className="text-xs mt-2 text-muted-foreground">{mintMsg}</div>}
        </Card>

        {/* Fund orchestrator */}
        <Card className="border-[hsl(var(--warning)/0.4)]">
          <div className="mb-3">
            <div className="text-sm font-semibold">2. Fund Calypso Orchestrator</div>
            <div className="text-xs text-muted-foreground mt-1">
              Conscious UX action: give Calypso working capital so it can distribute USDC to bot
              wallets when you launch sessions. In production this is an x402 payment; on testnet
              it&apos;s an admin mint to the orchestrator smart account.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">USDC</span>
            <Button onClick={() => void handleFundCalypso()} disabled={funding}>
              {funding ? "funding…" : "fund →"}
            </Button>
          </div>
          {fundMsg && <div className="text-xs mt-2 text-muted-foreground">{fundMsg}</div>}
        </Card>
      </div>

      {sessions.length === 0 && !error && (
        <Card className="mt-6">
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
          desc="Your Freighter wallet. Gets test XLM from friendbot and test USDC via the mint button above. Funds Calypso by topping up the orchestrator."
        />
        <LegendCard
          tone="warning"
          label="ORCHESTRATOR"
          desc="Calypso's platform wallet. Holds USDC you funded it with. On session launch, distributes USDC to each bot's smart account based on the session plan."
        />
        <LegendCard
          tone="default"
          label="BOT"
          desc="Each bot has an EOA keypair + a Hoops smart account. Receives XLM from friendbot and USDC from the orchestrator. Trades through the Hoops router."
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
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Badge tone={tone === "default" ? "default" : tone}>{label}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </Card>
  );
}
