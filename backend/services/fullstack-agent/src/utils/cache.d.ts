export interface CacheOptions {
    ttl?: number;
    checkPeriod?: number;
    useRedis?: boolean;
}
export declare class Cache {
    private readonly logger;
    private nodeCache;
    private redis?;
    private readonly prefix;
    private readonly useRedis;
    constructor(namespace?: string, options?: CacheOptions);
    private initializeRedis;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
    clear(pattern?: string): Promise<void>;
    getStats(): {
        local: {
            keys: number;
            hits: number;
            misses: number;
            ksize: number;
            vsize: number;
        };
        redis?: {
            connected: boolean;
            memory?: string;
            keys?: number;
        };
    };
    keys(pattern?: string): Promise<string[]>;
    mset(keyValuePairs: Array<{
        key: string;
        value: any;
        ttl?: number;
    }>): Promise<void>;
    mget<T>(keys: string[]): Promise<(T | null)[]>;
    increment(key: string, delta?: number): Promise<number>;
    expire(key: string, ttl: number): Promise<void>;
    ttl(key: string): Promise<number>;
    close(): Promise<void>;
    private matchesPattern;
}
//# sourceMappingURL=cache.d.ts.map