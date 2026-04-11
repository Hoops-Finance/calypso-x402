"use client";

/**
 * FlowDiagram — the visceral three-tier money flow diagram used on
 * /sessions/[id] and /wallets. Shows:
 *
 *   USER                  (your session wallet)
 *     │ ← LED dots travel here when plan/simulate pay via x402
 *   ORCHESTRATOR          (Calypso PAY_TO)
 *     │ ← LED dots travel here on bot creation
 *   BOTS                  (session bot smart accounts)
 *     │
 *   DEXes                 (Soroswap / Phoenix / Aqua / Comet)
 *
 * Visual language:
 *   - each tier is a heavy card with corner marks (blueprint feel)
 *   - flow rails between tiers carry LED dots (pure CSS keyframe)
 *   - live balances pulse when they change (detected via refs)
 *   - paper-cream display face for tier labels, industrial mono for values
 */

import { useEffect, useRef, useState } from "react";
import { useWallet } from "./WalletProvider";
import { useSessionWallet } from "./SessionWalletProvider";
import { walletApi, fmtStroops, shortAddr } from "../lib/walletApi";
import type {
  PlatformWallet,
  SessionWalletsResponse,
  RawBalances,
} from "../lib/walletApi";

export interface FlowDiagramProps {
  sessionId?: string;
  pollMs?: number;
}

export function FlowDiagram({ sessionId, pollMs = 4000 }: FlowDiagramProps) {
  const { address: freighterAddr, connected } = useWallet();
  const {
    publicKey: sessionWalletKey,
    balances: sessionBalances,
    status: sessionStatus,
  } = useSessionWallet();

  const [platform, setPlatform] = useState<PlatformWallet | null>(null);
  const [sessionWallets, setSessionWallets] = useState<SessionWalletsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const pPlat = walletApi.platform();
        const pSess = sessionId ? walletApi.session(sessionId) : Promise.resolve(null);
        const [plat, sess] = await Promise.all([pPlat, pSess]);
        if (!alive) return;
        setPlatform(plat);
        setSessionWallets(sess);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sessionId, pollMs]);

  return (
    <div className="relative">
      {error && (
        <div className="mb-3 font-mono text-[11px] text-destructive">
          FEED ERROR · {error}
        </div>
      )}

      <div className="space-y-0">
        {/* TIER 1 — Session Wallet */}
        <Tier
          index="01"
          label="Session Wallet"
          sublabel={`browser keypair · ${sessionStatus}`}
          role="user"
          address={sessionWalletKey}
          balances={sessionBalances}
          note="The throwaway Stellar keypair created by your browser on first visit. Persistent via localStorage. This is what actually signs x402 auth entries for /plan /simulate /analyze."
        />
        <Rail label="pays USDC via x402 · real on-chain settlement" />

        {/* TIER 2 — Orchestrator */}
        <Tier
          index="02"
          label="Calypso Orchestrator"
          sublabel="platform revenue wallet"
          role="orchestrator"
          address={platform?.address ?? null}
          balances={platform?.balances ?? null}
          note="Calypso's platform smart account. Receives x402 fees, holds working capital, distributes USDC to bot wallets on session launch."
        />

        {sessionId && (
          <>
            <Rail label="transfers XLM + USDC to bot wallets per session plan" />
            {/* TIER 3 — Session bots */}
            <SessionBots data={sessionWallets} />
            {sessionWallets && sessionWallets.bots.length > 0 && (
              <>
                <Rail label="routes swaps through Hoops router" />
                <DexVenue />
              </>
            )}
          </>
        )}
      </div>

      {/* Secondary: Freighter wallet row, shown if connected */}
      {connected && (
        <div className="mt-6 border border-dashed border-border-strong p-3 flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground font-mono">
              linked freighter account · optional
            </div>
            <div className="font-mono text-xs text-foreground mt-1">{shortAddr(freighterAddr)}</div>
          </div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
            not used for payments
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Role = "user" | "orchestrator" | "bot";

function Tier({
  index,
  label,
  sublabel,
  role,
  address,
  balances,
  note,
}: {
  index: string;
  label: string;
  sublabel?: string;
  role: Role;
  address: string | null;
  balances: RawBalances | null;
  note?: string;
}) {
  const theme = roleTheme(role);
  return (
    <div
      className={`relative border ${theme.border} ${theme.bg} p-5 corner-marks`}
      style={{ borderStyle: "solid" }}
    >
      {/* Index tag in top-left */}
      <div
        className={`absolute -top-2 left-5 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.22em] uppercase ${theme.tagBg}`}
      >
        TIER {index}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`font-display text-2xl md:text-3xl font-semibold leading-none ${theme.text}`}>
            {label}
          </div>
          {sublabel && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {sublabel}
            </div>
          )}
          <div className="mt-2 font-mono text-[10px] text-muted-foreground break-all" title={address ?? ""}>
            {address ? shortAddr(address) : "—"}
          </div>
          {note && (
            <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed max-w-[380px]">
              {note}
            </div>
          )}
        </div>
        <BalancePair balances={balances} />
      </div>
    </div>
  );
}

function roleTheme(role: Role): {
  border: string;
  bg: string;
  text: string;
  tagBg: string;
} {
  switch (role) {
    case "user":
      return {
        border: "border-primary/40",
        bg: "bg-gradient-to-br from-primary/5 to-card/60 backdrop-blur",
        text: "text-paper",
        tagBg: "bg-primary text-primary-foreground",
      };
    case "orchestrator":
      return {
        border: "border-[hsl(var(--warning)/0.4)]",
        bg: "bg-gradient-to-br from-[hsl(var(--warning)/0.06)] to-card/60 backdrop-blur",
        text: "text-paper",
        tagBg: "bg-[hsl(var(--warning))] text-primary-foreground",
      };
    case "bot":
      return {
        border: "border-border-strong",
        bg: "bg-card/70 backdrop-blur",
        text: "text-foreground",
        tagBg: "bg-border-strong text-foreground",
      };
  }
}

function BalancePair({ balances }: { balances: RawBalances | null }) {
  const xlm = balances ? fmtStroops(balances.xlm) : "—";
  const usdc = balances ? fmtStroops(balances.usdc) : "—";
  return (
    <div className="flex items-start gap-6 shrink-0">
      <div className="text-right">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          XLM
        </div>
        <div className="font-mono text-2xl md:text-3xl font-semibold text-foreground tabular-nums tracking-tight">
          {xlm}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
          USDC
        </div>
        <div className="font-mono text-2xl md:text-3xl font-semibold text-primary tabular-nums tracking-tight">
          {usdc}
        </div>
      </div>
    </div>
  );
}

function Rail({ label }: { label: string }) {
  return (
    <div className="relative my-0 pl-12 pr-4" style={{ height: 60 }}>
      <div className="absolute left-10 top-0 bottom-0 flow-rail">
        <div className="flow-dot" />
        <div className="flow-dot delay-1" />
        <div className="flow-dot delay-2" />
        <div className="flow-dot delay-3" />
      </div>
      <div className="flex items-center h-full pl-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

function SessionBots({ data }: { data: SessionWalletsResponse | null }) {
  if (!data) {
    return (
      <div className="border border-border-strong bg-card/70 p-5 corner-marks">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
          tier 03 · bot wallets
        </div>
        <div className="mt-2 text-sm text-muted-foreground">no session loaded</div>
      </div>
    );
  }

  return (
    <div className="relative border border-border-strong bg-card/60 backdrop-blur p-5 corner-marks">
      <div className="absolute -top-2 left-5 px-2 py-0.5 bg-border-strong text-foreground font-mono text-[9px] font-bold tracking-[0.22em] uppercase">
        TIER 03
      </div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="font-display text-2xl md:text-3xl font-semibold leading-none text-paper">
            Bot Swarm
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {data.session_name} · {data.bots.length} bots
          </div>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          ephemeral · per-session
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.bots.map((bot) => (
          <BotCard key={bot.bot_id} bot={bot} />
        ))}
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: SessionWalletsResponse["bots"][number] }) {
  const eoaXlm = fmtStroops(bot.eoa.balances.xlm);
  const eoaUsdc = fmtStroops(bot.eoa.balances.usdc);
  const sXlm = fmtStroops(bot.smart_account.balances.xlm);
  const sUsdc = fmtStroops(bot.smart_account.balances.usdc);

  return (
    <div className="relative border border-border bg-background/60 p-4 group hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-mono text-sm font-semibold text-primary">{bot.bot_id}</div>
          <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
            {bot.archetype}
          </div>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
          {shortAddr(bot.smart_account.address)}
        </div>
      </div>

      {/* Smart account balances — primary */}
      <div className="mb-2 pb-2 border-b border-border/50">
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
          smart account
        </div>
        <div className="flex items-baseline justify-between font-mono text-xs">
          <span>
            <span className="text-muted-foreground text-[9px]">XLM </span>
            {sXlm}
          </span>
          <span className="text-primary">
            <span className="text-muted-foreground text-[9px]">USDC </span>
            {sUsdc}
          </span>
        </div>
      </div>

      {/* EOA row — secondary */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
          eoa · {shortAddr(bot.eoa.address)}
        </div>
        <div className="flex items-baseline justify-between font-mono text-[11px] text-muted-foreground">
          <span>XLM {eoaXlm}</span>
          <span>USDC {eoaUsdc}</span>
        </div>
      </div>
    </div>
  );
}

function DexVenue() {
  const venues = [
    { id: "soroswap", name: "Soroswap" },
    { id: "phoenix", name: "Phoenix" },
    { id: "aqua", name: "Aqua" },
    { id: "comet", name: "Comet" },
  ];
  return (
    <div className="relative border border-dashed border-primary/40 p-5 bg-primary/[0.03]">
      <div className="absolute -top-2 left-5 px-2 py-0.5 bg-primary/20 text-primary font-mono text-[9px] font-bold tracking-[0.22em] uppercase">
        VENUES
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-display text-xl font-semibold text-paper">
            Stellar testnet DEXes
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            reached via Hoops router
          </div>
        </div>
        <div className="flex items-center gap-2">
          {venues.map((v) => (
            <div
              key={v.id}
              className="px-3 py-1.5 border border-border font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
            >
              {v.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
