import { getAddressBook } from "hoops-sdk-types";
import { createRpcClientForNetwork, getNetworkConfig, SmartAccountContract, signAndSubmitTx, } from "hoops-sdk-core";
export async function claimAquaRewards(keypair, accountId, network) {
    const addressBook = getAddressBook(network);
    const config = getNetworkConfig(network);
    const server = createRpcClientForNetwork(network);
    const pubkey = keypair.publicKey();
    const account = new SmartAccountContract(accountId, server, config.passphrase);
    const claimTx = await account.buildClaimTx(pubkey, addressBook.adapters.aqua, addressBook.pools.aquaPool, addressBook.tokens.usdc);
    const result = await signAndSubmitTx(server, keypair, claimTx);
    return result.hash;
}
//# sourceMappingURL=rewards.js.map