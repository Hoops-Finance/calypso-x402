import { rpc, Address, xdr } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToI128, scValToAddress } from "../network/scval.js";

export class AquaRewardsContract {
  constructor(
    private readonly adapterId: string,
    private readonly server: rpc.Server,
    private readonly passphrase: string
  ) {}

  async getLpBalance(caller: string, user: string, pool: string): Promise<bigint> {
    try {
      const tx = await buildContractCallTx(
        this.server,
        caller,
        this.passphrase,
        this.adapterId,
        "get_lp_balance",
        [
          new Address(user).toScVal(),
          new Address(pool).toScVal(),
        ]
      );
      const result = await simulateRead(this.server, tx, scValToI128);
      return result ?? 0n;
    } catch {
      return 0n;
    }
  }

  async getShareId(caller: string, pool: string): Promise<string> {
    const tx = await buildContractCallTx(
      this.server,
      caller,
      this.passphrase,
      pool,
      "share_id",
      []
    );
    const result = await simulateRead(this.server, tx, scValToAddress);
    return result ?? pool;
  }
}
