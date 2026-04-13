import { Keypair } from "@stellar/stellar-sdk";
import type { HoopsNetwork, DepositParams } from "hoops-sdk-types";
/**
 * Deposit liquidity with configurable adapter selection and split ratio.
 *
 * @param params.adapterIds - Which adapters to target. Defaults to [AQUA, SOROSWAP].
 *   Max 2 adapters (resource limits prevent batching more).
 * @param params.splitRatio - Portion of funds for first adapter (0-1).
 *   Only used with 2 adapters. Defaults to 0.5.
 */
export declare function addLiquidity(keypair: Keypair, accountId: string, network: HoopsNetwork, params?: DepositParams): Promise<void>;
/** Convenience: 50/50 split across Aqua + Soroswap. */
export declare function addLiquidity50_50(keypair: Keypair, accountId: string, network: HoopsNetwork): Promise<void>;
//# sourceMappingURL=liquidity.d.ts.map