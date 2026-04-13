import { rpc } from "@stellar/stellar-sdk";
import type { SwapQuote } from "hoops-sdk-types";
export declare class RouterContract {
    private readonly routerId;
    private readonly server;
    private readonly passphrase;
    constructor(routerId: string, server: rpc.Server, passphrase: string);
    getAllQuotes(caller: string, amount: bigint, tokenIn: string, tokenOut: string): Promise<SwapQuote[]>;
    getBestQuote(caller: string, amount: bigint, tokenIn: string, tokenOut: string): Promise<SwapQuote | null>;
}
//# sourceMappingURL=router.d.ts.map