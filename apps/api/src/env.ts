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
  AI_MODEL: optional("AI_MODEL", "gemma-4-31b-it"),
  AI_INTERVAL_MS: Number(optional("AI_INTERVAL_MS", "300000")),

  HOOPS_DATA_API_URL: process.env.HOOPS_DATA_API_URL ?? "",
} as const;
