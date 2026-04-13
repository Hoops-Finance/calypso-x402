export async function withRetry(fn, opts = {}) {
    const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = opts;
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
                const delay = Math.min(baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs, maxDelayMs);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}
//# sourceMappingURL=retries.js.map