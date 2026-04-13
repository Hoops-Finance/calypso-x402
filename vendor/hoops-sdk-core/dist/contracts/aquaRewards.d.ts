import { rpc } from "@stellar/stellar-sdk";
export declare class AquaRewardsContract {
    private readonly adapterId;
    private readonly server;
    private readonly passphrase;
    constructor(adapterId: string, server: rpc.Server, passphrase: string);
    getLpBalance(caller: string, user: string, pool: string): Promise<bigint>;
    getShareId(caller: string, pool: string): Promise<string>;
}
//# sourceMappingURL=aquaRewards.d.ts.map