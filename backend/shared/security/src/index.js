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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSecurityConfig = exports.createDefaultSecurityConfig = exports.createCrossPlatformSecurity = exports.CrossPlatformSecurityService = exports.SecurityError = void 0;
__exportStar(require("./auth/unified-auth"), exports);
__exportStar(require("./auth/mfa"), exports);
__exportStar(require("./encryption/advanced-encryption"), exports);
__exportStar(require("./compliance/unified-compliance"), exports);
__exportStar(require("./monitoring/advanced-threat-detection"), exports);
__exportStar(require("./platform/web-security"), exports);
__exportStar(require("./platform/mobile-security"), exports);
__exportStar(require("./platform/extension-security"), exports);
__exportStar(require("./middleware/enhanced-security-middleware"), exports);
__exportStar(require("./validation/zod-schemas"), exports);
__exportStar(require("./security/xss-protection"), exports);
__exportStar(require("./security/bot-detection"), exports);
__exportStar(require("./security/file-upload-security"), exports);
__exportStar(require("./monitoring/security-monitor"), exports);
__exportStar(require("./audit/audit-logger"), exports);
class SecurityError extends Error {
    code;
    statusCode;
    timestamp;
    constructor(message, code, statusCode = 403) {
        super(message);
        this.name = 'SecurityError';
        this.code = code;
        this.statusCode = statusCode;
        this.timestamp = new Date();
    }
}
exports.SecurityError = SecurityError;
class CrossPlatformSecurityService {
    config;
    redis;
    prisma;
    auth;
    encryption;
    compliance;
    monitoring;
    webSecurity;
    mobileSecurity;
    extensionSecurity;
    constructor(redis, prisma, config) {
        this.config = config;
        this.redis = redis;
        this.prisma = prisma;
        this.initializeCoreServices();
        this.initializePlatformServices();
        this.setupServiceIntegration();
    }
    initializeCoreServices() {
        this.auth = require('./auth/unified-auth').createUnifiedAuth(this.redis, this.prisma, this.config.auth);
        this.encryption = require('./encryption/advanced-encryption').createAdvancedEncryption(this.config.encryption, {
            rotationInterval: this.config.encryption.rotationInterval,
            gracePeriod: this.config.encryption.gracePeriod,
            maxKeyAge: this.config.encryption.maxKeyAge,
            autoRotate: this.config.encryption.autoRotate
        });
        this.compliance = require('./compliance/unified-compliance').createUnifiedCompliance(this.redis, this.prisma, this.encryption, this.config.compliance);
        this.monitoring = require('./monitoring/advanced-threat-detection').createAdvancedThreatDetection(this.redis, this.prisma, this.config.monitoring);
    }
    initializePlatformServices() {
        this.webSecurity = require('./platform/web-security').createWebSecurity(this.config.platforms.web);
        this.mobileSecurity = require('./platform/mobile-security').createMobileSecurity(this.config.platforms.mobile);
        this.extensionSecurity = require('./platform/extension-security').createExtensionSecurity(this.config.platforms.extension);
    }
    setupServiceIntegration() {
        this.monitoring.on('securityEvent', async (event) => {
            if (event.type === 'data_access' || event.type === 'configuration_change') {
                await this.compliance.logAuditEvent({
                    action: event.action,
                    resource: event.resource,
                    userId: event.userId,
                    platform: event.source,
                    ipAddress: event.ipAddress,
                    userAgent: event.userAgent,
                    result: event.result,
                    riskLevel: this.mapSeverityToRiskLevel(event.severity),
                    complianceFrameworks: this.getApplicableFrameworks(),
                    metadata: event.metadata
                });
            }
        });
        this.auth.on('authEvent', async (event) => {
            await this.monitoring.processSecurityEvent({
                type: 'authentication',
                severity: event.result === 'success' ? 'info' : 'warning',
                source: event.platform,
                userId: event.userId,
                ipAddress: event.ipAddress,
                userAgent: event.userAgent,
                action: event.action,
                resource: 'auth',
                result: event.result,
                metadata: event.metadata
            });
        });
        ['webSecurity', 'mobileSecurity', 'extensionSecurity'].forEach(platform => {
            if (this[platform] && this[platform].on) {
                this[platform].on('securityEvent', async (event) => {
                    await this.monitoring.processSecurityEvent({
                        ...event,
                        source: platform.replace('Security', '')
                    });
                });
            }
        });
    }
    async getSecurityStatus() {
        const [complianceStatus, threatStatus, webMetrics, authMetrics, encryptionMetrics] = await Promise.all([
            this.compliance.monitorCompliance(),
            this.monitoring.getMetrics(),
            this.webSecurity?.getMetrics?.() || {},
            this.auth.getMetrics?.() || {},
            this.encryption.getMetrics()
        ]);
        const overallScore = this.calculateOverallScore({
            compliance: complianceStatus.score,
            threats: threatStatus.riskScoreDistribution,
            platforms: { web: webMetrics }
        });
        return {
            overall: this.mapScoreToStatus(overallScore),
            score: overallScore,
            platforms: {
                web: webMetrics,
                mobile: {},
                extension: {}
            },
            compliance: complianceStatus,
            threats: threatStatus
        };
    }
    async performSecurityAssessment() {
        const assessment = {
            authentication: await this.assessAuthentication(),
            encryption: await this.assessEncryption(),
            compliance: await this.assessCompliance(),
            monitoring: await this.assessMonitoring(),
            platforms: await this.assessPlatforms()
        };
        const recommendations = this.generateRecommendations(assessment);
        const actionItems = this.generateActionItems(assessment);
        return {
            timestamp: new Date(),
            assessment,
            recommendations,
            actionItems
        };
    }
    mapSeverityToRiskLevel(severity) {
        switch (severity) {
            case 'info': return 'low';
            case 'warning': return 'medium';
            case 'high': return 'high';
            case 'critical': return 'critical';
            default: return 'medium';
        }
    }
    getApplicableFrameworks() {
        const frameworks = [];
        if (this.config.compliance.gdpr.enabled)
            frameworks.push('GDPR');
        if (this.config.compliance.ccpa.enabled)
            frameworks.push('CCPA');
        if (this.config.compliance.hipaa.enabled)
            frameworks.push('HIPAA');
        if (this.config.compliance.sox.enabled)
            frameworks.push('SOX');
        if (this.config.compliance.fedramp.enabled)
            frameworks.push('FedRAMP');
        return frameworks;
    }
    calculateOverallScore(metrics) {
        const weights = {
            compliance: 0.3,
            threats: 0.25,
            platforms: 0.25,
            auth: 0.2
        };
        let score = 0;
        score += metrics.compliance * weights.compliance;
        return Math.min(Math.max(score, 0), 100);
    }
    mapScoreToStatus(score) {
        if (score >= 85)
            return 'secure';
        if (score >= 60)
            return 'warning';
        return 'critical';
    }
    async assessAuthentication() { return {}; }
    async assessEncryption() { return {}; }
    async assessCompliance() { return {}; }
    async assessMonitoring() { return {}; }
    async assessPlatforms() { return {}; }
    generateRecommendations(assessment) { return []; }
    generateActionItems(assessment) { return []; }
}
exports.CrossPlatformSecurityService = CrossPlatformSecurityService;
const createCrossPlatformSecurity = (redis, prisma, config) => {
    return new CrossPlatformSecurityService(redis, prisma, config);
};
exports.createCrossPlatformSecurity = createCrossPlatformSecurity;
const createDefaultSecurityConfig = (environment) => {
    const baseConfig = {
        auth: {
            jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
            jwtAccessExpiration: '15m',
            jwtRefreshExpiration: '7d',
            mfaSecret: process.env.MFA_SECRET || 'default-mfa-secret',
            sessionTimeout: 86400000,
            maxConcurrentSessions: 5,
            crossDeviceSync: true,
            biometricAuth: true
        },
        encryption: {
            algorithm: 'aes-256-gcm',
            keyLength: 32,
            ivLength: 12,
            tagLength: 16,
            saltLength: 32,
            iterations: 100000,
            masterKey: process.env.MASTER_ENCRYPTION_KEY || 'default-master-key',
            hsmEnabled: environment === 'production',
            rotationInterval: environment === 'production' ? 90 : 365,
            gracePeriod: 30,
            maxKeyAge: 365,
            autoRotate: environment === 'production'
        },
        compliance: {
            gdpr: {
                enabled: environment !== 'development',
                dataRetentionDays: 365,
                consentRequired: true,
                rightToErasure: true,
                dataPortability: true,
                privacyByDesign: true
            },
            ccpa: {
                enabled: environment === 'production',
                saleOptOut: true,
                dataDisclosure: true,
                consumerRights: true
            },
            hipaa: {
                enabled: false,
                baaRequired: true,
                auditLogging: true,
                accessControls: true,
                encryptionRequired: true
            },
            sox: {
                enabled: false,
                auditTrails: true,
                changeControls: true,
                accessReviews: true
            },
            fedramp: {
                enabled: false,
                securityLevel: 'moderate',
                continuousMonitoring: true,
                incidentResponse: true
            }
        },
        monitoring: {
            anomalyDetection: {
                enabled: true,
                sensitivity: environment === 'production' ? 'high' : 'medium',
                learningPeriod: 30,
                alertThreshold: 85
            },
            behavioralAnalysis: {
                enabled: environment !== 'development',
                userProfilingEnabled: true,
                deviceTrackingEnabled: true,
                locationAnalysisEnabled: true
            },
            realTimeMonitoring: {
                enabled: true,
                samplingRate: environment === 'production' ? 100 : 50,
                bufferSize: 1000,
                processingInterval: 10
            },
            incidentResponse: {
                autoBlocking: environment === 'production',
                escalationEnabled: true,
                notificationChannels: ['email', 'slack'],
                responseTimeouts: { low: 3600, medium: 1800, high: 300, critical: 60 }
            },
            threatIntelligence: {
                enabled: environment !== 'development',
                feeds: ['misp'],
                updateInterval: 24,
                confidence_threshold: 70
            }
        },
        platforms: {
            web: require('./platform/web-security').defaultWebSecurityConfig,
            mobile: require('./platform/mobile-security').defaultMobileSecurityConfig,
            extension: require('./platform/extension-security').defaultExtensionSecurityConfig
        }
    };
    if (environment === 'development') {
        baseConfig.platforms.web.https.enforce = false;
        baseConfig.platforms.web.csp.strict = false;
        baseConfig.platforms.mobile.deviceIntegrity.jailbreakDetection = false;
    }
    return baseConfig;
};
exports.createDefaultSecurityConfig = createDefaultSecurityConfig;
exports.defaultSecurityConfig = (0, exports.createDefaultSecurityConfig)('production');
//# sourceMappingURL=index.js.map