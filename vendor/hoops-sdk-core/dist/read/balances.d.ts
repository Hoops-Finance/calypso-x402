import { rpc } from "@stellar/stellar-sdk";
import type { AddressBook } from "hoops-sdk-types";
export declare function getTokenBalance(server: rpc.Server, passphrase: string, caller: string, tokenId: string, account: string): Promise<bigint>;
export declare function getBalances(server: rpc.Server, passphrase: string, caller: string, tokenIds: string[], account: string): Promise<Record<string, bigint>>;
export declare function getStandardBalances(server: rpc.Server, passphrase: string, caller: string, account: string, addressBook: AddressBook): Promise<{
    xlm: bigint;
    usdc: bigint;
}>;
export declare function getAquaLpBalance(server: rpc.Server, passphrase: string, caller: string, account: string, addressBook: AddressBook): Promise<bigint>;
//# sourceMappingURL=balances.d.ts.map