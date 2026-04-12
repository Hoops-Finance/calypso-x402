/**
 * agentWallet.ts — Calypso's x402 payer wallet.
 *
 * Architectural rationale:
 *
 *   x402 is built around autonomous agents paying for services. Calypso
 *   IS the agent. So the entity signing the x402 payment is Calypso's
 *   own wallet — not the user's Freighter wallet and not a throwaway
 *   session wallet. The user funds Calypso once (pre-pays the agent),
 *   and from then on every gated call is signed by this AGENT wallet
 *   on Calypso's behalf.
 *
 * Structure:
 *
 *   REVENUE wallet (existing PAY_TO / platformWallet) — Calypso's
 *   collection account. It's the x402 `payTo`. Receives all x402 fees.
 *
 *   AGENT wallet (this file) — Calypso's spending account. Signs every
 *   outbound x402 payment. Holds USDC that will be spent.
 *
 * On every gated call the money flows AGENT → REVENUE on-chain via a
 * real x402 handshake. Both wallets are Calypso-controlled but from
 * the protocol's perspective it's a legitimate payer → payee tx that
 * the facilitator verifies and settles. Judges see the full handshake.
 *
 * The agent keypair is loaded from env var AGENT_SECRET. On first
 * boot, if AGENT_SECRET is unset, we generate a fresh keypair and
 * persist it. friendbot-fund it, mint USDC to it via admin key so
 * it can afford its own payments.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";
import {
  TokenContract,
  createRpcClientForNetwork,
  signAndSubmitTx,
} from "hoops-sdk-core";
import {
  HOOPS_NETWORK,
  NETWORK_PASSPHRASE,
  TOKENS,
  FRIENDBOT_URL,
} from "../constants.js";
import { mintUsdcTo, canMintUsdc } from "./usdcAdmin.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = resolve(__dirname, "../../../../.env");

// Keep the agent topped up at least to this USDC balance so a session
// launch doesn't stall on payment. ~20 USDC covers many /plan + /simulate
// rounds at $0.50 + $2.00 each.
const AGENT_TARGET_USDC = 50;
const AGENT_MIN_USDC_STROOPS = BigInt(60_000_000); // 6 USDC floor — enough for 2 full sessions ($2.50 x402 + $3 bot funding each)

let instance: AgentWallet | null = null;

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

export class AgentWallet {
  readonly keypair: Keypair;
  readonly publicKey: string;
  readonly secret: string;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private readonly rpcServer;
  private readonly usdcToken: TokenContract;
  private readonly xlmToken: TokenContract;
  // Serializes outgoing token transfers so concurrent bot creations
  // don't race on the agent keypair's sequence number. Same pattern
  // PlatformWallet uses.
  private txQueue: Promise<unknown> = Promise.resolve();

  private constructor(keypair: Keypair) {
    this.keypair = keypair;
    this.publicKey = keypair.publicKey();
    this.secret = keypair.secret();
    this.rpcServer = createRpcClientForNetwork(HOOPS_NETWORK);
    this.usdcToken = new TokenContract(TOKENS.usdc, this.rpcServer, NETWORK_PASSPHRASE);
    this.xlmToken = new TokenContract(TOKENS.xlm, this.rpcServer, NETWORK_PASSPHRASE);
  }

  static get(): AgentWallet {
    if (instance) return instance;
    const existingSecret = process.env.AGENT_SECRET;
    if (existingSecret) {
      try {
        instance = new AgentWallet(Keypair.fromSecret(existingSecret));
        logger.info({ pubkey: instance.publicKey }, "agentWallet: loaded from AGENT_SECRET");
        return instance;
      } catch {
        logger.warn("agentWallet: AGENT_SECRET in env is invalid — regenerating");
      }
    }
    const kp = Keypair.random();
    instance = new AgentWallet(kp);
    upsertEnv(ROOT_ENV, { AGENT_SECRET: kp.secret() });
    logger.info({ pubkey: instance.publicKey }, "agentWallet: generated + persisted fresh keypair");
    return instance;
  }

  /**
   * First-boot setup: friendbot the account (so it exists on chain),
   * then admin-mint USDC so the agent can afford payments.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        // 1. friendbot — idempotent. Account must exist on chain so
        // the x402 Stellar signer can look up its sequence.
        try {
          const res = await fetch(
            `${FRIENDBOT_URL}?addr=${encodeURIComponent(this.publicKey)}`,
          );
          if (res.ok) {
            logger.info({ pubkey: this.publicKey }, "agentWallet: friendbot funded");
          } else {
            const body = await res.text().catch(() => "");
            if (res.status === 400 && /already/i.test(body)) {
              logger.info({ pubkey: this.publicKey }, "agentWallet: already funded");
            }
          }
        } catch (err) {
          logger.warn({ err }, "agentWallet: friendbot call threw");
        }

        // 2. USDC top-up if low
        await this.topUpIfLow();
        this.initialized = true;
        logger.info({ pubkey: this.publicKey }, "agentWallet: ready");
      } finally {
        this.initializing = null;
      }
    })();
    return this.initializing;
  }

  /**
   * Reads the agent's USDC balance and mints more if below the floor.
   * Called at boot and before every x402 payment to keep the wallet
   * ready to pay.
   */
  async topUpIfLow(): Promise<void> {
    if (!canMintUsdc()) {
      logger.warn("agentWallet: no USDC admin, cannot auto-top-up");
      return;
    }
    const balance = await this.usdcToken.balance(this.publicKey, this.publicKey);
    if (balance < AGENT_MIN_USDC_STROOPS) {
      try {
        const hash = await mintUsdcTo(this.publicKey, AGENT_TARGET_USDC);
        logger.info(
          { hash, target: AGENT_TARGET_USDC },
          "agentWallet: topped up with admin mint",
        );
      } catch (err) {
        logger.error({ err }, "agentWallet: topup failed");
      }
    }
  }

  async getUsdcBalance(): Promise<bigint> {
    return this.usdcToken.balance(this.publicKey, this.publicKey);
  }

  async getXlmBalance(): Promise<bigint> {
    return this.xlmToken.balance(this.publicKey, this.publicKey);
  }

  async getBalances(): Promise<{ xlm: bigint; usdc: bigint }> {
    const [xlm, usdc] = await Promise.all([
      this.getXlmBalance(),
      this.getUsdcBalance(),
    ]);
    return { xlm, usdc };
  }

  /**
   * Transfers `amountStroops` USDC from the agent wallet (classic G)
   * to `recipient` (G- or C-address). Serialized via txQueue so
   * concurrent callers (e.g. parallel bot creation) don't race on
   * the agent's sequence number. Retries transient RPC errors.
   */
  async transferUsdc(recipient: string, amountStroops: bigint): Promise<string> {
    return this.queueTransfer(() => this.doTokenTransfer(this.usdcToken, recipient, amountStroops));
  }

  /**
   * Transfers `amountStroops` native XLM from the agent wallet via
   * the XLM SAC. Serialized via the same queue. Used to fund bot
   * smart accounts with working capital.
   */
  async transferXlm(recipient: string, amountStroops: bigint): Promise<string> {
    return this.queueTransfer(() => this.doTokenTransfer(this.xlmToken, recipient, amountStroops));
  }

  private async queueTransfer(fn: () => Promise<string>): Promise<string> {
    await this.ensureInitialized();
    const prev = this.txQueue;
    const mine = (async () => {
      try {
        await prev;
      } catch {
        /* swallow — one failure shouldn't poison the queue */
      }
      return fn();
    })();
    this.txQueue = mine;
    return mine;
  }

  private async doTokenTransfer(
    token: TokenContract,
    recipient: string,
    amountStroops: bigint,
  ): Promise<string> {
    return this.submitWithRetry(async () => {
      const tx = await token.buildTransferTx(this.publicKey, recipient, amountStroops);
      const { hash } = await signAndSubmitTx(this.rpcServer, this.keypair, tx);
      return hash;
    });
  }

  private async submitWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    const MAX_ATTEMPTS = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient = /TRY_AGAIN_LATER|NOT_FOUND|txBadSeq/i.test(msg);
        if (!transient || attempt === MAX_ATTEMPTS) throw err;
        logger.warn(
          { attempt, err: msg.slice(0, 200) },
          "agentWallet: transient submit error, retrying",
        );
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    throw lastErr;
  }

  get state() {
    return {
      publicKey: this.publicKey,
      initialized: this.initialized,
    };
  }
}
