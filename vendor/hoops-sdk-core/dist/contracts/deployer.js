import { nativeToScVal } from "@stellar/stellar-sdk";
import { buildContractCallTx } from "../network/tx.js";
export class AccountDeployerContract {
    deployerId;
    server;
    passphrase;
    constructor(deployerId, server, passphrase) {
        this.deployerId = deployerId;
        this.server = server;
        this.passphrase = passphrase;
    }
    async buildDeployAccountTx(owner, router, wasmHash, salt) {
        const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(32));
        return buildContractCallTx(this.server, owner, this.passphrase, this.deployerId, "deploy_account", [
            nativeToScVal(owner, { type: "address" }),
            nativeToScVal(router, { type: "address" }),
            nativeToScVal(Buffer.from(wasmHash, "hex"), { type: "bytes" }),
            nativeToScVal(Buffer.from(saltBytes), { type: "bytes" }),
        ]);
    }
}
//# sourceMappingURL=deployer.js.map