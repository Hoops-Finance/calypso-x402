import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToI128 } from "../network/scval.js";
export class TokenContract {
    tokenId;
    server;
    passphrase;
    constructor(tokenId, server, passphrase) {
        this.tokenId = tokenId;
        this.server = server;
        this.passphrase = passphrase;
    }
    async balance(caller, addr) {
        try {
            const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.tokenId, "balance", [new Address(addr).toScVal()]);
            const result = await simulateRead(this.server, tx, scValToI128);
            return result ?? 0n;
        }
        catch {
            return 0n;
        }
    }
    async buildTransferTx(from, to, amount) {
        return buildContractCallTx(this.server, from, this.passphrase, this.tokenId, "transfer", [
            nativeToScVal(from, { type: "address" }),
            nativeToScVal(to, { type: "address" }),
            nativeToScVal(amount, { type: "i128" }),
        ]);
    }
}
//# sourceMappingURL=token.js.map