/**
 * usdcAdmin.ts — mints Hoops testnet USDC directly using the token
 * contract's admin key.
 *
 * On testnet the USDC/XLM Soroswap pool reserves are drained, so the
 * bot self-swap strategy returns fractional dust. We own the admin key
 * of the test USDC contract (it's the hoops_contracts deployer), so we
 * can just mint fresh USDC directly into any address — bypassing the
 * swap entirely.
 *
 * SECURITY: this module holds the full admin key of the test USDC
 * token. Do NOT wire this into anything touching mainnet. Demo-mode
 * only.
 */

import { Keypair, Address, nativeToScVal } from "@stellar/stellar-sdk";
import {
  buildContractCallTx,
  signAndSubmitTx,
  createRpcClientForNetwork,
  toStroops,
} from "hoops-sdk-core";
import {
  HOOPS_NETWORK,
  NETWORK_PASSPHRASE,
  TOKENS,
} from "../constants.js";
import { ENV } from "../env.js";
import { logger } from "../logger.js";

let adminKeypair: Keypair | null = null;
function getAdminKeypair(): Keypair | null {
  if (adminKeypair) return adminKeypair;
  if (!ENV.USDC_ADMIN_SECRET) return null;
  try {
    adminKeypair = Keypair.fromSecret(ENV.USDC_ADMIN_SECRET);
    return adminKeypair;
  } catch (err) {
    logger.error({ err }, "usdcAdmin: invalid USDC_ADMIN_SECRET");
    return null;
  }
}

export function canMintUsdc(): boolean {
  return getAdminKeypair() !== null;
}

/**
 * Mints `amount` USDC (human units, e.g. 1.5 for 1.5 USDC) to the
 * given Stellar address. The admin key signs + submits.
 *
 * Serializes across calls via a simple promise chain so concurrent
 * mints don't race on the admin keypair's sequence number.
 */

let mintQueue: Promise<unknown> = Promise.resolve();

export async function mintUsdcTo(recipient: string, amount: number): Promise<string> {
  const admin = getAdminKeypair();
  if (!admin) {
    throw new Error("USDC admin key not configured (USDC_ADMIN_SECRET)");
  }

  // Serialize so concurrent calls don't clash on the admin sequence.
  const prev = mintQueue;
  const mine = (async () => {
    try {
      await prev;
    } catch {
      /* swallow */
    }
    return doMint(admin, recipient, amount);
  })();
  mintQueue = mine;
  return mine;
}

async function doMint(admin: Keypair, recipient: string, amount: number): Promise<string> {
  const server = createRpcClientForNetwork(HOOPS_NETWORK);
  const amountStroops = toStroops(amount);

  const tx = await buildContractCallTx(
    server,
    admin.publicKey(),
    NETWORK_PASSPHRASE,
    TOKENS.usdc,
    "mint",
    [
      new Address(recipient).toScVal(),
      nativeToScVal(amountStroops, { type: "i128" }),
    ],
  );

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { hash } = await signAndSubmitTx(server, admin, tx);
      return hash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /TRY_AGAIN_LATER|NOT_FOUND|txBadSeq/i.test(msg);
      if (!transient || attempt === MAX_ATTEMPTS) throw err;
      logger.warn(
        { attempt, err: msg.slice(0, 200) },
        "usdcAdmin: transient mint error, retrying",
      );
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error("unreachable");
}
