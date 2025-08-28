import { CacheManager } from '@fineprintai/cache';
import { RateLimitConfig, RateLimitRequest, RateLimitInfo, RateLimitStats } from './types';
export declare class AuthRateLimiter {
    private cache;
    private config;
    private rules;
    private suspiciousActivityPatterns;
    constructor(cache: CacheManager, config: RateLimitConfig);
    private initializeRules;
    private initializeSuspiciousActivityPatterns;
    checkRateLimit(request: RateLimitRequest): Promise<RateLimitInfo>;
    recordResult(key: string, success: boolean, metadata?: Record<string, any>): Promise<void>;
    applyDynamicRateLimit(userId: string, multiplier: number, duration: number, reason: string): Promise<void>;
    removeDynamicRateLimit(userId: string): Promise<void>;
    blockIP(ip: string, duration: number, reason: string, severity?: 'low' | 'medium' | 'high' | 'critical'): Promise<void>;
    unblockIP(ip: string): Promise<void>;
    isIPBlocked(ip: string): Promise<boolean>;
    getStats(): Promise<RateLimitStats>;
    private findApplicableRule;
    private matchesRule;
    private shouldSkipRequest;
    private generateKey;
    private getBucket;
    private updateBucket;
    private calculateRequestWeight;
    private checkSuspiciousActivity;
    private createAllowedInfo;
    private createBlockedInfo;
    private createLimitExceededInfo;
    private createPassInfo;
    performMaintenance(): Promise<void>;
}
//# sourceMappingURL=rateLimiter.d.ts.map