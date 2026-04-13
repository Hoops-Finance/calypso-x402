import { rpc } from "@stellar/stellar-sdk";
export interface Reserves {
    reserve0: bigint;
    reserve1: bigint;
}
export declare class SoroswapPairContract {
    private readonly pairId;
    private readonly server;
    private readonly passphrase;
    constructor(pairId: string, server: rpc.Server, passphrase: string);
    getReserves(caller: string): Promise<Reserves>;
    token0(caller: string): Promise<string>;
    token1(caller: string): Promise<string>;
}
//# sourceMappingURL=soroswap.d.ts.map