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
exports.AuditEventType = exports.AuditLevel = exports.AuthManager = exports.AuditLogger = exports.AuthRateLimiter = exports.OAuth2Manager = exports.MFAManager = exports.SessionManager = exports.PasswordManager = exports.JWTTokenManager = exports.JWTKeyManager = void 0;
exports.createDefaultAuthConfig = createDefaultAuthConfig;
const logger_1 = require("@fineprintai/logger");
var keyManager_1 = require("./jwt/keyManager");
Object.defineProperty(exports, "JWTKeyManager", { enumerable: true, get: function () { return keyManager_1.JWTKeyManager; } });
var tokenManager_1 = require("./jwt/tokenManager");
Object.defineProperty(exports, "JWTTokenManager", { enumerable: true, get: function () { return tokenManager_1.JWTTokenManager; } });
__exportStar(require("./jwt/types"), exports);
var passwordManager_1 = require("./password/passwordManager");
Object.defineProperty(exports, "PasswordManager", { enumerable: true, get: function () { return passwordManager_1.PasswordManager; } });
__exportStar(require("./password/types"), exports);
var sessionManager_1 = require("./session/sessionManager");
Object.defineProperty(exports, "SessionManager", { enumerable: true, get: function () { return sessionManager_1.SessionManager; } });
__exportStar(require("./session/types"), exports);
var mfaManager_1 = require("./mfa/mfaManager");
Object.defineProperty(exports, "MFAManager", { enumerable: true, get: function () { return mfaManager_1.MFAManager; } });
__exportStar(require("./mfa/types"), exports);
var oauthManager_1 = require("./oauth/oauthManager");
Object.defineProperty(exports, "OAuth2Manager", { enumerable: true, get: function () { return oauthManager_1.OAuth2Manager; } });
__exportStar(require("./oauth/types"), exports);
var rateLimiter_1 = require("./rateLimit/rateLimiter");
Object.defineProperty(exports, "AuthRateLimiter", { enumerable: true, get: function () { return rateLimiter_1.AuthRateLimiter; } });
__exportStar(require("./rateLimit/types"), exports);
var auditLogger_1 = require("./audit/auditLogger");
Object.defineProperty(exports, "AuditLogger", { enumerable: true, get: function () { return auditLogger_1.AuditLogger; } });
__exportStar(require("./audit/types"), exports);
const logger = (0, logger_1.createServiceLogger)('auth-manager');
class AuthManager {
    cache;
    config;
    jwt;
    password;
    session;
    mfa;
    oauth;
    rateLimit;
    audit;
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.jwt = new JWTTokenManager(cache, config.jwt);
        this.password = new PasswordManager(cache, config.password);
        this.session = new SessionManager(cache, config.session);
        this.mfa = new MFAManager(cache, config.mfa);
        this.oauth = new OAuth2Manager(cache, config.oauth);
        this.rateLimit = new AuthRateLimiter(cache, config.rateLimit);
        this.audit = new AuditLogger(cache, config.audit);
        logger.info('Auth Manager initialized with all components');
    }
    async getSecurityStatus() {
        try {
            const [jwtStats, sessionStats, mfaStats, oauthStats, rateLimitStats, auditStats] = await Promise.all([
                this.jwt.getTokenStats(),
                this.session.getSessionStats(),
                this.mfa.getMFAStats(),
                this.oauth.getOAuth2Stats(),
                this.rateLimit.getStats(),
                this.audit.getStats()
            ]);
            return {
                jwt: jwtStats,
                sessions: sessionStats,
                mfa: mfaStats,
                oauth: oauthStats,
                rateLimit: rateLimitStats,
                audit: auditStats
            };
        }
        catch (error) {
            logger.error('Failed to get security status', { error });
            throw new Error('Security status retrieval failed');
        }
    }
    async performMaintenance() {
        try {
            logger.info('Starting comprehensive auth maintenance');
            const results = await Promise.allSettled([
                this.jwt.performMaintenance(),
                this.password.performMaintenance(),
                this.session.performMaintenance(),
                this.mfa.performMaintenance(),
                this.oauth.performMaintenance(),
                this.rateLimit.performMaintenance(),
                this.audit.cleanup()
            ]);
            const maintenanceResults = {
                jwt: results[0].status === 'fulfilled' ? results[0].value : undefined,
                password: results[1].status === 'fulfilled' ? results[1].value : undefined,
                session: results[2].status === 'fulfilled' ? results[2].value : undefined,
                mfa: results[3].status === 'fulfilled' ? results[3].value : undefined,
                oauth: results[4].status === 'fulfilled' ? results[4].value : undefined,
                rateLimit: results[5].status === 'fulfilled' ? results[5].value : undefined,
                audit: results[6].status === 'fulfilled' ? results[6].value : 0
            };
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const componentNames = ['jwt', 'password', 'session', 'mfa', 'oauth', 'rateLimit', 'audit'];
                    logger.error(`Maintenance failed for ${componentNames[index]}`, {
                        error: result.reason
                    });
                }
            });
            logger.info('Auth maintenance completed');
            return maintenanceResults;
        }
        catch (error) {
            logger.error('Auth maintenance failed', { error });
            throw new Error('Maintenance operation failed');
        }
    }
    async shutdown() {
        try {
            logger.info('Shutting down Auth Manager');
            await this.jwt.cleanup();
            logger.info('Auth Manager shutdown completed');
        }
        catch (error) {
            logger.error('Auth Manager shutdown failed', { error });
            throw new Error('Shutdown failed');
        }
    }
    async healthCheck() {
        try {
            const checks = {
                cache: 'healthy',
                jwt: 'healthy',
                session: 'healthy',
                mfa: 'healthy',
                oauth: 'healthy',
                rateLimit: 'healthy',
                audit: 'healthy'
            };
            const details = {};
            try {
                const cacheHealth = await this.cache.ping();
                checks.cache = cacheHealth ? 'healthy' : 'unhealthy';
                details.cache = { connected: cacheHealth };
            }
            catch (error) {
                checks.cache = 'unhealthy';
                details.cache = { error: error.message };
            }
            try {
                const jwtStatus = await this.jwt.getTokenStats();
                checks.jwt = 'healthy';
                details.jwt = { activeTokens: jwtStatus.activeAccessTokens + jwtStatus.activeRefreshTokens };
            }
            catch (error) {
                checks.jwt = 'unhealthy';
                details.jwt = { error: error.message };
            }
            try {
                const sessionStatus = await this.session.getSessionStats();
                checks.session = 'healthy';
                details.session = { activeSessions: sessionStatus.totalActiveSessions };
            }
            catch (error) {
                checks.session = 'unhealthy';
                details.session = { error: error.message };
            }
            try {
                const mfaStatus = await this.mfa.getMFAStats();
                checks.mfa = 'healthy';
                details.mfa = { enabledUsers: mfaStatus.enabledUsers };
            }
            catch (error) {
                checks.mfa = 'unhealthy';
                details.mfa = { error: error.message };
            }
            try {
                const oauthStatus = await this.oauth.getOAuth2Stats();
                checks.oauth = 'healthy';
                details.oauth = { totalAccounts: oauthStatus.totalAccounts };
            }
            catch (error) {
                checks.oauth = 'unhealthy';
                details.oauth = { error: error.message };
            }
            try {
                const rateLimitStatus = await this.rateLimit.getStats();
                checks.rateLimit = 'healthy';
                details.rateLimit = { totalRequests: rateLimitStatus.totalRequests };
            }
            catch (error) {
                checks.rateLimit = 'unhealthy';
                details.rateLimit = { error: error.message };
            }
            try {
                const auditStatus = await this.audit.getStats();
                checks.audit = 'healthy';
                details.audit = { totalEvents: auditStatus.totalEvents };
            }
            catch (error) {
                checks.audit = 'unhealthy';
                details.audit = { error: error.message };
            }
            const unhealthyComponents = Object.values(checks).filter(status => status === 'unhealthy').length;
            let overallStatus;
            if (unhealthyComponents === 0) {
                overallStatus = 'healthy';
            }
            else if (unhealthyComponents <= 2) {
                overallStatus = 'degraded';
            }
            else {
                overallStatus = 'unhealthy';
            }
            return {
                status: overallStatus,
                components: checks,
                details
            };
        }
        catch (error) {
            logger.error('Health check failed', { error });
            return {
                status: 'unhealthy',
                components: {
                    cache: 'unhealthy',
                    jwt: 'unhealthy',
                    session: 'unhealthy',
                    mfa: 'unhealthy',
                    oauth: 'unhealthy',
                    rateLimit: 'unhealthy',
                    audit: 'unhealthy'
                },
                details: { error: error.message }
            };
        }
    }
}
exports.AuthManager = AuthManager;
function createDefaultAuthConfig() {
    return {
        jwt: {
            algorithm: 'RS256',
            issuer: 'fineprintai',
            audience: 'fineprintai-users',
            accessTokenTTL: 900,
            refreshTokenTTL: 2592000,
            keyRotation: {
                rotationIntervalHours: 24,
                maxKeyAge: 172800,
                keyOverlapPeriod: 86400,
                autoRotate: true
            },
            blacklistEnabled: true,
            maxRefreshTokensPerUser: 5,
            deviceTrackingEnabled: true
        },
        password: {
            saltRounds: 12,
            minLength: 8,
            maxLength: 128,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            preventCommonPasswords: true,
            preventUserInfoInPassword: true,
            maxPasswordAge: 90,
            passwordHistoryCount: 5
        },
        session: {
            ttl: 3600,
            extendOnActivity: true,
            maxConcurrentSessions: 5,
            deviceTrackingEnabled: true,
            geoLocationTracking: true,
            suspiciousActivityDetection: true,
            sessionCookieName: 'fpa_session',
            secureSessionsOnly: true,
            sameSitePolicy: 'strict'
        },
        mfa: {
            totp: {
                enabled: true,
                issuer: 'FinePrint AI',
                window: 2,
                stepSize: 30
            },
            sms: {
                enabled: true,
                provider: 'twilio',
                from: '+1234567890',
                rateLimitPerHour: 10,
                codeLength: 6,
                codeExpiry: 300
            },
            email: {
                enabled: true,
                from: 'security@fineprintai.com',
                rateLimitPerHour: 10,
                codeLength: 6,
                codeExpiry: 300,
                template: 'mfa-verification'
            },
            backup: {
                enabled: true,
                codeCount: 10,
                codeLength: 8
            },
            enforcement: {
                requireForNewDevices: true,
                requireForSensitiveOperations: true,
                maxFailedAttempts: 5,
                lockoutDuration: 900
            }
        },
        oauth: {
            google: {
                enabled: true,
                clientId: process.env.GOOGLE_CLIENT_ID || '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
                redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
                scopes: ['openid', 'email', 'profile']
            },
            microsoft: {
                enabled: true,
                clientId: process.env.MICROSOFT_CLIENT_ID || '',
                clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
                redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
                scopes: ['openid', 'email', 'profile'],
                tenantId: 'common'
            },
            security: {
                stateExpiry: 600,
                nonceExpiry: 600,
                maxRetries: 3,
                rateLimitPerHour: 20
            }
        },
        rateLimit: {
            rules: [
                {
                    id: 'login-attempts',
                    name: 'Login Attempts',
                    endpoint: '/auth/login',
                    method: 'POST',
                    windowMs: 900000,
                    max: 5,
                    blockDuration: 900000
                },
                {
                    id: 'password-reset',
                    name: 'Password Reset',
                    endpoint: '/auth/password/reset',
                    method: 'POST',
                    windowMs: 3600000,
                    max: 3,
                    blockDuration: 3600000
                },
                {
                    id: 'mfa-attempts',
                    name: 'MFA Attempts',
                    endpoint: '/auth/mfa/verify',
                    method: 'POST',
                    windowMs: 300000,
                    max: 5,
                    blockDuration: 900000
                },
                {
                    id: 'oauth-requests',
                    name: 'OAuth Requests',
                    endpoint: /\/auth\/oauth\/.*/,
                    windowMs: 3600000,
                    max: 20
                }
            ],
            storage: 'redis',
            keyGenerator: (req) => `${req.ip}:${req.path}`,
            headers: {
                total: 'X-RateLimit-Limit',
                remaining: 'X-RateLimit-Remaining',
                reset: 'X-RateLimit-Reset',
                retryAfter: 'Retry-After'
            }
        },
        audit: {
            enabled: true,
            storage: 'redis',
            retention: {
                days: 90,
                maxEntries: 1000000
            },
            levels: [types_1.AuditLevel.INFO, types_1.AuditLevel.WARN, types_1.AuditLevel.ERROR, types_1.AuditLevel.CRITICAL],
            sensitiveFields: ['password', 'token', 'secret', 'key', 'credential'],
            encryption: {
                enabled: false
            },
            forwarding: {
                enabled: false,
                endpoints: [],
                headers: {}
            }
        }
    };
}
const types_1 = require("./audit/types");
Object.defineProperty(exports, "AuditLevel", { enumerable: true, get: function () { return types_1.AuditLevel; } });
Object.defineProperty(exports, "AuditEventType", { enumerable: true, get: function () { return types_1.AuditEventType; } });
exports.default = AuthManager;
//# sourceMappingURL=index.js.map