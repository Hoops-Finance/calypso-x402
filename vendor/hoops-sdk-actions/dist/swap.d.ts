import { Keypair } from "@stellar/stellar-sdk";
import type { HoopsNetwork, SwapParams } from "hoops-sdk-types";
/**
 * Execute a swap through any pool.
 * Use `getBestQuote` or `getAllQuotes` from hoops-sdk-core to find the optimal pool.
 */
export declare function swap(keypair: Keypair, accountId: string, network: HoopsNetwork, params: SwapParams): Promise<string>;
/**
 * Convenience: swap XLM to USDC.
 * @param poolAddress - Pool to route through. Defaults to Soroswap pair.
 */
export declare function swapXlmToUsdc(keypair: Keypair, accountId: string, xlmAmount: number, network: HoopsNetwork, poolAddress?: string): Promise<string>;
//# sourceMappingURL=swap.d.ts.map