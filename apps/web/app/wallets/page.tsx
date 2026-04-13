"use client";

/**
 * /wallets — the agent money-flow control panel.
 *
 * The Calypso Agent is the star. User's Freighter wallet is shown as
 * a secondary tier that connects only to fund the agent or receive
 * withdrawals. The API revenue sink is shown on the sticky side rail
 * inside FlowDiagram.
 *
 * Actions:
 *   - Get testnet USDC   (admin mint → Freighter address)
 *   - Fund Agent         (admin mint → Agent address, testnet shim)
 *   - Withdraw from Agent (POST /agent/withdraw → Freighter address)
 *
 * Note: "Fund Agent" on mainnet would be a Freighter-signed USDC
 * transfer from the user's wallet to the agent's G-address. On testnet
 * the admin-mint shim avoids the Freighter popup and makes the demo
 * frictionless. We label it that way in the card copy.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlowDiagram } from "../../components/FlowDiagram";
import { useWallet } from "../../components/WalletProvider";
import {
  agent,
  admin,
  tx as txApi,
  shortAddr,
  type AgentStatus,
} from "../../lib/apiClient";
import type { SessionSummary } from "@calypso/shared";

export default function WalletsPage() {
  const { address: freighterAddr, connected, fundFromFriendbot, signXdr } = useWallet();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Action card state
  const [mint, setMint] = useState<ActionState>({ amount: "100" });
  const [fund, setFund] = useState<ActionState>({ amount: "20" });
  const [withdraw, setWithdraw] = useState<ActionState>({ amount: "5" });
  const [quickFund, setQuickFund] = useState<ActionState>({ amount: "50" });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [st, list] = await Promise.all([agent.status(), agent.listSessions()]);
        if (!alive) return;
        setAgentStatus(st);
        setSessions(list.sessions);
        setSelectedSessionId((prev) => {
          if (prev) return prev;
          const running = list.sessions.find((s) => s.status === "running");
          return running?.session_id ?? list.sessions[0]?.session_id ?? null;
        });
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function handleMintToFreighter() {
    if (!freighterAddr) {
      setMint((s) => ({ ...s, message: "connect freighter first", error: true }));
      return;
    }
    const amount = Number(mint.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMint((s) => ({ ...s, message: "invalid amount", error: true }));
      return;
    }
    setMint((s) => ({ ...s, busy: true, message: undefined, error: false }));
    try {
      const res = await admin.mintUsdc(freighterAddr, amount);
      setMint((s) => ({
        ...s,
        busy: false,
        message: `minted ${amount} USDC · tx ${res.tx.slice(0, 10)}…`,
        error: false,
      }));
    } catch (err) {
      setMint((s) => ({
        ...s,
        busy: false,
        message: err instanceof Error ? err.message : String(err),
        error: true,
      }));
    }
  }

  async function handleFundAgent() {
    if (!agentStatus?.address) return;
    if (!connected || !freighterAddr) {
      setFund((s) => ({ ...s, message: "connect freighter first", error: true }));
      return;
    }
    const amount = Number(fund.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFund((s) => ({ ...s, message: "invalid amount", error: true }));
      return;
    }
    setFund((s) => ({ ...s, busy: true, message: undefined, error: false }));
    try {
      // Real on-chain flow:
      //   1. API builds + prepares the USDC transfer tx (user → agent)
      //   2. Freighter signs the XDR (source-account auth covers the
      //      Soroban contract call since source === from)
      //   3. API submits + waits for confirmation
      setFund((s) => ({ ...s, message: "building tx…", error: false }));
      const built = await txApi.buildFundAgent(freighterAddr, amount);

      setFund((s) => ({ ...s, message: "waiting for freighter signature…", error: false }));
      const signedXdr = await signXdr(built.xdr);

      setFund((s) => ({ ...s, message: "submitting to stellar…", error: false }));
      const submitted = await txApi.submit(signedXdr);

      setFund((s) => ({
        ...s,
        busy: false,
        message: `sent ${amount} USDC → agent · tx ${submitted.hash.slice(0, 10)}…`,
        error: false,
      }));
    } catch (err) {
      setFund((s) => ({
        ...s,
        busy: false,
        message: err instanceof Error ? err.message : String(err),
        error: true,
      }));
    }
  }

  async function handleQuickFundAgent() {
    if (!agentStatus?.address) return;
    const amount = Number(quickFund.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setQuickFund((s) => ({ ...s, message: "invalid amount", error: true }));
      return;
    }
    setQuickFund((s) => ({ ...s, busy: true, message: undefined, error: false }));
    try {
      const res = await admin.mintUsdc(agentStatus.address, amount);
      setQuickFund((s) => ({
        ...s,
        busy: false,
        message: `minted ${amount} USDC to agent · tx ${res.tx.slice(0, 10)}…`,
        error: false,
      }));
    } catch (err) {
      setQuickFund((s) => ({
        ...s,
        busy: false,
        message: err instanceof Error ? err.message : String(err),
        error: true,
      }));
    }
  }

  async function handleWithdraw() {
    if (!freighterAddr) {
      setWithdraw((s) => ({
        ...s,
        message: "connect freighter to set a destination",
        error: true,
      }));
      return;
    }
    const amount = Number(withdraw.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdraw((s) => ({ ...s, message: "invalid amount", error: true }));
      return;
    }
    setWithdraw((s) => ({ ...s, busy: true, message: undefined, error: false }));
    try {
      const res = await agent.withdraw(freighterAddr, amount);
      setWithdraw((s) => ({
        ...s,
        busy: false,
        message: `withdrew ${amount} USDC → ${shortAddr(freighterAddr)} · tx ${res.tx.slice(0, 10)}…`,
        error: false,
      }));
    } catch (err) {
      setWithdraw((s) => ({
        ...s,
        busy: false,
        message: err instanceof Error ? err.message : String(err),
        error: true,
      }));
    }
  }

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-10">
      {/* HEADER */}
      <div className="mb-10 pb-5 border-b border-border flex items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="ship-mark">money flow control</span>
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-semibold text-paper tracking-tight leading-[0.95]">
            Agent Treasury
          </h1>
          <p className="mt-3 text-muted-foreground max-w-[680px] leading-relaxed">
            The Calypso Agent is the x402 payer. It holds its own USDC, signs
            every payment, and redistributes funds to bots on session launch.
            Use this panel to top it up, withdraw from it, or mint testnet USDC
            to your own Freighter wallet.
          </p>
        </div>
        <Link
          href="/simulate"
          className="font-mono text-[10px] uppercase tracking-[0.18em] px-4 py-3 border-2 border-primary bg-primary/10 hover:bg-primary/20 text-primary"
        >
          + new session
        </Link>
      </div>

      {error && (
        <div className="mb-6 border border-destructive/40 bg-destructive/5 p-5 corner-marks">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-destructive mb-2">
            connection error
          </div>
          <div className="font-mono text-xs text-destructive/80">{error}</div>
          <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            Make sure the API is running: <code className="font-mono text-primary bg-primary/10 px-1">pnpm dev:api</code> on port 9990.
            The agent wallet auto-initializes on first boot (friendbot + USDC top-up).
          </div>
        </div>
      )}

      {/* AGENT STATUS — always visible, shows readiness + balance */}
      {agentStatus && (
        <div className="mb-6 border border-border-strong bg-card/60 corner-marks">
          <div className="hazard-stripes h-1 w-full" aria-hidden />
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] shadow-[0_0_10px_hsl(var(--success))]" />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  calypso agent · {agentStatus.ready ? "ready" : "initializing"}
                </div>
                <div className="font-mono text-sm text-foreground mt-0.5">
                  {agentStatus.address}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">USDC</div>
                <div className="font-mono text-2xl font-bold tabular-nums text-primary">
                  {(Number(agentStatus.balances.usdc) / 10_000_000).toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">XLM</div>
                <div className="font-mono text-lg tabular-nums text-foreground">
                  {(Number(agentStatus.balances.xlm) / 10_000_000).toFixed(0)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">sessions</div>
                <div className="font-mono text-lg tabular-nums text-foreground">
                  {agentStatus.sessions}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SESSION SELECTOR — so the flow diagram can focus */}
      {sessions.length > 0 && (
        <div className="mb-6 border border-border bg-card/50 corner-marks p-4">
          <div className="flex items-center justify-between mb-3 gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                viewing session
              </div>
              <div className="font-mono text-sm text-primary mt-1">
                {selectedSessionId ?? "none"}
              </div>
            </div>
            <button
              onClick={() => setSelectedSessionId(null)}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              type="button"
            >
              clear
            </button>
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

      {/* FLOW DIAGRAM — the visceral centerpiece */}
      <section className="mb-12">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          A · live flow of funds
        </div>
        <FlowDiagram sessionId={selectedSessionId ?? undefined} />
      </section>

      {/* ACTION CARDS */}
      <section>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          B · money movement
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <ActionCard
            step="00"
            title="Quick Fund Agent"
            subtitle="testnet · no wallet needed"
            body="Mint testnet USDC directly to the Calypso Agent. No Freighter connection required. This is the fastest way to get the agent funded and ready to run simulations."
            disabled={!agentStatus}
            disabledReason="waiting for agent to initialize"
            tone="primary"
            amount={quickFund.amount}
            setAmount={(v) => setQuickFund({ ...quickFund, amount: v })}
            busy={quickFund.busy}
            message={quickFund.message}
            messageIsError={quickFund.error}
            onClick={handleQuickFundAgent}
            buttonLabel="mint to agent"
            footer={agentStatus ? `to · ${shortAddr(agentStatus.address)}` : undefined}
          />

          <ActionCard
            step="03"
            title="Withdraw from Agent"
            subtitle="agent → you"
            body="Pull USDC out of the Calypso Agent wallet back to your Freighter address. The agent signs and submits the Soroban token transfer itself — no user signature required."
            disabled={!connected}
            disabledReason="connect freighter as destination"
            tone="info"
            amount={withdraw.amount}
            setAmount={(v) => setWithdraw({ ...withdraw, amount: v })}
            busy={withdraw.busy}
            message={withdraw.message}
            messageIsError={withdraw.error}
            onClick={handleWithdraw}
            buttonLabel="withdraw"
            footer={connected ? `to · ${shortAddr(freighterAddr)}` : undefined}
          />
        </div>

        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
          C · freighter wallet actions
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ActionCard
            step="01"
            title="Mint testnet USDC"
            subtitle="to your freighter"
            body="Get USDC into your Freighter wallet. Testnet shim via the admin mint key (Calypso owns the USDC contract on Hoops testnet)."
            disabled={!connected}
            disabledReason="connect freighter first"
            tone="primary"
            amount={mint.amount}
            setAmount={(v) => setMint({ ...mint, amount: v })}
            busy={mint.busy}
            message={mint.message}
            messageIsError={mint.error}
            onClick={handleMintToFreighter}
            buttonLabel="mint to freighter"
            footer={connected ? `to · ${shortAddr(freighterAddr)}` : undefined}
          />

          <ActionCard
            step="02"
            title="Fund Agent"
            subtitle="freighter → agent · real on-chain"
            body="Send USDC from your Freighter wallet to the Calypso Agent via a real Soroban contract-call transfer. Server builds the XDR, Freighter signs, the tx lands on Stellar testnet."
            disabled={!connected || !agentStatus}
            disabledReason="connect freighter first"
            tone="warning"
            amount={fund.amount}
            setAmount={(v) => setFund({ ...fund, amount: v })}
            busy={fund.busy}
            message={fund.message}
            messageIsError={fund.error}
            onClick={handleFundAgent}
            buttonLabel="sign & send"
            footer={agentStatus ? `to · ${shortAddr(agentStatus.address)}` : undefined}
          />

        </div>
      </section>

      {/* FREIGHTER BLOCK — expanded info for connected users */}
      {connected && (
        <section className="mt-12 border-t border-border pt-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                linked freighter account
              </div>
              <div className="font-mono text-sm mt-1 text-foreground break-all max-w-[720px]">
                {freighterAddr}
              </div>
            </div>
            <button
              onClick={() => void fundFromFriendbot()}
              type="button"
              className="font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-2 border border-border hover:border-primary/60 text-muted-foreground hover:text-foreground"
            >
              friendbot XLM →
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground max-w-[720px] leading-relaxed">
            Calypso never uses this address to pay x402. It exists only as an
            on/off ramp: use action cards above to push USDC in (fund the
            agent) or pull it out (withdraw).
          </p>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ActionState {
  amount: string;
  busy?: boolean;
  message?: string;
  error?: boolean;
}

function ActionCard({
  step,
  title,
  subtitle,
  body,
  amount,
  setAmount,
  busy,
  message,
  messageIsError,
  onClick,
  buttonLabel,
  footer,
  disabled,
  disabledReason,
  tone,
}: {
  step: string;
  title: string;
  subtitle: string;
  body: string;
  amount: string;
  setAmount: (v: string) => void;
  busy?: boolean;
  message?: string;
  messageIsError?: boolean;
  onClick: () => void;
  buttonLabel: string;
  footer?: string;
  disabled?: boolean;
  disabledReason?: string;
  tone: "primary" | "warning" | "info";
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

      <div className="flex items-baseline justify-between">
        <div className="font-display text-2xl font-semibold text-paper mt-1">{title}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          {subtitle}
        </div>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed flex-1">{body}</div>

      <div className="mt-5 flex items-center gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-background/60 border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary/60 disabled:opacity-50"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          USDC
        </span>
      </div>

      <button
        onClick={onClick}
        disabled={busy || disabled}
        type="button"
        className={`mt-3 px-3 py-2.5 border-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${buttonClass}`}
      >
        {busy ? "working…" : disabled && disabledReason ? disabledReason : buttonLabel}
      </button>

      {footer && (
        <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground break-all">
          {footer}
        </div>
      )}
      {message && (
        <div
          className={`mt-3 font-mono text-[10px] break-words ${
            messageIsError ? "text-destructive" : "text-[hsl(var(--success))]"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
