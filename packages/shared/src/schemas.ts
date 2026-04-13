import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const StellarAddress = z
  .string()
  .regex(/^[GC][A-Z0-9]{55}$/, "not a valid Stellar address");

export const DexIdSchema = z.enum(["aqua", "comet", "phoenix", "soroswap"]);
export type DexId = z.infer<typeof DexIdSchema>;

export const PoolRefSchema = z
  .string()
  .regex(
    /^(aqua|comet|phoenix|soroswap):[A-Z0-9]+\/[A-Z0-9]+$/,
    'pool must look like "soroswap:USDC/XLM"',
  );
export type PoolRef = z.infer<typeof PoolRefSchema>;

export const TokenPairSchema = z.string().regex(/^[A-Z0-9]+\/[A-Z0-9]+$/);
export type TokenPair = z.infer<typeof TokenPairSchema>;

// ---------------------------------------------------------------------------
// Bot archetype configs
// ---------------------------------------------------------------------------

export const ArbitrageurConfigSchema = z.object({
  archetype: z.literal("arbitrageur"),
  bot_id: z.string(),
  min_spread_bps: z.number().int().min(1).max(1000),
  max_position_size: z.number().positive(),
  target_pairs: z.array(TokenPairSchema).min(1),
  target_dexes: z.array(DexIdSchema).min(1),
  interval_seconds: z.number().int().min(5).max(300).default(15),
});
export type ArbitrageurConfig = z.infer<typeof ArbitrageurConfigSchema>;

export const NoiseConfigSchema = z.object({
  archetype: z.literal("noise"),
  bot_id: z.string(),
  interval_seconds: z.number().int().min(5).max(300),
  min_amount: z.number().positive(),
  max_amount: z.number().positive(),
  target_pools: z.array(PoolRefSchema).min(1),
});
export type NoiseConfig = z.infer<typeof NoiseConfigSchema>;

export const LpConfigSchema = z.object({
  archetype: z.literal("lp_manager"),
  bot_id: z.string(),
  rebalance_threshold: z.number().min(0).max(1),
  target_pool: PoolRefSchema,
  deposit_amount: z.number().positive(),
  interval_seconds: z.number().int().min(5).max(600).default(30),
});
export type LpConfig = z.infer<typeof LpConfigSchema>;

export const BotConfigSchema = z.discriminatedUnion("archetype", [
  ArbitrageurConfigSchema,
  NoiseConfigSchema,
  LpConfigSchema,
]);
export type BotConfig = z.infer<typeof BotConfigSchema>;

export const BotArchetypeSchema = z.enum(["arbitrageur", "noise", "lp_manager"]);
export type BotArchetype = z.infer<typeof BotArchetypeSchema>;

// ---------------------------------------------------------------------------
// Session config
// ---------------------------------------------------------------------------

export const SessionConfigSchema = z.object({
  name: z.string().min(1).max(100).default("unnamed session"),
  duration_minutes: z.number().int().min(1).max(180),
  target_pools: z.array(PoolRefSchema).min(1),
  initial_treasury_xlm: z.number().positive().default(10_000),
  // How much USDC the orchestrator hands to each bot's smart account
  // at creation time. LP bots need >= 0.5 USDC to clear the hoops_sdk
  // addLiquidity50_50 threshold.
  usdc_per_bot: z.number().positive().default(1),
  demo_mode: z.boolean().default(false),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

// ---------------------------------------------------------------------------
// /plan response
// ---------------------------------------------------------------------------

export const PlanResponseSchema = z.object({
  session_config: SessionConfigSchema,
  bot_configs: z.array(BotConfigSchema).min(1),
  estimated_cost_usd: z.number().nonnegative(),
  target_pools: z.array(PoolRefSchema),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

// ---------------------------------------------------------------------------
// Bot actions + logs
// ---------------------------------------------------------------------------

export const BotActionTypeSchema = z.enum([
  "swap",
  "quote",
  "deposit_liquidity",
  "withdraw_liquidity",
  "rebalance",
  "skip",
  "error",
]);
export type BotActionType = z.infer<typeof BotActionTypeSchema>;

export const BotLogEntrySchema = z.object({
  t: z.number().int(), // epoch ms
  bot_id: z.string(),
  archetype: BotArchetypeSchema,
  action: BotActionTypeSchema,
  dex: DexIdSchema.optional(),
  pair: TokenPairSchema.optional(),
  amount_in: z.number().optional(),
  amount_out: z.number().optional(),
  tx_hash: z.string().optional(),
  error: z.string().optional(),
  note: z.string().optional(),
});
export type BotLogEntry = z.infer<typeof BotLogEntrySchema>;

// ---------------------------------------------------------------------------
// Aggregated metrics
// ---------------------------------------------------------------------------

export const BotMetricSchema = z.object({
  bot_id: z.string(),
  archetype: BotArchetypeSchema,
  actions_total: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  volume_usd: z.number().nonnegative(),
  pnl_usd: z.number(),
});
export type BotMetric = z.infer<typeof BotMetricSchema>;

export const PoolUtilizationSchema = z.object({
  pool: PoolRefSchema,
  swaps: z.number().int().nonnegative(),
  volume_usd: z.number().nonnegative(),
});
export type PoolUtilization = z.infer<typeof PoolUtilizationSchema>;

export const MetricsSchema = z.object({
  total_volume_usd: z.number().nonnegative(),
  total_actions: z.number().int().nonnegative(),
  failed_txns: z.number().int().nonnegative(),
  slippage_events: z.number().int().nonnegative(),
  spread_distribution: z.object({
    p50_bps: z.number(),
    p90_bps: z.number(),
    max_bps: z.number(),
  }),
  per_bot: z.array(BotMetricSchema),
  per_pool: z.array(PoolUtilizationSchema),
});
export type Metrics = z.infer<typeof MetricsSchema>;

// ---------------------------------------------------------------------------
// AI feedback trail
// ---------------------------------------------------------------------------

export const AIReviewDeltaSchema = z.object({
  bot_id: z.string(),
  param: z.string(),
  new_value: z.union([z.number(), z.string(), z.boolean()]),
  reason: z.string(),
});
export type AIReviewDelta = z.infer<typeof AIReviewDeltaSchema>;

export const AIReviewArraySchema = z.array(AIReviewDeltaSchema);
export type AIReviewArray = z.infer<typeof AIReviewArraySchema>;

export const AIFeedbackEntrySchema = z.object({
  t: z.number().int(),
  summary_in: z.unknown(),
  deltas_out: AIReviewArraySchema,
  model: z.string(),
  parse_attempts: z.number().int().positive(),
});
export type AIFeedbackEntry = z.infer<typeof AIFeedbackEntrySchema>;

// ---------------------------------------------------------------------------
// Session status + report
// ---------------------------------------------------------------------------

export const SessionStatusSchema = z.enum([
  "planning",
  "running",
  "stopping",
  "completed",
  "failed",
  "cancelled",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SimulateResponseSchema = z.object({
  session_id: z.string(),
  status: SessionStatusSchema,
  started_at: z.string(), // ISO-8601
});
export type SimulateResponse = z.infer<typeof SimulateResponseSchema>;

export const ReportSchema = z.object({
  session_id: z.string(),
  status: SessionStatusSchema,
  started_at: z.string(),
  ended_at: z.string().nullable(),
  session_config: SessionConfigSchema,
  metrics: MetricsSchema,
  bot_logs: z.array(BotLogEntrySchema),
  ai_feedback: z.array(AIFeedbackEntrySchema),
  pnl_summary: z.object({
    gross_volume_usd: z.number(),
    net_pnl_usd: z.number(),
  }),
});
export type Report = z.infer<typeof ReportSchema>;

export const SessionSummarySchema = z.object({
  session_id: z.string(),
  name: z.string(),
  status: SessionStatusSchema,
  started_at: z.string(),
  bot_count: z.number(),
  pnl_summary: z.object({
    gross_volume_usd: z.number(),
    net_pnl_usd: z.number(),
  }),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

// ---------------------------------------------------------------------------
// /analyze
// ---------------------------------------------------------------------------

export const AnalyzeRequestSchema = z.object({
  contracts: z.object({
    router: StellarAddress.optional(),
    pools: z.array(StellarAddress).optional(),
    tokens: z.array(StellarAddress).optional(),
  }),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AnalyzeResponseSchema = z.object({
  pool_health: z.array(
    z.object({
      pool: StellarAddress,
      reserves_a: z.number(),
      reserves_b: z.number(),
      fee_bps: z.number(),
    }),
  ),
  liquidity_depth_usd: z.number().nonnegative(),
  fee_analysis: z.object({
    avg_fee_bps: z.number(),
    fee_24h_usd: z.number(),
  }),
  risk_profile: z.object({
    concentration: z.enum(["low", "medium", "high"]),
    stale_pools: z.number().int().nonnegative(),
    notes: z.array(z.string()),
  }),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

// ---------------------------------------------------------------------------
// /plan request
// ---------------------------------------------------------------------------

export const PlanRequestSchema = z.union([
  z.object({ prompt: z.string().min(1).max(2000) }),
  z.object({
    pairs: z.array(TokenPairSchema).min(1),
    duration_minutes: z.number().int().min(1).max(180),
    bot_count: z.number().int().min(1).max(20),
    dexes: z.array(DexIdSchema).min(1),
  }),
]);
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

// ---------------------------------------------------------------------------
// /simulate request
// ---------------------------------------------------------------------------

export const SimulateRequestSchema = z.object({
  session_config: SessionConfigSchema,
  bot_configs: z.array(BotConfigSchema).min(1),
});
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
