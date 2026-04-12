/**
 * localFacilitator.ts — in-process x402 facilitator.
 *
 * The hosted facilitator at x402.org/facilitator enforces
 * `maxTransactionFeeStroops = 50_000` (0.005 XLM). Soroban contract
 * invocations can legitimately cost several hundred thousand stroops
 * for inclusion + resource fees, so the hosted facilitator rejects
 * every call we make with `invalid_exact_stellar_payload_fee_exceeds_maximum`.
 *
 * Fix: run the facilitator in-process using @x402/stellar's
 * ExactStellarScheme with an elevated fee ceiling. For the demo the
 * API process hosts the facilitator, which is explicitly supported
 * by x402 (FacilitatorClient is an interface precisely so
 * implementations can be local or remote).
 *
 * Architectural note: the facilitator signer MUST NOT be involved
 * in the payment (scheme validates "facilitator address is not
 * involved in the transfer"). So we can't reuse PAY_TO (recipient)
 * or AGENT (sender). A dedicated facilitator keypair is created on
 * first boot, friendbot-funded for XLM fees, and persisted to .env
 * as FACILITATOR_SECRET. It only needs XLM — no USDC trustline.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@stellar/stellar-sdk";
import type {
  FacilitatorClient,
} from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  Network,
} from "@x402/core/types";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactStellarScheme as FacilitatorExactStellarScheme } from "@x402/stellar/exact/facilitator";
import { createEd25519Signer } from "@x402/stellar";
import { FRIENDBOT_URL } from "../constants.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = resolve(__dirname, "../../../../.env");

// Generous ceiling — real Soroban contract invocations routinely cost
// 200k-500k stroops (inclusion + resource fees). 5M is ~0.5 XLM per
// call max, way above anything we'd actually hit.
const MAX_TX_FEE_STROOPS = 5_000_000;

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

function loadOrCreateFacilitatorKeypair(): Keypair {
  const existing = process.env.FACILITATOR_SECRET;
  if (existing) {
    try {
      return Keypair.fromSecret(existing);
    } catch {
      logger.warn("localFacilitator: FACILITATOR_SECRET invalid — regenerating");
    }
  }
  const kp = Keypair.random();
  upsertEnv(ROOT_ENV, { FACILITATOR_SECRET: kp.secret() });
  logger.info({ pubkey: kp.publicKey() }, "localFacilitator: generated fresh facilitator keypair");
  return kp;
}

async function friendbotFund(pubkey: string): Promise<void> {
  try {
    const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pubkey)}`);
    if (res.ok) {
      logger.info({ pubkey }, "localFacilitator: friendbot funded facilitator");
    } else {
      const body = await res.text().catch(() => "");
      if (res.status === 400 && /already/i.test(body)) {
        logger.info({ pubkey }, "localFacilitator: facilitator already funded");
      } else {
        logger.warn({ pubkey, status: res.status, body: body.slice(0, 200) }, "localFacilitator: friendbot non-ok");
      }
    }
  } catch (err) {
    logger.warn({ err, pubkey }, "localFacilitator: friendbot call threw");
  }
}

/**
 * Thin adapter from x402Facilitator (which has verify/settle/getSupported
 * methods) to the FacilitatorClient interface expected by
 * paymentMiddlewareFromConfig. Lets the express middleware route
 * verify/settle calls straight into our in-process facilitator.
 */
class LocalFacilitatorClient implements FacilitatorClient {
  constructor(private readonly facilitator: x402Facilitator) {}

  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.facilitator.verify(payload, requirements);
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.facilitator.settle(payload, requirements);
  }

  async getSupported(): Promise<SupportedResponse> {
    return this.facilitator.getSupported() as SupportedResponse;
  }
}

export interface LocalFacilitatorSetup {
  client: FacilitatorClient;
  facilitatorPubkey: string;
}

export async function buildLocalFacilitator(network: Network): Promise<LocalFacilitatorSetup> {
  const keypair = loadOrCreateFacilitatorKeypair();
  await friendbotFund(keypair.publicKey());

  const signer = createEd25519Signer(keypair.secret(), network);
  const scheme = new FacilitatorExactStellarScheme([signer], {
    maxTransactionFeeStroops: MAX_TX_FEE_STROOPS,
    areFeesSponsored: true,
  });

  const facilitator = new x402Facilitator().register(network, scheme);
  const client = new LocalFacilitatorClient(facilitator);

  logger.info(
    {
      facilitator: keypair.publicKey(),
      network,
      maxFeeStroops: MAX_TX_FEE_STROOPS,
    },
    "localFacilitator: ready (in-process, elevated fee ceiling)",
  );

  return { client, facilitatorPubkey: keypair.publicKey() };
}
