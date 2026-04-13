import { ADAPTER_IDS, ADAPTER_NAMES } from "hoops-sdk-types";
import { getTokenBalance, getAquaLpBalance } from "./balances.js";
export async function getSoroswapLpPosition(server, passphrase, caller, account, addressBook) {
    const shares = await getTokenBalance(server, passphrase, caller, addressBook.pools.soroswapPair, account);
    return {
        adapterId: ADAPTER_IDS.SOROSWAP,
        adapterName: ADAPTER_NAMES[ADAPTER_IDS.SOROSWAP],
        pool: addressBook.pools.soroswapPair,
        lpToken: addressBook.pools.soroswapPair,
        shares,
    };
}
export async function getAquaLpPosition(server, passphrase, caller, account, addressBook) {
    const shares = await getAquaLpBalance(server, passphrase, caller, account, addressBook);
    return {
        adapterId: ADAPTER_IDS.AQUA,
        adapterName: ADAPTER_NAMES[ADAPTER_IDS.AQUA],
        pool: addressBook.pools.aquaPool,
        lpToken: addressBook.aquaLpToken,
        shares,
    };
}
export async function getAllLpPositions(server, passphrase, caller, account, addressBook) {
    const [aqua, soroswap] = await Promise.all([
        getAquaLpPosition(server, passphrase, caller, account, addressBook),
        getSoroswapLpPosition(server, passphrase, caller, account, addressBook),
    ]);
    return [aqua, soroswap];
}
//# sourceMappingURL=positions.js.map