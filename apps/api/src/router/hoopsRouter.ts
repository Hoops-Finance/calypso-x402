/**
 * hoopsRouter.ts — thin wrapper around hoops-sdk-* that exposes:
 *   - best-quote lookup across all DEX adapters via the Hoops router
 *   - swap execution via a deployed SmartAccount for a bot keypair
 *
 * All bots route through this module. Never call DEX contracts directly.
 */

import { Keypair, rpc } from "@stellar/stellar-sdk";
import {
  RouterContract,
  createRpcClientForNetwork,
  toStroops,
  fromStroops,
} from "hoops-sdk-core";
import { createSession, HoopsSession } from "hoops-sdk-actions";
import type { SwapQuote } from "hoops-sdk-types";

import {
  HOOPS_NETWORK,
  NETWORK_PASSPHRASE,
  ROUTER_ID,
  TOKENS,
  POOLS,
  ADAPTERS,
} from "../constants.js";

let sharedServer: rpc.Server | null = null;
function server(): rpc.Server {
  if (!sharedServer) sharedServer = createRpcClientForNetwork(HOOPS_NETWORK);
  return sharedServer;
}

let sharedRouter: RouterContract | null = null;
function router(): RouterContract {
  if (!sharedRouter) sharedRouter = new RouterContract(ROUTER_ID, server(), NETWORK_PASSPHRASE);
  return sharedRouter;
}

// ---------------------------------------------------------------------------
// Quotes — dex-agnostic, goes through the Hoops router which polls all adapters
// ---------------------------------------------------------------------------

export interface BestQuote {
  adapterId: number;
  poolAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
}

function normalizeQuote(q: SwapQuote): BestQuote {
  return {
    adapterId: Number(q.adapterId),
    poolAddress: q.poolAddress,
    tokenIn: q.tokenIn,
    tokenOut: q.tokenOut,
    amountIn: q.amountIn,
    amountOut: q.amountOut,
  };
}

export async function getBestQuote(
  caller: string,
  amountIn: bigint,
  tokenIn: string,
  tokenOut: string,
): Promise<BestQuote | null> {
  // NOTE: we don't call router.getBestQuote directly — there's a latent
  // deserialization bug in hoops-sdk-core that assumes the on-chain
  // `Option<SwapQuote>` comes back wrapped in a Vec. Instead, pull all
  // quotes and pick the highest amountOut ourselves. Same semantics, and
  // it also surfaces per-adapter quotes for free — useful for the arbitrageur.
  const all = await router().getAllQuotes(caller, amountIn, tokenIn, tokenOut);
  if (all.length === 0) return null;
  let best: SwapQuote = all[0]!;
  for (const q of all) {
    if (q.amountOut > best.amountOut) best = q;
  }
  return normalizeQuote(best);
}

export async function getAllQuotes(
  caller: string,
  amountIn: bigint,
  tokenIn: string,
  tokenOut: string,
): Promise<BestQuote[]> {
  const qs = await router().getAllQuotes(caller, amountIn, tokenIn, tokenOut);
  return qs.map(normalizeQuote);
}

// ---------------------------------------------------------------------------
// Sessions — one HoopsSession per bot wallet. Encapsulates the smart account.
// ---------------------------------------------------------------------------

export interface BotSession {
  session: HoopsSession;
  pubkey: string;
  smartAccountId: string;
}

/**
 * Creates a fresh HoopsSession for a bot keypair and deploys its smart account.
 * Caller must ensure the keypair's account is already funded with XLM.
 */
export async function createBotSession(keypair: Keypair): Promise<BotSession> {
  const session = createSession({ network: HOOPS_NETWORK, keypair });
  const smartAccountId = await session.deploySmartAccount();
  return { session, pubkey: keypair.publicKey(), smartAccountId };
}

// ---------------------------------------------------------------------------
// Generic router-driven swap: pick best quote, execute via SmartAccount
// ---------------------------------------------------------------------------

export interface SwapResult {
  txHash: string;
  adapterId: number;
  poolAddress: string;
  amountIn: bigint;
  expectedAmountOut: bigint;
  /** Per-adapter quotes we saw at execution time — used for spread metrics. */
  quoteSnapshot: BestQuote[];
}

/**
 * Executes an XLM → USDC swap of `xlmAmount` (human units) through the
 * SDK's known-working Soroswap path via HoopsSession. In parallel we snapshot
 * the multi-DEX quote surface so the arbitrageur bot + aggregator still see
 * per-adapter prices at execution time. Writing a fully generic
 * router-driven execution path is blocked on a Soroban auth issue in the
 * Comet/Phoenix/Aqua adapters that lives outside this repo.
 */
export async function swapXlmToUsdc(bot: BotSession, xlmAmount: number): Promise<SwapResult> {
  const amountIn = toStroops(xlmAmount);
  const [quoteSnapshot, txHash] = await Promise.all([
    getAllQuotes(bot.pubkey, amountIn, TOKENS.xlm, TOKENS.usdc).catch(() => [] as BestQuote[]),
    bot.session.swapXlmToUsdc(xlmAmount),
  ]);

  let executed: BestQuote | undefined;
  for (const q of quoteSnapshot) {
    if (q.adapterId === ADAPTERS_BY_ID.soroswap) {
      executed = q;
      break;
    }
  }

  return {
    txHash,
    adapterId: ADAPTERS_BY_ID.soroswap,
    poolAddress: POOLS.soroswapPair,
    amountIn,
    expectedAmountOut: executed?.amountOut ?? 0n,
    quoteSnapshot,
  };
}

// Reverse direction + arbitrary pair support are intentionally omitted: the
// v0 bot archetypes simulate market stress by hammering one well-known path
// (XLM→USDC on Soroswap) while the arb bot quotes every DEX and flags spread.
// Generic multi-DEX execution reopens the Comet auth rabbit hole and is not
// worth blocking the submission on.

// Exported for the arbitrageur bot so it can emit per-DEX spread metrics.
export const ADAPTERS_BY_ID = {
  aqua: 0,
  comet: 1,
  phoenix: 2,
  soroswap: 3,
} as const;

/** Lists the configured Hoops adapter contract IDs. */
export function allAdapterAddresses(): Record<string, string> {
  return { ...ADAPTERS };
}

export { toStroops, fromStroops };
