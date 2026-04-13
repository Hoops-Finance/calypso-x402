import { Keypair, rpc, xdr, Transaction } from "@stellar/stellar-sdk";
import type { TxSigner } from "hoops-sdk-types";
export interface SubmitResult {
    hash: string;
    response: rpc.Api.GetSuccessfulTransactionResponse;
}
export declare function buildContractCallTx(server: rpc.Server, pubkey: string, passphrase: string, contractId: string, method: string, args: xdr.ScVal[]): Promise<Transaction>;
export declare function simulateRead<T>(server: rpc.Server, tx: Transaction, decoder: (val: xdr.ScVal) => T): Promise<T | null>;
export declare function signAndSubmitTx(server: rpc.Server, keypair: Keypair, tx: Transaction): Promise<SubmitResult>;
export declare function signExternalAndSubmitTx(server: rpc.Server, tx: Transaction, passphrase: string, signer: TxSigner): Promise<SubmitResult>;
export declare function waitForTx(server: rpc.Server, hash: string): Promise<rpc.Api.GetSuccessfulTransactionResponse>;
export declare function getDeadline(offsetSeconds?: number): number;
//# sourceMappingURL=tx.d.ts.map