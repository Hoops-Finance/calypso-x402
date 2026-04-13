import { rpc, xdr, Address, Transaction } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToI128, scValToAddress } from "../network/scval.js";

export interface Reserves {
  reserve0: bigint;
  reserve1: bigint;
}

export class SoroswapPairContract {
  constructor(
    private readonly pairId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string
  ) {}

  async getReserves(caller: string): Promise<Reserves> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.pairId,
      "get_reserves",
      []
    );

    const result = await simulateRead(this.server, tx, (val: xdr.ScVal) => {
      const vec = val.vec();
      if (!vec || vec.length < 2) throw new Error("get_reserves: unexpected response");
      return {
        reserve0: scValToI128(vec[0]),
        reserve1: scValToI128(vec[1]),
      };
    });

    if (!result) throw new Error("get_reserves returned null");
    return result;
  }

  async token0(caller: string): Promise<string> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.pairId,
      "token_0",
      []
    );
    const result = await simulateRead(this.server, tx, scValToAddress);
    if (!result) throw new Error("token_0 returned null");
    return result;
  }

  async token1(caller: string): Promise<string> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      this.pairId,
      "token_1",
      []
    );
    const result = await simulateRead(this.server, tx, scValToAddress);
    if (!result) throw new Error("token_1 returned null");
    return result;
  }
}
