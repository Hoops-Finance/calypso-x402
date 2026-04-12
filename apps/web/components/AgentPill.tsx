"use client";

/**
 * AgentPill — compact nav chip showing the Calypso Agent's live USDC
 * balance and a link to /wallets. The Agent is the x402 payer; this
 * pill is the UI's single source of truth for "does the agent have
 * money to pay for calls right now".
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { agent, fmtStroops, shortAddr, type AgentStatus } from "../lib/apiClient";

export function AgentPill() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const s = await agent.status();
        if (!alive) return;
        setStatus(s);
        setError(false);
      } catch {
        if (!alive) return;
        setError(true);
      }
    }
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-destructive/60 bg-destructive/5 font-mono text-[10px] uppercase tracking-[0.18em] text-destructive">
        agent offline
      </div>
    );
  }
  if (!status) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 border border-border/60 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        agent ·{" "}
        <span className="inline-block w-8 h-2 bg-border/60 animate-pulse rounded-sm" />
      </div>
    );
  }

  const usdc = fmtStroops(status.balances.usdc);

  return (
    <Link
      href="/wallets"
      className="group hidden md:flex items-stretch border border-border-strong bg-ink/80 hover:border-primary/60 transition-colors"
      title="Calypso Agent wallet"
    >
      <div className="flex items-center px-3 border-r border-border/70 bg-primary/8">
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] mr-2 shadow-[0_0_8px_hsl(var(--success))]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-primary font-bold">
          agent
        </span>
      </div>
      <div className="flex items-center gap-3 px-3 py-1.5">
        <div className="flex flex-col">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground leading-none">
            USDC
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-foreground leading-tight mt-0.5">
            {usdc}
          </span>
        </div>
        <div className="w-px self-stretch bg-border/70" />
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {shortAddr(status.address)}
        </div>
      </div>
    </Link>
  );
}
