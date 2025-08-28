export * from './auth/unified-auth';
export * from './auth/mfa';
export * from './encryption/advanced-encryption';
export * from './compliance/unified-compliance';
export * from './monitoring/advanced-threat-detection';
export * from './platform/web-security';
export * from './platform/mobile-security';
export * from './platform/extension-security';
export * from './middleware/enhanced-security-middleware';
export * from './validation/zod-schemas';
export * from './security/xss-protection';
export * from './security/bot-detection';
export * from './security/file-upload-security';
export * from './monitoring/security-monitor';
export * from './audit/audit-logger';
export interface CrossPlatformSecurityConfig {
    auth: {
        jwtSecret: string;
        jwtAccessExpiration: string;
        jwtRefreshExpiration: string;
        mfaSecret: string;
        sessionTimeout: number;
        maxConcurrentSessions: number;
        crossDeviceSync: boolean;
        biometricAuth: boolean;
    };
    encryption: {
        algorithm: string;
        keyLength: number;
        ivLength: number;
        tagLength: number;
        saltLength: number;
        iterations: number;
        masterKey: string;
        kmsEndpoint?: string;
        hsmEnabled: boolean;
        rotationInterval: number;
        gracePeriod: number;
        maxKeyAge: number;
        autoRotate: boolean;
    };
    compliance: {
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
    };
    monitoring: {
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
    };
    platforms: {
        web: {
            csp: {
                enabled: boolean;
                strict: boolean;
                reportUri?: string;
                directives: Record<string, string[]>;
            };
            cookies: {
                secure: boolean;
                httpOnly: boolean;
                sameSite: 'strict' | 'lax' | 'none';
                maxAge: number;
            };
            https: {
                enforce: boolean;
                hsts: {
                    enabled: boolean;
                    maxAge: number;
                    includeSubDomains: boolean;
                    preload: boolean;
                };
            };
        };
        mobile: {
            certificatePinning: {
                enabled: boolean;
                pins: string[];
                backupPins: string[];
                enforceOnSubdomains: boolean;
                reportFailures: boolean;
            };
            deviceIntegrity: {
                jailbreakDetection: boolean;
                rootDetection: boolean;
                debuggerDetection: boolean;
                emulatorDetection: boolean;
                hookingDetection: boolean;
            };
            secureStorage: {
                useKeychain: boolean;
                useKeystore: boolean;
                biometricProtection: boolean;
                encryptionAlgorithm: string;
            };
        };
        extension: {
            permissions: {
                minimal: boolean;
                requestedPermissions: string[];
                optionalPermissions: string[];
                hostPermissions: string[];
            };
            contentSecurity: {
                isolatedWorlds: boolean;
                sandboxing: boolean;
                cspEnabled: boolean;
                strictMode: boolean;
            };
            communication: {
                encryptMessages: boolean;
                validateOrigin: boolean;
                rateLimit: boolean;
                messageTimeout: number;
            };
        };
    };
}
export declare class SecurityError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly timestamp: Date;
    constructor(message: string, code: string, statusCode?: number);
}
export declare class CrossPlatformSecurityService {
    private config;
    private redis;
    private prisma;
    readonly auth: any;
    readonly encryption: any;
    readonly compliance: any;
    readonly monitoring: any;
    readonly webSecurity: any;
    readonly mobileSecurity: any;
    readonly extensionSecurity: any;
    constructor(redis: any, prisma: any, config: CrossPlatformSecurityConfig);
    private initializeCoreServices;
    private initializePlatformServices;
    private setupServiceIntegration;
    getSecurityStatus(): Promise<{
        overall: 'secure' | 'warning' | 'critical';
        score: number;
        platforms: Record<string, any>;
        compliance: any;
        threats: any;
    }>;
    performSecurityAssessment(): Promise<{
        timestamp: Date;
        assessment: {
            authentication: any;
            encryption: any;
            compliance: any;
            monitoring: any;
            platforms: any;
        };
        recommendations: string[];
        actionItems: Array<{
            priority: 'low' | 'medium' | 'high' | 'critical';
            description: string;
            dueDate: Date;
        }>;
    }>;
    private mapSeverityToRiskLevel;
    private getApplicableFrameworks;
    private calculateOverallScore;
    private mapScoreToStatus;
    private assessAuthentication;
    private assessEncryption;
    private assessCompliance;
    private assessMonitoring;
    private assessPlatforms;
    private generateRecommendations;
    private generateActionItems;
}
export declare const createCrossPlatformSecurity: (redis: any, prisma: any, config: CrossPlatformSecurityConfig) => CrossPlatformSecurityService;
export declare const createDefaultSecurityConfig: (environment: "development" | "staging" | "production") => CrossPlatformSecurityConfig;
export declare const defaultSecurityConfig: CrossPlatformSecurityConfig;
//# sourceMappingURL=index.d.ts.map