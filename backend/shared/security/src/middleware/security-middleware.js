"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMiddleware = void 0;
exports.createSecurityMiddleware = createSecurityMiddleware;
const input_sanitizer_1 = require("../validation/input-sanitizer");
const csrf_protection_1 = require("../csrf/csrf-protection");
const security_headers_1 = require("../headers/security-headers");
const advanced_rate_limiter_1 = require("../rate-limiting/advanced-rate-limiter");
const security_monitor_1 = require("../monitoring/security-monitor");
const audit_logger_1 = require("../audit/audit-logger");
const gdpr_compliance_1 = require("../compliance/gdpr-compliance");
const db_security_1 = require("../database/db-security");
const index_1 = require("../index");
class SecurityMiddleware {
    config;
    redis;
    prisma;
    rateLimiter;
    securityMonitor;
    databaseSecurity;
    constructor(redis, prisma, config = {}) {
        this.redis = redis;
        this.prisma = prisma;
        this.config = {
            enableRateLimiting: true,
            enableCSRFProtection: true,
            enableSecurityHeaders: true,
            enableInputValidation: true,
            enableSecurityMonitoring: true,
            enableAuditLogging: true,
            enableGDPRCompliance: true,
            enableDatabaseSecurity: true,
            enableMFA: true,
            securityLevel: 'enhanced',
            environment: 'production',
            customRules: [],
            exemptPaths: ['/health', '/metrics', '/favicon.ico'],
            exemptIPs: [],
            ...config
        };
        this.initializeSecurityComponents();
    }
    initializeSecurityComponents() {
        if (this.config.enableRateLimiting) {
            this.rateLimiter = (0, advanced_rate_limiter_1.createRateLimiter)(this.redis);
        }
        if (this.config.enableSecurityMonitoring) {
            this.securityMonitor = (0, security_monitor_1.createSecurityMonitor)(this.redis);
        }
        if (this.config.enableDatabaseSecurity) {
            this.databaseSecurity = (0, db_security_1.createDatabaseSecurity)(this.prisma);
        }
    }
    async register(fastify) {
        if (this.config.enableSecurityHeaders) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', security_headers_1.securityHeaders.middleware());
            });
        }
        if (this.config.enableRateLimiting) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', this.rateLimiter.middleware());
            });
        }
        if (this.config.enableSecurityMonitoring) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', this.securityMonitor.middleware());
            });
        }
        if (this.config.enableGDPRCompliance) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', gdpr_compliance_1.gdprCompliance.consentMiddleware());
            });
        }
        if (this.config.enableInputValidation) {
            await fastify.register(async (fastify) => {
                fastify.addHook('preValidation', this.inputValidationMiddleware());
            });
        }
        if (this.config.enableCSRFProtection) {
            await fastify.register(async (fastify) => {
                fastify.addHook('preHandler', csrf_protection_1.csrfProtection.verifyTokenMiddleware());
                fastify.addHook('onSend', csrf_protection_1.csrfProtection.setTokenMiddleware());
            });
        }
        if (this.config.enableAuditLogging) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', audit_logger_1.auditLogger.middleware());
            });
        }
        await this.registerSecurityRoutes(fastify);
        fastify.setErrorHandler(this.securityErrorHandler());
    }
    middleware() {
        return async (request, reply) => {
            if (this.isExemptPath(request.url)) {
                return;
            }
            const clientIP = index_1.SecurityUtils.extractClientIP(request);
            if (this.config.exemptIPs.includes(clientIP)) {
                return;
            }
            try {
                const securityContext = await this.buildSecurityContext(request);
                await this.applyCustomRules(request, reply, securityContext);
                await this.applyThreatBasedSecurity(request, reply, securityContext);
                request.securityContext = securityContext;
            }
            catch (error) {
                if (error instanceof index_1.SecurityError) {
                    throw error;
                }
                throw new index_1.SecurityError('Security validation failed', 'SECURITY_ERROR');
            }
        };
    }
    inputValidationMiddleware() {
        return async (request, reply) => {
            if (request.method === 'GET' || request.method === 'HEAD') {
                return;
            }
            try {
                if (request.body) {
                    const sanitized = input_sanitizer_1.inputSanitizer.sanitizeJson(JSON.stringify(request.body));
                    request.body = sanitized;
                }
                if (request.query && typeof request.query === 'object') {
                    const sanitizedQuery = {};
                    for (const [key, value] of Object.entries(request.query)) {
                        if (typeof value === 'string') {
                            sanitizedQuery[key] = input_sanitizer_1.inputSanitizer.sanitizeString(value, {
                                removeHtml: true,
                                removeSqlKeywords: true
                            });
                        }
                        else {
                            sanitizedQuery[key] = value;
                        }
                    }
                    request.query = sanitizedQuery;
                }
                if (request.params && typeof request.params === 'object') {
                    const sanitizedParams = {};
                    for (const [key, value] of Object.entries(request.params)) {
                        if (typeof value === 'string') {
                            sanitizedParams[key] = input_sanitizer_1.inputSanitizer.sanitizeString(value, {
                                removeHtml: true,
                                removeSqlKeywords: true,
                                maxLength: 100
                            });
                        }
                        else {
                            sanitizedParams[key] = value;
                        }
                    }
                    request.params = sanitizedParams;
                }
            }
            catch (error) {
                throw new index_1.ValidationError('Input validation failed: ' + error.message);
            }
        };
    }
    async buildSecurityContext(request) {
        const sourceIP = index_1.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        const userId = this.extractUserId(request);
        const sessionId = this.extractSessionId(request);
        const riskScore = await this.calculateRiskScore(request, sourceIP, userAgent, userId);
        const threatLevel = this.getThreatLevel(riskScore);
        const mfaRequired = this.shouldRequireMFA(request, riskScore, userId);
        const deviceTrusted = await this.isDeviceTrusted(userId, sourceIP, userAgent);
        return {
            userId,
            sessionId,
            userAgent,
            sourceIP,
            riskScore,
            threatLevel,
            mfaRequired,
            deviceTrusted
        };
    }
    async calculateRiskScore(request, sourceIP, userAgent, userId) {
        let score = 0;
        score += 1;
        const ipReputation = await this.checkIPReputation(sourceIP);
        score += ipReputation * 2;
        if (this.isSuspiciousUserAgent(userAgent)) {
            score += 3;
        }
        if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
            score += 1;
        }
        if (this.isHighRiskPath(request.url)) {
            score += 2;
        }
        const hour = new Date().getHours();
        if (hour < 6 || hour > 22) {
            score += 1;
        }
        if (userId) {
            const userRisk = await this.getUserRiskScore(userId);
            score += userRisk;
        }
        return Math.min(score, 10);
    }
    async applyCustomRules(request, reply, context) {
        const sortedRules = this.config.customRules.sort((a, b) => a.priority - b.priority);
        for (const rule of sortedRules) {
            if (rule.condition(request)) {
                switch (rule.action) {
                    case 'deny':
                        throw new index_1.SecurityError(rule.message || 'Access denied by security rule', 'CUSTOM_RULE_DENY');
                    case 'challenge':
                        if (!context.mfaRequired) {
                            context.mfaRequired = true;
                        }
                        break;
                    case 'log':
                        await this.securityMonitor?.logSecurityEvent({
                            type: 'custom_rule_triggered',
                            severity: 'medium',
                            sourceIP: context.sourceIP,
                            userAgent: context.userAgent,
                            userId: context.userId,
                            details: { ruleName: rule.name, action: rule.action }
                        });
                        break;
                }
            }
        }
    }
    async applyThreatBasedSecurity(request, reply, context) {
        switch (context.threatLevel) {
            case 'critical':
                throw new index_1.SecurityError('Request blocked due to critical threat level', 'CRITICAL_THREAT');
            case 'high':
                context.mfaRequired = true;
                await this.requireAdditionalVerification(request, reply, context);
                break;
            case 'medium':
                if (this.isSensitiveOperation(request)) {
                    context.mfaRequired = true;
                }
                break;
            case 'low':
                break;
        }
    }
    async registerSecurityRoutes(fastify) {
        fastify.get('/api/security/csrf-token', csrf_protection_1.csrfProtection.getTokenHandler());
        fastify.get('/api/security/status', async (request, reply) => {
            const status = {
                timestamp: new Date().toISOString(),
                securityLevel: this.config.securityLevel,
                activeFeatures: this.getActiveFeatures(),
                threatLevel: 'low',
                systemHealth: 'healthy'
            };
            return reply.send({ success: true, data: status });
        });
        fastify.get('/api/security/headers', security_headers_1.securityHeaders.cspReportHandler());
        if (this.config.enableMFA) {
            fastify.post('/api/security/mfa/setup', async (request, reply) => {
                return reply.send({ success: true, message: 'MFA setup initiated' });
            });
        }
    }
    securityErrorHandler() {
        return async (error, request, reply) => {
            await audit_logger_1.auditLogger.logSecurity('security_error', this.extractUserId(request), request, {
                error: error.message,
                stack: error.stack,
                path: request.url,
                method: request.method
            });
            if (error instanceof index_1.SecurityError) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.code,
                    message: error.message
                });
            }
            if (error instanceof index_1.AuthenticationError) {
                return reply.status(401).send({
                    success: false,
                    error: 'AUTHENTICATION_REQUIRED',
                    message: error.message
                });
            }
            if (error instanceof index_1.AuthorizationError) {
                return reply.status(403).send({
                    success: false,
                    error: 'ACCESS_DENIED',
                    message: error.message
                });
            }
            if (error instanceof index_1.ValidationError) {
                return reply.status(400).send({
                    success: false,
                    error: 'VALIDATION_ERROR',
                    message: error.message
                });
            }
            return reply.status(500).send({
                success: false,
                error: 'SECURITY_ERROR',
                message: 'A security error occurred'
            });
        };
    }
    isExemptPath(path) {
        return this.config.exemptPaths.some(exemptPath => path.startsWith(exemptPath));
    }
    extractUserId(request) {
        try {
            const authHeader = request.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.sub;
            }
        }
        catch {
            return undefined;
        }
        return undefined;
    }
    extractSessionId(request) {
        try {
            const authHeader = request.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                const jwt = require('jsonwebtoken');
                const decoded = jwt.decode(token);
                return decoded?.jti;
            }
        }
        catch {
            return undefined;
        }
        return undefined;
    }
    getThreatLevel(riskScore) {
        if (riskScore >= 8)
            return 'critical';
        if (riskScore >= 6)
            return 'high';
        if (riskScore >= 4)
            return 'medium';
        return 'low';
    }
    shouldRequireMFA(request, riskScore, userId) {
        if (riskScore >= 6)
            return true;
        if (this.isSensitiveOperation(request))
            return true;
        if (request.url.startsWith('/api/admin'))
            return true;
        return false;
    }
    async isDeviceTrusted(userId, sourceIP, userAgent) {
        if (!userId || !sourceIP || !userAgent)
            return false;
        return false;
    }
    async checkIPReputation(ip) {
        return 0;
    }
    isSuspiciousUserAgent(userAgent) {
        const suspiciousPatterns = [
            /bot/i, /crawler/i, /spider/i, /scraper/i,
            /sqlmap/i, /nikto/i, /burp/i, /nmap/i
        ];
        return suspiciousPatterns.some(pattern => pattern.test(userAgent));
    }
    isHighRiskPath(path) {
        const highRiskPaths = [
            '/api/admin', '/api/auth', '/api/user/delete',
            '/api/security', '/api/system'
        ];
        return highRiskPaths.some(riskPath => path.startsWith(riskPath));
    }
    async getUserRiskScore(userId) {
        return 0;
    }
    async requireAdditionalVerification(request, reply, context) {
        await audit_logger_1.auditLogger.logSecurity('additional_verification_required', context.userId, request, { riskScore: context.riskScore, threatLevel: context.threatLevel });
    }
    isSensitiveOperation(request) {
        const sensitivePaths = [
            '/api/user/delete', '/api/user/export',
            '/api/admin', '/api/billing',
            '/api/documents/delete'
        ];
        const sensitiveMethods = ['DELETE', 'PUT'];
        return sensitivePaths.some(path => request.url.startsWith(path)) ||
            sensitiveMethods.includes(request.method);
    }
    getActiveFeatures() {
        const features = [];
        if (this.config.enableRateLimiting)
            features.push('rate_limiting');
        if (this.config.enableCSRFProtection)
            features.push('csrf_protection');
        if (this.config.enableSecurityHeaders)
            features.push('security_headers');
        if (this.config.enableInputValidation)
            features.push('input_validation');
        if (this.config.enableSecurityMonitoring)
            features.push('security_monitoring');
        if (this.config.enableAuditLogging)
            features.push('audit_logging');
        if (this.config.enableGDPRCompliance)
            features.push('gdpr_compliance');
        if (this.config.enableDatabaseSecurity)
            features.push('database_security');
        if (this.config.enableMFA)
            features.push('mfa');
        return features;
    }
}
exports.SecurityMiddleware = SecurityMiddleware;
function createSecurityMiddleware(redis, prisma, config) {
    return new SecurityMiddleware(redis, prisma, config);
}
//# sourceMappingURL=security-middleware.js.map