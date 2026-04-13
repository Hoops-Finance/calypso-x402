import { rpc, Transaction } from "@stellar/stellar-sdk";
import type { LpPlan } from "hoops-sdk-types";
export declare class SmartAccountContract {
    private readonly accountId;
    private readonly server;
    private readonly passphrase;
    constructor(accountId: string, server: rpc.Server, passphrase: string);
    owner(caller: string): Promise<string>;
    router(caller: string): Promise<string>;
    buildInitializeTx(ownerPubkey: string, router: string): Promise<Transaction>;
    buildSwapTx(ownerPubkey: string, tokenIn: string, tokenOut: string, amount: bigint, bestHop: string, deadline: number): Promise<Transaction>;
    buildDepositTx(ownerPubkey: string, usdcToken: string, usdcAmount: bigint, plans: LpPlan[], deadline: number): Promise<Transaction>;
    buildRedeemTx(ownerPubkey: string, lpToken: string, lpAmount: bigint, tokenA: string, tokenB: string, deadline: number): Promise<Transaction>;
    buildClaimTx(ownerPubkey: string, adapter: string, pool: string, rewardToken: string): Promise<Transaction>;
    buildTransferTx(ownerPubkey: string, token: string, to: string, amount: bigint): Promise<Transaction>;
    buildUpgradeTx(ownerPubkey: string, wasmHash: string): Promise<Transaction>;
}
//# sourceMappingURL=smartAccount.d.ts.map