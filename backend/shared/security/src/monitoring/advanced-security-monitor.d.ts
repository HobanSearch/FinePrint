import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
export interface SecurityMonitorConfig {
    enabled: boolean;
    realTimeMonitoring: boolean;
    anomalyDetection: boolean;
    automaticResponse: boolean;
    threatIntelligence: boolean;
    behavioralAnalysis: boolean;
    alertThresholds: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    retentionDays: number;
    aggregationWindow: number;
    maxEventsPerSecond: number;
}
export interface SecurityEvent {
    id: string;
    timestamp: number;
    type: SecurityEventType;
    severity: SecuritySeverity;
    source: {
        ip: string;
        userAgent: string;
        userId?: string;
        sessionId?: string;
        geoLocation?: GeoLocation;
    };
    target: {
        endpoint: string;
        method: string;
        resource?: string;
    };
    details: Record<string, any>;
    riskScore: number;
    indicators: ThreatIndicator[];
    response?: SecurityResponse;
}
export type SecurityEventType = 'authentication_failure' | 'authorization_violation' | 'xss_attempt' | 'sql_injection_attempt' | 'csrf_violation' | 'rate_limit_exceeded' | 'suspicious_activity' | 'data_exfiltration_attempt' | 'privilege_escalation_attempt' | 'malicious_file_upload' | 'bot_detection' | 'brute_force_attack' | 'session_hijacking_attempt' | 'directory_traversal_attempt' | 'command_injection_attempt' | 'vulnerability_scan' | 'anomaly_detected' | 'security_policy_violation';
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';
export interface ThreatIndicator {
    type: string;
    value: string;
    confidence: number;
    source: string;
    description: string;
}
export interface SecurityResponse {
    action: 'log' | 'alert' | 'block' | 'quarantine' | 'challenge';
    timestamp: number;
    automated: boolean;
    details: Record<string, any>;
}
export interface GeoLocation {
    country: string;
    region: string;
    city: string;
    lat?: number;
    lon?: number;
    isp?: string;
    org?: string;
}
export interface AnomalyResult {
    isAnomaly: boolean;
    score: number;
    reasons: string[];
    baseline: Record<string, number>;
    current: Record<string, number>;
}
export interface BehaviorProfile {
    userId: string;
    baseline: {
        averageRequestsPerHour: number;
        commonEndpoints: string[];
        typicalGeoLocations: GeoLocation[];
        averageSessionDuration: number;
        commonUserAgents: string[];
        typicalRequestTimes: number[];
    };
    recentActivity: {
        requestCount: number;
        uniqueEndpoints: Set<string>;
        geoLocations: GeoLocation[];
        sessionDuration: number;
        userAgents: Set<string>;
        requestTimes: number[];
    };
    riskScore: number;
    lastUpdated: number;
}
export interface SecurityAlert {
    id: string;
    timestamp: number;
    severity: SecuritySeverity;
    title: string;
    description: string;
    events: SecurityEvent[];
    indicators: ThreatIndicator[];
    recommendation: string;
    acknowledged: boolean;
    resolved: boolean;
}
export declare class AdvancedSecurityMonitor {
    private config;
    private redis;
    private prisma?;
    private eventBuffer;
    private behaviorProfiles;
    private alertQueue;
    private threatIntelCache;
    private eventCounters;
    private lastAggregation;
    private suspiciousPatterns;
    constructor(redis: Redis, prisma?: PrismaClient, config?: Partial<SecurityMonitorConfig>);
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private extractSourceInfo;
    private extractTargetInfo;
    private analyzeRequest;
    private calculateRiskScore;
    private detectSecurityEvents;
    logSecurityEvent(event: SecurityEvent): Promise<void>;
    private processCriticalEvent;
    private executeSecurityResponse;
    private analyzeUserAgent;
    private checkThreatIntelligence;
    private analyzeRequestPatterns;
    private checkAttackSignatures;
    private startEventProcessor;
    private startAnomalyDetector;
    private startPatternDetector;
    private startCleanupJob;
    private extractUserId;
    private extractSessionId;
    private extractResourceId;
    private getGeoLocation;
    private getSeverityFromRiskScore;
    private incrementEventCounter;
    private getRecentRequestCount;
    private getRecentEvents;
    private detectBehaviorAnomaly;
    private updateBehaviorProfile;
    private performRealTimeAnalysis;
    private storeEventsInDatabase;
    private detectAttackPatterns;
    private blockIP;
    private quarantineUser;
    private requireAdditionalAuth;
    private generateRecommendation;
    private generatePatternRecommendation;
    private sendSecurityAlert;
    getStatistics(): {
        eventsBuffered: number;
        behaviorProfiles: number;
        pendingAlerts: number;
        threatIntelEntries: number;
        config: SecurityMonitorConfig;
    };
    getRecentAlerts(count?: number): SecurityAlert[];
    acknowledgeAlert(alertId: string): boolean;
}
export declare function createAdvancedSecurityMonitor(redis: Redis, prisma?: PrismaClient, config?: Partial<SecurityMonitorConfig>): AdvancedSecurityMonitor;
//# sourceMappingURL=advanced-security-monitor.d.ts.map