"use client";

/**
 * BotConfigEditor — per-bot editable form with inline archetype explainer.
 *
 * Shows what each archetype actually does in plain English, then exposes
 * the knobs the AI reviewer can also touch (interval, amounts, spread,
 * rebalance threshold). Users can tweak before launching a session.
 *
 * Validates every edit against the shared zod schema so a bad input is
 * caught before it ever reaches the API.
 */

import { useState } from "react";
import { BotConfigSchema, type BotConfig } from "@calypso/shared";
import { Badge, Button, Input } from "./ui";

interface ArchetypeMeta {
  title: string;
  tagline: string;
  description: string;
}

const ARCHETYPES: Record<BotConfig["archetype"], ArchetypeMeta> = {
  arbitrageur: {
    title: "Arbitrageur",
    tagline: "Spread hunter across DEXes",
    description:
      "Queries Hoops for a price on every adapter (Soroswap, Phoenix, Aqua, Comet) and executes a swap when the spread between best and worst exceeds the threshold. Logs the observed spread on every tick even when it skips, so the AI reviewer can see why the bot is quiet.",
  },
  noise: {
    title: "Noise Trader",
    tagline: "Random volume generator",
    description:
      "Picks a random XLM swap size within [min_amount, max_amount] on a fixed interval. No strategy — its only job is to generate realistic background volume so the LP bot's rebalance logic fires and the arbitrageur has something to work against.",
  },
  lp_manager: {
    title: "LP Manager",
    tagline: "Liquidity provider with drift probe",
    description:
      "On first tick, deposits 50/50 USDC + XLM into the Soroswap pair via addLiquidity50_50. Subsequent ticks read the position, and with probability = rebalance_threshold execute a tiny rebalance probe swap to simulate drift pressure.",
  },
};

interface Props {
  config: BotConfig;
  onChange: (next: BotConfig) => void;
  onRemove: () => void;
  /** True when editing is enabled. Defaults true. */
  editable?: boolean;
}

export function BotConfigEditor({ config, onChange, onRemove, editable = true }: Props) {
  const [localError, setLocalError] = useState<string | null>(null);
  const meta = ARCHETYPES[config.archetype];

  function update(key: string, rawValue: unknown) {
    const next = { ...(config as Record<string, unknown>), [key]: rawValue } as BotConfig;
    const parsed = BotConfigSchema.safeParse(next);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setLocalError(first ? `${first.path.join(".")}: ${first.message}` : "invalid");
      return;
    }
    setLocalError(null);
    onChange(parsed.data);
  }

  function updateNumber(key: string, raw: string) {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      setLocalError(`${key}: must be a number`);
      return;
    }
    update(key, n);
  }

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-primary">{config.bot_id}</span>
            <Badge>{config.archetype}</Badge>
          </div>
          <div className="mt-2 text-sm font-semibold">{meta.title}</div>
          <div className="text-xs text-muted-foreground">{meta.tagline}</div>
        </div>
        {editable && (
          <Button variant="ghost" onClick={onRemove} className="text-xs">
            remove
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-4">{meta.description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="bot_id" value={config.bot_id} onChange={(v) => update("bot_id", v)} editable={editable} />

        {config.archetype === "arbitrageur" && (
          <>
            <NumField
              label="min_spread_bps"
              value={config.min_spread_bps}
              onChange={(v) => updateNumber("min_spread_bps", v)}
              hint="basis points; fires when spread ≥ this"
              editable={editable}
            />
            <NumField
              label="max_position_size"
              value={config.max_position_size}
              onChange={(v) => updateNumber("max_position_size", v)}
              hint="XLM per trade"
              editable={editable}
            />
            <NumField
              label="interval_seconds"
              value={config.interval_seconds}
              onChange={(v) => updateNumber("interval_seconds", v)}
              hint="1–300s; min clamp 5 by reviewer"
              editable={editable}
            />
          </>
        )}

        {config.archetype === "noise" && (
          <>
            <NumField
              label="interval_seconds"
              value={config.interval_seconds}
              onChange={(v) => updateNumber("interval_seconds", v)}
              editable={editable}
            />
            <NumField
              label="min_amount"
              value={config.min_amount}
              onChange={(v) => updateNumber("min_amount", v)}
              hint="XLM"
              editable={editable}
            />
            <NumField
              label="max_amount"
              value={config.max_amount}
              onChange={(v) => updateNumber("max_amount", v)}
              hint="XLM"
              editable={editable}
            />
          </>
        )}

        {config.archetype === "lp_manager" && (
          <>
            <NumField
              label="deposit_amount"
              value={config.deposit_amount}
              onChange={(v) => updateNumber("deposit_amount", v)}
              hint="initial deposit (USDC)"
              editable={editable}
            />
            <NumField
              label="rebalance_threshold"
              value={config.rebalance_threshold}
              onChange={(v) => updateNumber("rebalance_threshold", v)}
              hint="0..1 — probe frequency"
              editable={editable}
            />
            <NumField
              label="interval_seconds"
              value={config.interval_seconds}
              onChange={(v) => updateNumber("interval_seconds", v)}
              editable={editable}
            />
          </>
        )}
      </div>

      {localError && <div className="mt-3 text-xs text-destructive">{localError}</div>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  editable,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <Input
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  editable,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  editable: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <Input
        type="number"
        step="any"
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </label>
  );
}
