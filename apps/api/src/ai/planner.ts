/**
 * planner.ts — turns a natural-language prompt into a validated
 * (SessionConfig, BotConfig[]) pair. Called from POST /plan.
 *
 * Uses Gemini 2.5 Flash with responseMimeType: "application/json"
 * for reliable structured output. Retries twice on parse failure.
 */

import {
  PlanResponseSchema,
  type PlanResponse,
  type PlanRequest,
  type BotConfig,
  type SessionConfig,
} from "@calypso/shared";
import { generate, allJsonCandidates } from "./gemma.js";
import { ENV } from "../env.js";
import { logger } from "../logger.js";

export interface PlanResult {
  plan: PlanResponse;
  reasoning: string | null;
  model: string;
}

const PLANNER_PROMPT = `You are Calypso, a DeFi simulation planner. Given a user request, emit a JSON object describing a bot swarm session for the Stellar testnet.

Output schema (match exactly):
{
  "reasoning": string (2-5 sentences explaining your design choices — what bots you picked and why, what intervals you chose, etc.),
  "session_config": {
    "name": string (max 100 chars),
    "duration_minutes": integer 1-180,
    "target_pools": string[] (each "soroswap:USDC/XLM" or "aqua:USDC/XLM"),
    "initial_treasury_xlm": number > 0,
    "demo_mode": boolean
  },
  "bot_configs": [
    // Each bot is one of three archetypes. Pick between 1 and 5 bots total.
    // "arbitrageur": { "archetype":"arbitrageur", "bot_id":"arb-1", "min_spread_bps": 10, "max_position_size": 100, "target_pairs": ["USDC/XLM"], "target_dexes": ["soroswap","aqua"], "interval_seconds": 15 }
    // "noise":       { "archetype":"noise", "bot_id":"noise-1", "interval_seconds": 10, "min_amount": 1, "max_amount": 5, "target_pools": ["soroswap:USDC/XLM"] }
    // "lp_manager":  { "archetype":"lp_manager", "bot_id":"lp-1", "rebalance_threshold": 0.15, "target_pool": "soroswap:USDC/XLM", "deposit_amount": 100, "interval_seconds": 30 }
  ],
  "estimated_cost_usd": number (sum of x402 fees),
  "target_pools": string[] (echo of session_config.target_pools)
}

RULES:
- Return ONLY the JSON object. No prose outside the JSON.
- bot_id values must be unique.
- If asked for "stress" or "volume" include at least 2 noise bots.
- If asked for "arbitrage" or "spread" include at least 1 arbitrageur.
- If the user names pools, target those. Otherwise default to ["soroswap:USDC/XLM"].
- duration_minutes defaults to 5 if unspecified, 30 if "long", 3 if "demo" or "quick".
- estimated_cost_usd = 0.05 (simulate) + 0.01 (plan) = 0.06 unless the user asks for /analyze too.
- demo_mode should be false.

User request:
`;

function defaultPlan(): PlanResponse {
  const session_config: SessionConfig = {
    name: "calypso default session",
    duration_minutes: 5,
    target_pools: ["soroswap:USDC/XLM"],
    initial_treasury_xlm: 10_000,
    usdc_per_bot: 1,
    demo_mode: false,
  };
  const bot_configs: BotConfig[] = [
    {
      archetype: "noise",
      bot_id: "noise-1",
      interval_seconds: 12,
      min_amount: 1,
      max_amount: 3,
      target_pools: ["soroswap:USDC/XLM"],
    },
    {
      archetype: "arbitrageur",
      bot_id: "arb-1",
      min_spread_bps: 10,
      max_position_size: 50,
      target_pairs: ["USDC/XLM"],
      target_dexes: ["soroswap", "aqua"],
      interval_seconds: 18,
    },
    {
      archetype: "lp_manager",
      bot_id: "lp-1",
      rebalance_threshold: 0.15,
      target_pool: "soroswap:USDC/XLM",
      deposit_amount: 50,
      interval_seconds: 25,
    },
  ];
  return {
    session_config,
    bot_configs,
    estimated_cost_usd: 0.06,
    target_pools: session_config.target_pools,
  };
}

function buildUserMessage(req: PlanRequest): string {
  if ("prompt" in req) return req.prompt;
  return `Structured request: ${JSON.stringify(req)}`;
}

export async function planFromRequest(req: PlanRequest): Promise<PlanResult> {
  const user = buildUserMessage(req);
  const prompt = PLANNER_PROMPT + user;
  const model = ENV.AI_MODEL;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await generate(prompt, { temperature: 0.2, model });

      // With Flash JSON mode, try direct parse first
      let reasoning: string | null = null;
      let parsed: PlanResponse | null = null;

      try {
        const full = JSON.parse(raw.trim());
        if (typeof full.reasoning === "string") {
          reasoning = full.reasoning;
        }
        parsed = PlanResponseSchema.parse(full);
      } catch {
        // Fall back to candidate iteration
        const candidates = allJsonCandidates(raw);
        for (const c of candidates) {
          try {
            const obj = JSON.parse(c);
            if (typeof obj.reasoning === "string") reasoning = obj.reasoning;
            parsed = PlanResponseSchema.parse(obj);
            break;
          } catch { /* try next */ }
        }
      }

      if (!parsed) {
        throw new Error(`no candidate matched PlanResponseSchema (attempt ${attempt})`);
      }
      logger.info({ model, attempt }, "planner: success");
      return { plan: parsed, reasoning, model };
    } catch (err) {
      lastError = err;
      logger.warn(
        { model, attempt, err: err instanceof Error ? err.message : err },
        "planner: attempt failed",
      );
    }
  }

  logger.error({ lastError }, "planner: all attempts failed, returning default plan");
  return { plan: defaultPlan(), reasoning: null, model: "default" };
}
