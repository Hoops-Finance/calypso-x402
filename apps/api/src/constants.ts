/**
 * Pulls all Stellar / Hoops addresses + network config from the sibling
 * hoops-sdk-types package so Calypso never drifts from the canonical
 * deployment. Edit hoops_sdk's addressbook — never hardcode here.
 */

import {
  getAddressBook,
  type HoopsNetwork,
  type AddressBook,
  type NetworkConfig,
} from "hoops-sdk-types";
import { getNetworkConfig } from "hoops-sdk-core";

const rawNetwork = (process.env.SOROBAN_NETWORK ?? "testnet").toLowerCase();
if (rawNetwork !== "testnet" && rawNetwork !== "mainnet") {
  throw new Error(`SOROBAN_NETWORK must be "testnet" or "mainnet", got: ${rawNetwork}`);
}
export const HOOPS_NETWORK: HoopsNetwork = rawNetwork;

export const ADDRESS_BOOK: AddressBook = getAddressBook(HOOPS_NETWORK);
export const NETWORK_CONFIG: NetworkConfig = getNetworkConfig(HOOPS_NETWORK);

export const NETWORK_PASSPHRASE = NETWORK_CONFIG.passphrase;
export const RPC_URL = process.env.RPC_URL ?? NETWORK_CONFIG.rpcUrl;
export const FRIENDBOT_URL = NETWORK_CONFIG.friendbotUrl ?? "https://friendbot.stellar.org";

export const ROUTER_ID = ADDRESS_BOOK.router;
export const ADAPTERS = ADDRESS_BOOK.adapters;
export const TOKENS = ADDRESS_BOOK.tokens;
export const POOLS = ADDRESS_BOOK.pools;

export const MIN_BOT_XLM_FUNDING = 500;   // friendbot gives 10,000 — keep some for fees
export const BOT_DEPLOY_XLM_FUNDING = 100; // xlm routed to the smart account post-deploy
