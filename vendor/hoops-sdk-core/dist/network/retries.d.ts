export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
}
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
//# sourceMappingURL=retries.d.ts.map