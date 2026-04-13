import { buildContractCallTx, simulateRead } from "../network/tx.js";
import { scValToI128, scValToAddress } from "../network/scval.js";
export class SoroswapPairContract {
    pairId;
    server;
    passphrase;
    constructor(pairId, server, passphrase) {
        this.pairId = pairId;
        this.server = server;
        this.passphrase = passphrase;
    }
    async getReserves(caller) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.pairId, "get_reserves", []);
        const result = await simulateRead(this.server, tx, (val) => {
            const vec = val.vec();
            if (!vec || vec.length < 2)
                throw new Error("get_reserves: unexpected response");
            return {
                reserve0: scValToI128(vec[0]),
                reserve1: scValToI128(vec[1]),
            };
        });
        if (!result)
            throw new Error("get_reserves returned null");
        return result;
    }
    async token0(caller) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.pairId, "token_0", []);
        const result = await simulateRead(this.server, tx, scValToAddress);
        if (!result)
            throw new Error("token_0 returned null");
        return result;
    }
    async token1(caller) {
        const tx = await buildContractCallTx(this.server, caller, this.passphrase, this.pairId, "token_1", []);
        const result = await simulateRead(this.server, tx, scValToAddress);
        if (!result)
            throw new Error("token_1 returned null");
        return result;
    }
}
//# sourceMappingURL=soroswap.js.map