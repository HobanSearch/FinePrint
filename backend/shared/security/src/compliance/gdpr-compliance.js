"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gdprCompliance = exports.GDPRCompliance = exports.BreachStatus = exports.BreachImpact = exports.BreachScope = exports.BreachType = exports.PrivacyRequestStatus = exports.PrivacyRequestType = exports.LegalBasis = exports.ProcessingPurpose = exports.PersonalDataType = void 0;
const audit_logger_1 = require("../audit/audit-logger");
const index_1 = require("../index");
var PersonalDataType;
(function (PersonalDataType) {
    PersonalDataType["IDENTITY"] = "identity";
    PersonalDataType["CONTACT"] = "contact";
    PersonalDataType["DEMOGRAPHIC"] = "demographic";
    PersonalDataType["USAGE"] = "usage";
    PersonalDataType["PREFERENCES"] = "preferences";
    PersonalDataType["INTERACTION"] = "interaction";
    PersonalDataType["DEVICE"] = "device";
    PersonalDataType["LOCATION"] = "location";
    PersonalDataType["COOKIES"] = "cookies";
    PersonalDataType["BIOMETRIC"] = "biometric";
    PersonalDataType["HEALTH"] = "health";
    PersonalDataType["GENETIC"] = "genetic";
    PersonalDataType["PAYMENT"] = "payment";
    PersonalDataType["FINANCIAL"] = "financial";
})(PersonalDataType || (exports.PersonalDataType = PersonalDataType = {}));
var ProcessingPurpose;
(function (ProcessingPurpose) {
    ProcessingPurpose["CONTRACT_PERFORMANCE"] = "contract_performance";
    ProcessingPurpose["LEGAL_OBLIGATION"] = "legal_obligation";
    ProcessingPurpose["LEGITIMATE_INTEREST"] = "legitimate_interest";
    ProcessingPurpose["CONSENT"] = "consent";
    ProcessingPurpose["VITAL_INTERESTS"] = "vital_interests";
    ProcessingPurpose["PUBLIC_TASK"] = "public_task";
})(ProcessingPurpose || (exports.ProcessingPurpose = ProcessingPurpose = {}));
var LegalBasis;
(function (LegalBasis) {
    LegalBasis["CONSENT"] = "consent";
    LegalBasis["CONTRACT"] = "contract";
    LegalBasis["LEGAL_OBLIGATION"] = "legal_obligation";
    LegalBasis["VITAL_INTERESTS"] = "vital_interests";
    LegalBasis["PUBLIC_TASK"] = "public_task";
    LegalBasis["LEGITIMATE_INTERESTS"] = "legitimate_interests";
})(LegalBasis || (exports.LegalBasis = LegalBasis = {}));
var PrivacyRequestType;
(function (PrivacyRequestType) {
    PrivacyRequestType["ACCESS"] = "access";
    PrivacyRequestType["RECTIFICATION"] = "rectification";
    PrivacyRequestType["ERASURE"] = "erasure";
    PrivacyRequestType["RESTRICT"] = "restrict";
    PrivacyRequestType["PORTABILITY"] = "portability";
    PrivacyRequestType["OBJECT"] = "object";
    PrivacyRequestType["WITHDRAW_CONSENT"] = "withdraw_consent";
})(PrivacyRequestType || (exports.PrivacyRequestType = PrivacyRequestType = {}));
var PrivacyRequestStatus;
(function (PrivacyRequestStatus) {
    PrivacyRequestStatus["RECEIVED"] = "received";
    PrivacyRequestStatus["VERIFICATION_PENDING"] = "verification_pending";
    PrivacyRequestStatus["VERIFIED"] = "verified";
    PrivacyRequestStatus["IN_PROGRESS"] = "in_progress";
    PrivacyRequestStatus["COMPLETED"] = "completed";
    PrivacyRequestStatus["REJECTED"] = "rejected";
    PrivacyRequestStatus["EXTENDED"] = "extended";
})(PrivacyRequestStatus || (exports.PrivacyRequestStatus = PrivacyRequestStatus = {}));
var BreachType;
(function (BreachType) {
    BreachType["CONFIDENTIALITY"] = "confidentiality";
    BreachType["INTEGRITY"] = "integrity";
    BreachType["AVAILABILITY"] = "availability";
})(BreachType || (exports.BreachType = BreachType = {}));
var BreachScope;
(function (BreachScope) {
    BreachScope["INTERNAL"] = "internal";
    BreachScope["EXTERNAL"] = "external";
    BreachScope["BOTH"] = "both";
})(BreachScope || (exports.BreachScope = BreachScope = {}));
var BreachImpact;
(function (BreachImpact) {
    BreachImpact["LOW"] = "low";
    BreachImpact["MEDIUM"] = "medium";
    BreachImpact["HIGH"] = "high";
})(BreachImpact || (exports.BreachImpact = BreachImpact = {}));
var BreachStatus;
(function (BreachStatus) {
    BreachStatus["DETECTED"] = "detected";
    BreachStatus["CONTAINED"] = "contained";
    BreachStatus["INVESTIGATED"] = "investigated";
    BreachStatus["RESOLVED"] = "resolved";
})(BreachStatus || (exports.BreachStatus = BreachStatus = {}));
class GDPRCompliance {
    dataMapping = new Map();
    consentRecords = new Map();
    privacyRequests = new Map();
    breachIncidents = new Map();
    constructor() {
        this.initializeDataMapping();
        this.startAutomatedTasks();
    }
    consentMiddleware() {
        return async (request, reply) => {
            if (request.url.startsWith('/api/system') || request.url.startsWith('/health')) {
                return;
            }
            const userId = this.extractUserId(request);
            if (!userId)
                return;
            const consent = await this.getConsentStatus(userId);
            if (!consent) {
                if (request.method === 'POST' && !request.url.includes('/consent')) {
                    reply.status(451).send({
                        error: 'CONSENT_REQUIRED',
                        message: 'User consent required before processing',
                        consentUrl: '/api/privacy/consent'
                    });
                    return;
                }
            }
            if (consent && this.isConsentExpired(consent)) {
                reply.status(451).send({
                    error: 'CONSENT_EXPIRED',
                    message: 'User consent has expired and needs renewal',
                    consentUrl: '/api/privacy/consent/renew'
                });
                return;
            }
            await audit_logger_1.auditLogger.logEvent({
                action: 'data_processing',
                resource: 'personal_data',
                resourceId: userId,
                userId,
                sourceIP: index_1.SecurityUtils.extractClientIP(request),
                details: {
                    purpose: this.getProcessingPurpose(request),
                    legalBasis: this.getLegalBasis(request),
                    dataTypes: this.getDataTypes(request)
                }
            });
        };
    }
    async recordConsent(userId, email, consent, request) {
        const dataSubject = {
            id: userId,
            email,
            consentStatus: consent,
            consentDate: new Date(),
            consentSource: 'web_form',
            consentVersion: '1.0',
            marketingConsent: consent.marketing,
            analyticsConsent: consent.analytics,
            profileConsent: consent.functional,
            preferences: {
                dataMinimization: true,
                anonymization: false,
                pseudonymization: true,
                encryption: true,
                retentionPeriod: 365
            }
        };
        this.consentRecords.set(userId, dataSubject);
        await audit_logger_1.auditLogger.logPrivacy('consent_update', userId, request, {
            consentTypes: Object.keys(consent).filter(key => consent[key]),
            consentVersion: dataSubject.consentVersion,
            source: dataSubject.consentSource
        });
    }
    async handlePrivacyRequest(type, email, request, additionalInfo) {
        const requestId = index_1.SecurityUtils.generateUUID();
        const userId = await this.findUserByEmail(email);
        const privacyRequest = {
            id: requestId,
            type,
            dataSubjectId: userId || '',
            email,
            status: PrivacyRequestStatus.RECEIVED,
            requestDate: new Date(),
            verificationMethod: userId ? 'account_login' : 'email',
            verificationCompleted: !!userId,
            estimatedCompletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            additionalInfo
        };
        this.privacyRequests.set(requestId, privacyRequest);
        if (!userId) {
            await this.sendVerificationEmail(email, requestId);
        }
        if (privacyRequest.verificationCompleted) {
            await this.processPrivacyRequest(requestId);
        }
        await audit_logger_1.auditLogger.logPrivacy(type, userId || '', request, { requestId, email, type });
        return requestId;
    }
    async processPrivacyRequest(requestId) {
        const request = this.privacyRequests.get(requestId);
        if (!request || !request.verificationCompleted) {
            throw new Error('Request not found or not verified');
        }
        request.status = PrivacyRequestStatus.IN_PROGRESS;
        try {
            switch (request.type) {
                case PrivacyRequestType.ACCESS:
                    request.data = await this.exportUserData(request.dataSubjectId);
                    break;
                case PrivacyRequestType.RECTIFICATION:
                    await this.rectifyUserData(request.dataSubjectId, request.additionalInfo);
                    break;
                case PrivacyRequestType.ERASURE:
                    await this.deleteUserData(request.dataSubjectId, request.reason);
                    break;
                case PrivacyRequestType.RESTRICT:
                    await this.restrictProcessing(request.dataSubjectId);
                    break;
                case PrivacyRequestType.PORTABILITY:
                    request.data = await this.exportPortableData(request.dataSubjectId);
                    break;
                case PrivacyRequestType.OBJECT:
                    await this.objectToProcessing(request.dataSubjectId, request.reason);
                    break;
                case PrivacyRequestType.WITHDRAW_CONSENT:
                    await this.withdrawConsent(request.dataSubjectId);
                    break;
            }
            request.status = PrivacyRequestStatus.COMPLETED;
            request.completionDate = new Date();
            await this.sendCompletionNotification(request);
        }
        catch (error) {
            request.status = PrivacyRequestStatus.REJECTED;
            console.error('Privacy request processing failed:', error);
        }
    }
    async exportUserData(userId) {
        const userData = {
            userId,
            exportDate: new Date().toISOString(),
            dataCategories: {}
        };
        for (const [dataType, mapping] of this.dataMapping) {
            try {
                const data = await this.extractDataFromLocation(userId, mapping.location);
                if (data) {
                    if (mapping.location.encrypted) {
                        userData.dataCategories[dataType] = await this.decryptUserData(data);
                    }
                    else {
                        userData.dataCategories[dataType] = data;
                    }
                }
            }
            catch (error) {
                console.error(`Failed to export ${dataType} for user ${userId}:`, error);
            }
        }
        const consent = this.consentRecords.get(userId);
        if (consent) {
            userData.consentRecord = consent;
        }
        const requests = Array.from(this.privacyRequests.values())
            .filter(req => req.dataSubjectId === userId);
        userData.privacyRequests = requests;
        return userData;
    }
    async deleteUserData(userId, reason) {
        const deletionLog = [];
        for (const [dataType, mapping] of this.dataMapping) {
            try {
                if (this.canDeleteData(mapping, reason)) {
                    await this.deleteDataFromLocation(userId, mapping.location);
                    deletionLog.push({
                        dataType,
                        location: mapping.location,
                        method: mapping.retention.deletionMethod,
                        timestamp: new Date()
                    });
                }
                else {
                    await this.anonymizeDataAtLocation(userId, mapping.location);
                    deletionLog.push({
                        dataType,
                        location: mapping.location,
                        method: 'anonymization',
                        timestamp: new Date()
                    });
                }
            }
            catch (error) {
                console.error(`Failed to delete ${dataType} for user ${userId}:`, error);
            }
        }
        this.consentRecords.delete(userId);
        await audit_logger_1.auditLogger.logEvent({
            action: 'data_deletion',
            resource: 'personal_data',
            resourceId: userId,
            userId,
            details: {
                reason,
                deletionLog,
                deletionDate: new Date()
            }
        });
    }
    async exportPortableData(userId) {
        const portableData = {
            userId,
            exportDate: new Date().toISOString(),
            format: 'JSON',
            data: {}
        };
        const portableDataTypes = [
            PersonalDataType.IDENTITY,
            PersonalDataType.CONTACT,
            PersonalDataType.PREFERENCES,
            PersonalDataType.USAGE
        ];
        for (const dataType of portableDataTypes) {
            const mapping = this.dataMapping.get(dataType);
            if (mapping && mapping.legalBasis === LegalBasis.CONSENT) {
                try {
                    const data = await this.extractDataFromLocation(userId, mapping.location);
                    if (data) {
                        portableData.data[dataType] = data;
                    }
                }
                catch (error) {
                    console.error(`Failed to export portable ${dataType}:`, error);
                }
            }
        }
        return portableData;
    }
    async reportDataBreach(type, scope, affectedRecords, dataTypes, cause, impact) {
        const breachId = index_1.SecurityUtils.generateUUID();
        const now = new Date();
        const breach = {
            id: breachId,
            incidentDate: now,
            discoveryDate: now,
            type,
            scope,
            affectedRecords,
            dataTypes,
            cause,
            impact,
            containmentMeasures: [],
            notificationRequired: this.requiresNotification(impact, affectedRecords),
            supervisoryAuthorityNotified: false,
            dataSubjectsNotified: false,
            status: BreachStatus.DETECTED
        };
        this.breachIncidents.set(breachId, breach);
        if (breach.notificationRequired) {
            setTimeout(() => {
                this.notifySupervisoryAuthority(breachId);
            }, 72 * 60 * 60 * 1000);
        }
        await audit_logger_1.auditLogger.logSecurity('data_breach_detected', undefined, {}, {
            breachId,
            type,
            scope,
            affectedRecords,
            dataTypes,
            impact
        });
        return breachId;
    }
    async generateDPIA(processingActivity, dataTypes, purposes, recipients) {
        const dpia = {
            id: index_1.SecurityUtils.generateUUID(),
            activity: processingActivity,
            date: new Date(),
            dataTypes,
            purposes,
            recipients,
            riskAssessment: {
                likelihood: this.assessRiskLikelihood(dataTypes, purposes),
                severity: this.assessRiskSeverity(dataTypes),
                overallRisk: 'medium'
            },
            mitigationMeasures: this.generateMitigationMeasures(dataTypes, purposes),
            residualRisk: 'low',
            recommendation: 'PROCEED_WITH_MEASURES',
            reviewer: 'system',
            reviewDate: new Date()
        };
        return dpia;
    }
    async getConsentStatus(userId) {
        return this.consentRecords.get(userId) || null;
    }
    isConsentExpired(consent) {
        const consentAge = Date.now() - consent.consentDate.getTime();
        const maxAge = 365 * 24 * 60 * 60 * 1000;
        return consentAge > maxAge;
    }
    extractUserId(request) {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.sub;
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }
    getProcessingPurpose(request) {
        if (request.url.includes('/analytics'))
            return ProcessingPurpose.LEGITIMATE_INTEREST;
        if (request.url.includes('/marketing'))
            return ProcessingPurpose.CONSENT;
        if (request.url.includes('/billing'))
            return ProcessingPurpose.CONTRACT_PERFORMANCE;
        return ProcessingPurpose.LEGITIMATE_INTEREST;
    }
    getLegalBasis(request) {
        if (request.url.includes('/consent'))
            return LegalBasis.CONSENT;
        if (request.url.includes('/contract'))
            return LegalBasis.CONTRACT;
        if (request.url.includes('/legal'))
            return LegalBasis.LEGAL_OBLIGATION;
        return LegalBasis.LEGITIMATE_INTERESTS;
    }
    getDataTypes(request) {
        const dataTypes = [];
        if (request.url.includes('/user') || request.url.includes('/profile')) {
            dataTypes.push(PersonalDataType.IDENTITY, PersonalDataType.CONTACT);
        }
        if (request.url.includes('/analytics')) {
            dataTypes.push(PersonalDataType.USAGE, PersonalDataType.DEVICE);
        }
        if (request.url.includes('/location')) {
            dataTypes.push(PersonalDataType.LOCATION);
        }
        return dataTypes;
    }
    initializeDataMapping() {
        this.dataMapping.set('user_identity', {
            dataType: PersonalDataType.IDENTITY,
            location: {
                system: 'main_db',
                database: 'fineprintai',
                table: 'users',
                field: 'email,display_name',
                encrypted: false,
                backups: ['daily_backup', 'weekly_backup']
            },
            purpose: ProcessingPurpose.CONTRACT_PERFORMANCE,
            legalBasis: LegalBasis.CONTRACT,
            retention: {
                period: 2555,
                reason: 'Legal obligation and business records',
                deletionMethod: 'hard_delete',
                exceptions: ['ongoing_contract', 'legal_dispute']
            },
            sharing: [],
            security: {
                encryption: false,
                accessControls: ['authentication_required', 'authorization_check'],
                auditLogging: true,
                backupEncryption: true,
                transmission: 'tls'
            }
        });
        this.dataMapping.set('usage_analytics', {
            dataType: PersonalDataType.USAGE,
            location: {
                system: 'analytics_db',
                database: 'analytics',
                table: 'user_events',
                field: 'user_id,event_type,timestamp',
                encrypted: true,
                backups: ['analytics_backup']
            },
            purpose: ProcessingPurpose.LEGITIMATE_INTEREST,
            legalBasis: LegalBasis.LEGITIMATE_INTERESTS,
            retention: {
                period: 365,
                reason: 'Service improvement and analytics',
                deletionMethod: 'anonymization',
                exceptions: []
            },
            sharing: [],
            security: {
                encryption: true,
                accessControls: ['role_based_access'],
                auditLogging: true,
                backupEncryption: true,
                transmission: 'encrypted'
            }
        });
    }
    startAutomatedTasks() {
        setInterval(async () => {
            await this.enforceRetentionPolicies();
        }, 24 * 60 * 60 * 1000);
        setInterval(async () => {
            await this.checkConsentRenewal();
        }, 7 * 24 * 60 * 60 * 1000);
        setInterval(async () => {
            await this.generateComplianceReport();
        }, 30 * 24 * 60 * 60 * 1000);
    }
    async findUserByEmail(email) {
        for (const [userId, subject] of this.consentRecords) {
            if (subject.email === email) {
                return userId;
            }
        }
        return null;
    }
    async sendVerificationEmail(email, requestId) {
        console.log(`Sending verification email to ${email} for request ${requestId}`);
    }
    async extractDataFromLocation(userId, location) {
        return {};
    }
    async decryptUserData(data) {
        return data;
    }
    canDeleteData(mapping, reason) {
        return true;
    }
    async deleteDataFromLocation(userId, location) {
    }
    async anonymizeDataAtLocation(userId, location) {
    }
    async sendCompletionNotification(request) {
    }
    requiresNotification(impact, affectedRecords) {
        return impact !== BreachImpact.LOW || affectedRecords > 100;
    }
    async notifySupervisoryAuthority(breachId) {
    }
    assessRiskLikelihood(dataTypes, purposes) {
        return 'medium';
    }
    assessRiskSeverity(dataTypes) {
        return 'medium';
    }
    generateMitigationMeasures(dataTypes, purposes) {
        return ['encryption', 'access_controls', 'audit_logging'];
    }
    async rectifyUserData(userId, corrections) {
    }
    async restrictProcessing(userId) {
    }
    async objectToProcessing(userId, reason) {
    }
    async withdrawConsent(userId) {
    }
    async enforceRetentionPolicies() {
    }
    async checkConsentRenewal() {
    }
    async generateComplianceReport() {
    }
}
exports.GDPRCompliance = GDPRCompliance;
exports.gdprCompliance = new GDPRCompliance();
//# sourceMappingURL=gdpr-compliance.js.map