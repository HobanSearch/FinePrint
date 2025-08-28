import { FastifyRequest } from 'fastify';
export interface AuditEvent {
    id: string;
    timestamp: Date;
    userId?: string;
    sessionId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    sourceIP: string;
    userAgent?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    oldValues?: any;
    newValues?: any;
    details?: any;
    riskLevel: AuditRiskLevel;
    complianceFlags: ComplianceFlag[];
    hash: string;
    previousHash?: string;
}
export declare enum AuditRiskLevel {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum ComplianceFlag {
    GDPR = "gdpr",
    CCPA = "ccpa",
    SOX = "sox",
    HIPAA = "hipaa",
    PCI_DSS = "pci_dss",
    ISO27001 = "iso27001"
}
export interface AuditConfiguration {
    enabled: boolean;
    retentionDays: number;
    compressionEnabled: boolean;
    encryptionEnabled: boolean;
    integrityProtection: boolean;
    realTimeAlerts: boolean;
    excludePaths: string[];
    excludeUsers: string[];
    sensitiveFields: string[];
    complianceMode: ComplianceFlag[];
}
export interface AuditQuery {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: AuditRiskLevel;
    complianceFlags?: ComplianceFlag[];
    sourceIP?: string;
    limit?: number;
    offset?: number;
}
export interface AuditReport {
    totalEvents: number;
    timeRange: {
        start: Date;
        end: Date;
    };
    userActivity: {
        [userId: string]: number;
    };
    actionBreakdown: {
        [action: string]: number;
    };
    riskDistribution: {
        [riskLevel: string]: number;
    };
    complianceEvents: {
        [flag: string]: number;
    };
    anomalies: AuditAnomaly[];
}
export interface AuditAnomaly {
    type: 'unusual_time' | 'suspicious_ip' | 'bulk_action' | 'privilege_escalation';
    description: string;
    events: string[];
    severity: 'low' | 'medium' | 'high';
}
export declare class AuditLogger {
    private config;
    private eventChain;
    private readonly hashSecret;
    constructor(config?: Partial<AuditConfiguration>);
    logEvent(eventData: Partial<AuditEvent>): Promise<string>;
    middleware(): (request: FastifyRequest, reply: any) => Promise<void>;
    logAuth(action: 'login' | 'logout' | 'mfa' | 'password_change', userId: string, request: FastifyRequest, success: boolean, details?: any): Promise<string>;
    logDataAccess(action: 'read' | 'create' | 'update' | 'delete', resource: string, resourceId: string, userId: string, request: FastifyRequest, oldValues?: any, newValues?: any): Promise<string>;
    logAdmin(action: string, resource: string, userId: string, request: FastifyRequest, details?: any): Promise<string>;
    logSecurity(action: string, userId: string | undefined, request: FastifyRequest, details: any): Promise<string>;
    logPrivacy(action: 'data_export' | 'data_deletion' | 'consent_update', userId: string, request: FastifyRequest, details?: any): Promise<string>;
    queryEvents(query: AuditQuery): Promise<AuditEvent[]>;
    generateReport(startDate: Date, endDate: Date): Promise<AuditReport>;
    verifyIntegrity(): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    exportData(format: 'json' | 'csv' | 'xml', query: AuditQuery): Promise<string>;
    private shouldExclude;
    private sanitizeDetails;
    private determineComplianceFlags;
    private calculateRiskLevel;
    private generateEventHash;
    private getLastEventHash;
    private storeEvent;
    private sendAlert;
    private extractSessionId;
    private extractUserId;
    private isHighRiskOperation;
    private getActionFromRequest;
    private getResourceFromRequest;
    private getResourceIdFromRequest;
    private sanitizeHeaders;
    private sanitizeBody;
    private detectAnomalies;
    private convertToCSV;
    private convertToXML;
}
export declare const auditLogger: AuditLogger;
//# sourceMappingURL=audit-logger.d.ts.map