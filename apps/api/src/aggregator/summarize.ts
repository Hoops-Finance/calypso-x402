/**
 * summarize.ts — compresses raw bot logs into an aggregated Metrics blob.
 *
 * Runs on every AI review and on every /report read. Intentionally simple:
 * counts, sums, and a quick spread distribution. The AI sees the same blob
 * the /report consumer sees, so if the AI is missing signal, we can add
 * fields here and everything downstream picks them up.
 */

import type {
  BotLogEntry,
  BotConfig,
  Metrics,
  BotMetric,
  PoolUtilization,
  PoolRef,
  BotArchetype,
} from "@calypso/shared";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

function archetypeOf(botId: string, botConfigs: BotConfig[]): BotArchetype {
  const cfg = botConfigs.find((b) => b.bot_id === botId);
  return (cfg?.archetype ?? "noise") as BotArchetype;
}

function parsePoolRef(log: BotLogEntry): PoolRef | null {
  if (!log.dex || !log.pair) return null;
  return `${log.dex}:${log.pair}` as PoolRef;
}

export function summarize(botLogs: BotLogEntry[], botConfigs: BotConfig[]): Metrics {
  const perBotMap = new Map<string, BotMetric>();
  const perPoolMap = new Map<PoolRef, PoolUtilization>();
  let failedTxns = 0;
  let slippageEvents = 0;
  let totalVolume = 0;
  const spreads: number[] = [];

  for (const log of botLogs) {
    const botId = log.bot_id;
    const entry =
      perBotMap.get(botId) ??
      ({
        bot_id: botId,
        archetype: archetypeOf(botId, botConfigs),
        actions_total: 0,
        successes: 0,
        failures: 0,
        volume_usd: 0,
        pnl_usd: 0,
      } satisfies BotMetric);

    entry.actions_total += 1;

    if (log.action === "error") {
      entry.failures += 1;
      failedTxns += 1;
    } else if (log.action === "swap" || log.action === "rebalance") {
      entry.successes += 1;
      const vol = log.amount_in ?? 0;
      entry.volume_usd += vol;
      totalVolume += vol;
      if (log.amount_out !== undefined && log.amount_in !== undefined && log.amount_out > 0) {
        // naive pnl: amount_out - amount_in (units are different but the
        // relative trend is what the AI cares about).
        entry.pnl_usd += log.amount_out - log.amount_in;
      }

      const poolRef = parsePoolRef(log);
      if (poolRef) {
        const pu = perPoolMap.get(poolRef) ?? {
          pool: poolRef,
          swaps: 0,
          volume_usd: 0,
        };
        pu.swaps += 1;
        pu.volume_usd += vol;
        perPoolMap.set(poolRef, pu);
      }
    } else if (log.action === "deposit_liquidity") {
      entry.successes += 1;
    }

    // Heuristic: a skip whose note mentions bps is a spread observation.
    if (log.action === "skip" && log.note) {
      const match = /spread\s+(\d+)\s*bps/.exec(log.note);
      if (match && match[1]) spreads.push(Number(match[1]));
    }

    if (log.note?.toLowerCase().includes("slippage")) slippageEvents += 1;

    perBotMap.set(botId, entry);
  }

  return {
    total_volume_usd: totalVolume,
    total_actions: botLogs.length,
    failed_txns: failedTxns,
    slippage_events: slippageEvents,
    spread_distribution: {
      p50_bps: percentile(spreads, 0.5),
      p90_bps: percentile(spreads, 0.9),
      max_bps: spreads.length ? Math.max(...spreads) : 0,
    },
    per_bot: [...perBotMap.values()],
    per_pool: [...perPoolMap.values()],
  };
}
