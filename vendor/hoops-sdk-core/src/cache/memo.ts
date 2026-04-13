interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createMemoizer(ttlMs: number = 30_000) {
  const cache = new Map<string, CacheEntry<unknown>>();

  return {
    get<T>(key: string): T | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
      }
      return entry.value as T;
    },

    set<T>(key: string, value: T): void {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    invalidate(key: string): void {
      cache.delete(key);
    },

    clear(): void {
      cache.clear();
    },
  };
}
