export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = Math.min(
          baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs,
          maxDelayMs
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
