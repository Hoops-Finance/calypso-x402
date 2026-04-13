import { Keypair } from "@stellar/stellar-sdk";
import type { HoopsNetwork, SwapParams } from "hoops-sdk-types";
import { getAddressBook } from "hoops-sdk-types";
import {
  createRpcClientForNetwork,
  getNetworkConfig,
  SmartAccountContract,
  signAndSubmitTx,
  toStroops,
  getDeadline,
} from "hoops-sdk-core";

/**
 * Execute a swap through any pool.
 * Use `getBestQuote` or `getAllQuotes` from hoops-sdk-core to find the optimal pool.
 */
export async function swap(
  keypair: Keypair,
  accountId: string,
  network: HoopsNetwork,
  params: SwapParams
): Promise<string> {
  const config = getNetworkConfig(network);
  const server = createRpcClientForNetwork(network);
  const pubkey = keypair.publicKey();

  const account = new SmartAccountContract(accountId, server, config.passphrase);
  const swapTx = await account.buildSwapTx(
    pubkey,
    params.tokenIn,
    params.tokenOut,
    params.amount,
    params.poolAddress,
    params.deadline ?? getDeadline()
  );

  const result = await signAndSubmitTx(server, keypair, swapTx);
  return result.hash;
}

/**
 * Convenience: swap XLM to USDC.
 * @param poolAddress - Pool to route through. Defaults to Soroswap pair.
 */
export async function swapXlmToUsdc(
  keypair: Keypair,
  accountId: string,
  xlmAmount: number,
  network: HoopsNetwork,
  poolAddress?: string
): Promise<string> {
  const addressBook = getAddressBook(network);
  return swap(keypair, accountId, network, {
    tokenIn: addressBook.tokens.xlm,
    tokenOut: addressBook.tokens.usdc,
    amount: toStroops(xlmAmount),
    poolAddress: poolAddress ?? addressBook.pools.soroswapPair,
  });
}
