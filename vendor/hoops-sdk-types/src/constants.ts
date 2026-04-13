export const TOKEN_DECIMALS = 7;
export const TOKEN_UNIT = 10_000_000n;

export const ADAPTER_IDS = {
  AQUA: 0,
  COMET: 1,
  PHOENIX: 2,
  SOROSWAP: 3,
} as const;

export const ADAPTER_NAMES: Record<number, string> = {
  [ADAPTER_IDS.AQUA]: "Aquarius",
  [ADAPTER_IDS.COMET]: "Comet",
  [ADAPTER_IDS.PHOENIX]: "Phoenix",
  [ADAPTER_IDS.SOROSWAP]: "Soroswap",
};

export const SWAP_FEE_NUMERATOR = 997n;
export const SWAP_FEE_DENOMINATOR = 1000n;

export const NETWORK_CONFIG = {
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    friendbotUrl: "https://friendbot.stellar.org",
  },
  mainnet: {
    rpcUrl: "https://mainnet.sorobanrpc.com",
    passphrase: "Public Global Stellar Network ; September 2015",
    friendbotUrl: null,
  },
} as const;

export const TX_DEFAULTS = {
  fee: "100",
  timeoutSeconds: 180,
  deadlineOffsetSeconds: 600,
  xlmReserveForFees: 10_000_000n * 10n, // 10 XLM in stroops
  minUsdcForDeposit: 10_000_000n / 2n, // 0.5 USDC in stroops
} as const;
