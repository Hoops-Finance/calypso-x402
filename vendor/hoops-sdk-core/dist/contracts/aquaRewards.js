import { Address } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToI128, scValToAddress } from "../network/scval.js";
export class AquaRewardsContract {
    adapterId;
    server;
    passphrase;
    constructor(adapterId, server, passphrase) {
        this.adapterId = adapterId;
        this.server = server;
        this.passphrase = passphrase;
    }
    async getLpBalance(caller, user, pool) {
        try {
            const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.adapterId, "get_lp_balance", [
                new Address(user).toScVal(),
                new Address(pool).toScVal(),
            ]);
            const result = await simulateRead(this.server, tx, scValToI128);
            return result ?? 0n;
        }
        catch {
            return 0n;
        }
    }
    async getShareId(caller, pool) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, pool, "share_id", []);
        const result = await simulateRead(this.server, tx, scValToAddress);
        return result ?? pool;
    }
}
//# sourceMappingURL=aquaRewards.js.map