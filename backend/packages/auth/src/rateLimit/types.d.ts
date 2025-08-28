export interface RateLimitConfig {
    rules: RateLimitRule[];
    storage: 'redis' | 'memory';
    keyGenerator: (req: RateLimitRequest) => string;
    skipFunction?: (req: RateLimitRequest) => boolean;
    onLimitReached?: (req: RateLimitRequest, info: RateLimitInfo) => void;
    headers: {
        total: string;
        remaining: string;
        reset: string;
        retryAfter: string;
    };
}
export interface RateLimitRule {
    id: string;
    name: string;
    endpoint: string | RegExp;
    method?: string | string[];
    windowMs: number;
    max: number;
    blockDuration?: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    keyGenerator?: (req: RateLimitRequest) => string;
    condition?: (req: RateLimitRequest) => boolean;
    weights?: Record<string, number>;
}
export interface RateLimitRequest {
    ip: string;
    method: string;
    path: string;
    userId?: string;
    userAgent?: string;
    headers: Record<string, string>;
    body?: any;
    timestamp: Date;
}
export interface RateLimitInfo {
    total: number;
    remaining: number;
    reset: Date;
    retryAfter?: number;
    blocked: boolean;
    rule: RateLimitRule;
    key: string;
}
export interface RateLimitAttempt {
    timestamp: Date;
    success: boolean;
    weight: number;
    metadata?: Record<string, any>;
}
export interface RateLimitBucket {
    attempts: RateLimitAttempt[];
    totalAttempts: number;
    totalWeight: number;
    blocked: boolean;
    blockedUntil?: Date;
    createdAt: Date;
    lastAttempt: Date;
    rule: string;
}
export interface RateLimitStats {
    totalRequests: number;
    blockedRequests: number;
    ruleStats: Record<string, {
        requests: number;
        blocked: number;
        averageWeight: number;
    }>;
    topBlockedIPs: Array<{
        ip: string;
        count: number;
    }>;
    topBlockedEndpoints: Array<{
        endpoint: string;
        count: number;
    }>;
}
export interface DynamicRateLimit {
    userId: string;
    multiplier: number;
    expires: Date;
    reason: string;
}
export interface SuspiciousActivityPattern {
    id: string;
    name: string;
    description: string;
    detector: (attempts: RateLimitAttempt[], context: any) => boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    action: 'log' | 'block' | 'alert' | 'escalate';
    blockDuration: number;
}
//# sourceMappingURL=types.d.ts.map