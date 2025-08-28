import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
export interface ThreatDetectionConfig {
    anomalyDetection: {
        enabled: boolean;
        sensitivity: 'low' | 'medium' | 'high';
        learningPeriod: number;
        alertThreshold: number;
    };
    behavioralAnalysis: {
        enabled: boolean;
        userProfilingEnabled: boolean;
        deviceTrackingEnabled: boolean;
        locationAnalysisEnabled: boolean;
    };
    realTimeMonitoring: {
        enabled: boolean;
        samplingRate: number;
        bufferSize: number;
        processingInterval: number;
    };
    incidentResponse: {
        autoBlocking: boolean;
        escalationEnabled: boolean;
        notificationChannels: string[];
        responseTimeouts: Record<string, number>;
    };
    threatIntelligence: {
        enabled: boolean;
        feeds: string[];
        updateInterval: number;
        confidence_threshold: number;
    };
}
export interface SecurityEvent {
    id: string;
    timestamp: Date;
    type: 'authentication' | 'authorization' | 'data_access' | 'configuration_change' | 'anomaly' | 'threat';
    severity: 'info' | 'warning' | 'high' | 'critical';
    source: 'web' | 'mobile' | 'extension' | 'api' | 'system';
    userId?: string;
    sessionId?: string;
    ipAddress: string;
    userAgent: string;
    action: string;
    resource: string;
    result: 'success' | 'failure' | 'blocked';
    riskScore: number;
    anomalyScore?: number;
    threatIntelligence?: ThreatIntelMatch[];
    metadata: Record<string, any>;
}
export interface ThreatIntelMatch {
    source: string;
    indicator: string;
    type: 'ip' | 'domain' | 'hash' | 'signature';
    confidence: number;
    description: string;
    lastSeen: Date;
}
export interface UserBehaviorProfile {
    userId: string;
    baseline: {
        loginTimes: number[];
        commonLocations: string[];
        typicalDevices: string[];
        usagePatterns: Record<string, number>;
        riskFactors: string[];
    };
    current: {
        lastLogin: Date;
        currentLocation: string;
        currentDevice: string;
        sessionDuration: number;
        actionFrequency: Record<string, number>;
    };
    anomalies: BehaviorAnomaly[];
    lastUpdated: Date;
}
export interface BehaviorAnomaly {
    id: string;
    type: 'location' | 'time' | 'device' | 'usage_pattern' | 'velocity' | 'frequency';
    severity: 'low' | 'medium' | 'high';
    description: string;
    detectedAt: Date;
    confidence: number;
    baseline: any;
    current: any;
}
export interface SecurityIncident {
    id: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
    category: 'breach' | 'attack' | 'vulnerability' | 'policy_violation' | 'system_failure';
    affectedSystems: string[];
    affectedUsers: string[];
    detectedAt: Date;
    assignedTo?: string;
    timeline: IncidentTimelineEntry[];
    evidence: IncidentEvidence[];
    mitigation: IncidentMitigation[];
    lessons_learned?: string;
    closedAt?: Date;
}
export interface IncidentTimelineEntry {
    timestamp: Date;
    action: string;
    actor: string;
    description: string;
    impact?: string;
}
export interface IncidentEvidence {
    id: string;
    type: 'log' | 'screenshot' | 'network_trace' | 'memory_dump' | 'file';
    description: string;
    location: string;
    hash: string;
    collectedAt: Date;
    collectedBy: string;
}
export interface IncidentMitigation {
    id: string;
    action: string;
    description: string;
    implementedAt: Date;
    implementedBy: string;
    effectiveness: 'low' | 'medium' | 'high';
    status: 'planned' | 'in_progress' | 'completed' | 'failed';
}
export interface ThreatDetectionMetrics {
    totalEvents: number;
    threatsDetected: number;
    falsePositives: number;
    truePositives: number;
    incidentsCreated: number;
    averageResponseTime: number;
    averageResolutionTime: number;
    blockedAttacks: number;
    anomaliesDetected: number;
    riskScoreDistribution: Record<string, number>;
}
export declare class AdvancedThreatDetectionService extends EventEmitter {
    private redis;
    private prisma;
    private config;
    private eventBuffer;
    private userProfiles;
    private threatIntelCache;
    private metrics;
    private processingTimer?;
    constructor(redis: Redis, prisma: PrismaClient, config: ThreatDetectionConfig);
    private initialize;
    processSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'riskScore'>): Promise<SecurityEvent>;
    createIncident(title: string, description: string, severity: SecurityIncident['severity'], category: SecurityIncident['category'], triggeringEvents: SecurityEvent[]): Promise<SecurityIncident>;
    private analyzeBehavior;
    private calculateRiskScore;
    private checkThreatIntelligence;
    private detectAnomaly;
    private processHighRiskEvent;
    private getAnomalyThreshold;
    private extractEventMetrics;
    private loadThreatIntelligence;
    private startThreatIntelUpdater;
    private loadUserProfiles;
    private startRealTimeProcessor;
    private processEventBuffer;
    private createUserProfile;
    private detectLocationAnomaly;
    private detectTimeAnomaly;
    private detectDeviceAnomaly;
    private detectUsageAnomaly;
    private updateUserProfile;
    private checkIPReputation;
    private checkRateViolations;
    private getRecentAuthFailures;
    private getHistoricalEvents;
    private storeIncident;
    private autoAssignIncident;
    private triggerAutomatedResponse;
    private sendIncidentNotifications;
    private blockThreatSource;
    private applyRateLimit;
    private batchStoreEvents;
    private detectPatterns;
    private updateMetrics;
    getMetrics(): ThreatDetectionMetrics;
    getActiveIncidents(): Promise<SecurityIncident[]>;
    updateIncident(incidentId: string, updates: Partial<SecurityIncident>): Promise<void>;
    closeIncident(incidentId: string, resolution: string, lessonsLearned?: string): Promise<void>;
}
export declare const createAdvancedThreatDetection: (redis: Redis, prisma: PrismaClient, config: ThreatDetectionConfig) => AdvancedThreatDetectionService;
//# sourceMappingURL=advanced-threat-detection.d.ts.map