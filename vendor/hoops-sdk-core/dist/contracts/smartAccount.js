import { Address, nativeToScVal, } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToAddress, buildLpPlansVecScVal } from "../network/scval.js";
export class SmartAccountContract {
    accountId;
    server;
    passphrase;
    constructor(accountId, server, passphrase) {
        this.accountId = accountId;
        this.server = server;
        this.passphrase = passphrase;
    }
    async owner(caller) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.accountId, "owner", []);
        const result = await simulateRead(this.server, tx, scValToAddress);
        if (!result)
            throw new Error("owner() returned null");
        return result;
    }
    async router(caller) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.accountId, "router", []);
        const result = await simulateRead(this.server, tx, scValToAddress);
        if (!result)
            throw new Error("router() returned null");
        return result;
    }
    async buildInitializeTx(ownerPubkey, router) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "initialize", [
            nativeToScVal(ownerPubkey, { type: "address" }),
            nativeToScVal(router, { type: "address" }),
        ]);
    }
    async buildSwapTx(ownerPubkey, tokenIn, tokenOut, amount, bestHop, deadline) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "swap", [
            new Address(tokenIn).toScVal(),
            new Address(tokenOut).toScVal(),
            nativeToScVal(amount, { type: "i128" }),
            new Address(bestHop).toScVal(),
            nativeToScVal(deadline, { type: "u32" }),
        ]);
    }
    async buildDepositTx(ownerPubkey, usdcToken, usdcAmount, plans, deadline) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "deposit", [
            new Address(usdcToken).toScVal(),
            nativeToScVal(usdcAmount, { type: "i128" }),
            buildLpPlansVecScVal(plans),
            nativeToScVal(deadline, { type: "u32" }),
        ]);
    }
    async buildRedeemTx(ownerPubkey, lpToken, lpAmount, tokenA, tokenB, deadline) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "redeem", [
            new Address(lpToken).toScVal(),
            nativeToScVal(lpAmount, { type: "i128" }),
            new Address(tokenA).toScVal(),
            new Address(tokenB).toScVal(),
            nativeToScVal(deadline, { type: "u32" }),
        ]);
    }
    async buildClaimTx(ownerPubkey, adapter, pool, rewardToken) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "claim", [
            new Address(adapter).toScVal(),
            new Address(pool).toScVal(),
            new Address(rewardToken).toScVal(),
        ]);
    }
    async buildTransferTx(ownerPubkey, token, to, amount) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "transfer", [
            new Address(token).toScVal(),
            new Address(to).toScVal(),
            nativeToScVal(amount, { type: "i128" }),
        ]);
    }
    async buildUpgradeTx(ownerPubkey, wasmHash) {
        return buildContractCallTx(this.server, ownerPubkey, this.passphrase, this.accountId, "upgrade", [nativeToScVal(Buffer.from(wasmHash, "hex"), { type: "bytes" })]);
    }
}
//# sourceMappingURL=smartAccount.js.map