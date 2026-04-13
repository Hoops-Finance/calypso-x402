import { xdr, nativeToScVal, Address } from "@stellar/stellar-sdk";
import { TOKEN_DECIMALS, SWAP_FEE_NUMERATOR, SWAP_FEE_DENOMINATOR } from "hoops-sdk-types";
import type { LpPlan, SwapQuote } from "hoops-sdk-types";

const UNIT = 10n ** BigInt(TOKEN_DECIMALS);

export function toStroops(n: number): bigint {
  return BigInt(Math.round(n * Number(UNIT)));
}

export function fromStroops(stroops: bigint): number {
  return Number(stroops) / Number(UNIT);
}

export function formatBalance(stroops: bigint): string {
  const whole = stroops / UNIT;
  const frac = (stroops % UNIT).toString().padStart(TOKEN_DECIMALS, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export function scValToI128(val: xdr.ScVal): bigint {
  try {
    const i128 = val.i128();
    const hi = BigInt(i128.hi().toString());
    const lo = BigInt(i128.lo().toString());
    return (hi << 64n) | lo;
  } catch {
    return 0n;
  }
}

export function scValToAddress(val: xdr.ScVal): string {
  return Address.fromScVal(val).toString();
}

export function buildLpPlanScVal(plan: LpPlan): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("adapter_id"),
      val: nativeToScVal(plan.adapterId, { type: "i128" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("amount_a"),
      val: nativeToScVal(plan.amountA, { type: "i128" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("amount_b"),
      val: nativeToScVal(plan.amountB, { type: "i128" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("token_a"),
      val: new Address(plan.tokenA).toScVal(),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("token_b"),
      val: new Address(plan.tokenB).toScVal(),
    }),
  ]);
}

export function buildLpPlansVecScVal(plans: LpPlan[]): xdr.ScVal {
  return xdr.ScVal.scvVec(plans.map(buildLpPlanScVal));
}

export function decodeSwapQuote(val: xdr.ScVal): SwapQuote {
  const map = val.map();
  if (!map) throw new Error("Expected ScVal map for SwapQuote");

  const fields: Record<string, xdr.ScVal> = {};
  for (const entry of map) {
    const key = entry.key().sym().toString();
    fields[key] = entry.val();
  }

  return {
    adapterId: scValToI128(fields["adapter_id"]),
    poolAddress: scValToAddress(fields["pool_address"]),
    tokenIn: scValToAddress(fields["token_in"]),
    tokenOut: scValToAddress(fields["token_out"]),
    amountIn: scValToI128(fields["amount_in"]),
    amountOut: scValToI128(fields["amount_out"]),
    poolType: fields["pool_type"].u32(),
    lpToken: scValToAddress(fields["lp_token"]),
  };
}

export function decodeOptionSwapQuote(val: xdr.ScVal): SwapQuote | null {
  const typeName = val.switch().name;
  if (typeName === "scvVoid") return null;
  if (typeName === "scvVec") {
    const vec = val.vec()!;
    return vec.length === 0 ? null : decodeSwapQuote(vec[0]);
  }
  return decodeSwapQuote(val);
}

export function calculateConstantProductQuote(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  const feeAdj = amountIn * SWAP_FEE_NUMERATOR;
  return (feeAdj * reserveOut) / (reserveIn * SWAP_FEE_DENOMINATOR + feeAdj);
}
