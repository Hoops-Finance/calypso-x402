export declare enum HoopsErrorCode {
    WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED",
    AUTH_FAILED = "AUTH_FAILED",
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    SLIPPAGE_TOO_HIGH = "SLIPPAGE_TOO_HIGH",
    DEADLINE_EXPIRED = "DEADLINE_EXPIRED",
    POOL_NOT_FOUND = "POOL_NOT_FOUND",
    NO_LP_POSITIONS = "NO_LP_POSITIONS",
    NO_REWARDS = "NO_REWARDS",
    TX_SIMULATION_FAILED = "TX_SIMULATION_FAILED",
    TX_SUBMISSION_FAILED = "TX_SUBMISSION_FAILED",
    TX_TIMEOUT = "TX_TIMEOUT",
    TX_FAILED = "TX_FAILED",
    ALREADY_INITIALIZED = "ALREADY_INITIALIZED",
    NOT_INITIALIZED = "NOT_INITIALIZED",
    INVALID_ARGUMENT = "INVALID_ARGUMENT",
    UNKNOWN = "UNKNOWN"
}
export declare class HoopsError extends Error {
    readonly code: HoopsErrorCode;
    readonly cause?: unknown;
    constructor(code: HoopsErrorCode, message: string, cause?: unknown);
}
//# sourceMappingURL=errors.d.ts.map