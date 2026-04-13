import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  tokens: { xlm_sac: string; usdc: string };
  amm: {
    soroswap: { pair_usdc_xlm: string };
    aquarius: { pool_usdc_xlm: string; lp_token: string };
  };
  hoops: {
    router: string;
    account_deployer: string;
    account_wasm_hash?: string;
    adapters: { aqua: string; comet: string; phoenix: string; soroswap: string };
  };
}

// ---------------------------------------------------------------------------
// Hardcoded fallback (last known good testnet deployment)
// ---------------------------------------------------------------------------
const TESTNET_DEFAULTS: AddressBook = Object.freeze({
  network: "testnet" as const,
  router: "CCXJKZWHXCN4JYPHOWJWHTIE7NTTPK6JOZNMYNRKX3IEWD4OW6O7V6AE",
  accountDeployer: "CDBKXYD3HHYUSHPRVTGDQRVAHRVDRLIUWER2KZRIAHYLPSOARXEX54Z6",
  adapters: Object.freeze({
    aqua: "CBNYDXFV5GTNRXFPY5KZ6W3BP5NLYDAMHY4ZZYZGHQF4JTMDZWQDOPNZ",
    comet: "CBBKYGYJG2ONO22EAEP6N532UTDNQQELJVCGPBX22NFPP67YBW4UWQLX",
    phoenix: "CBQAZAMW3L4V45SXFEXYJMBQSBOIPLOUXCCVONIV5DZ7BIHCVXECAURN",
    soroswap: "CDIDG3IKKUSDZETWMLKV5KYOVYS75PUM26X4S5GA5GBYVXEBHA4MCFG2",
  }),
  tokens: Object.freeze({
    usdc: "CBNXXK7DFBR6M5NUU2U3466LDYCL7PSWKSE46C5LFK5RWCRLUTEK3OEJ",
    xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  }),
  pools: Object.freeze({
    soroswapPair: "CBEE5OFOU6ETB3LUEK2WMDUIUSYDEL4Y4KJAKYKXM5EKNDJFE42UBCHS",
    aquaPool: "CDYHRFHFH7USQFDLBVWNZ2WIFBHFGLK3ESRML2CVJ2BQSQZDWUINEUWV",
  }),
  aquaLpToken: "CDXYUZTVO2CTNZ42OILUQFUPXWOWMZ7OL3DNYVZQXT7XUJXDN52O67X4",
  wasmHash: "b5a8b0121e5619245cf269961849634f4b14ffb3d552ddbbd597c1138552413e",
});

const MAINNET_DEFAULTS: AddressBook = Object.freeze({
  network: "mainnet" as const,
  router: "",
  accountDeployer: "",
  adapters: Object.freeze({ aqua: "", comet: "", phoenix: "", soroswap: "" }),
  tokens: Object.freeze({ usdc: "", xlm: "" }),
  pools: Object.freeze({ soroswapPair: "", aquaPool: "" }),
  aquaLpToken: "",
  wasmHash: "",
});

// ---------------------------------------------------------------------------
// Load from testnet-suite.json (produced by hoops_contracts deploy scripts)
// ---------------------------------------------------------------------------

/**
 * Parse a `testnet-suite.json` file into an `AddressBook`.
 */
export function addressBookFromSuiteJson(json: SuiteJson): AddressBook {
  return {
    network: "testnet",
    router: json.hoops.router,
    accountDeployer: json.hoops.account_deployer,
    adapters: {
      aqua: json.hoops.adapters.aqua,
      comet: json.hoops.adapters.comet,
      phoenix: json.hoops.adapters.phoenix,
      soroswap: json.hoops.adapters.soroswap,
    },
    tokens: {
      usdc: json.tokens.usdc,
      xlm: json.tokens.xlm_sac,
    },
    pools: {
      soroswapPair: json.amm.soroswap.pair_usdc_xlm,
      aquaPool: json.amm.aquarius.pool_usdc_xlm,
    },
    aquaLpToken: json.amm.aquarius.lp_token,
    wasmHash: json.hoops.account_wasm_hash ?? TESTNET_DEFAULTS.wasmHash,
  };
}

/**
 * Load an `AddressBook` from a `testnet-suite.json` file path.
 * Throws if the file doesn't exist or can't be parsed.
 */
export function loadAddressBookFromFile(filePath: string): AddressBook {
  const raw = readFileSync(resolve(filePath), "utf-8");
  const json: SuiteJson = JSON.parse(raw);
  return addressBookFromSuiteJson(json);
}

// ---------------------------------------------------------------------------
// Load from environment variables
// ---------------------------------------------------------------------------

/**
 * Build an `AddressBook` from environment variables.
 * Uses the same variable names as `testnet-suite.env`:
 *   ROUTER, ACCOUNT_DEPLOYER, AQUA_ADAPTER, COMET_ADAPTER, PHOENIX_ADAPTER,
 *   SOROSWAP_ADAPTER, USDC_TOKEN, XLM_SAC, SOROSWAP_PAIR, AQUA_POOL_ADDRESS,
 *   AQUA_LP_TOKEN, ACCOUNT_WASM_HASH
 *
 * Falls back to hardcoded defaults for any missing variable.
 */
export function addressBookFromEnv(
  env: Record<string, string | undefined> = process.env
): AddressBook {
  const defaults = TESTNET_DEFAULTS;
  return {
    network: "testnet",
    router: env.ROUTER ?? defaults.router,
    accountDeployer: env.ACCOUNT_DEPLOYER ?? defaults.accountDeployer,
    adapters: {
      aqua: env.AQUA_ADAPTER ?? defaults.adapters.aqua,
      comet: env.COMET_ADAPTER ?? defaults.adapters.comet,
      phoenix: env.PHOENIX_ADAPTER ?? defaults.adapters.phoenix,
      soroswap: env.SOROSWAP_ADAPTER ?? defaults.adapters.soroswap,
    },
    tokens: {
      usdc: env.USDC_TOKEN ?? defaults.tokens.usdc,
      xlm: env.XLM_SAC ?? defaults.tokens.xlm,
    },
    pools: {
      soroswapPair: env.SOROSWAP_PAIR ?? defaults.pools.soroswapPair,
      aquaPool: env.AQUA_POOL_ADDRESS ?? defaults.pools.aquaPool,
    },
    aquaLpToken: env.AQUA_LP_TOKEN ?? defaults.aquaLpToken,
    wasmHash: env.ACCOUNT_WASM_HASH ?? defaults.wasmHash,
  };
}

// ---------------------------------------------------------------------------
// Main entry point — resolution order:
//   1. HOOPS_SUITE_JSON env var (path to testnet-suite.json)
//   2. Env vars (ROUTER, ACCOUNT_DEPLOYER, etc.)
//   3. Hardcoded defaults
// ---------------------------------------------------------------------------

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
export function getAddressBook(network: HoopsNetwork): AddressBook {
  switch (network) {
    case "testnet": {
      const suiteJsonPath = process.env.HOOPS_SUITE_JSON;
      if (suiteJsonPath) {
        return loadAddressBookFromFile(suiteJsonPath);
      }
      // If any Hoops env var is set, load from env
      if (process.env.ROUTER || process.env.ACCOUNT_DEPLOYER) {
        return addressBookFromEnv();
      }
      return TESTNET_DEFAULTS;
    }
    case "mainnet":
      return MAINNET_DEFAULTS;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}
