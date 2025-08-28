import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import * as Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
export interface SecurityMiddlewareConfig {
    enableRateLimiting: boolean;
    enableCSRFProtection: boolean;
    enableSecurityHeaders: boolean;
    enableInputValidation: boolean;
    enableSecurityMonitoring: boolean;
    enableAuditLogging: boolean;
    enableGDPRCompliance: boolean;
    enableDatabaseSecurity: boolean;
    enableMFA: boolean;
    securityLevel: 'basic' | 'standard' | 'enhanced' | 'maximum';
    environment: 'development' | 'staging' | 'production';
    customRules: SecurityRule[];
    exemptPaths: string[];
    exemptIPs: string[];
}
export interface SecurityRule {
    name: string;
    condition: (request: FastifyRequest) => boolean;
    action: 'allow' | 'deny' | 'log' | 'challenge';
    priority: number;
    message?: string;
}
export interface SecurityContext {
    userId?: string;
    sessionId?: string;
    userAgent: string;
    sourceIP: string;
    riskScore: number;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    mfaRequired: boolean;
    deviceTrusted: boolean;
    geoLocation?: {
        country: string;
        region: string;
        city: string;
    };
}
export declare class SecurityMiddleware {
    private config;
    private redis;
    private prisma;
    private rateLimiter;
    private securityMonitor;
    private databaseSecurity;
    constructor(redis: Redis, prisma: PrismaClient, config?: Partial<SecurityMiddlewareConfig>);
    private initializeSecurityComponents;
    register(fastify: FastifyInstance): Promise<void>;
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private inputValidationMiddleware;
    private buildSecurityContext;
    private calculateRiskScore;
    private applyCustomRules;
    private applyThreatBasedSecurity;
    private registerSecurityRoutes;
    private securityErrorHandler;
    private isExemptPath;
    private extractUserId;
    private extractSessionId;
    private getThreatLevel;
    private shouldRequireMFA;
    private isDeviceTrusted;
    private checkIPReputation;
    private isSuspiciousUserAgent;
    private isHighRiskPath;
    private getUserRiskScore;
    private requireAdditionalVerification;
    private isSensitiveOperation;
    private getActiveFeatures;
}
export declare function createSecurityMiddleware(redis: Redis, prisma: PrismaClient, config?: Partial<SecurityMiddlewareConfig>): SecurityMiddleware;
//# sourceMappingURL=security-middleware.d.ts.map