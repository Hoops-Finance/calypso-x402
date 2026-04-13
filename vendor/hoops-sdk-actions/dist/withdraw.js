import { HoopsError, HoopsErrorCode, getAddressBook } from "hoops-sdk-types";
import { createRpcClientForNetwork, getNetworkConfig, SmartAccountContract, AquaRewardsContract, signAndSubmitTx, getDeadline, getAquaLpBalance, getTokenBalance, } from "hoops-sdk-core";
export async function withdrawAllLiquidity(keypair, accountId, network) {
    const addressBook = getAddressBook(network);
    const config = getNetworkConfig(network);
    const server = createRpcClientForNetwork(network);
    const pubkey = keypair.publicKey();
    const account = new SmartAccountContract(accountId, server, config.passphrase);
    // Upgrade account first (picks up latest redeem/claim signatures)
    const upgradeTx = await account.buildUpgradeTx(pubkey, addressBook.wasmHash);
    await signAndSubmitTx(server, keypair, upgradeTx);
    // Query LP balances
    const [aquaShares, soroswapShares] = await Promise.all([
        getAquaLpBalance(server, config.passphrase, pubkey, accountId, addressBook),
        getTokenBalance(server, config.passphrase, pubkey, addressBook.pools.soroswapPair, accountId),
    ]);
    if (aquaShares === 0n && soroswapShares === 0n) {
        throw new HoopsError(HoopsErrorCode.NO_LP_POSITIONS, "No LP positions to withdraw");
    }
    const deadline = getDeadline(300);
    // Withdraw Aqua LP
    if (aquaShares > 0n) {
        const aqua = new AquaRewardsContract(addressBook.adapters.aqua, server, config.passphrase);
        const aquaLpToken = await aqua.getShareId(pubkey, addressBook.pools.aquaPool);
        const redeemTx = await account.buildRedeemTx(pubkey, aquaLpToken, aquaShares, addressBook.tokens.usdc, addressBook.tokens.xlm, deadline);
        await signAndSubmitTx(server, keypair, redeemTx);
    }
    // Withdraw Soroswap LP
    if (soroswapShares > 0n) {
        const redeemTx = await account.buildRedeemTx(pubkey, addressBook.pools.soroswapPair, soroswapShares, addressBook.tokens.usdc, addressBook.tokens.xlm, deadline);
        await signAndSubmitTx(server, keypair, redeemTx);
    }
}
//# sourceMappingURL=withdraw.js.map