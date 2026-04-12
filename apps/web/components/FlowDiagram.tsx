"use client";

/**
 * FlowDiagram — visceral money flow diagram for the agent-centric
 * Calypso architecture. Three tiers, a revenue side rail, and live
 * balance polling:
 *
 *     USER (Freighter, optional)
 *       │ fund          │ withdraw
 *       ▼               ▲
 *     CALYPSO AGENT     ─→ x402 $ ─→   API REVENUE (sink)
 *       │ funds bots
 *       ▼
 *     BOT SWARM (per session)
 *       │ trades via Hoops router
 *       ▼
 *     DEXes
 *
 * The agent is the one-line economic actor at the centre. The user's
 * Freighter wallet is optional — its only job is to fund the agent
 * and to collect withdrawals. The API revenue wallet is shown on a
 * side rail because it's a pure sink that accumulates x402 payments
 * on every paid call.
 */

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import {
  agent,
  wallets,
  fmtStroops,
  shortAddr,
  type AgentStatus,
  type PlatformWallet,
  type RawBalances,
  type AgentReport,
} from "../lib/apiClient";

export interface FlowDiagramProps {
  sessionId?: string;
  pollMs?: number;
}

interface BotBalances {
  bot_id: string;
  archetype: string;
  eoa: string;
  smart_account: string;
  eoa_balances: RawBalances;
  smart_balances: RawBalances;
}

export function FlowDiagram({ sessionId, pollMs = 5000 }: FlowDiagramProps) {
  const { address: freighterAddr, connected } = useWallet();

  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [revenue, setRevenue] = useState<PlatformWallet | null>(null);
  const [botBalances, setBotBalances] = useState<BotBalances[]>([]);
  const [sessionMeta, setSessionMeta] = useState<{
    name: string;
    status: string;
  } | null>(null);
  const [freighterBalance, setFreighterBalance] = useState<RawBalances | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [status, rev] = await Promise.all([agent.status(), wallets.platform()]);
        if (!alive) return;
        setAgentStatus(status);
        setRevenue(rev);
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
  }, [pollMs]);

  useEffect(() => {
    let alive = true;
    if (!connected || !freighterAddr) {
      setFreighterBalance(null);
      return;
    }
    async function load() {
      if (!freighterAddr) return;
      try {
        const res = await wallets.byAddress(freighterAddr);
        if (!alive) return;
        setFreighterBalance(res.balances);
      } catch {
        /* swallow */
      }
    }
    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connected, freighterAddr, pollMs]);

  useEffect(() => {
    let alive = true;
    if (!sessionId) {
      setBotBalances([]);
      setSessionMeta(null);
      return;
    }
    async function load() {
      try {
        const report: AgentReport = await agent.getReport(sessionId!);
        if (!alive) return;
        setSessionMeta({ name: report.name, status: report.status });
        if (report.bots.length === 0) {
          setBotBalances([]);
          return;
        }
        const results = await Promise.all(
          report.bots.map(async (b) => {
            const [eoa, smart] = await Promise.all([
              wallets.byAddress(b.eoa).catch(() => null),
              wallets.byAddress(b.smart_account).catch(() => null),
            ]);
            const archetype =
              report.bot_configs.find((c) => c.bot_id === b.bot_id)?.archetype ?? "bot";
            return {
              bot_id: b.bot_id,
              archetype,
              eoa: b.eoa,
              smart_account: b.smart_account,
              eoa_balances: eoa?.balances ?? { xlm: "0", usdc: "0" },
              smart_balances: smart?.balances ?? { xlm: "0", usdc: "0" },
            } satisfies BotBalances;
          }),
        );
        if (!alive) return;
        setBotBalances(results);
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
        <div className="mb-3 font-mono text-[11px] text-destructive">FEED ERROR · {error}</div>
      )}

      {/* Main column (3 tiers) + revenue side rail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* LEFT — the agent-centric money column */}
        <div className="relative space-y-0">
          {/* USER — optional */}
          <Tier
            index="USER"
            role="user"
            label="Your Wallet"
            sublabel={connected ? "freighter · testnet" : "freighter · not connected"}
            address={connected ? freighterAddr : null}
            balances={freighterBalance}
            note={
              connected
                ? "Optional. Used to fund the agent and to receive withdrawals — that's it. Calypso is usable without connecting a wallet."
                : "Connect Freighter above only if you want to fund the agent from your own wallet or withdraw funds back."
            }
            dim={!connected}
          />
          <Rail label="fund / withdraw · off-path" dimmed />

          {/* AGENT — the star */}
          <Tier
            index="AGENT"
            role="agent"
            label="Calypso Agent"
            sublabel="autonomous x402 payer"
            address={agentStatus?.address ?? null}
            balances={agentStatus?.balances ?? null}
            note="The economic actor. Signs every x402 payment with its own Ed25519 keypair, calls the Calypso API over localhost, and spawns bot wallets at session launch."
            emphasis
          />
          <Rail label="transfers XLM + USDC to bot wallets · on session launch" active={!!sessionId} />

          {/* BOTS — per session */}
          <BotTier
            bots={botBalances}
            sessionMeta={sessionMeta}
            hasSession={!!sessionId}
          />

          {botBalances.length > 0 && (
            <>
              <Rail label="routes swaps via Hoops router" active />
              <DexVenueRow />
            </>
          )}
        </div>

        {/* RIGHT — API revenue sink */}
        <div className="lg:sticky lg:top-[140px] h-fit">
          <RevenueRail revenue={revenue} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER — a big horizontal card representing one party
// ─────────────────────────────────────────────────────────────────────────────

type Role = "user" | "agent" | "bot";

function Tier({
  index,
  label,
  sublabel,
  role,
  address,
  balances,
  note,
  emphasis,
  dim,
}: {
  index: string;
  label: string;
  sublabel?: string;
  role: Role;
  address: string | null;
  balances: RawBalances | null;
  note?: string;
  emphasis?: boolean;
  dim?: boolean;
}) {
  const theme = roleTheme(role);
  return (
    <div
      className={`relative border ${theme.border} ${theme.bg} p-5 corner-marks ${
        emphasis ? "calypso-glow" : ""
      } ${dim ? "opacity-70" : ""}`}
    >
      <div
        className={`absolute -top-2 left-5 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.22em] uppercase ${theme.tagBg}`}
      >
        {index}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className={`font-display text-2xl md:text-3xl font-semibold leading-none ${theme.text}`}
          >
            {label}
          </div>
          {sublabel && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {sublabel}
            </div>
          )}
          <div
            className="mt-2 font-mono text-[10px] text-muted-foreground break-all"
            title={address ?? ""}
          >
            {address ? shortAddr(address) : "—"}
          </div>
          {note && (
            <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed max-w-[520px]">
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
        border: "border-[hsl(var(--info)/0.35)]",
        bg: "bg-gradient-to-br from-[hsl(var(--info)/0.05)] to-card/60 backdrop-blur",
        text: "text-paper",
        tagBg: "bg-[hsl(var(--info))] text-primary-foreground",
      };
    case "agent":
      return {
        border: "border-primary/60",
        bg: "bg-gradient-to-br from-primary/10 via-ink/60 to-card/60 backdrop-blur",
        text: "text-paper",
        tagBg: "bg-primary text-primary-foreground",
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
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">USDC</div>
        <div className="font-mono text-2xl md:text-3xl font-semibold text-primary tabular-nums tracking-tight">
          {usdc}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RAIL — vertical connector with animated LED dots
// ─────────────────────────────────────────────────────────────────────────────

function Rail({
  label,
  active = true,
  dimmed,
}: {
  label: string;
  active?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`relative pl-12 pr-4 ${dimmed ? "opacity-50" : ""}`}
      style={{ height: 58 }}
    >
      <div className="absolute left-10 top-0 bottom-0 flow-rail">
        {active && (
          <>
            <div className="flow-dot" />
            <div className="flow-dot delay-1" />
            <div className="flow-dot delay-2" />
            <div className="flow-dot delay-3" />
          </>
        )}
      </div>
      <div className="flex items-center h-full pl-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT TIER — empty state or per-bot grid
// ─────────────────────────────────────────────────────────────────────────────

function BotTier({
  bots,
  sessionMeta,
  hasSession,
}: {
  bots: BotBalances[];
  sessionMeta: { name: string; status: string } | null;
  hasSession: boolean;
}) {
  if (!hasSession) {
    return (
      <div className="relative border border-dashed border-border-strong bg-card/40 p-5 corner-marks">
        <div className="absolute -top-2 left-5 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.22em] uppercase bg-border-strong text-foreground">
          BOT SWARM
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-display text-2xl md:text-3xl font-semibold leading-none text-muted-foreground">
              No session
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground max-w-[420px]">
              When the agent launches a session, bot wallets appear here — each
              with its own EOA + Hoops smart account funded by the agent.
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ephemeral · per-session
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative border border-border-strong bg-card/60 backdrop-blur p-5 corner-marks">
      <div className="absolute -top-2 left-5 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.22em] uppercase bg-border-strong text-foreground">
        BOT SWARM
      </div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="font-display text-2xl md:text-3xl font-semibold leading-none text-paper">
            {sessionMeta?.name ?? "Session"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {bots.length} bot{bots.length === 1 ? "" : "s"} ·{" "}
            <span className="text-foreground">{sessionMeta?.status ?? "?"}</span>
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          ephemeral · per-session
        </div>
      </div>

      {bots.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          spawning… bot wallets will appear shortly
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {bots.map((b) => (
            <BotCard key={b.bot_id} bot={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BotCard({ bot }: { bot: BotBalances }) {
  const sXlm = fmtStroops(bot.smart_balances.xlm);
  const sUsdc = fmtStroops(bot.smart_balances.usdc);
  const eXlm = fmtStroops(bot.eoa_balances.xlm);
  const eUsdc = fmtStroops(bot.eoa_balances.usdc);

  return (
    <div className="relative border border-border bg-background/60 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-mono text-sm font-semibold text-primary">{bot.bot_id}</div>
          <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
            {bot.archetype}
          </div>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
          {shortAddr(bot.smart_account)}
        </div>
      </div>

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
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
          eoa · {shortAddr(bot.eoa)}
        </div>
        <div className="flex items-baseline justify-between font-mono text-[11px] text-muted-foreground">
          <span>XLM {eXlm}</span>
          <span>USDC {eUsdc}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEX venue row (visual terminus)
// ─────────────────────────────────────────────────────────────────────────────

function DexVenueRow() {
  const venues = ["Soroswap", "Phoenix", "Aqua", "Comet"];
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
            reached through the Hoops router
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {venues.map((v) => (
            <div
              key={v}
              className="px-3 py-1.5 border border-border font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
            >
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE RAIL — API revenue sink, shown as a side panel
// ─────────────────────────────────────────────────────────────────────────────

function RevenueRail({ revenue }: { revenue: PlatformWallet | null }) {
  const eoa = revenue?.eoa_balances ?? revenue?.balances ?? null;
  return (
    <div className="border border-[hsl(var(--ink-stamp)/0.35)] bg-[hsl(var(--ink-stamp)/0.04)] p-5 corner-marks">
      <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[hsl(var(--ink-stamp))] font-bold">
        REVENUE · x402 sink
      </div>
      <div className="font-display text-2xl font-semibold text-paper leading-none mt-2">
        API Earnings
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
        {revenue ? shortAddr(revenue.address) : "—"}
      </div>

      <div className="mt-5 pt-4 border-t border-border/50">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          accumulated USDC
        </div>
        <div className="font-display text-4xl font-semibold text-[hsl(var(--ink-stamp))] tabular-nums mt-1">
          {eoa ? fmtStroops(eoa.usdc) : "—"}
        </div>
      </div>

      <div className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
        Every x402 payment the agent makes to /plan, /simulate or /analyze
        lands here as a normal Stellar USDC transfer. This wallet is a pure
        sink — it never spends.
      </div>
    </div>
  );
}
