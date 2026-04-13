/**
 * hoopsRouter.ts — multi-DEX swap execution for Calypso bot swarms.
 *
 * Two execution paths:
 *   1. Soroswap: via HoopsSession.swapXlmToUsdc (smart account path)
 *   2. Aqua/Phoenix: via AdapterContract.swapExactIn (direct EOA path)
 *
 * The smart account contract has an auth issue with non-Soroswap adapters.
 * For Aqua and Phoenix, we bypass the smart account entirely and call the
 * adapter's swap_exact_in() directly from the bot's EOA keypair. The EOA
 * has ~1,000 XLM remaining after funding the smart account — enough for
 * direct swaps. Output USDC lands on the EOA.
 */

import { Keypair, rpc } from "@stellar/stellar-sdk";
import {
  RouterContract,
  createRpcClientForNetwork,
  signAndSubmitTx,
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
import { AdapterContract } from "./adapterContract.js";
import { logger } from "../logger.js";

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
// Adapter config
// ---------------------------------------------------------------------------

const ADAPTER_NAME_BY_ID: Record<number, string> = {
  0: "aqua",
  1: "comet",
  2: "phoenix",
  3: "soroswap",
};

export const ADAPTERS_BY_ID = {
  aqua: 0,
  comet: 1,
  phoenix: 2,
  soroswap: 3,
} as const;

// Comet excluded — stale testnet pools return absurd quotes.
const ENABLED_ADAPTERS: Set<number> = new Set([ADAPTERS_BY_ID.soroswap, ADAPTERS_BY_ID.aqua, ADAPTERS_BY_ID.phoenix]);

// Map adapter IDs to their on-chain contract addresses for direct calls
const ADAPTER_ADDRESS_BY_ID: Record<number, string> = {
  [ADAPTERS_BY_ID.aqua]: ADAPTERS.aqua,
  [ADAPTERS_BY_ID.phoenix]: ADAPTERS.phoenix,
  [ADAPTERS_BY_ID.soroswap]: ADAPTERS.soroswap,
};

// ---------------------------------------------------------------------------
// Quotes
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
  const result = await router().getBestQuote(caller, amountIn, tokenIn, tokenOut);
  return result ? normalizeQuote(result) : null;
}

export async function getAllQuotes(
  caller: string,
  amountIn: bigint,
  tokenIn: string,
  tokenOut: string,
): Promise<BestQuote[]> {
  const qs = await router().getAllQuotes(caller, amountIn, tokenIn, tokenOut);
  return qs.map(normalizeQuote).filter((q) => ENABLED_ADAPTERS.has(q.adapterId));
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface BotSession {
  session: HoopsSession;
  pubkey: string;
  smartAccountId: string;
}

export async function createBotSession(keypair: Keypair): Promise<BotSession> {
  const session = createSession({ network: HOOPS_NETWORK, keypair });
  const smartAccountId = await session.deploySmartAccount();
  return { session, pubkey: keypair.publicKey(), smartAccountId };
}

// ---------------------------------------------------------------------------
// Swap — direct adapter call for Aqua/Phoenix, smart account for Soroswap
// ---------------------------------------------------------------------------

export interface SwapResult {
  txHash: string;
  adapterId: number;
  adapterName: string;
  poolAddress: string;
  amountIn: bigint;
  expectedAmountOut: bigint;
  quoteSnapshot: BestQuote[];
}

/**
 * Execute a swap directly through an adapter contract (bypassing smart account).
 * The bot's EOA signs the transaction and provides auth directly.
 */
async function swapViaAdapter(
  bot: BotSession,
  adapterId: number,
  amountIn: bigint,
  expectedOut: bigint,
): Promise<string> {
  const adapterAddress = ADAPTER_ADDRESS_BY_ID[adapterId];
  if (!adapterAddress) throw new Error(`no adapter address for ID ${adapterId}`);

  const adapter = new AdapterContract(adapterAddress, server(), NETWORK_PASSPHRASE);
  const tx = await adapter.buildSwapExactIn(
    bot.pubkey,
    amountIn,
    0n, // min_out = 0 for testnet (no slippage protection needed)
    TOKENS.xlm,
    TOKENS.usdc,
  );
  const result = await signAndSubmitTx(server(), bot.session.keypair, tx);
  return result.hash;
}

/**
 * Executes an XLM -> USDC swap through the best-priced adapter.
 *
 * - Soroswap: uses HoopsSession.swapXlmToUsdc (smart account, known working)
 * - Aqua/Phoenix: uses direct adapter swap_exact_in (bypasses smart account)
 * - Falls back to Soroswap if the direct adapter call fails
 */
export async function swapXlmToUsdc(bot: BotSession, xlmAmount: number): Promise<SwapResult> {
  const amountIn = toStroops(xlmAmount);
  const quoteSnapshot = await getAllQuotes(bot.pubkey, amountIn, TOKENS.xlm, TOKENS.usdc)
    .catch(() => [] as BestQuote[]);

  // Find best quote among enabled adapters
  let best: BestQuote | null = null;
  for (const q of quoteSnapshot) {
    if (!best || q.amountOut > best.amountOut) best = q;
  }

  const bestAdapterId = best?.adapterId ?? ADAPTERS_BY_ID.soroswap;
  const bestAdapterName = ADAPTER_NAME_BY_ID[bestAdapterId] ?? "unknown";
  const bestPoolAddress = best?.poolAddress ?? POOLS.soroswapPair;

  // Try best-priced adapter
  try {
    let txHash: string;
    if (bestAdapterId === ADAPTERS_BY_ID.soroswap) {
      // Soroswap: smart account path (known working)
      txHash = await bot.session.swapXlmToUsdc(xlmAmount, POOLS.soroswapPair);
    } else {
      // Aqua/Phoenix: direct adapter call (bypasses smart account auth issue)
      txHash = await swapViaAdapter(bot, bestAdapterId, amountIn, best?.amountOut ?? 0n);
    }

    logger.info(
      { adapter: bestAdapterName, txHash: txHash.slice(0, 12) },
      "swap: executed via best adapter",
    );

    return {
      txHash,
      adapterId: bestAdapterId,
      adapterName: bestAdapterName,
      poolAddress: bestPoolAddress,
      amountIn,
      expectedAmountOut: best?.amountOut ?? 0n,
      quoteSnapshot,
    };
  } catch (err) {
    if (bestAdapterId === ADAPTERS_BY_ID.soroswap) throw err;

    logger.warn(
      { adapter: bestAdapterName, err: err instanceof Error ? err.message : err },
      "swap: direct adapter call failed, falling back to soroswap",
    );

    // Fallback to Soroswap via smart account
    const soroswapQuote = quoteSnapshot.find((q) => q.adapterId === ADAPTERS_BY_ID.soroswap);
    const txHash = await bot.session.swapXlmToUsdc(xlmAmount, POOLS.soroswapPair);
    return {
      txHash,
      adapterId: ADAPTERS_BY_ID.soroswap,
      adapterName: "soroswap",
      poolAddress: POOLS.soroswapPair,
      amountIn,
      expectedAmountOut: soroswapQuote?.amountOut ?? 0n,
      quoteSnapshot,
    };
  }
}

export function allAdapterAddresses(): Record<string, string> {
  return { ...ADAPTERS };
}

export { toStroops, fromStroops };
