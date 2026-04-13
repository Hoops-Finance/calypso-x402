export declare const TOKEN_DECIMALS = 7;
export declare const TOKEN_UNIT = 10000000n;
export declare const ADAPTER_IDS: {
    readonly AQUA: 0;
    readonly COMET: 1;
    readonly PHOENIX: 2;
    readonly SOROSWAP: 3;
};
export declare const ADAPTER_NAMES: Record<number, string>;
export declare const SWAP_FEE_NUMERATOR = 997n;
export declare const SWAP_FEE_DENOMINATOR = 1000n;
export declare const NETWORK_CONFIG: {
    readonly testnet: {
        readonly rpcUrl: "https://soroban-testnet.stellar.org";
        readonly passphrase: "Test SDF Network ; September 2015";
        readonly friendbotUrl: "https://friendbot.stellar.org";
    };
    readonly mainnet: {
        readonly rpcUrl: "https://mainnet.sorobanrpc.com";
        readonly passphrase: "Public Global Stellar Network ; September 2015";
        readonly friendbotUrl: null;
    };
};
export declare const TX_DEFAULTS: {
    readonly fee: "100";
    readonly timeoutSeconds: 180;
    readonly deadlineOffsetSeconds: 600;
    readonly xlmReserveForFees: bigint;
    readonly minUsdcForDeposit: bigint;
};
//# sourceMappingURL=constants.d.ts.map