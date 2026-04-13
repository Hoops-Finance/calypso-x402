export declare function createMemoizer(ttlMs?: number): {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    invalidate(key: string): void;
    clear(): void;
};
//# sourceMappingURL=memo.d.ts.map