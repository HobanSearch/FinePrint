import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
export interface BotDetectionConfig {
    enabled: boolean;
    strictMode: boolean;
    captchaProvider: 'recaptcha' | 'hcaptcha' | 'turnstile' | 'custom';
    captchaSecretKey: string;
    captchaSiteKey: string;
    suspiciousThreshold: number;
    blockThreshold: number;
    challengeThreshold: number;
    whitelistedUserAgents: string[];
    whitelistedIPs: string[];
    honeypotFields: string[];
}
export interface BotDetectionResult {
    isBot: boolean;
    confidence: number;
    reasons: string[];
    requiresCaptcha: boolean;
    shouldBlock: boolean;
    riskScore: number;
}
export interface BehaviorMetrics {
    requestCount: number;
    averageInterval: number;
    uniqueEndpoints: Set<string>;
    userAgentChanges: number;
    suspiciousPatterns: string[];
    humanBehaviorScore: number;
    firstSeen: number;
    lastSeen: number;
}
export interface CaptchaChallenge {
    challengeId: string;
    timestamp: number;
    ip: string;
    attempts: number;
    solved: boolean;
    expiresAt: number;
}
export declare class BotDetectionEngine {
    private config;
    private redis;
    private behaviorCache;
    private captchaChallenges;
    private readonly botPatterns;
    private readonly legitimateBots;
    private readonly suspiciousIPRanges;
    constructor(redis: Redis, config?: Partial<BotDetectionConfig>);
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private analyzeRequest;
    private analyzeUserAgent;
    private analyzeIP;
    private analyzeRequestPatterns;
    private analyzeBehavior;
    private analyzeHeaders;
    private analyzeRequestTiming;
    private analyzeHoneypot;
    private requireCaptchaChallenge;
    private verifyCaptcha;
    private markCaptchaSolved;
    private hasSolvedCaptcha;
    private blockIP;
    private isWhitelisted;
    private updateBehaviorMetrics;
    private getRecentRequestCount;
    private startCleanupJob;
    getStatistics(): {
        totalBehaviorProfiles: number;
        activeCaptchaChallenges: number;
        config: {
            enabled: boolean;
            strictMode: boolean;
            captchaProvider: "custom" | "recaptcha" | "hcaptcha" | "turnstile";
            thresholds: {
                suspicious: number;
                challenge: number;
                block: number;
            };
        };
    };
    generateHoneypotHTML(): string;
    createCaptchaMiddleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
}
export declare function createBotDetection(redis: Redis, config?: Partial<BotDetectionConfig>): BotDetectionEngine;
//# sourceMappingURL=bot-detection.d.ts.map