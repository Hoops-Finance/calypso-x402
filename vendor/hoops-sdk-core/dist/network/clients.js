import { rpc } from "@stellar/stellar-sdk";
import { NETWORK_CONFIG } from "hoops-sdk-types";
export function getNetworkConfig(network) {
    const cfg = NETWORK_CONFIG[network];
    if (!cfg)
        throw new Error(`Unknown network: ${network}`);
    return cfg;
}
export function createRpcClient(config) {
    return new rpc.Server(config.rpcUrl);
}
export function createRpcClientForNetwork(network) {
    return createRpcClient(getNetworkConfig(network));
}
//# sourceMappingURL=clients.js.map