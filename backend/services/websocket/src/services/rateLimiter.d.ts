import { Socket } from 'socket.io';
export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    keyGenerator?: (socket: Socket) => string;
    onLimitReached?: (socket: Socket, info: RateLimitInfo) => void;
}
export interface RateLimitInfo {
    totalHits: number;
    totalHitsInWindow: number;
    remainingPoints: number;
    msBeforeNext: number;
    isFirstInWindow: boolean;
}
export interface RateLimitRule {
    name: string;
    config: RateLimitConfig;
    eventTypes?: string[];
    userTypes?: string[];
}
export declare class RateLimiter {
    private rules;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    checkLimit(socket: Socket, eventType?: string): Promise<boolean>;
    recordRequest(socket: Socket, eventType?: string, success?: boolean): Promise<void>;
    getRateLimitInfo(socket: Socket, ruleName: string): Promise<RateLimitInfo | null>;
    resetUserLimits(userId: string): Promise<void>;
    getGlobalStats(): Promise<{
        totalRequests: number;
        blockedRequests: number;
        topUsers: Array<{
            userId: string;
            requests: number;
        }>;
        topIPs: Array<{
            ip: string;
            requests: number;
        }>;
    }>;
    addRule(rule: RateLimitRule): void;
    removeRule(ruleName: string): boolean;
    getRules(): RateLimitRule[];
    private setupDefaultRules;
    private loadCustomRules;
    private getApplicableRules;
    private checkRule;
    private recordForRule;
    private generateKey;
    private getWindowStart;
    private getClientIP;
    private getUserType;
    private incrementBlockedCounter;
    private getTopEntries;
    private handleGlobalIPLimit;
    createEventMiddleware(): (socket: Socket, eventType: string, next: Function) => Promise<void>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=rateLimiter.d.ts.map