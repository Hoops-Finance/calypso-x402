import { rpc, Address, nativeToScVal, Transaction } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToI128 } from "../network/scval.js";

export class TokenContract {
  constructor(
    private readonly tokenId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string
  ) {}

  async balance(caller: string, addr: string): Promise<bigint> {
    try {
      const tx = await buildContractCallTx(
        this.server,
        caller,
        this.passphrase,
        this.tokenId,
        "balance",
        [new Address(addr).toScVal()]
      );
      const result = await simulateRead(this.server, tx, scValToI128);
      return result ?? 0n;
    } catch {
      return 0n;
    }
  }

  async buildTransferTx(
    from: string,
    to: string,
    amount: bigint
  ): Promise<Transaction> {
    return buildContractCallTx(
      this.server,
      from,
      this.passphrase,
      this.tokenId,
      "transfer",
      [
        nativeToScVal(from, { type: "address" }),
        nativeToScVal(to, { type: "address" }),
        nativeToScVal(amount, { type: "i128" }),
      ]
    );
  }
}
