import { ADAPTER_IDS, TX_DEFAULTS, getAddressBook } from "hoops-sdk-types";
import { createRpcClientForNetwork, getNetworkConfig, SmartAccountContract, signAndSubmitTx, getDeadline, getStandardBalances, formatBalance, } from "hoops-sdk-core";
/**
 * Deposit liquidity with configurable adapter selection and split ratio.
 *
 * @param params.adapterIds - Which adapters to target. Defaults to [AQUA, SOROSWAP].
 *   Max 2 adapters (resource limits prevent batching more).
 * @param params.splitRatio - Portion of funds for first adapter (0-1).
 *   Only used with 2 adapters. Defaults to 0.5.
 */
export async function addLiquidity(keypair, accountId, network, params) {
    const adapterIds = params?.adapterIds ?? [ADAPTER_IDS.AQUA, ADAPTER_IDS.SOROSWAP];
    const splitRatio = params?.splitRatio ?? 0.5;
    if (adapterIds.length === 0 || adapterIds.length > 2) {
        throw new Error("adapterIds must contain 1 or 2 entries");
    }
    if (splitRatio < 0 || splitRatio > 1) {
        throw new Error("splitRatio must be between 0 and 1");
    }
    const addressBook = getAddressBook(network);
    const config = getNetworkConfig(network);
    const server = createRpcClientForNetwork(network);
    const pubkey = keypair.publicKey();
    const { xlm: xlmBal, usdc: usdcBal } = await getStandardBalances(server, config.passphrase, pubkey, accountId, addressBook);
    if (usdcBal < TX_DEFAULTS.minUsdcForDeposit) {
        throw new Error(`Insufficient USDC: ${formatBalance(usdcBal)} (need >= ${formatBalance(TX_DEFAULTS.minUsdcForDeposit)})`);
    }
    const availableXlm = xlmBal > TX_DEFAULTS.xlmReserveForFees
        ? xlmBal - TX_DEFAULTS.xlmReserveForFees
        : 0n;
    if (availableXlm <= 0n) {
        throw new Error(`Insufficient XLM after reserving fees: ${formatBalance(xlmBal)}`);
    }
    const deadline = getDeadline();
    const account = new SmartAccountContract(accountId, server, config.passphrase);
    if (adapterIds.length === 1) {
        // Single adapter — all funds in one TX
        const lpPlans = [
            {
                tokenA: addressBook.tokens.usdc,
                tokenB: addressBook.tokens.xlm,
                amountA: usdcBal,
                amountB: availableXlm,
                adapterId: BigInt(adapterIds[0]),
            },
        ];
        const tx = await account.buildDepositTx(pubkey, addressBook.tokens.usdc, usdcBal, lpPlans, deadline);
        await signAndSubmitTx(server, keypair, tx);
    }
    else {
        // Two adapters — split by ratio, one TX per adapter (resource limits)
        const firstUsdc = BigInt(Math.floor(Number(usdcBal) * splitRatio));
        const firstXlm = BigInt(Math.floor(Number(availableXlm) * splitRatio));
        const splits = [
            { adapterId: BigInt(adapterIds[0]), usdc: firstUsdc, xlm: firstXlm },
            { adapterId: BigInt(adapterIds[1]), usdc: usdcBal - firstUsdc, xlm: availableXlm - firstXlm },
        ];
        for (const split of splits) {
            const lpPlans = [
                {
                    tokenA: addressBook.tokens.usdc,
                    tokenB: addressBook.tokens.xlm,
                    amountA: split.usdc,
                    amountB: split.xlm,
                    adapterId: split.adapterId,
                },
            ];
            const tx = await account.buildDepositTx(pubkey, addressBook.tokens.usdc, split.usdc, lpPlans, deadline);
            await signAndSubmitTx(server, keypair, tx);
        }
    }
}
/** Convenience: 50/50 split across Aqua + Soroswap. */
export async function addLiquidity50_50(keypair, accountId, network) {
    return addLiquidity(keypair, accountId, network);
}
//# sourceMappingURL=liquidity.js.map