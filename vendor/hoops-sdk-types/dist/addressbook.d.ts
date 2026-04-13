export type HoopsNetwork = "testnet" | "mainnet";
export interface AddressBook {
    network: HoopsNetwork;
    router: string;
    accountDeployer: string;
    adapters: {
        aqua: string;
        comet: string;
        phoenix: string;
        soroswap: string;
    };
    tokens: {
        usdc: string;
        xlm: string;
    };
    pools: {
        soroswapPair: string;
        aquaPool: string;
    };
    aquaLpToken: string;
    wasmHash: string;
}
/**
 * Shape of the `testnet-suite.json` file produced by the deploy scripts
 * in the `hoops_contracts` repository.
 */
interface SuiteJson {
    tokens: {
        xlm_sac: string;
        usdc: string;
    };
    amm: {
        soroswap: {
            pair_usdc_xlm: string;
        };
        aquarius: {
            pool_usdc_xlm: string;
            lp_token: string;
        };
    };
    hoops: {
        router: string;
        account_deployer: string;
        account_wasm_hash?: string;
        adapters: {
            aqua: string;
            comet: string;
            phoenix: string;
            soroswap: string;
        };
    };
}
/**
 * Parse a `testnet-suite.json` file into an `AddressBook`.
 */
export declare function addressBookFromSuiteJson(json: SuiteJson): AddressBook;
/**
 * Load an `AddressBook` from a `testnet-suite.json` file path.
 * Throws if the file doesn't exist or can't be parsed.
 */
export declare function loadAddressBookFromFile(filePath: string): AddressBook;
/**
 * Build an `AddressBook` from environment variables.
 * Uses the same variable names as `testnet-suite.env`:
 *   ROUTER, ACCOUNT_DEPLOYER, AQUA_ADAPTER, COMET_ADAPTER, PHOENIX_ADAPTER,
 *   SOROSWAP_ADAPTER, USDC_TOKEN, XLM_SAC, SOROSWAP_PAIR, AQUA_POOL_ADDRESS,
 *   AQUA_LP_TOKEN, ACCOUNT_WASM_HASH
 *
 * Falls back to hardcoded defaults for any missing variable.
 */
export declare function addressBookFromEnv(env?: Record<string, string | undefined>): AddressBook;
/**
 * Get the address book for a network.
 *
 * For testnet, resolution order:
 *   1. If `HOOPS_SUITE_JSON` env var is set, load from that file path
 *   2. If any individual env vars are set (ROUTER, etc.), use them
 *   3. Fall back to hardcoded defaults (last known good deployment)
 *
 * For mainnet, returns empty placeholders (not yet deployed).
 */
export declare function getAddressBook(network: HoopsNetwork): AddressBook;
export {};
//# sourceMappingURL=addressbook.d.ts.map