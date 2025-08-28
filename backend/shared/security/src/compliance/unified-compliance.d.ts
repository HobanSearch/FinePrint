import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { AdvancedEncryptionService } from '../encryption/advanced-encryption';
export interface ComplianceConfig {
    gdpr: {
        enabled: boolean;
        dataRetentionDays: number;
        consentRequired: boolean;
        rightToErasure: boolean;
        dataPortability: boolean;
        privacyByDesign: boolean;
    };
    ccpa: {
        enabled: boolean;
        saleOptOut: boolean;
        dataDisclosure: boolean;
        consumerRights: boolean;
    };
    hipaa: {
        enabled: boolean;
        baaRequired: boolean;
        auditLogging: boolean;
        accessControls: boolean;
        encryptionRequired: boolean;
    };
    sox: {
        enabled: boolean;
        auditTrails: boolean;
        changeControls: boolean;
        accessReviews: boolean;
    };
    fedramp: {
        enabled: boolean;
        securityLevel: 'low' | 'moderate' | 'high';
        continuousMonitoring: boolean;
        incidentResponse: boolean;
    };
}
export interface ConsentRecord {
    id: string;
    userId: string;
    consentType: 'data_processing' | 'marketing' | 'analytics' | 'third_party_sharing';
    status: 'granted' | 'denied' | 'withdrawn';
    version: string;
    platform: 'web' | 'mobile' | 'extension';
    ipAddress: string;
    userAgent: string;
    timestamp: Date;
    expiresAt?: Date;
    withdrawnAt?: Date;
    metadata: Record<string, any>;
}
export interface DataProcessingRecord {
    id: string;
    userId: string;
    dataCategory: 'personal' | 'sensitive' | 'financial' | 'health' | 'biometric';
    processingPurpose: string;
    legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
    dataTypes: string[];
    thirdParties: string[];
    retentionPeriod: number;
    crossBorderTransfer: boolean;
    encryptionApplied: boolean;
    timestamp: Date;
    platform: 'web' | 'mobile' | 'extension';
}
export interface DataSubjectRequest {
    id: string;
    userId: string;
    requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
    status: 'pending' | 'processing' | 'completed' | 'rejected';
    submittedAt: Date;
    completedAt?: Date;
    verificationMethod: 'email' | 'identity_document' | 'biometric';
    requestData: Record<string, any>;
    responseData?: Record<string, any>;
    auditTrail: AuditEvent[];
}
export interface AuditEvent {
    id: string;
    timestamp: Date;
    userId?: string;
    action: string;
    resource: string;
    platform: 'web' | 'mobile' | 'extension';
    ipAddress: string;
    userAgent: string;
    result: 'success' | 'failure' | 'error';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    complianceFrameworks: string[];
    metadata: Record<string, any>;
}
export interface ComplianceReport {
    id: string;
    reportType: 'gdpr' | 'ccpa' | 'hipaa' | 'sox' | 'fedramp' | 'comprehensive';
    period: {
        startDate: Date;
        endDate: Date;
    };
    metrics: {
        totalDataProcessingEvents: number;
        consentGranted: number;
        consentWithdrawn: number;
        dataSubjectRequests: number;
        breachIncidents: number;
        auditEvents: number;
    };
    findings: ComplianceFinding[];
    recommendations: ComplianceRecommendation[];
    generatedAt: Date;
    generatedBy: string;
}
export interface ComplianceFinding {
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'data_protection' | 'consent_management' | 'access_control' | 'audit_logging' | 'encryption';
    description: string;
    regulation: string;
    impact: string;
    remediation: string;
    dueDate: Date;
}
export interface ComplianceRecommendation {
    id: string;
    priority: 'low' | 'medium' | 'high';
    category: string;
    title: string;
    description: string;
    implementation: string;
    estimatedEffort: string;
    complianceImprovement: number;
}
export declare class UnifiedComplianceService {
    private redis;
    private prisma;
    private encryptionService;
    private config;
    private auditQueue;
    constructor(redis: Redis, prisma: PrismaClient, encryptionService: AdvancedEncryptionService, config: ComplianceConfig);
    recordConsent(userId: string, consentData: {
        consentType: ConsentRecord['consentType'];
        status: 'granted' | 'denied';
        version: string;
        platform: 'web' | 'mobile' | 'extension';
        ipAddress: string;
        userAgent: string;
        metadata?: Record<string, any>;
    }): Promise<ConsentRecord>;
    withdrawConsent(userId: string, consentId: string, platform: 'web' | 'mobile' | 'extension', ipAddress: string, userAgent: string): Promise<void>;
    processDataSubjectRequest(request: Omit<DataSubjectRequest, 'id' | 'submittedAt' | 'auditTrail'>): Promise<DataSubjectRequest>;
    generateComplianceReport(reportType: ComplianceReport['reportType'], period: {
        startDate: Date;
        endDate: Date;
    }, generatedBy: string): Promise<ComplianceReport>;
    monitorCompliance(): Promise<{
        status: 'compliant' | 'warning' | 'non_compliant';
        score: number;
        issues: ComplianceFinding[];
        recommendations: ComplianceRecommendation[];
    }>;
    enforceDataRetention(): Promise<{
        deletedRecords: number;
        anonymizedRecords: number;
        errors: string[];
    }>;
    validateDataTransfer(userId: string, sourceCountry: string, destinationCountry: string, dataCategory: string, transferMechanism: 'adequacy_decision' | 'standard_contractual_clauses' | 'binding_corporate_rules' | 'consent'): Promise<{
        approved: boolean;
        requirements: string[];
        additionalSafeguards: string[];
    }>;
    private logAuditEvent;
    private startAuditProcessor;
    private generateConsentProof;
    private calculateConsentExpiration;
    private getApplicableFrameworks;
    private storeConsentRecord;
    private getConsentRecord;
    private storeDataSubjectRequest;
    private storeComplianceReport;
    private storeAuditEvent;
    private batchStoreAuditEvents;
    private triggerDataCleanup;
    private processAccessRequest;
    private processRectificationRequest;
    private processErasureRequest;
    private processPortabilityRequest;
    private processRestrictionRequest;
    private processObjectionRequest;
    private gatherComplianceMetrics;
    private identifyComplianceFindings;
    private generateRecommendations;
    private checkGDPRCompliance;
    private checkHIPAACompliance;
    private checkSOXCompliance;
    private findExpiredDataRecords;
    private hasValidConsent;
    private anonymizeDataRecord;
    private deleteDataRecord;
    private validateGDPRTransfer;
}
export declare const createUnifiedCompliance: (redis: Redis, prisma: PrismaClient, encryptionService: AdvancedEncryptionService, config: ComplianceConfig) => UnifiedComplianceService;
//# sourceMappingURL=unified-compliance.d.ts.map