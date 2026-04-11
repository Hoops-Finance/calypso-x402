"use client";

/**
 * WalletHierarchy — the canonical view of Calypso's three-tier wallet
 * model. Shows:
 *
 *   1. USER        — the Freighter wallet the visitor has connected
 *   2. ORCHESTRATOR — Calypso's PAY_TO wallet that collects x402 fees
 *                     and seeds bot swarms
 *   3. BOTS        — per-session ephemeral wallets (EOA + smart acct)
 *
 * Between each tier we render an arrow with a label describing the
 * actual flow of funds ("pays $2.50 via x402", "friendbot + seed swap",
 * "routes swaps through Hoops"). Balances auto-refresh every 4s so you
 * can see trades settling on-chain in real time.
 */

import { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { walletApi, fmtStroops, shortAddr } from "../lib/walletApi";
import type {
  PlatformWallet,
  SessionWalletsResponse,
  RawBalances,
} from "../lib/walletApi";
import { Badge } from "./ui";

interface Props {
  /** When set, shows bot wallets for this session. Otherwise just user + orchestrator. */
  sessionId?: string;
  /** If false, the user tier is hidden (e.g. inside /sessions/[id] where the nav has it). */
  showUser?: boolean;
  pollMs?: number;
}

export function WalletHierarchy({ sessionId, showUser = true, pollMs = 4000 }: Props) {
  const { address: userAddr, connected } = useWallet();
  const [platform, setPlatform] = useState<PlatformWallet | null>(null);
  const [userBalances, setUserBalances] = useState<RawBalances | null>(null);
  const [sessionWallets, setSessionWallets] = useState<SessionWalletsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const pPlat = walletApi.platform();
        const pSess = sessionId ? walletApi.session(sessionId) : Promise.resolve(null);
        const pUser = connected && userAddr ? walletApi.byAddress(userAddr) : Promise.resolve(null);
        const [plat, sess, usr] = await Promise.all([pPlat, pSess, pUser]);
        if (!alive) return;
        setPlatform(plat);
        setSessionWallets(sess);
        setUserBalances(usr?.balances ?? null);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sessionId, userAddr, connected, pollMs]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-destructive">wallet feed error: {error}</div>
      )}

      {showUser && (
        <>
          <WalletTier
            role="user"
            label="You"
            sublabel={connected ? "Freighter · testnet" : "not connected"}
            address={userAddr}
            balances={userBalances}
            muted={!connected}
          />
          <FlowArrow label="pays $0.50 + $2.00 USDC via x402" />
        </>
      )}

      <WalletTier
        role="orchestrator"
        label="Calypso Orchestrator"
        sublabel="PAY_TO · collects x402 fees"
        address={platform?.address ?? null}
        balances={platform?.balances ?? null}
      />

      {sessionId && (
        <>
          <FlowArrow label="spawns ephemeral bot wallets (friendbot + seed swap)" />
          <SessionTier session={sessionWallets} />
        </>
      )}

      {sessionId && sessionWallets && sessionWallets.bots.length > 0 && (
        <>
          <FlowArrow label="routes swaps through Hoops → Soroswap / Phoenix / Aqua / Comet" />
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Stellar testnet DEXes
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

type Role = "user" | "orchestrator" | "bot";

function roleTheme(role: Role): { ring: string; chip: string; label: string } {
  switch (role) {
    case "user":
      return {
        ring: "border-primary/40",
        chip: "bg-primary/15 text-primary border border-primary/30",
        label: "USER",
      };
    case "orchestrator":
      return {
        ring: "border-[hsl(var(--warning)/0.35)]",
        chip: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border border-[hsl(var(--warning)/0.3)]",
        label: "ORCHESTRATOR",
      };
    case "bot":
      return {
        ring: "border-border",
        chip: "bg-muted text-muted-foreground",
        label: "BOT",
      };
  }
}

function WalletTier({
  role,
  label,
  sublabel,
  address,
  balances,
  muted,
}: {
  role: Role;
  label: string;
  sublabel?: string;
  address: string | null;
  balances: RawBalances | null;
  muted?: boolean;
}) {
  const theme = roleTheme(role);
  return (
    <div
      className={`rounded-xl border ${theme.ring} bg-card/70 backdrop-blur-sm p-4 ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${theme.chip}`}
          >
            {theme.label}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{label}</div>
            {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <BalancePair balances={balances} />
          <span className="font-mono text-xs text-muted-foreground hidden md:inline" title={address ?? ""}>
            {shortAddr(address)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BalancePair({ balances }: { balances: RawBalances | null }) {
  const xlm = balances ? fmtStroops(balances.xlm) : "—";
  const usdc = balances ? fmtStroops(balances.usdc) : "—";
  return (
    <div className="flex items-center gap-5">
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">XLM</div>
        <div className="font-mono text-sm">{xlm}</div>
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">USDC</div>
        <div className="font-mono text-sm">{usdc}</div>
      </div>
    </div>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pl-6 pr-2 py-1">
      <div className="w-px h-4 bg-border" />
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <div className="flex-1 h-px bg-border" />
      <span className="text-muted-foreground text-xs">↓</span>
    </div>
  );
}

function SessionTier({ session }: { session: SessionWalletsResponse | null }) {
  if (!session) {
    return (
      <div className="rounded-xl border border-border bg-card/70 p-4 text-xs text-muted-foreground">
        no session
      </div>
    );
  }
  if (session.bots.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/70 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{session.session_name}</div>
            <div className="text-xs text-muted-foreground">spinning up bot wallets…</div>
          </div>
          <Badge>{session.status}</Badge>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">{session.session_name}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {session.bots.length} bot wallet{session.bots.length === 1 ? "" : "s"}
          </div>
        </div>
        <Badge tone={session.status === "running" ? "success" : "default"}>
          {session.status}
        </Badge>
      </div>
      <div className="space-y-2">
        {session.bots.map((b) => (
          <BotRow key={b.bot_id} bot={b} />
        ))}
      </div>
    </div>
  );
}

function BotRow({ bot }: { bot: SessionWalletsResponse["bots"][number] }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-primary">{bot.bot_id}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {bot.archetype}
          </span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <SubWallet label="EOA" address={bot.eoa.address} balances={bot.eoa.balances} />
        <SubWallet
          label="Smart Account"
          address={bot.smart_account.address}
          balances={bot.smart_account.balances}
        />
      </div>
    </div>
  );
}

function SubWallet({
  label,
  address,
  balances,
}: {
  label: string;
  address: string;
  balances: RawBalances;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 border border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground" title={address}>
          {shortAddr(address)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-4">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">XLM </span>
          <span className="font-mono">{fmtStroops(balances.xlm)}</span>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">USDC </span>
          <span className="font-mono">{fmtStroops(balances.usdc)}</span>
        </div>
      </div>
    </div>
  );
}
