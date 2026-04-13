import { xdr } from "@stellar/stellar-sdk";
import type { LpPlan, SwapQuote } from "hoops-sdk-types";
export declare function toStroops(n: number): bigint;
export declare function fromStroops(stroops: bigint): number;
export declare function formatBalance(stroops: bigint): string;
export declare function scValToI128(val: xdr.ScVal): bigint;
export declare function scValToAddress(val: xdr.ScVal): string;
export declare function buildLpPlanScVal(plan: LpPlan): xdr.ScVal;
export declare function buildLpPlansVecScVal(plans: LpPlan[]): xdr.ScVal;
export declare function decodeSwapQuote(val: xdr.ScVal): SwapQuote;
export declare function decodeOptionSwapQuote(val: xdr.ScVal): SwapQuote | null;
export declare function calculateConstantProductQuote(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint;
//# sourceMappingURL=scval.d.ts.map