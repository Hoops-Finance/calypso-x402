import { rpc, Transaction } from "@stellar/stellar-sdk";
export declare class AccountDeployerContract {
    private readonly deployerId;
    private readonly server;
    private readonly passphrase;
    constructor(deployerId: string, server: rpc.Server, passphrase: string);
    buildDeployAccountTx(owner: string, router: string, wasmHash: string, salt?: Uint8Array): Promise<Transaction>;
}
//# sourceMappingURL=deployer.d.ts.map