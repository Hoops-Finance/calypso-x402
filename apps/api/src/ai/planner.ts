/**
 * planner.ts — turns a natural-language prompt (or structured hint) into a
 * validated (SessionConfig, BotConfig[]) pair. Called from POST /plan.
 *
 * Strategy: ask Gemma to emit a JSON object matching our schema, parse and
 * validate with zod, retry twice on failure, then fall back to a sane
 * default config so the user's $0.50 is never wasted on an LLM tantrum.
 */

import {
  PlanResponseSchema,
  type PlanResponse,
  type PlanRequest,
  type BotConfig,
  type SessionConfig,
} from "@calypso/shared";
import { generate, stripFences } from "./gemma.js";
import { logger } from "../logger.js";

const PLANNER_PROMPT = `You are Calypso, a DeFi simulation planner. Given a user request, emit a JSON object describing a bot swarm session for the Stellar testnet.

Output schema (match exactly):
{
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
- Return ONLY the JSON object. No prose, no markdown code fences.
- bot_id values must be unique.
- If asked for "stress" or "volume" include at least 2 noise bots.
- If asked for "arbitrage" or "spread" include at least 1 arbitrageur.
- If the user names pools, target those. Otherwise default to ["soroswap:USDC/XLM"].
- duration_minutes defaults to 5 if unspecified, 30 if "long", 3 if "demo" or "quick".
- estimated_cost_usd = 2.00 (simulate) + 0.50 (plan) = 2.50 unless the user asks for /analyze too.

User request:
`;

function defaultPlan(): PlanResponse {
  const session_config: SessionConfig = {
    name: "calypso default session",
    duration_minutes: 5,
    target_pools: ["soroswap:USDC/XLM"],
    initial_treasury_xlm: 10_000,
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
    estimated_cost_usd: 2.5,
    target_pools: session_config.target_pools,
  };
}

function buildUserMessage(req: PlanRequest): string {
  if ("prompt" in req) return req.prompt;
  return `Structured request: ${JSON.stringify(req)}`;
}

export async function planFromRequest(req: PlanRequest): Promise<PlanResponse> {
  const user = buildUserMessage(req);
  const prompt = PLANNER_PROMPT + user;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await generate(prompt, { temperature: 0.2 });
      const stripped = stripFences(raw);
      const json = JSON.parse(stripped);
      const parsed = PlanResponseSchema.parse(json);
      return parsed;
    } catch (err) {
      lastError = err;
      logger.warn({ attempt, err: err instanceof Error ? err.message : err }, "planner: attempt failed");
    }
  }

  logger.error({ lastError }, "planner: all attempts failed, returning default plan");
  return defaultPlan();
}
