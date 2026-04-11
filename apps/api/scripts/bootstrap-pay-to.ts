/**
 * bootstrap-pay-to.ts
 * -------------------
 * Generates a fresh Stellar testnet keypair to be the x402 revenue wallet,
 * funds it via friendbot, and persists the public key + secret into the
 * repo-root .env file. The secret is also printed to stdout ONCE so the
 * user can copy it into a password manager.
 *
 * Never run this against mainnet.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = resolve(__dirname, "../../../.env");
const FRIENDBOT = process.env.FRIENDBOT_URL ?? "https://friendbot.stellar.org";

function upsertEnv(path: string, updates: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing.split("\n");
  const remaining = new Map(Object.entries(updates));

  const next = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1]!;
    if (remaining.has(key)) {
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  if (remaining.size > 0) {
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    for (const [k, v] of remaining) next.push(`${k}=${v}`);
  }

  writeFileSync(path, next.join("\n"), "utf8");
}

async function main(): Promise<void> {
  console.log("🪐  Generating fresh Stellar testnet keypair for PAY_TO…");
  const kp = Keypair.random();
  const pub = kp.publicKey();
  const sec = kp.secret();

  console.log(`   pub: ${pub}`);
  console.log("🤖  Requesting friendbot funding…");

  const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(pub)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`friendbot failed: ${res.status} ${res.statusText}\n${body}`);
  }
  console.log("   funded ✓");

  upsertEnv(ROOT_ENV, { PAY_TO: pub, PAY_TO_SECRET: sec });

  console.log("\n============================================================");
  console.log("PAY_TO wallet created & funded on testnet.");
  console.log("Public key has been written to .env.");
  console.log("\n⚠️  SAVE THIS SECRET NOW — it will not be printed again:\n");
  console.log(`    ${sec}\n`);
  console.log("It has also been written to .env (git-ignored).");
  console.log("============================================================");
}

main().catch((err) => {
  console.error("bootstrap-pay-to failed:", err);
  process.exit(1);
});
