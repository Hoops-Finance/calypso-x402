import { rpc, Address, nativeToScVal, xdr, Transaction } from "@stellar/stellar-sdk";
import type { SwapQuote } from "hoops-sdk-types";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { decodeSwapQuote, decodeOptionSwapQuote } from "../network/scval.js";

export class RouterContract {
  constructor(
    private readonly routerId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string
  ) {}

  async getAllQuotes(
    caller: string,
    amount: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<SwapQuote[]> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.routerId,
      "get_all_quotes",
      [
        nativeToScVal(amount, { type: "i128" }),
        new Address(tokenIn).toScVal(),
        new Address(tokenOut).toScVal(),
      ]
    );

    const result = await simulateRead(this.server, tx, (val: xdr.ScVal) => {
      const vec = val.vec();
      if (!vec) return [];
      return vec.map(decodeSwapQuote);
    });

    return result ?? [];
  }

  async getBestQuote(
    caller: string,
    amount: bigint,
    tokenIn: string,
    tokenOut: string
  ): Promise<SwapQuote | null> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.routerId,
      "get_best_quote",
      [
        nativeToScVal(amount, { type: "i128" }),
        new Address(tokenIn).toScVal(),
        new Address(tokenOut).toScVal(),
      ]
    );

    const result = await simulateRead(this.server, tx, decodeOptionSwapQuote);

    return result;
  }
}
