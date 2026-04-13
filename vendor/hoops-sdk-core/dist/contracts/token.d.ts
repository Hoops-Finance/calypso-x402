import { rpc, Transaction } from "@stellar/stellar-sdk";
export declare class TokenContract {
    private readonly tokenId;
    private readonly server;
    private readonly passphrase;
    constructor(tokenId: string, server: rpc.Server, passphrase: string);
    balance(caller: string, addr: string): Promise<bigint>;
    buildTransferTx(from: string, to: string, amount: bigint): Promise<Transaction>;
}
//# sourceMappingURL=token.d.ts.map