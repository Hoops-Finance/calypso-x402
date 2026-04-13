import type { HoopsNetwork } from "./addressbook.js";
export interface NetworkConfig {
    rpcUrl: string;
    passphrase: string;
    friendbotUrl: string | null;
}
export interface LpPlan {
    tokenA: string;
    tokenB: string;
    amountA: bigint;
    amountB: bigint;
    adapterId: bigint;
}
export interface SwapQuote {
    adapterId: bigint;
    poolAddress: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    amountOut: bigint;
    poolType: number;
    lpToken: string;
}
export interface LocalSwapQuote {
    reserveIn: bigint;
    reserveOut: bigint;
    expectedOut: bigint;
    estimateStr: string;
}
export interface MarketData {
    adapterId: bigint;
    poolAddress: string;
    lpToken: string;
    tokenA: string;
    tokenB: string;
    reserveA: bigint;
    reserveB: bigint;
    poolType: number;
    ledger: number;
}
export interface BalanceMap {
    xlm: bigint;
    usdc: bigint;
    [tokenId: string]: bigint;
}
export interface LpPosition {
    adapterId: number;
    adapterName: string;
    pool: string;
    lpToken: string;
    shares: bigint;
}
export interface TxResult {
    hash: string;
    status: "SUCCESS" | "FAILED";
    returnValue?: unknown;
}
export type TxSigner = (xdrTx: string, opts: {
    network: string;
    networkPassphrase: string;
}) => Promise<string>;
export interface SessionState {
    network: HoopsNetwork;
    publicKey: string;
    smartAccountId: string | null;
}
export interface SwapParams {
    tokenIn: string;
    tokenOut: string;
    amount: bigint;
    poolAddress: string;
    deadline?: number;
}
export interface DepositParams {
    /** Adapter IDs to deposit into. Defaults to [AQUA (0), SOROSWAP (3)]. */
    adapterIds?: number[];
    /** Portion of funds for first adapter (0-1). Only used with 2 adapters. Defaults to 0.5. */
    splitRatio?: number;
}
//# sourceMappingURL=types.d.ts.map