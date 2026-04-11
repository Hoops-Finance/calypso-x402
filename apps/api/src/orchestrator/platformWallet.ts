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
    // 1. friendbot — idempotent. Only call if we don't already have a
    // persisted smart account, since a re-friendbot of an already-
    // funded account is a no-op anyway.
    const persistedSmartAccountId = process.env.PLATFORM_SMART_ACCOUNT_ID;
    if (!persistedSmartAccountId) {
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
    }

    // 2. Session + smart account. Reuse the persisted ID if we have
    // one, otherwise deploy a new one and write it back to .env so
    // subsequent boots (inc. tsx watcher reloads) don't burn another
    // 9500 XLM on a throwaway deploy.
    if (persistedSmartAccountId) {
      this.session = createSession({
        network: HOOPS_NETWORK,
        keypair: this.keypair,
        smartAccountId: persistedSmartAccountId,
      });
      this.smartAccountId = persistedSmartAccountId;
      logger.info({ smart: this.smartAccountId }, "platformWallet: reusing persisted smart account");
    } else {
      this.session = createSession({ network: HOOPS_NETWORK, keypair: this.keypair });
      try {
        this.smartAccountId = await this.session.deploySmartAccount();
        upsertEnv(ROOT_ENV, { PLATFORM_SMART_ACCOUNT_ID: this.smartAccountId });
        logger.info(
          { smart: this.smartAccountId },
          "platformWallet: deployed + persisted smart account",
        );
      } catch (err) {
        logger.warn({ err }, "platformWallet: deploySmartAccount failed (continuing)");
        this.smartAccountId = this.session.state.smartAccountId;
      }
    }

    if (!this.smartAccountId) {
      throw new Error("platformWallet: no smart account after boot");
    }

    // 3. If the smart account already holds enough USDC to seed bots,
    // skip the fund + swap entirely. This is the hot path on reloads.
    const currentSmartUsdc = await this.usdcToken.balance(this.eoa, this.smartAccountId);
    if (currentSmartUsdc >= SEED_SUFFICIENT_USDC_STROOPS) {
      logger.info(
        { smart_usdc: currentSmartUsdc.toString() },
        "platformWallet: already seeded, skipping XLM funding + swap",
      );
      return;
    }

    // 4. fund smart account with XLM
    try {
      await this.session.fundAccountXlm(SMART_ACCOUNT_XLM_FUNDING);
      logger.info(
        { xlm: SMART_ACCOUNT_XLM_FUNDING },
        "platformWallet: funded smart account with XLM",
      );
    } catch (err) {
      logger.warn({ err }, "platformWallet: fundAccountXlm failed");
    }

    // 5. seed swap — XLM → USDC. Hoops' smart-account swap path
    // actually delivers USDC to the smart account (verified after a
    // prior diagnostic scare).
    try {
      const txHash = await this.session.swapXlmToUsdc(SEED_SWAP_XLM_AMOUNT);
      logger.info({ txHash, xlm: SEED_SWAP_XLM_AMOUNT }, "platformWallet: seed swap landed");
    } catch (err) {
      logger.warn({ err }, "platformWallet: seed swap failed — USDC balance will be 0");
    }

    // 6. final balance log
    const [eoaUsdc, smartUsdc] = await Promise.all([
      this.usdcToken.balance(this.eoa, this.eoa),
      this.usdcToken.balance(this.eoa, this.smartAccountId),
    ]);
    logger.info(
      {
        eoa_usdc: eoaUsdc.toString(),
        smart_usdc: smartUsdc.toString(),
      },
      "platformWallet: usdc balances after seed",
    );
  }

  /**
   * Transfers `amountStroops` USDC from the orchestrator to `recipient`.
   *
   * Checks the smart account first (where the Hoops swap actually
   * delivers USDC — the earlier "swap lands on EOA" theory was wrong).
   * If the smart account has enough, we use SmartAccountContract's
   * built-in `transfer(token, to, amount)` method, which is how the
   * smart account releases tokens to arbitrary addresses. Falls back
   * to the EOA path if for some reason USDC ended up there instead.
   */
  async transferUsdc(recipient: string, amountStroops: bigint): Promise<string> {
    await this.ensureInitialized();

    if (!this.smartAccountId) {
      throw new Error("platformWallet: no smart account");
    }

    const smartBalance = await this.usdcToken.balance(this.eoa, this.smartAccountId);
    if (smartBalance >= amountStroops) {
      const account = new SmartAccountContract(
        this.smartAccountId,
        this.rpcServer,
        NETWORK_PASSPHRASE,
      );
      const tx = await account.buildTransferTx(this.eoa, TOKENS.usdc, recipient, amountStroops);
      const { hash } = await signAndSubmitTx(this.rpcServer, this.keypair, tx);
      return hash;
    }

    const eoaBalance = await this.usdcToken.balance(this.eoa, this.eoa);
    if (eoaBalance >= amountStroops) {
      const tx = await this.usdcToken.buildTransferTx(this.eoa, recipient, amountStroops);
      const { hash } = await signAndSubmitTx(this.rpcServer, this.keypair, tx);
      return hash;
    }

    throw new Error(
      `platformWallet: insufficient USDC (smart=${smartBalance}, eoa=${eoaBalance}, need=${amountStroops})`,
    );
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
