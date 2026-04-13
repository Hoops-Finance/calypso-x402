/**
 * adapterContract.ts — direct adapter swap that bypasses the smart account.
 *
 * The Hoops smart account contract has an auth recording issue when
 * calling non-Soroswap adapters. This wrapper calls the adapter's
 * `swap_exact_in()` function directly from the bot's EOA keypair,
 * cutting the auth chain from:
 *   EOA → SmartAccount → Router → Adapter → Pool
 * to:
 *   EOA → Adapter → Pool
 *
 * The adapter's `swap_exact_in` transfers `amount_in` of `token_in`
 * FROM the `to` address, swaps through the pool, and returns the
 * output to the same `to` address. The `to.require_auth()` call
 * succeeds because the EOA keypair signs the transaction directly.
 */

import { Address, nativeToScVal, xdr, rpc } from "@stellar/stellar-sdk";
import { buildContractCallTx, signAndSubmitTx, getDeadline } from "hoops-sdk-core";

export class AdapterContract {
  constructor(
    private readonly adapterId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string,
  ) {}

  /**
   * Build a `swap_exact_in` transaction against the adapter.
   *
   * @param caller   - The bot's EOA public key (signs + sends + receives)
   * @param amountIn - Amount of tokenIn in stroops
   * @param minOut   - Minimum acceptable output (0n for testnet)
   * @param tokenIn  - SAC address of input token (e.g. XLM)
   * @param tokenOut - SAC address of output token (e.g. USDC)
   * @param deadline - Unix timestamp deadline (optional, defaults to +5min)
   */
  async buildSwapExactIn(
    caller: string,
    amountIn: bigint,
    minOut: bigint,
    tokenIn: string,
    tokenOut: string,
    deadline?: number,
  ) {
    return buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.adapterId,
      "swap_exact_in",
      [
        nativeToScVal(amountIn, { type: "i128" }),
        nativeToScVal(minOut, { type: "i128" }),
        xdr.ScVal.scvVec([
          new Address(tokenIn).toScVal(),
          new Address(tokenOut).toScVal(),
        ]),
        new Address(caller).toScVal(),
        nativeToScVal(deadline ?? getDeadline(), { type: "u64" }),
      ],
    );
  }
}
