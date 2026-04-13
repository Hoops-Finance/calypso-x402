import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// .env lives at repo root, not apps/api/, because bootstrap-pay-to writes
// there. Load it explicitly instead of cwd-relative.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../../.env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const ENV = {
  API_PORT: Number(optional("API_PORT", "9990")),
  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:3000"),
  LOG_LEVEL: optional("LOG_LEVEL", "info"),

  PAY_TO: required("PAY_TO"),
  X402_FACILITATOR_URL: optional("X402_FACILITATOR_URL", "https://www.x402.org/facilitator"),
  X402_NETWORK: optional("X402_NETWORK", "stellar:testnet"),

  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  AI_MODEL: optional("AI_MODEL", "gemini-2.5-flash"),
  AI_INTERVAL_MS: Number(optional("AI_INTERVAL_MS", "300000")),

  HOOPS_DATA_API_URL: process.env.HOOPS_DATA_API_URL ?? "",

  // When true, gated routes skip x402 verification entirely. Intended for
  // local UI demos where driving real browser-side payment signing is
  // out of scope. Default off. DO NOT set this in a deployment.
  X402_DEMO_MODE: (process.env.X402_DEMO_MODE ?? "").toLowerCase() === "true",

  // Secret key of the USDC token contract admin. When set, Calypso can
  // mint fresh USDC directly to any address — bypassing the broken-pool
  // XLM→USDC swap path entirely on testnet. Empty string means minting
  // is disabled and we fall back to self-swap.
  USDC_ADMIN_SECRET: process.env.USDC_ADMIN_SECRET ?? "",

  // Secret key of the Calypso agent wallet — the x402 payer. Auto-
  // generated on first boot if unset, then written back to .env so
  // it persists across restarts.
  AGENT_SECRET: process.env.AGENT_SECRET ?? "",
} as const;
