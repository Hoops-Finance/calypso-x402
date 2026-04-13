import { TokenContract } from "../contracts/token.js";
import { AquaRewardsContract } from "../contracts/aquaRewards.js";
export async function getTokenBalance(server, passphrase, caller, tokenId, account) {
    const token = new TokenContract(tokenId, server, passphrase);
    return token.balance(caller, account);
}
export async function getBalances(server, passphrase, caller, tokenIds, account) {
    const results = await Promise.all(tokenIds.map((id) => getTokenBalance(server, passphrase, caller, id, account)));
    const map = {};
    for (let i = 0; i < tokenIds.length; i++) {
        map[tokenIds[i]] = results[i];
    }
    return map;
}
export async function getStandardBalances(server, passphrase, caller, account, addressBook) {
    const [xlm, usdc] = await Promise.all([
        getTokenBalance(server, passphrase, caller, addressBook.tokens.xlm, account),
        getTokenBalance(server, passphrase, caller, addressBook.tokens.usdc, account),
    ]);
    return { xlm, usdc };
}
export async function getAquaLpBalance(server, passphrase, caller, account, addressBook) {
    const aqua = new AquaRewardsContract(addressBook.adapters.aqua, server, passphrase);
    return aqua.getLpBalance(caller, account, addressBook.pools.aquaPool);
}
//# sourceMappingURL=balances.js.map