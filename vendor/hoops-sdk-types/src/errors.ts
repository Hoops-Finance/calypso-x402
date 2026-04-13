export enum HoopsErrorCode {
  // Wallet / auth
  WALLET_NOT_CONNECTED = "WALLET_NOT_CONNECTED",
  AUTH_FAILED = "AUTH_FAILED",

  // Balance
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",

  // Swap
  SLIPPAGE_TOO_HIGH = "SLIPPAGE_TOO_HIGH",
  DEADLINE_EXPIRED = "DEADLINE_EXPIRED",
  POOL_NOT_FOUND = "POOL_NOT_FOUND",

  // Liquidity
  NO_LP_POSITIONS = "NO_LP_POSITIONS",

  // Rewards
  NO_REWARDS = "NO_REWARDS",

  // Transaction lifecycle
  TX_SIMULATION_FAILED = "TX_SIMULATION_FAILED",
  TX_SUBMISSION_FAILED = "TX_SUBMISSION_FAILED",
  TX_TIMEOUT = "TX_TIMEOUT",
  TX_FAILED = "TX_FAILED",

  // Contract errors
  ALREADY_INITIALIZED = "ALREADY_INITIALIZED",
  NOT_INITIALIZED = "NOT_INITIALIZED",
  INVALID_ARGUMENT = "INVALID_ARGUMENT",

  // Catch-all
  UNKNOWN = "UNKNOWN",
}

export class HoopsError extends Error {
  readonly code: HoopsErrorCode;
  readonly cause?: unknown;

  constructor(code: HoopsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "HoopsError";
    this.code = code;
    this.cause = cause;
  }
}
