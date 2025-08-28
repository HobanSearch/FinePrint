import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    keyGenerator?: (request: FastifyRequest) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    onLimitReached?: (request: FastifyRequest) => void;
    message?: string;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
}
export interface RateLimitRule {
    name: string;
    path?: string | RegExp;
    method?: string | string[];
    condition?: (request: FastifyRequest) => boolean;
    config: RateLimitConfig;
    priority: number;
}
export interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: Date;
    retryAfter?: number;
}
export interface SlidingWindowEntry {
    count: number;
    windowStart: number;
    requests: number[];
}
export interface ThreatMetrics {
    suspiciousIPs: Set<string>;
    blockedIPs: Set<string>;
    rateLimitViolations: Map<string, number>;
    lastViolation: Map<string, number>;
}
export declare class AdvancedRateLimiter {
    private redis;
    private rules;
    private threatMetrics;
    private readonly keyPrefix;
    private readonly threatKeyPrefix;
    constructor(redisClient: Redis);
    addRule(rule: RateLimitRule): void;
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private applyRule;
    private slidingWindowCheck;
    private generateKey;
    private findApplicableRules;
    private updateThreatMetrics;
    private initializeDefaultRules;
    getRateLimitStatus(request: FastifyRequest): Promise<{
        [ruleName: string]: RateLimitInfo;
    }>;
    blockIP(ip: string, durationMs?: number): Promise<void>;
    unblockIP(ip: string): Promise<void>;
    getThreatMetrics(): ThreatMetrics;
    resetRateLimit(key: string): Promise<void>;
    private startCleanupJob;
    createIPLimiter(config: RateLimitConfig): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    createUserLimiter(config: RateLimitConfig): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}
export declare function createRateLimiter(redisClient: Redis): AdvancedRateLimiter;
//# sourceMappingURL=advanced-rate-limiter.d.ts.map