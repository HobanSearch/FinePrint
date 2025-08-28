export declare function delay(ms: number): Promise<void>;
export declare function retry<T>(fn: () => Promise<T>, maxAttempts: number, baseDelay?: number): Promise<T | null>;
export declare function chunk<T>(array: T[], size: number): T[][];
export declare function sanitizeString(str: string): string;
export declare function extractDomain(url: string): string;
export declare function generateHash(content: string): string;
export declare function calculateSimilarity(str1: string, str2: string): number;
export declare function formatBytes(bytes: number, decimals?: number): string;
export declare function formatDuration(ms: number): string;
export declare function isValidEmail(email: string): boolean;
export declare function isValidUrl(url: string): boolean;
export declare function stripHtml(html: string): string;
export declare function truncate(str: string, length: number, suffix?: string): string;
export declare function deepClone<T>(obj: T): T;
export declare function groupBy<T, K extends keyof T>(array: T[], key: K): Record<string, T[]>;
export declare function percentile(arr: number[], p: number): number;
export declare class RateLimiter {
    private maxRequests;
    private windowMs;
    private requests;
    constructor(maxRequests: number, windowMs: number);
    canMakeRequest(): boolean;
    getWaitTime(): number;
}
export declare class CircuitBreaker {
    private failureThreshold;
    private resetTimeoutMs;
    private failures;
    private lastFailTime;
    private state;
    constructor(failureThreshold?: number, resetTimeoutMs?: number);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    getState(): string;
}
export declare class MemoryTracker {
    private startMemory;
    constructor();
    getUsage(): {
        rss: string;
        heapTotal: string;
        heapUsed: string;
        external: string;
        diff: {
            rss: string;
            heapTotal: string;
            heapUsed: string;
            external: string;
        };
    };
}
export declare class SimpleCache<K, V> {
    private defaultTtlMs;
    private cache;
    constructor(defaultTtlMs?: number);
    set(key: K, value: V, ttlMs?: number): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    size(): number;
}
//# sourceMappingURL=helpers.d.ts.map