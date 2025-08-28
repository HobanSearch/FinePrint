import { FastifyRequest, FastifyReply } from 'fastify';
export interface DataSubject {
    id: string;
    email: string;
    phoneNumber?: string;
    consentStatus: ConsentStatus;
    consentDate: Date;
    consentSource: string;
    consentVersion: string;
    dataRetentionDate?: Date;
    lastActivityDate?: Date;
    marketingConsent: boolean;
    analyticsConsent: boolean;
    profileConsent: boolean;
    preferences: DataProcessingPreferences;
}
export interface ConsentStatus {
    necessary: boolean;
    functional: boolean;
    analytics: boolean;
    marketing: boolean;
    lastUpdated: Date;
    ipAddress: string;
    userAgent: string;
}
export interface DataProcessingPreferences {
    dataMinimization: boolean;
    anonymization: boolean;
    pseudonymization: boolean;
    encryption: boolean;
    retentionPeriod: number;
}
export interface DataMapping {
    dataType: PersonalDataType;
    location: DataLocation;
    purpose: ProcessingPurpose;
    legalBasis: LegalBasis;
    retention: RetentionPolicy;
    sharing: DataSharing[];
    security: SecurityMeasures;
}
export declare enum PersonalDataType {
    IDENTITY = "identity",
    CONTACT = "contact",
    DEMOGRAPHIC = "demographic",
    USAGE = "usage",
    PREFERENCES = "preferences",
    INTERACTION = "interaction",
    DEVICE = "device",
    LOCATION = "location",
    COOKIES = "cookies",
    BIOMETRIC = "biometric",
    HEALTH = "health",
    GENETIC = "genetic",
    PAYMENT = "payment",
    FINANCIAL = "financial"
}
export declare enum ProcessingPurpose {
    CONTRACT_PERFORMANCE = "contract_performance",
    LEGAL_OBLIGATION = "legal_obligation",
    LEGITIMATE_INTEREST = "legitimate_interest",
    CONSENT = "consent",
    VITAL_INTERESTS = "vital_interests",
    PUBLIC_TASK = "public_task"
}
export declare enum LegalBasis {
    CONSENT = "consent",
    CONTRACT = "contract",
    LEGAL_OBLIGATION = "legal_obligation",
    VITAL_INTERESTS = "vital_interests",
    PUBLIC_TASK = "public_task",
    LEGITIMATE_INTERESTS = "legitimate_interests"
}
export interface DataLocation {
    system: string;
    database: string;
    table: string;
    field: string;
    encrypted: boolean;
    backups: string[];
}
export interface RetentionPolicy {
    period: number;
    reason: string;
    deletionMethod: 'hard_delete' | 'anonymization' | 'pseudonymization';
    exceptions: string[];
}
export interface DataSharing {
    recipient: string;
    purpose: string;
    legalBasis: LegalBasis;
    country: string;
    adequacyDecision: boolean;
    safeguards: string[];
}
export interface SecurityMeasures {
    encryption: boolean;
    accessControls: string[];
    auditLogging: boolean;
    backupEncryption: boolean;
    transmission: 'tls' | 'encrypted';
}
export interface PrivacyRequest {
    id: string;
    type: PrivacyRequestType;
    dataSubjectId: string;
    email: string;
    status: PrivacyRequestStatus;
    requestDate: Date;
    completionDate?: Date;
    verificationMethod: 'email' | 'identity_check' | 'account_login';
    verificationCompleted: boolean;
    estimatedCompletion: Date;
    data?: any;
    reason?: string;
    additionalInfo?: string;
}
export declare enum PrivacyRequestType {
    ACCESS = "access",
    RECTIFICATION = "rectification",
    ERASURE = "erasure",
    RESTRICT = "restrict",
    PORTABILITY = "portability",
    OBJECT = "object",
    WITHDRAW_CONSENT = "withdraw_consent"
}
export declare enum PrivacyRequestStatus {
    RECEIVED = "received",
    VERIFICATION_PENDING = "verification_pending",
    VERIFIED = "verified",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    REJECTED = "rejected",
    EXTENDED = "extended"
}
export interface DataBreachIncident {
    id: string;
    incidentDate: Date;
    discoveryDate: Date;
    reportDate?: Date;
    type: BreachType;
    scope: BreachScope;
    affectedRecords: number;
    dataTypes: PersonalDataType[];
    cause: string;
    impact: BreachImpact;
    containmentMeasures: string[];
    notificationRequired: boolean;
    supervisoryAuthorityNotified: boolean;
    dataSubjectsNotified: boolean;
    status: BreachStatus;
}
export declare enum BreachType {
    CONFIDENTIALITY = "confidentiality",
    INTEGRITY = "integrity",
    AVAILABILITY = "availability"
}
export declare enum BreachScope {
    INTERNAL = "internal",
    EXTERNAL = "external",
    BOTH = "both"
}
export declare enum BreachImpact {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high"
}
export declare enum BreachStatus {
    DETECTED = "detected",
    CONTAINED = "contained",
    INVESTIGATED = "investigated",
    RESOLVED = "resolved"
}
export declare class GDPRCompliance {
    private dataMapping;
    private consentRecords;
    private privacyRequests;
    private breachIncidents;
    constructor();
    consentMiddleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    recordConsent(userId: string, email: string, consent: ConsentStatus, request: FastifyRequest): Promise<void>;
    handlePrivacyRequest(type: PrivacyRequestType, email: string, request: FastifyRequest, additionalInfo?: string): Promise<string>;
    processPrivacyRequest(requestId: string): Promise<void>;
    exportUserData(userId: string): Promise<any>;
    deleteUserData(userId: string, reason?: string): Promise<void>;
    exportPortableData(userId: string): Promise<any>;
    reportDataBreach(type: BreachType, scope: BreachScope, affectedRecords: number, dataTypes: PersonalDataType[], cause: string, impact: BreachImpact): Promise<string>;
    generateDPIA(processingActivity: string, dataTypes: PersonalDataType[], purposes: ProcessingPurpose[], recipients: string[]): Promise<any>;
    private getConsentStatus;
    private isConsentExpired;
    private extractUserId;
    private getProcessingPurpose;
    private getLegalBasis;
    private getDataTypes;
    private initializeDataMapping;
    private startAutomatedTasks;
    private findUserByEmail;
    private sendVerificationEmail;
    private extractDataFromLocation;
    private decryptUserData;
    private canDeleteData;
    private deleteDataFromLocation;
    private anonymizeDataAtLocation;
    private sendCompletionNotification;
    private requiresNotification;
    private notifySupervisoryAuthority;
    private assessRiskLikelihood;
    private assessRiskSeverity;
    private generateMitigationMeasures;
    private rectifyUserData;
    private restrictProcessing;
    private objectToProcessing;
    private withdrawConsent;
    private enforceRetentionPolicies;
    private checkConsentRenewal;
    private generateComplianceReport;
}
export declare const gdprCompliance: GDPRCompliance;
//# sourceMappingURL=gdpr-compliance.d.ts.map