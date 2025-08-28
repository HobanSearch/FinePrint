import Redis from 'ioredis';
export declare class RedisClient {
    client: Redis;
    private isConnected;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    healthCheck(): Promise<boolean>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    setex(key: string, ttl: number, value: string): Promise<void>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    expire(key: string, ttl: number): Promise<void>;
    lpush(key: string, value: string): Promise<void>;
    ltrim(key: string, start: number, stop: number): Promise<void>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    deletePattern(pattern: string): Promise<void>;
    hset(key: string, field: string, value: string): Promise<void>;
    hget(key: string, field: string): Promise<string | null>;
    hgetall(key: string): Promise<Record<string, string>>;
    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
}
//# sourceMappingURL=redis.d.ts.map