import { HoopsError, HoopsErrorCode } from "hoops-sdk-types";
// Contract error code mappings
const ACCOUNT_ERROR_MAP = {
    1: HoopsErrorCode.ALREADY_INITIALIZED,
    2: HoopsErrorCode.AUTH_FAILED,
};
const ROUTER_ERROR_MAP = {
    10: HoopsErrorCode.ALREADY_INITIALIZED,
    100: HoopsErrorCode.UNKNOWN,
    101: HoopsErrorCode.POOL_NOT_FOUND,
    102: HoopsErrorCode.UNKNOWN,
    200: HoopsErrorCode.POOL_NOT_FOUND,
    201: HoopsErrorCode.INSUFFICIENT_BALANCE,
    202: HoopsErrorCode.SLIPPAGE_TOO_HIGH,
    203: HoopsErrorCode.SLIPPAGE_TOO_HIGH,
    204: HoopsErrorCode.SLIPPAGE_TOO_HIGH,
    205: HoopsErrorCode.DEADLINE_EXPIRED,
    206: HoopsErrorCode.NOT_INITIALIZED,
    207: HoopsErrorCode.INVALID_ARGUMENT,
    209: HoopsErrorCode.INVALID_ARGUMENT,
    210: HoopsErrorCode.INVALID_ARGUMENT,
    211: HoopsErrorCode.INSUFFICIENT_BALANCE,
};
// String pattern matching for error messages
const ERROR_PATTERNS = [
    [/not.?authorized|auth.*fail|unauthorized/i, HoopsErrorCode.AUTH_FAILED],
    [/insufficient.*balance|not enough/i, HoopsErrorCode.INSUFFICIENT_BALANCE],
    [/deadline.*passed|deadline.*expired/i, HoopsErrorCode.DEADLINE_EXPIRED],
    [/pool.*not.*found/i, HoopsErrorCode.POOL_NOT_FOUND],
    [/slippage/i, HoopsErrorCode.SLIPPAGE_TOO_HIGH],
    [/already.*init/i, HoopsErrorCode.ALREADY_INITIALIZED],
    [/simulation.*fail/i, HoopsErrorCode.TX_SIMULATION_FAILED],
    [/submission.*fail/i, HoopsErrorCode.TX_SUBMISSION_FAILED],
    [/tx.*fail|transaction.*fail/i, HoopsErrorCode.TX_FAILED],
    [/no.*reward/i, HoopsErrorCode.NO_REWARDS],
    [/no.*lp.*position/i, HoopsErrorCode.NO_LP_POSITIONS],
];
function extractContractErrorCode(err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Contract errors often appear as "Error(Contract, #N)"
    const match = msg.match(/Error\(Contract,\s*#(\d+)\)/);
    if (match)
        return parseInt(match[1], 10);
    // Also check for raw numeric error codes
    const rawMatch = msg.match(/contract error[:\s]+(\d+)/i);
    if (rawMatch)
        return parseInt(rawMatch[1], 10);
    return null;
}
export function normalizeHoopsError(e) {
    if (e instanceof HoopsError)
        return e;
    const msg = e instanceof Error ? e.message : String(e);
    // Try contract error code mapping
    const code = extractContractErrorCode(e);
    if (code !== null) {
        const mapped = ACCOUNT_ERROR_MAP[code] ?? ROUTER_ERROR_MAP[code] ?? HoopsErrorCode.UNKNOWN;
        return new HoopsError(mapped, msg, e);
    }
    // Try string pattern matching
    for (const [pattern, errorCode] of ERROR_PATTERNS) {
        if (pattern.test(msg)) {
            return new HoopsError(errorCode, msg, e);
        }
    }
    return new HoopsError(HoopsErrorCode.UNKNOWN, msg, e);
}
//# sourceMappingURL=errorMapping.js.map