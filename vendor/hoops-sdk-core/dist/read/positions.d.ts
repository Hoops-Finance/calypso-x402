import { rpc } from "@stellar/stellar-sdk";
import type { LpPosition, AddressBook } from "hoops-sdk-types";
export declare function getSoroswapLpPosition(server: rpc.Server, passphrase: string, caller: string, account: string, addressBook: AddressBook): Promise<LpPosition>;
export declare function getAquaLpPosition(server: rpc.Server, passphrase: string, caller: string, account: string, addressBook: AddressBook): Promise<LpPosition>;
export declare function getAllLpPositions(server: rpc.Server, passphrase: string, caller: string, account: string, addressBook: AddressBook): Promise<LpPosition[]>;
//# sourceMappingURL=positions.d.ts.map