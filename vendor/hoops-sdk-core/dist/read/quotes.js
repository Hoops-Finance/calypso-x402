import { SoroswapPairContract } from "../contracts/soroswap.js";
import { RouterContract } from "../contracts/router.js";
import { calculateConstantProductQuote, toStroops, formatBalance } from "../network/scval.js";
export { calculateConstantProductQuote } from "../network/scval.js";
export async function getQuoteXlmToUsdc(server, passphrase, caller, xlmAmount, addressBook) {
    const pair = new SoroswapPairContract(addressBook.pools.soroswapPair, server, passphrase);
    const reserves = await pair.getReserves(caller);
    // Soroswap pair: token_0 = USDC, token_1 = XLM
    const reserveUsdc = reserves.reserve0;
    const reserveXlm = reserves.reserve1;
    const xlmIn = toStroops(xlmAmount);
    const expectedOut = calculateConstantProductQuote(xlmIn, reserveXlm, reserveUsdc);
    return {
        reserveIn: reserveXlm,
        reserveOut: reserveUsdc,
        expectedOut,
        estimateStr: formatBalance(expectedOut),
    };
}
export async function getOnChainBestQuote(server, passphrase, caller, amount, tokenIn, tokenOut, addressBook) {
    const router = new RouterContract(addressBook.router, server, passphrase);
    return router.getBestQuote(caller, amount, tokenIn, tokenOut);
}
export async function getOnChainAllQuotes(server, passphrase, caller, amount, tokenIn, tokenOut, addressBook) {
    const router = new RouterContract(addressBook.router, server, passphrase);
    return router.getAllQuotes(caller, amount, tokenIn, tokenOut);
}
//# sourceMappingURL=quotes.js.map