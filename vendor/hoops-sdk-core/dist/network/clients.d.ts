import { rpc } from "@stellar/stellar-sdk";
import { type HoopsNetwork, type NetworkConfig } from "hoops-sdk-types";
export declare function getNetworkConfig(network: HoopsNetwork): NetworkConfig;
export declare function createRpcClient(config: NetworkConfig): rpc.Server;
export declare function createRpcClientForNetwork(network: HoopsNetwork): rpc.Server;
//# sourceMappingURL=clients.d.ts.map