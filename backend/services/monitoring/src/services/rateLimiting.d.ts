import Bottleneck from 'bottleneck';
import { EventEmitter } from 'events';
interface RateLimitConfig {
    id: string;
    maxConcurrent?: number;
    minTime?: number;
    maxRequests?: number;
    timeWindow?: number;
    reservoir?: number;
    reservoirRefreshAmount?: number;
    reservoirRefreshInterval?: number;
    strategy?: 'leak_bucket' | 'fixed_window' | 'sliding_window';
    retryCount?: number;
    highWater?: number;
    backoffType?: 'exponential' | 'linear' | 'fixed';
    backoffDelay?: number;
}
interface RateLimitStats {
    id: string;
    running: number;
    queued: number;
    submitted: number;
    done: number;
    failed: number;
    retries: number;
    executing: boolean;
    reservoir?: number;
}
declare class RateLimitingService extends EventEmitter {
    private redis;
    private limiters;
    private backoffStrategies;
    private initialized;
    private statsCollectionInterval;
    constructor();
    initialize(): Promise<void>;
    createRateLimiter(config: RateLimitConfig): Promise<Bottleneck>;
    executeWithRateLimit<T>(limiterId: string, task: () => Promise<T>, options?: {
        priority?: number;
        weight?: number;
        retryCount?: number;
        expiration?: number;
    }): Promise<T>;
    private executeWithRetry;
    private calculateBackoffDelay;
    getRateLimiter(id: string): Bottleneck | undefined;
    getAllRateLimiters(): Map<string, Bottleneck>;
    getRateLimitStats(id: string): RateLimitStats | undefined;
    getAllRateLimitStats(): RateLimitStats[];
    updateReservoir(limiterId: string, reservoir: number): Promise<boolean>;
    incrementReservoir(limiterId: string, amount?: number): Promise<number | null>;
    getQueueLength(limiterId: string): Promise<number>;
    clearQueue(limiterId: string): Promise<number>;
    pauseRateLimiter(limiterId: string): Promise<boolean>;
    resumeRateLimiter(limiterId: string): Promise<boolean>;
    removeRateLimiter(limiterId: string): Promise<boolean>;
    createDocumentCrawlerLimiter(maxConcurrent?: number, minTime?: number): Promise<Bottleneck>;
    createWebhookDeliveryLimiter(maxRequests?: number, timeWindow?: number): Promise<Bottleneck>;
    createAPIRateLimiter(tier: 'free' | 'starter' | 'professional' | 'enterprise'): Promise<Bottleneck>;
    private parseTimeWindow;
    private createDefaultLimiters;
    private setupLimiterEventListeners;
    private setupRetryLogic;
    private startStatsCollection;
    private stopStatsCollection;
    healthCheck(): Promise<void>;
    getHealthStatus(): {
        healthy: boolean;
        totalLimiters: number;
        unhealthyLimiters: string[];
        totalRunning: number;
        totalQueued: number;
    };
    shutdown(): Promise<void>;
}
export declare const rateLimitingService: RateLimitingService;
export {};
//# sourceMappingURL=rateLimiting.d.ts.map