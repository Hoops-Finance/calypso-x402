export var HoopsErrorCode;
(function (HoopsErrorCode) {
    // Wallet / auth
    HoopsErrorCode["WALLET_NOT_CONNECTED"] = "WALLET_NOT_CONNECTED";
    HoopsErrorCode["AUTH_FAILED"] = "AUTH_FAILED";
    // Balance
    HoopsErrorCode["INSUFFICIENT_BALANCE"] = "INSUFFICIENT_BALANCE";
    // Swap
    HoopsErrorCode["SLIPPAGE_TOO_HIGH"] = "SLIPPAGE_TOO_HIGH";
    HoopsErrorCode["DEADLINE_EXPIRED"] = "DEADLINE_EXPIRED";
    HoopsErrorCode["POOL_NOT_FOUND"] = "POOL_NOT_FOUND";
    // Liquidity
    HoopsErrorCode["NO_LP_POSITIONS"] = "NO_LP_POSITIONS";
    // Rewards
    HoopsErrorCode["NO_REWARDS"] = "NO_REWARDS";
    // Transaction lifecycle
    HoopsErrorCode["TX_SIMULATION_FAILED"] = "TX_SIMULATION_FAILED";
    HoopsErrorCode["TX_SUBMISSION_FAILED"] = "TX_SUBMISSION_FAILED";
    HoopsErrorCode["TX_TIMEOUT"] = "TX_TIMEOUT";
    HoopsErrorCode["TX_FAILED"] = "TX_FAILED";
    // Contract errors
    HoopsErrorCode["ALREADY_INITIALIZED"] = "ALREADY_INITIALIZED";
    HoopsErrorCode["NOT_INITIALIZED"] = "NOT_INITIALIZED";
    HoopsErrorCode["INVALID_ARGUMENT"] = "INVALID_ARGUMENT";
    // Catch-all
    HoopsErrorCode["UNKNOWN"] = "UNKNOWN";
})(HoopsErrorCode || (HoopsErrorCode = {}));
export class HoopsError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.name = "HoopsError";
        this.code = code;
        this.cause = cause;
    }
}
//# sourceMappingURL=errors.js.map