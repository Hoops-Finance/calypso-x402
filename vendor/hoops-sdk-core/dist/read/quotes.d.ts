import { rpc } from "@stellar/stellar-sdk";
import type { LocalSwapQuote, SwapQuote, AddressBook } from "hoops-sdk-types";
export { calculateConstantProductQuote } from "../network/scval.js";
export declare function getQuoteXlmToUsdc(server: rpc.Server, passphrase: string, caller: string, xlmAmount: number, addressBook: AddressBook): Promise<LocalSwapQuote>;
export declare function getOnChainBestQuote(server: rpc.Server, passphrase: string, caller: string, amount: bigint, tokenIn: string, tokenOut: string, addressBook: AddressBook): Promise<SwapQuote | null>;
export declare function getOnChainAllQuotes(server: rpc.Server, passphrase: string, caller: string, amount: bigint, tokenIn: string, tokenOut: string, addressBook: AddressBook): Promise<SwapQuote[]>;
//# sourceMappingURL=quotes.d.ts.map