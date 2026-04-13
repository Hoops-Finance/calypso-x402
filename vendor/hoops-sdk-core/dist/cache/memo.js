export function createMemoizer(ttlMs = 30_000) {
    const cache = new Map();
    return {
        get(key) {
            const entry = cache.get(key);
            if (!entry)
                return undefined;
            if (Date.now() > entry.expiresAt) {
                cache.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value) {
            cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        },
        invalidate(key) {
            cache.delete(key);
        },
        clear() {
            cache.clear();
        },
    };
}
//# sourceMappingURL=memo.js.map