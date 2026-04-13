/**
 * botKeystore.ts — persist bot keypairs to disk so crash recovery
 * can drain stranded funds back to the agent.
 *
 * Lifecycle:
 *   1. launchSession() calls saveSessionKeys() after bot wallets are created
 *   2. teardown (auto-end, manual stop, circuit breaker) calls clearSessionKeys()
 *   3. On server boot, recoverStrandedSessions() scans for leftover files,
 *      rebuilds minimal BotWallet objects from the stored secrets, and runs
 *      teardownSession() to drain funds back to the agent.
 *
 * Keys are stored as plaintext JSON in data/sessions/{sessionId}.json.
 * Acceptable for testnet; production would use encrypted-at-rest or a KMS.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";
import { createSession as createHoopsSession } from "hoops-sdk-actions";
import { HOOPS_NETWORK } from "../constants.js";
import { teardownSession } from "./teardown.js";
import type { BotWallet } from "./wallets.js";
import type { Session } from "./session.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../../../data/sessions");

interface StoredBot {
  botId: string;
  secret: string;
  pubkey: string;
  smartAccountId: string;
}

interface StoredSession {
  sessionId: string;
  savedAt: string;
  bots: StoredBot[];
}

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sessionPath(sessionId: string): string {
  return resolve(DATA_DIR, `${sessionId}.json`);
}

/**
 * Persist bot keypairs for a running session. Called immediately after
 * bot wallets are created, before bots start trading.
 */
export function saveSessionKeys(session: Session): void {
  ensureDir();
  const stored: StoredSession = {
    sessionId: session.id,
    savedAt: new Date().toISOString(),
    bots: session.bots.map((bot) => ({
      botId: bot.botId,
      secret: bot.session.keypair.secret(),
      pubkey: bot.pubkey,
      smartAccountId: bot.smartAccountId,
    })),
  };
  writeFileSync(sessionPath(session.id), JSON.stringify(stored, null, 2), "utf8");
  logger.info(
    { sessionId: session.id, bots: stored.bots.length },
    "botKeystore: saved bot keypairs to disk",
  );
}

/**
 * Delete the persisted keypairs after successful teardown.
 */
export function clearSessionKeys(sessionId: string): void {
  const path = sessionPath(sessionId);
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      logger.info({ sessionId }, "botKeystore: cleared keypair file");
    }
  } catch (err) {
    logger.warn({ err, sessionId }, "botKeystore: failed to delete keypair file");
  }
}

/**
 * Rebuild a minimal BotWallet from a stored secret. The HoopsSession
 * is created with the existing smart account ID (no redeploy needed).
 */
function rebuildBotWallet(stored: StoredBot): BotWallet {
  const keypair = Keypair.fromSecret(stored.secret);
  const session = createHoopsSession({
    network: HOOPS_NETWORK,
    keypair,
    smartAccountId: stored.smartAccountId,
  });
  return {
    session,
    pubkey: stored.pubkey,
    smartAccountId: stored.smartAccountId,
    botId: stored.botId,
  };
}

/**
 * Called once at server boot. Scans for leftover session key files
 * (evidence of a crash during an active session) and drains any
 * remaining funds back to the agent.
 */
export async function recoverStrandedSessions(): Promise<void> {
  ensureDir();
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return;

  logger.info({ count: files.length }, "botKeystore: found stranded sessions, recovering funds");

  for (const file of files) {
    const path = resolve(DATA_DIR, file);
    let stored: StoredSession;
    try {
      stored = JSON.parse(readFileSync(path, "utf8")) as StoredSession;
    } catch (err) {
      logger.warn({ file, err }, "botKeystore: corrupt keystore file, deleting");
      try { unlinkSync(path); } catch { /* ignore */ }
      continue;
    }

    logger.info(
      { sessionId: stored.sessionId, bots: stored.bots.length, savedAt: stored.savedAt },
      "botKeystore: recovering session",
    );

    // Rebuild minimal bot wallets from stored secrets
    const bots = stored.bots.map(rebuildBotWallet);

    // Build a minimal Session-like object for teardownSession()
    const fakeSession: Pick<Session, "id" | "bots"> = {
      id: stored.sessionId,
      bots,
    };

    try {
      const td = await teardownSession(fakeSession as Session);
      logger.info(
        {
          sessionId: stored.sessionId,
          xlm: td.recovered.xlm,
          usdc: td.recovered.usdc,
        },
        "botKeystore: stranded funds recovered",
      );
    } catch (err) {
      logger.error(
        { err, sessionId: stored.sessionId },
        "botKeystore: recovery teardown failed (funds may still be stranded)",
      );
    }

    // Delete the keystore file regardless — if recovery failed, the keys
    // are still on disk as the JSON file, operator can manually recover.
    // But don't retry automatically on every boot.
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}
