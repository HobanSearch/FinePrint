"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUnifiedCompliance = exports.UnifiedComplianceService = void 0;
const crypto = __importStar(require("crypto"));
class UnifiedComplianceService {
    redis;
    prisma;
    encryptionService;
    config;
    auditQueue = [];
    constructor(redis, prisma, encryptionService, config) {
        this.redis = redis;
        this.prisma = prisma;
        this.encryptionService = encryptionService;
        this.config = config;
        this.startAuditProcessor();
    }
    async recordConsent(userId, consentData) {
        try {
            const consentRecord = {
                id: crypto.randomUUID(),
                userId,
                ...consentData,
                timestamp: new Date(),
                expiresAt: this.calculateConsentExpiration(consentData.consentType),
                metadata: {
                    ...consentData.metadata,
                    cryptographicProof: this.generateConsentProof(userId, consentData)
                }
            };
            await this.storeConsentRecord(consentRecord);
            await this.logAuditEvent({
                action: 'consent_recorded',
                resource: `consent:${consentRecord.id}`,
                userId,
                platform: consentData.platform,
                ipAddress: consentData.ipAddress,
                userAgent: consentData.userAgent,
                result: 'success',
                riskLevel: 'low',
                complianceFrameworks: this.getApplicableFrameworks(),
                metadata: { consentType: consentData.consentType, status: consentData.status }
            });
            return consentRecord;
        }
        catch (error) {
            throw new Error(`Consent recording failed: ${error.message}`);
        }
    }
    async withdrawConsent(userId, consentId, platform, ipAddress, userAgent) {
        try {
            const consentRecord = await this.getConsentRecord(consentId);
            if (!consentRecord || consentRecord.userId !== userId) {
                throw new Error('Consent record not found or unauthorized');
            }
            consentRecord.status = 'withdrawn';
            consentRecord.withdrawnAt = new Date();
            await this.storeConsentRecord(consentRecord);
            if (this.config.gdpr.rightToErasure) {
                await this.triggerDataCleanup(userId, consentRecord.consentType);
            }
            await this.logAuditEvent({
                action: 'consent_withdrawn',
                resource: `consent:${consentId}`,
                userId,
                platform,
                ipAddress,
                userAgent,
                result: 'success',
                riskLevel: 'medium',
                complianceFrameworks: ['GDPR', 'CCPA'],
                metadata: { consentType: consentRecord.consentType }
            });
        }
        catch (error) {
            throw new Error(`Consent withdrawal failed: ${error.message}`);
        }
    }
    async processDataSubjectRequest(request) {
        try {
            const dsrRequest = {
                id: crypto.randomUUID(),
                submittedAt: new Date(),
                auditTrail: [],
                ...request
            };
            await this.storeDataSubjectRequest(dsrRequest);
            switch (request.requestType) {
                case 'access':
                    await this.processAccessRequest(dsrRequest);
                    break;
                case 'rectification':
                    await this.processRectificationRequest(dsrRequest);
                    break;
                case 'erasure':
                    await this.processErasureRequest(dsrRequest);
                    break;
                case 'portability':
                    await this.processPortabilityRequest(dsrRequest);
                    break;
                case 'restriction':
                    await this.processRestrictionRequest(dsrRequest);
                    break;
                case 'objection':
                    await this.processObjectionRequest(dsrRequest);
                    break;
            }
            await this.logAuditEvent({
                action: 'dsr_submitted',
                resource: `dsr:${dsrRequest.id}`,
                userId: request.userId,
                platform: 'web',
                ipAddress: '',
                userAgent: '',
                result: 'success',
                riskLevel: 'medium',
                complianceFrameworks: ['GDPR', 'CCPA'],
                metadata: { requestType: request.requestType }
            });
            return dsrRequest;
        }
        catch (error) {
            throw new Error(`Data subject request processing failed: ${error.message}`);
        }
    }
    async generateComplianceReport(reportType, period, generatedBy) {
        try {
            const reportId = crypto.randomUUID();
            const metrics = await this.gatherComplianceMetrics(period);
            const findings = await this.identifyComplianceFindings(reportType, period);
            const recommendations = await this.generateRecommendations(findings);
            const report = {
                id: reportId,
                reportType,
                period,
                metrics,
                findings,
                recommendations,
                generatedAt: new Date(),
                generatedBy
            };
            await this.storeComplianceReport(report);
            await this.logAuditEvent({
                action: 'compliance_report_generated',
                resource: `report:${reportId}`,
                platform: 'web',
                ipAddress: '',
                userAgent: '',
                result: 'success',
                riskLevel: 'low',
                complianceFrameworks: [reportType.toUpperCase()],
                metadata: { reportType, period }
            });
            return report;
        }
        catch (error) {
            throw new Error(`Compliance report generation failed: ${error.message}`);
        }
    }
    async monitorCompliance() {
        try {
            const currentDate = new Date();
            const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
            const issues = [];
            let overallScore = 100;
            if (this.config.gdpr.enabled) {
                const gdprIssues = await this.checkGDPRCompliance(thirtyDaysAgo, currentDate);
                issues.push(...gdprIssues);
                overallScore -= gdprIssues.length * 5;
            }
            if (this.config.hipaa.enabled) {
                const hipaaIssues = await this.checkHIPAACompliance(thirtyDaysAgo, currentDate);
                issues.push(...hipaaIssues);
                overallScore -= hipaaIssues.length * 10;
            }
            if (this.config.sox.enabled) {
                const soxIssues = await this.checkSOXCompliance(thirtyDaysAgo, currentDate);
                issues.push(...soxIssues);
                overallScore -= soxIssues.length * 8;
            }
            let status;
            if (overallScore >= 95) {
                status = 'compliant';
            }
            else if (overallScore >= 80) {
                status = 'warning';
            }
            else {
                status = 'non_compliant';
            }
            const recommendations = await this.generateRecommendations(issues);
            return {
                status,
                score: Math.max(overallScore, 0),
                issues,
                recommendations
            };
        }
        catch (error) {
            throw new Error(`Compliance monitoring failed: ${error.message}`);
        }
    }
    async enforceDataRetention() {
        try {
            const currentDate = new Date();
            let deletedRecords = 0;
            let anonymizedRecords = 0;
            const errors = [];
            if (this.config.gdpr.enabled) {
                const retentionDate = new Date(currentDate.getTime() - this.config.gdpr.dataRetentionDays * 24 * 60 * 60 * 1000);
                try {
                    const expiredRecords = await this.findExpiredDataRecords(retentionDate);
                    for (const record of expiredRecords) {
                        const hasValidConsent = await this.hasValidConsent(record.userId, record.category);
                        if (hasValidConsent) {
                            await this.anonymizeDataRecord(record);
                            anonymizedRecords++;
                        }
                        else {
                            await this.deleteDataRecord(record);
                            deletedRecords++;
                        }
                    }
                }
                catch (error) {
                    errors.push(`GDPR retention enforcement failed: ${error.message}`);
                }
            }
            await this.logAuditEvent({
                action: 'data_retention_enforced',
                resource: 'system',
                platform: 'web',
                ipAddress: '',
                userAgent: '',
                result: errors.length === 0 ? 'success' : 'error',
                riskLevel: 'medium',
                complianceFrameworks: this.getApplicableFrameworks(),
                metadata: { deletedRecords, anonymizedRecords, errors }
            });
            return { deletedRecords, anonymizedRecords, errors };
        }
        catch (error) {
            throw new Error(`Data retention enforcement failed: ${error.message}`);
        }
    }
    async validateDataTransfer(userId, sourceCountry, destinationCountry, dataCategory, transferMechanism) {
        try {
            const requirements = [];
            const additionalSafeguards = [];
            let approved = false;
            if (this.config.gdpr.enabled) {
                const gdprValidation = await this.validateGDPRTransfer(sourceCountry, destinationCountry, dataCategory, transferMechanism);
                approved = gdprValidation.approved;
                requirements.push(...gdprValidation.requirements);
                additionalSafeguards.push(...gdprValidation.safeguards);
            }
            await this.logAuditEvent({
                action: 'data_transfer_validated',
                resource: `transfer:${userId}:${destinationCountry}`,
                userId,
                platform: 'web',
                ipAddress: '',
                userAgent: '',
                result: approved ? 'success' : 'failure',
                riskLevel: approved ? 'low' : 'high',
                complianceFrameworks: ['GDPR'],
                metadata: {
                    sourceCountry,
                    destinationCountry,
                    dataCategory,
                    transferMechanism,
                    approved
                }
            });
            return { approved, requirements, additionalSafeguards };
        }
        catch (error) {
            throw new Error(`Data transfer validation failed: ${error.message}`);
        }
    }
    async logAuditEvent(event) {
        const auditEvent = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            ...event
        };
        this.auditQueue.push(auditEvent);
        if (event.riskLevel === 'critical' || event.result === 'error') {
            await this.storeAuditEvent(auditEvent);
        }
    }
    startAuditProcessor() {
        setInterval(async () => {
            if (this.auditQueue.length > 0) {
                const events = this.auditQueue.splice(0);
                try {
                    await this.batchStoreAuditEvents(events);
                }
                catch (error) {
                    console.error('Audit event storage failed:', error);
                    this.auditQueue.unshift(...events);
                }
            }
        }, 30000);
    }
    generateConsentProof(userId, consentData) {
        const data = `${userId}:${consentData.consentType}:${consentData.status}:${Date.now()}`;
        return crypto.createHmac('sha256', process.env.CONSENT_PROOF_SECRET || 'default-secret')
            .update(data)
            .digest('hex');
    }
    calculateConsentExpiration(consentType) {
        const currentDate = new Date();
        switch (consentType) {
            case 'marketing':
                return new Date(currentDate.getTime() + 365 * 24 * 60 * 60 * 1000);
            case 'analytics':
                return new Date(currentDate.getTime() + 730 * 24 * 60 * 60 * 1000);
            default:
                return undefined;
        }
    }
    getApplicableFrameworks() {
        const frameworks = [];
        if (this.config.gdpr.enabled)
            frameworks.push('GDPR');
        if (this.config.ccpa.enabled)
            frameworks.push('CCPA');
        if (this.config.hipaa.enabled)
            frameworks.push('HIPAA');
        if (this.config.sox.enabled)
            frameworks.push('SOX');
        if (this.config.fedramp.enabled)
            frameworks.push('FedRAMP');
        return frameworks;
    }
    async storeConsentRecord(record) {
        const encrypted = await this.encryptionService.encryptData(JSON.stringify(record), {
            platform: 'web',
            sensitivity: 'high'
        });
        await this.redis.setex(`consent:${record.id}`, 86400 * 365, JSON.stringify(encrypted));
    }
    async getConsentRecord(consentId) {
        const encrypted = await this.redis.get(`consent:${consentId}`);
        if (!encrypted)
            return null;
        const decrypted = await this.encryptionService.decryptData(JSON.parse(encrypted), {
            platform: 'web'
        });
        return JSON.parse(decrypted.toString());
    }
    async storeDataSubjectRequest(request) {
        await this.redis.setex(`dsr:${request.id}`, 86400 * 30, JSON.stringify(request));
    }
    async storeComplianceReport(report) {
        const encrypted = await this.encryptionService.encryptData(JSON.stringify(report), {
            platform: 'web',
            sensitivity: 'high'
        });
        await this.redis.setex(`report:${report.id}`, 86400 * 365, JSON.stringify(encrypted));
    }
    async storeAuditEvent(event) {
        await this.redis.lpush('audit_events', JSON.stringify(event));
    }
    async batchStoreAuditEvents(events) {
        const pipeline = this.redis.pipeline();
        events.forEach(event => {
            pipeline.lpush('audit_events', JSON.stringify(event));
        });
        await pipeline.exec();
    }
    async triggerDataCleanup(userId, consentType) { }
    async processAccessRequest(request) { }
    async processRectificationRequest(request) { }
    async processErasureRequest(request) { }
    async processPortabilityRequest(request) { }
    async processRestrictionRequest(request) { }
    async processObjectionRequest(request) { }
    async gatherComplianceMetrics(period) { return {}; }
    async identifyComplianceFindings(type, period) { return []; }
    async generateRecommendations(findings) { return []; }
    async checkGDPRCompliance(start, end) { return []; }
    async checkHIPAACompliance(start, end) { return []; }
    async checkSOXCompliance(start, end) { return []; }
    async findExpiredDataRecords(date) { return []; }
    async hasValidConsent(userId, category) { return false; }
    async anonymizeDataRecord(record) { }
    async deleteDataRecord(record) { }
    async validateGDPRTransfer(source, dest, category, mechanism) {
        return { approved: false, requirements: [], safeguards: [] };
    }
}
exports.UnifiedComplianceService = UnifiedComplianceService;
const createUnifiedCompliance = (redis, prisma, encryptionService, config) => {
    return new UnifiedComplianceService(redis, prisma, encryptionService, config);
};
exports.createUnifiedCompliance = createUnifiedCompliance;
//# sourceMappingURL=unified-compliance.js.map