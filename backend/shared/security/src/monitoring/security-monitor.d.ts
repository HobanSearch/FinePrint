import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
export interface SecurityEvent {
    id: string;
    type: SecurityEventType;
    severity: SecuritySeverity;
    timestamp: Date;
    sourceIP: string;
    userAgent?: string;
    userId?: string;
    sessionId?: string;
    details: any;
    riskScore: number;
    blocked: boolean;
}
export declare enum SecurityEventType {
    LOGIN_SUCCESS = "login_success",
    LOGIN_FAILURE = "login_failure",
    LOGOUT = "logout",
    PASSWORD_CHANGE = "password_change",
    MFA_SETUP = "mfa_setup",
    MFA_SUCCESS = "mfa_success",
    MFA_FAILURE = "mfa_failure",
    ACCOUNT_LOCKED = "account_locked",
    ACCESS_DENIED = "access_denied",
    PRIVILEGE_ESCALATION = "privilege_escalation",
    UNAUTHORIZED_ACCESS = "unauthorized_access",
    XSS_ATTEMPT = "xss_attempt",
    SQL_INJECTION = "sql_injection",
    PATH_TRAVERSAL = "path_traversal",
    COMMAND_INJECTION = "command_injection",
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
    DDoS_ATTACK = "ddos_attack",
    SENSITIVE_DATA_ACCESS = "sensitive_data_access",
    DATA_EXPORT = "data_export",
    BULK_DOWNLOAD = "bulk_download",
    SYSTEM_ERROR = "system_error",
    CONFIGURATION_CHANGE = "configuration_change",
    SERVICE_RESTART = "service_restart",
    SUSPICIOUS_BEHAVIOR = "suspicious_behavior",
    LOCATION_ANOMALY = "location_anomaly",
    TIME_ANOMALY = "time_anomaly",
    UNUSUAL_TRAFFIC = "unusual_traffic"
}
export declare enum SecuritySeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export interface ThreatIntelligence {
    maliciousIPs: Set<string>;
    knownAttackers: Set<string>;
    suspiciousUserAgents: Set<string>;
    blockedCountries: Set<string>;
    honeypotTokens: Set<string>;
}
export interface AnomalyDetectionConfig {
    enabled: boolean;
    sensitivity: number;
    windowSize: number;
    thresholds: {
        requestRate: number;
        errorRate: number;
        geolocationChange: boolean;
        unusualHours: boolean;
    };
}
export interface AlertRule {
    id: string;
    name: string;
    eventTypes: SecurityEventType[];
    conditions: AlertCondition[];
    actions: AlertAction[];
    enabled: boolean;
    cooldownMinutes: number;
}
export interface AlertCondition {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex';
    value: any;
}
export interface AlertAction {
    type: 'email' | 'webhook' | 'slack' | 'block_ip' | 'disable_user';
    config: any;
}
export declare class SecurityMonitor {
    private redis;
    private threatIntel;
    private alertRules;
    private anomalyConfig;
    private readonly eventKeyPrefix;
    private readonly alertKeyPrefix;
    private readonly metricsKeyPrefix;
    constructor(redisClient: Redis);
    logSecurityEvent(event: Partial<SecurityEvent>): Promise<void>;
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private calculateRiskScore;
    private checkThreatIntelligence;
    private updateSecurityMetrics;
    private processAlertRules;
    private evaluateCondition;
    private getEventValue;
    private executeAlertAction;
    private detectAnomalies;
    private logToApplication;
    private initializeDefaultRules;
    private startThreatIntelUpdate;
    private updateThreatIntelligence;
    getSecurityMetrics(timeframe?: 'hour' | 'day'): Promise<any>;
    getRecentEvents(limit?: number): Promise<SecurityEvent[]>;
}
export declare function createSecurityMonitor(redisClient: Redis): SecurityMonitor;
//# sourceMappingURL=security-monitor.d.ts.map