import { TransactionBuilder, Contract, BASE_FEE, } from "@stellar/stellar-sdk";
import { TX_DEFAULTS } from "hoops-sdk-types";
export async function buildContractCallTx(server, pubkey, passphrase, contractId, method, args) {
    const sourceAccount = await server.getAccount(pubkey);
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
    })
        .addOperation(contract.call(method, ...args))
        .setTimeout(TX_DEFAULTS.timeoutSeconds)
        .build();
    return tx;
}
export async function simulateRead(server, tx, decoder) {
    const sim = await server.simulateTransaction(tx);
    if ("result" in sim && sim.result) {
        const retVal = sim.result.retval;
        if (retVal)
            return decoder(retVal);
    }
    return null;
}
export async function signAndSubmitTx(server, keypair, tx) {
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(keypair);
    const sendResp = await server.sendTransaction(prepared);
    if (sendResp.status !== "PENDING") {
        throw new Error(`TX submission failed: ${sendResp.status} ${JSON.stringify(sendResp)}`);
    }
    const response = await waitForTx(server, sendResp.hash);
    return { hash: sendResp.hash, response };
}
export async function signExternalAndSubmitTx(server, tx, passphrase, signer) {
    const prepared = await server.prepareTransaction(tx);
    const signedXdr = await signer(prepared.toXDR(), {
        network: "testnet",
        networkPassphrase: passphrase,
    });
    const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);
    const sendResp = await server.sendTransaction(signedTx);
    if (sendResp.status !== "PENDING") {
        throw new Error(`TX submission failed: ${sendResp.status} ${JSON.stringify(sendResp)}`);
    }
    const response = await waitForTx(server, sendResp.hash);
    return { hash: sendResp.hash, response };
}
export async function waitForTx(server, hash) {
    let response = await server.getTransaction(hash);
    let attempts = 0;
    while (response.status === "NOT_FOUND" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 1000));
        response = await server.getTransaction(hash);
        attempts++;
    }
    if (response.status !== "SUCCESS") {
        throw new Error(`TX failed: ${response.status}`);
    }
    return response;
}
export function getDeadline(offsetSeconds = TX_DEFAULTS.deadlineOffsetSeconds) {
    return Math.floor(Date.now() / 1000) + offsetSeconds;
}
//# sourceMappingURL=tx.js.map