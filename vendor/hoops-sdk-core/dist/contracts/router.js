import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { decodeSwapQuote, decodeOptionSwapQuote } from "../network/scval.js";
export class RouterContract {
    routerId;
    server;
    passphrase;
    constructor(routerId, server, passphrase) {
        this.routerId = routerId;
        this.server = server;
        this.passphrase = passphrase;
    }
    async getAllQuotes(caller, amount, tokenIn, tokenOut) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.routerId, "get_all_quotes", [
            nativeToScVal(amount, { type: "i128" }),
            new Address(tokenIn).toScVal(),
            new Address(tokenOut).toScVal(),
        ]);
        const result = await simulateRead(this.server, tx, (val) => {
            const vec = val.vec();
            if (!vec)
                return [];
            return vec.map(decodeSwapQuote);
        });
        return result ?? [];
    }
    async getBestQuote(caller, amount, tokenIn, tokenOut) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.routerId, "get_best_quote", [
            nativeToScVal(amount, { type: "i128" }),
            new Address(tokenIn).toScVal(),
            new Address(tokenOut).toScVal(),
        ]);
        const result = await simulateRead(this.server, tx, decodeOptionSwapQuote);
        return result;
    }
}
//# sourceMappingURL=router.js.map