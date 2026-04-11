"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlowDiagram } from "../../components/FlowDiagram";
import { useWallet } from "../../components/WalletProvider";
import { useSessionWallet } from "../../components/SessionWalletProvider";
import { api } from "../../lib/apiClient";
import { walletApi, shortAddr } from "../../lib/walletApi";
import type { SessionSummary } from "@calypso/shared";

export default function WalletsPage() {
  const { address: freighterAddr, connected } = useWallet();
  const {
    publicKey: sessionWalletKey,
    refresh: refreshSession,
  } = useSessionWallet();

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mintAmount, setMintAmount] = useState("100");
  const [minting, setMinting] = useState(false);
  const [mintMsg, setMintMsg] = useState<string | null>(null);

  const [fundAmount, setFundAmount] = useState("10");
  const [funding, setFunding] = useState(false);
  const [fundMsg, setFundMsg] = useState<string | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState("5");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);

  async function handleMintToSessionWallet() {
    const amount = Number(mintAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMintMsg("invalid amount");
      return;
    }
    setMinting(true);
    setMintMsg(null);
    const result = await walletApi.mintUsdcToAddress(sessionWalletKey, amount);
    if (result.ok) {
      setMintMsg(`minted ${amount} USDC · tx ${result.tx.slice(0, 10)}…`);
      await refreshSession();
      setTimeout(() => setMintMsg(null), 5000);
    } else {
      setMintMsg(`error · ${result.error}`);
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
      setFundMsg(`orchestrator topped up with ${amount} USDC`);
      setTimeout(() => setFundMsg(null), 5000);
    } else {
      setFundMsg(`error · ${result.error}`);
      setTimeout(() => setFundMsg(null), 8000);
    }
    setFunding(false);
  }

  async function handleWithdraw() {
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawMsg("invalid amount");
      return;
    }
    const to = freighterAddr || sessionWalletKey;
    if (!to) {
      setWithdrawMsg("no destination address");
      return;
    }
    setWithdrawing(true);
    setWithdrawMsg(null);
    const result = await walletApi.withdraw(to, amount);
    if (result.ok) {
      setWithdrawMsg(`withdrew ${amount} USDC to ${shortAddr(to)} · tx ${result.tx.slice(0, 10)}…`);
      setTimeout(() => setWithdrawMsg(null), 6000);
    } else {
      setWithdrawMsg(`error · ${result.error}`);
      setTimeout(() => setWithdrawMsg(null), 8000);
    }
    setWithdrawing(false);
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
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <div className="mb-10 pb-5 border-b border-border flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="ship-mark">money flow control</span>
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-semibold text-paper tracking-tight leading-[0.95]">
            Wallet Hierarchy
          </h1>
          <p className="mt-3 text-muted-foreground max-w-[680px] leading-relaxed">
            Three tiers of Stellar accounts. Your browser&apos;s session wallet pays
            Calypso via x402 — every payment settles on-chain through the
            facilitator. The orchestrator holds working capital and distributes
            XLM + USDC to each bot wallet on session launch.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 border border-destructive/40 p-4 font-mono text-xs text-destructive">
          API ERROR · {error}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="mb-6 border border-border bg-card/50 corner-marks p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                viewing session
              </div>
              <div className="font-mono text-sm text-primary mt-1">
                {selectedSessionId ?? "none"}
              </div>
            </div>
            <Link
              href="/simulate"
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline"
            >
              + new session
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => setSelectedSessionId(s.session_id)}
                className={`px-3 py-1.5 border text-[10px] font-mono uppercase tracking-[0.15em] transition-colors ${
                  selectedSessionId === s.session_id
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
                type="button"
              >
                {s.name} · {s.status}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="mb-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          A · live flow of funds
        </div>
        <FlowDiagram sessionId={selectedSessionId ?? undefined} />
      </section>

      <section>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          B · money movement controls
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            step="01"
            title="Mint test USDC"
            body="Admin-mints USDC to your browser session wallet. Testnet shim for 'user has money'. In production this would be a real USDC on-ramp."
            amount={mintAmount}
            setAmount={setMintAmount}
            buttonLabel={minting ? "minting…" : "mint to session wallet"}
            onClick={handleMintToSessionWallet}
            busy={minting}
            message={mintMsg}
            footer={`to · ${shortAddr(sessionWalletKey)}`}
          />

          <ActionCard
            step="02"
            title="Fund Calypso"
            body="Top up the orchestrator. In production: real x402 payment flowing in from users. On testnet: admin mint to the orchestrator smart account."
            amount={fundAmount}
            setAmount={setFundAmount}
            buttonLabel={funding ? "funding…" : "fund orchestrator"}
            onClick={handleFundCalypso}
            busy={funding}
            message={fundMsg}
            tone="warning"
          />

          <ActionCard
            step="03"
            title="Withdraw from Calypso"
            body="Pull remaining USDC from the orchestrator back to your Freighter wallet (if connected) or your session wallet."
            amount={withdrawAmount}
            setAmount={setWithdrawAmount}
            buttonLabel={withdrawing ? "withdrawing…" : "withdraw"}
            onClick={handleWithdraw}
            busy={withdrawing}
            message={withdrawMsg}
            tone="info"
            footer={`to · ${connected ? shortAddr(freighterAddr) : shortAddr(sessionWalletKey)}`}
          />
        </div>
      </section>

      <section className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <Legend label="USER" tone="primary">
          Your browser&apos;s session wallet. Ed25519 keypair persisted in localStorage.
          Gets XLM from friendbot and test USDC via admin mint. Signs every x402
          payment for /plan /simulate /analyze.
        </Legend>
        <Legend label="ORCHESTRATOR" tone="warning">
          Calypso&apos;s platform smart account. Receives x402 fees from the session
          wallet. Holds working capital. Distributes XLM + USDC to each bot wallet
          at session launch based on the session plan.
        </Legend>
        <Legend label="BOT" tone="default">
          Each bot has an EOA keypair + a Hoops smart account. Receives XLM from
          friendbot and USDC from the orchestrator. Trades through the Hoops router
          across Soroswap, Phoenix, Aqua, Comet.
        </Legend>
      </section>

      {connected && (
        <div className="mt-10 border-t border-border pt-6">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              linked freighter account
            </div>
            <div className="font-mono text-xs mt-1 text-foreground break-all">
              {freighterAddr}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Not used for x402 payments. Used as a withdrawal destination and for
              general testnet interaction.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  step,
  title,
  body,
  amount,
  setAmount,
  buttonLabel,
  onClick,
  busy,
  message,
  tone = "primary",
  footer,
}: {
  step: string;
  title: string;
  body: string;
  amount: string;
  setAmount: (v: string) => void;
  buttonLabel: string;
  onClick: () => void;
  busy: boolean;
  message: string | null;
  tone?: "primary" | "warning" | "info";
  footer?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "border-[hsl(var(--warning)/0.5)]"
      : tone === "info"
        ? "border-[hsl(var(--info)/0.5)]"
        : "border-primary/50";
  const tagBg =
    tone === "warning"
      ? "bg-[hsl(var(--warning))] text-primary-foreground"
      : tone === "info"
        ? "bg-[hsl(var(--info))] text-primary-foreground"
        : "bg-primary text-primary-foreground";
  const buttonClass =
    tone === "warning"
      ? "border-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)] hover:bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--warning))]"
      : tone === "info"
        ? "border-[hsl(var(--info))] bg-[hsl(var(--info)/0.1)] hover:bg-[hsl(var(--info)/0.2)] text-[hsl(var(--info))]"
        : "border-primary bg-primary/10 hover:bg-primary/20 text-primary";

  return (
    <div className={`relative border ${toneClass} bg-card/60 corner-marks p-5 flex flex-col`}>
      <div
        className={`absolute -top-2 left-5 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] ${tagBg}`}
      >
        STEP {step}
      </div>
      <div className="font-display text-2xl font-semibold text-paper mt-1">{title}</div>
      <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed flex-1">{body}</div>

      <div className="mt-5 flex items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          USDC
        </span>
      </div>

      <button
        onClick={onClick}
        disabled={busy}
        type="button"
        className={`mt-3 px-3 py-2.5 border-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${buttonClass}`}
      >
        {buttonLabel}
      </button>

      {footer && (
        <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground break-all">
          {footer}
        </div>
      )}
      {message && (
        <div className="mt-3 font-mono text-[10px] text-muted-foreground break-words">{message}</div>
      )}
    </div>
  );
}

function Legend({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "primary" | "warning" | "default";
  children: React.ReactNode;
}) {
  const theme =
    tone === "primary"
      ? "border-primary/40"
      : tone === "warning"
        ? "border-[hsl(var(--warning)/0.4)]"
        : "border-border";
  const tagBg =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "warning"
        ? "bg-[hsl(var(--warning))] text-primary-foreground"
        : "bg-border-strong text-foreground";
  return (
    <div className={`relative border ${theme} bg-card/40 p-5 corner-marks`}>
      <div
        className={`absolute -top-2 left-5 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] ${tagBg}`}
      >
        {label}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
