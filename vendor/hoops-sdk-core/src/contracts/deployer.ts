import { rpc, nativeToScVal, Transaction } from "@stellar/stellar-sdk";
import { buildContractCallTx } from "../network/tx.js";

export class AccountDeployerContract {
  constructor(
    private readonly deployerId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string
  ) {}

  async buildDeployAccountTx(
    owner: string,
    router: string,
    wasmHash: string,
    salt?: Uint8Array
  ): Promise<Transaction> {
    const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(32));

    return buildContractCallTx(
      this.server,
      owner,
      this.passphrase,
      this.deployerId,
      "deploy_account",
      [
        nativeToScVal(owner, { type: "address" }),
        nativeToScVal(router, { type: "address" }),
        nativeToScVal(Buffer.from(wasmHash, "hex"), { type: "bytes" }),
        nativeToScVal(Buffer.from(saltBytes), { type: "bytes" }),
      ]
    );
  }
}
