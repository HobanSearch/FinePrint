import { FastifyRequest, FastifyInstance } from 'fastify';
import * as Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { SecurityMiddlewareConfig } from './security-middleware';
import { BotDetectionConfig } from '../security/bot-detection';
import { FileUploadConfig } from '../security/file-upload-security';
import { XSSProtectionConfig } from '../security/xss-protection';
import { SecurityMonitorConfig } from '../monitoring/advanced-security-monitor';
export interface EnhancedSecurityConfig {
    core: Partial<SecurityMiddlewareConfig>;
    botDetection: Partial<BotDetectionConfig>;
    fileUpload: Partial<FileUploadConfig>;
    xssProtection: Partial<XSSProtectionConfig>;
    securityMonitor: Partial<SecurityMonitorConfig>;
    features: {
        enableBotDetection: boolean;
        enableFileUploadSecurity: boolean;
        enableXSSProtection: boolean;
        enableAdvancedMonitoring: boolean;
        enableRealTimeBlocking: boolean;
        enableThreatIntelligence: boolean;
        enableBehavioralAnalysis: boolean;
        enableVulnerabilityScanning: boolean;
    };
    securityLevel: 'basic' | 'standard' | 'enhanced' | 'maximum';
    environment: 'development' | 'staging' | 'production';
    customRules: SecurityRule[];
    exemptPaths: string[];
    exemptIPs: string[];
    exemptUserAgents: string[];
}
export interface SecurityRule {
    name: string;
    priority: number;
    condition: (request: FastifyRequest) => boolean;
    action: 'allow' | 'deny' | 'log' | 'challenge' | 'captcha';
    message?: string;
}
export interface SecurityMetrics {
    totalRequests: number;
    blockedRequests: number;
    suspiciousRequests: number;
    captchaChallenges: number;
    rateLimitViolations: number;
    xssAttempts: number;
    sqlInjectionAttempts: number;
    csrfViolations: number;
    fileUploadBlocks: number;
    botDetections: number;
    threatIntelHits: number;
    averageRiskScore: number;
    activeThreats: number;
}
export declare class EnhancedSecurityMiddleware {
    private config;
    private redis;
    private prisma?;
    private coreMiddleware;
    private botDetection?;
    private fileUploadSecurity?;
    private xssProtection?;
    private securityMonitor?;
    private rateLimiter?;
    private metrics;
    constructor(redis: Redis, prisma?: PrismaClient, config?: Partial<EnhancedSecurityConfig>);
    private buildConfiguration;
    private initializeSecurityComponents;
    register(fastify: FastifyInstance): Promise<void>;
    private orchestratorMiddleware;
    private isExemptRequest;
    private applyCustomRules;
    private collectSecurityMetrics;
    private calculateRequestRiskScore;
    private identifyThreats;
    private registerEnhancedSecurityRoutes;
    private enhancedErrorHandler;
    private isHighRiskIP;
    private isSuspiciousUserAgent;
    private isHighRiskPath;
    private containsSQLInjection;
    private containsXSS;
    private isKnownThreat;
    private startMetricsCollection;
    private startThreatIntelligenceSync;
    private syncThreatIntelligence;
    getSecurityMetrics(): SecurityMetrics;
    getComponentStatuses(): {
        coreMiddleware: boolean;
        botDetection: boolean;
        fileUploadSecurity: boolean;
        xssProtection: boolean;
        securityMonitor: boolean;
        rateLimiter: boolean;
    };
    addCustomRule(rule: SecurityRule): Promise<void>;
    removeCustomRule(ruleName: string): Promise<boolean>;
    updateConfiguration(updates: Partial<EnhancedSecurityConfig>): void;
}
export declare function createEnhancedSecurityMiddleware(redis: Redis, prisma?: PrismaClient, config?: Partial<EnhancedSecurityConfig>): EnhancedSecurityMiddleware;
//# sourceMappingURL=enhanced-security-middleware.d.ts.map