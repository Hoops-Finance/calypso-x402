import { Address } from "@stellar/stellar-sdk";
import { getAddressBook } from "hoops-sdk-types";
import { createRpcClientForNetwork, getNetworkConfig, AccountDeployerContract, SmartAccountContract, signAndSubmitTx, } from "hoops-sdk-core";
export async function deploySmartAccount(keypair, network) {
    const addressBook = getAddressBook(network);
    const config = getNetworkConfig(network);
    const server = createRpcClientForNetwork(network);
    const pubkey = keypair.publicKey();
    // Step 1: Deploy account via AccountDeployer
    const deployer = new AccountDeployerContract(addressBook.accountDeployer, server, config.passphrase);
    const deployTx = await deployer.buildDeployAccountTx(pubkey, addressBook.router, addressBook.wasmHash);
    const deployResult = await signAndSubmitTx(server, keypair, deployTx);
    if (!deployResult.response.returnValue) {
        throw new Error("deploy_account did not return account address");
    }
    const accountId = Address.fromScVal(deployResult.response.returnValue).toString();
    // Step 2: Initialize account with owner + router
    const account = new SmartAccountContract(accountId, server, config.passphrase);
    const initTx = await account.buildInitializeTx(pubkey, addressBook.router);
    await signAndSubmitTx(server, keypair, initTx);
    return accountId;
}
//# sourceMappingURL=deploy.js.map