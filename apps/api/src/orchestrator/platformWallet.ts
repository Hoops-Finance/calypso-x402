/**
 * platformWallet.ts — the Calypso orchestrator's Stellar wallet.
 *
 * Mental model:
 *
 *   user (Freighter)
 *     │ x402 USDC
 *     ▼
 *   ORCHESTRATOR (this file)   ← the platform wallet
 *     │ funds XLM + USDC into each bot smart account
 *     ▼
 *   bot wallets
 *     │ trades via Hoops router
 *     ▼
 *   DEX pools
 *
 * The orchestrator is the only component that ever has to touch Stellar
 * directly to acquire USDC. Bots are pure consumers: they receive XLM
 * (from friendbot) + USDC (from us) and route swaps.
 *
 * --------------------------------------------------------------------
 * TESTNET ECONOMICS NOTE
 *
 * The Hoops testnet Soroswap USDC/XLM pool is reserves-broken: XLM is
 * priced near zero, so a 5 XLM swap returns roughly 0.0007 USDC. To
 * accumulate meaningful USDC for bot seeding, we do a LARGE swap
 * (SEED_SWAP_XLM_AMOUNT). The resulting USDC (however small) becomes
 * the orchestrator's float.
 *
 * If a session exhausts the orchestrator's USDC, new bot creations
 * will still succeed but with 0 USDC — the LP bot will skip cleanly
 * and the other archetypes will continue to function on XLM alone.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";
import {
  TokenContract,
  SmartAccountContract,
  createRpcClientForNetwork,
  signAndSubmitTx,
} from "hoops-sdk-core";
import { createSession, HoopsSession } from "hoops-sdk-actions";
import {
  HOOPS_NETWORK,
  NETWORK_PASSPHRASE,
  TOKENS,
  FRIENDBOT_URL,
} from "../constants.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = resolve(__dirname, "../../../../.env");

// Minimum USDC balance at which we consider the wallet "seeded enough"
// and skip the costly fund+swap steps on reboot.
const SEED_SUFFICIENT_USDC_STROOPS = BigInt(5_000_000); // 0.5 USDC

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

// Friendbot gives 10,000 XLM. We fund the smart account with 9,500 XLM
// (leaving 500 XLM on the EOA for fees + reserves), then swap 8,500 of
// those into USDC. Empirically on the Hoops testnet Soroswap pool that
// yields ~1.1–1.2 USDC — enough for ~2 LP bots or ~5 non-LP bots.
const SEED_SWAP_XLM_AMOUNT = 8_500;
const SMART_ACCOUNT_XLM_FUNDING = 9_500;

let instance: PlatformWallet | null = null;

export class PlatformWallet {
  readonly keypair: Keypair;
  readonly eoa: string;
  private session: HoopsSession | null = null;
  private smartAccountId: string | null = null;
  private readonly rpcServer;
  private readonly usdcToken: TokenContract;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  // Serializes outgoing token transfers so concurrent callers don't race
  // on the platform keypair's sequence number. Each new transferUsdc()
  // chains onto this promise and updates it. Swallows errors in the
  // chain so one failed transfer doesn't poison subsequent ones.
  private txQueue: Promise<unknown> = Promise.resolve();

  private constructor(keypair: Keypair) {
    this.keypair = keypair;
    this.eoa = keypair.publicKey();
    this.rpcServer = createRpcClientForNetwork(HOOPS_NETWORK);
    this.usdcToken = new TokenContract(TOKENS.usdc, this.rpcServer, NETWORK_PASSPHRASE);
  }

  static get(): PlatformWallet {
    if (!instance) {
      const secret = process.env.PAY_TO_SECRET;
      if (!secret) {
        throw new Error(
          "PAY_TO_SECRET not set — run `pnpm bootstrap-pay-to` to generate the orchestrator wallet",
        );
      }
      instance = new PlatformWallet(Keypair.fromSecret(secret));
    }
    return instance;
  }

  /**
   * One-shot boot sequence:
   *   1. friendbot (idempotent if already funded)
   *   2. deploy smart account (idempotent if already deployed)
   *   3. fund smart account with XLM
   *   4. swap a large chunk of XLM → USDC, then forward the USDC from
   *      the EOA (where the Hoops swap actually delivers it) to a
   *      balance we can transfer from
   *
   * Every step is wrapped so a partial failure doesn't crash bootstrap.
   * Concurrent callers share the same init promise.
   */
  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        await this.boot();
        this.initialized = true;
        logger.info({ eoa: this.eoa, smart: this.smartAccountId }, "platformWallet: ready");
      } catch (err) {
        logger.error({ err }, "platformWallet: boot failed (will retry on next use)");
        throw err;
      } finally {
        this.initializing = null;
      }
    })();
    return this.initializing;
  }

  private async boot(): Promise<void> {
    const persistedSmartAccountId = process.env.PLATFORM_SMART_ACCOUNT_ID;

    // FAST PATH — we already have a persisted smart account from a
    // prior boot. Trust it and use whatever USDC it currently holds.
    // If USDC runs low in the middle of a session, the operator can
    // hit POST /wallets/reseed to top up (see reseed()).
    if (persistedSmartAccountId) {
      this.session = createSession({
        network: HOOPS_NETWORK,
        keypair: this.keypair,
        smartAccountId: persistedSmartAccountId,
      });
      this.smartAccountId = persistedSmartAccountId;
      const currentSmartUsdc = await this.usdcToken.balance(this.eoa, this.smartAccountId);
      logger.info(
        { smart: this.smartAccountId, smart_usdc: currentSmartUsdc.toString() },
        "platformWallet: reusing persisted smart account (fast path)",
      );
      return;
    }

    // SLOW PATH — first-ever boot. Full seed sequence.
    try {
      const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(this.eoa)}`);
      if (res.ok) {
        logger.info({ eoa: this.eoa }, "platformWallet: friendbot funded");
      } else {
        const body = await res.text().catch(() => "");
        if (res.status === 400 && /already/i.test(body)) {
          logger.info({ eoa: this.eoa }, "platformWallet: already funded");
        } else {
          logger.warn({ status: res.status, body }, "platformWallet: friendbot non-ok");
        }
      }
    } catch (err) {
      logger.warn({ err }, "platformWallet: friendbot threw");
    }

    this.session = createSession({ network: HOOPS_NETWORK, keypair: this.keypair });
    try {
      this.smartAccountId = await this.session.deploySmartAccount();
      upsertEnv(ROOT_ENV, { PLATFORM_SMART_ACCOUNT_ID: this.smartAccountId });
      logger.info(
        { smart: this.smartAccountId },
        "platformWallet: deployed + persisted smart account",
      );
    } catch (err) {
      logger.error({ err }, "platformWallet: deploySmartAccount failed");
      throw new Error("platformWallet: deploy failed on first boot");
    }

    if (!this.smartAccountId) {
      throw new Error("platformWallet: no smart account after boot");
    }

    await this.fundAndSwap();
  }

  /**
   * Runs the core fund-XLM-then-swap-to-USDC cycle. Called from boot
   * on first run, and callable externally via reseed() when USDC runs
   * low. Does NOT mutate any persistence state.
   */
  private async fundAndSwap(): Promise<void> {
    if (!this.session || !this.smartAccountId) {
      throw new Error("platformWallet: fundAndSwap called before session ready");
    }
    try {
      await this.session.fundAccountXlm(SMART_ACCOUNT_XLM_FUNDING);
      logger.info(
        { xlm: SMART_ACCOUNT_XLM_FUNDING },
        "platformWallet: funded smart account with XLM",
      );
    } catch (err) {
      logger.warn({ err }, "platformWallet: fundAccountXlm failed");
    }

    try {
      const txHash = await this.session.swapXlmToUsdc(SEED_SWAP_XLM_AMOUNT);
      logger.info({ txHash, xlm: SEED_SWAP_XLM_AMOUNT }, "platformWallet: seed swap landed");
    } catch (err) {
      logger.warn({ err }, "platformWallet: seed swap failed — USDC balance will be 0");
    }

    const [eoaUsdc, smartUsdc] = await Promise.all([
      this.usdcToken.balance(this.eoa, this.eoa),
      this.usdcToken.balance(this.eoa, this.smartAccountId),
    ]);
    logger.info(
      {
        eoa_usdc: eoaUsdc.toString(),
        smart_usdc: smartUsdc.toString(),
      },
      "platformWallet: usdc balances after fund+swap",
    );
  }

  /**
   * Top up the orchestrator's USDC by admin-minting directly to its
   * smart account. Replaces the old fundAndSwap-based reseed path
   * which was broken by the XLM SAC's stuck EOA balance after one
   * transfer. Requires USDC_ADMIN_SECRET to be configured. In a
   * production Calypso this would be replaced by a real x402 payment
   * from the user's wallet.
   */
  async topUpUsdc(amount: number): Promise<string> {
    await this.ensureInitialized();
    if (!this.smartAccountId) {
      throw new Error("platformWallet: no smart account");
    }
    const { mintUsdcTo, canMintUsdc } = await import("./usdcAdmin.js");
    if (!canMintUsdc()) {
      throw new Error(
        "platformWallet: USDC admin not configured — set USDC_ADMIN_SECRET",
      );
    }
    return mintUsdcTo(this.smartAccountId, amount);
  }

  /**
   * Withdraws USDC from the orchestrator smart account to an arbitrary
   * recipient address. Same serialization + retry path as transferUsdc,
   * just with human-facing semantics: the operator calls this from the
   * /wallets page to pull money back out of Calypso.
   */
  async withdrawUsdc(
    recipient: string,
    amount: number,
  ): Promise<{ hash: string; amountStroops: bigint }> {
    const { toStroops } = await import("hoops-sdk-core");
    const amountStroops = toStroops(amount);
    const hash = await this.transferUsdc(recipient, amountStroops);
    return { hash, amountStroops };
  }

  /**
   * Returns the platform smart account's current USDC balance.
   * Used by the teardown route to confirm recovery landed.
   */
  async getUsdcBalance(): Promise<bigint> {
    await this.ensureInitialized();
    if (!this.smartAccountId) return BigInt(0);
    return this.usdcToken.balance(this.eoa, this.smartAccountId);
  }

  /**
   * Transfers `amountStroops` USDC from the orchestrator to `recipient`.
   *
   * Serialized via the internal txQueue so multiple concurrent callers
   * (e.g. Promise.all over bot creation) don't race on the platform
   * keypair's sequence number. Each invocation:
   *   1. Waits for any previously-queued transfer to finish
   *   2. Reads orchestrator balances fresh
   *   3. Submits the transfer tx, retrying transient RPC errors
   *      (TRY_AGAIN_LATER, NOT_FOUND during waitForTx) up to 3 times
   */
  async transferUsdc(recipient: string, amountStroops: bigint): Promise<string> {
    await this.ensureInitialized();
    const prev = this.txQueue;
    const mine = (async () => {
      try {
        await prev;
      } catch {
        /* swallow — one failure shouldn't poison the queue */
      }
      return this.doTransferUsdc(recipient, amountStroops);
    })();
    this.txQueue = mine;
    return mine;
  }

  private async doTransferUsdc(recipient: string, amountStroops: bigint): Promise<string> {
    if (!this.smartAccountId) {
      throw new Error("platformWallet: no smart account");
    }

    const smartBalance = await this.usdcToken.balance(this.eoa, this.smartAccountId);
    if (smartBalance >= amountStroops) {
      return this.submitWithRetry(async () => {
        const account = new SmartAccountContract(
          this.smartAccountId!,
          this.rpcServer,
          NETWORK_PASSPHRASE,
        );
        const tx = await account.buildTransferTx(this.eoa, TOKENS.usdc, recipient, amountStroops);
        const { hash } = await signAndSubmitTx(this.rpcServer, this.keypair, tx);
        return hash;
      });
    }

    const eoaBalance = await this.usdcToken.balance(this.eoa, this.eoa);
    if (eoaBalance >= amountStroops) {
      return this.submitWithRetry(async () => {
        const tx = await this.usdcToken.buildTransferTx(this.eoa, recipient, amountStroops);
        const { hash } = await signAndSubmitTx(this.rpcServer, this.keypair, tx);
        return hash;
      });
    }

    throw new Error(
      `platformWallet: insufficient USDC (smart=${smartBalance}, eoa=${eoaBalance}, need=${amountStroops})`,
    );
  }

  /**
   * Retries a soroban tx submission on transient failures. Soroban
   * preview RPC throws TRY_AGAIN_LATER under load and NOT_FOUND when
   * waitForTx races the indexer. Both are safe to retry after a short
   * backoff.
   */
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
        if (!transient || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        const backoffMs = 1500 * attempt;
        logger.warn(
          { attempt, backoffMs, err: msg.slice(0, 200) },
          "platformWallet: transient submit error, retrying",
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw lastErr;
  }

  /** For the UI/diagnostics. */
  get state() {
    return {
      initialized: this.initialized,
      eoa: this.eoa,
      smartAccountId: this.smartAccountId,
    };
  }
}
