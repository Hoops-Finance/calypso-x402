import { rpc } from "@stellar/stellar-sdk";
import { NETWORK_CONFIG, type HoopsNetwork, type NetworkConfig } from "hoops-sdk-types";

export function getNetworkConfig(network: HoopsNetwork): NetworkConfig {
  const cfg = NETWORK_CONFIG[network];
  if (!cfg) throw new Error(`Unknown network: ${network}`);
  return cfg;
}

export function createRpcClient(config: NetworkConfig): rpc.Server {
  return new rpc.Server(config.rpcUrl);
}

export function createRpcClientForNetwork(network: HoopsNetwork): rpc.Server {
  return createRpcClient(getNetworkConfig(network));
}
