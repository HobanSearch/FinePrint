"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedSecurityMiddleware = void 0;
exports.createEnhancedSecurityMiddleware = createEnhancedSecurityMiddleware;
const security_middleware_1 = require("./security-middleware");
const bot_detection_1 = require("../security/bot-detection");
const file_upload_security_1 = require("../security/file-upload-security");
const xss_protection_1 = require("../security/xss-protection");
const advanced_security_monitor_1 = require("../monitoring/advanced-security-monitor");
const index_1 = require("../validation/index");
const advanced_rate_limiter_1 = require("../rate-limiting/advanced-rate-limiter");
const audit_logger_1 = require("../audit/audit-logger");
const index_2 = require("../index");
class EnhancedSecurityMiddleware {
    config;
    redis;
    prisma;
    coreMiddleware;
    botDetection;
    fileUploadSecurity;
    xssProtection;
    securityMonitor;
    rateLimiter;
    metrics = {
        totalRequests: 0,
        blockedRequests: 0,
        suspiciousRequests: 0,
        captchaChallenges: 0,
        rateLimitViolations: 0,
        xssAttempts: 0,
        sqlInjectionAttempts: 0,
        csrfViolations: 0,
        fileUploadBlocks: 0,
        botDetections: 0,
        threatIntelHits: 0,
        averageRiskScore: 0,
        activeThreats: 0
    };
    constructor(redis, prisma, config = {}) {
        this.redis = redis;
        this.prisma = prisma;
        this.config = this.buildConfiguration(config);
        this.initializeSecurityComponents();
        this.startMetricsCollection();
        this.startThreatIntelligenceSync();
    }
    buildConfiguration(config) {
        const securityLevel = config.securityLevel || 'enhanced';
        const environment = config.environment || 'production';
        const baseConfigs = {
            basic: {
                features: {
                    enableBotDetection: false,
                    enableFileUploadSecurity: true,
                    enableXSSProtection: true,
                    enableAdvancedMonitoring: false,
                    enableRealTimeBlocking: false,
                    enableThreatIntelligence: false,
                    enableBehavioralAnalysis: false,
                    enableVulnerabilityScanning: false
                }
            },
            standard: {
                features: {
                    enableBotDetection: true,
                    enableFileUploadSecurity: true,
                    enableXSSProtection: true,
                    enableAdvancedMonitoring: true,
                    enableRealTimeBlocking: false,
                    enableThreatIntelligence: false,
                    enableBehavioralAnalysis: false,
                    enableVulnerabilityScanning: false
                }
            },
            enhanced: {
                features: {
                    enableBotDetection: true,
                    enableFileUploadSecurity: true,
                    enableXSSProtection: true,
                    enableAdvancedMonitoring: true,
                    enableRealTimeBlocking: true,
                    enableThreatIntelligence: true,
                    enableBehavioralAnalysis: true,
                    enableVulnerabilityScanning: false
                }
            },
            maximum: {
                features: {
                    enableBotDetection: true,
                    enableFileUploadSecurity: true,
                    enableXSSProtection: true,
                    enableAdvancedMonitoring: true,
                    enableRealTimeBlocking: true,
                    enableThreatIntelligence: true,
                    enableBehavioralAnalysis: true,
                    enableVulnerabilityScanning: true
                }
            }
        };
        const baseConfig = baseConfigs[securityLevel];
        return {
            core: {
                enableRateLimiting: true,
                enableCSRFProtection: true,
                enableSecurityHeaders: true,
                enableInputValidation: true,
                enableSecurityMonitoring: true,
                enableAuditLogging: true,
                enableGDPRCompliance: true,
                enableDatabaseSecurity: true,
                enableMFA: true,
                securityLevel,
                environment,
                ...config.core
            },
            botDetection: {
                enabled: baseConfig.features.enableBotDetection,
                strictMode: securityLevel === 'maximum',
                captchaProvider: 'recaptcha',
                suspiciousThreshold: securityLevel === 'maximum' ? 50 : 70,
                blockThreshold: securityLevel === 'maximum' ? 70 : 85,
                challengeThreshold: securityLevel === 'maximum' ? 60 : 75,
                ...config.botDetection
            },
            fileUpload: {
                maxFileSize: 50 * 1024 * 1024,
                maxFiles: 10,
                scanForMalware: securityLevel === 'maximum',
                validateFileSignature: true,
                enableVirusScan: false,
                ...config.fileUpload
            },
            xssProtection: {
                enabled: baseConfig.features.enableXSSProtection,
                strictMode: securityLevel === 'maximum',
                blockMode: securityLevel !== 'basic',
                trustedTypes: securityLevel === 'maximum',
                cspReportOnly: environment === 'development',
                ...config.xssProtection
            },
            securityMonitor: {
                enabled: baseConfig.features.enableAdvancedMonitoring,
                realTimeMonitoring: baseConfig.features.enableRealTimeBlocking,
                anomalyDetection: baseConfig.features.enableBehavioralAnalysis,
                automaticResponse: baseConfig.features.enableRealTimeBlocking && environment === 'production',
                threatIntelligence: baseConfig.features.enableThreatIntelligence,
                behavioralAnalysis: baseConfig.features.enableBehavioralAnalysis,
                retentionDays: 30,
                ...config.securityMonitor
            },
            features: {
                ...baseConfig.features,
                ...config.features
            },
            securityLevel,
            environment,
            customRules: config.customRules || [],
            exemptPaths: config.exemptPaths || ['/health', '/metrics', '/favicon.ico'],
            exemptIPs: config.exemptIPs || [],
            exemptUserAgents: config.exemptUserAgents || []
        };
    }
    initializeSecurityComponents() {
        this.coreMiddleware = new security_middleware_1.SecurityMiddleware(this.redis, this.prisma, this.config.core);
        if (this.config.features.enableBotDetection) {
            this.botDetection = (0, bot_detection_1.createBotDetection)(this.redis, this.config.botDetection);
        }
        if (this.config.features.enableFileUploadSecurity) {
            this.fileUploadSecurity = (0, file_upload_security_1.createFileUploadSecurity)(this.config.fileUpload);
        }
        if (this.config.features.enableXSSProtection) {
            this.xssProtection = (0, xss_protection_1.createXSSProtection)(this.config.xssProtection);
        }
        if (this.config.features.enableAdvancedMonitoring) {
            this.securityMonitor = (0, advanced_security_monitor_1.createAdvancedSecurityMonitor)(this.redis, this.prisma, this.config.securityMonitor);
        }
        this.rateLimiter = (0, advanced_rate_limiter_1.createRateLimiter)(this.redis);
    }
    async register(fastify) {
        await this.coreMiddleware.register(fastify);
        if (this.securityMonitor) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', this.securityMonitor.middleware());
            });
        }
        if (this.xssProtection) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', this.xssProtection.middleware());
            });
        }
        if (this.botDetection) {
            await fastify.register(async (fastify) => {
                fastify.addHook('onRequest', this.botDetection.middleware());
            });
        }
        if (this.fileUploadSecurity) {
            await fastify.register(async (fastify) => {
                fastify.addHook('preHandler', this.fileUploadSecurity.middleware());
            });
        }
        await fastify.register(async (fastify) => {
            fastify.addHook('onRequest', this.orchestratorMiddleware());
        });
        await this.registerEnhancedSecurityRoutes(fastify);
        fastify.setErrorHandler(this.enhancedErrorHandler());
    }
    orchestratorMiddleware() {
        return async (request, reply) => {
            const startTime = Date.now();
            this.metrics.totalRequests++;
            try {
                if (this.isExemptRequest(request)) {
                    return;
                }
                await this.applyCustomRules(request, reply);
                await this.collectSecurityMetrics(request);
                request.securityContext = {
                    startTime,
                    securityLevel: this.config.securityLevel,
                    riskScore: await this.calculateRequestRiskScore(request),
                    threats: await this.identifyThreats(request)
                };
            }
            catch (error) {
                if (error instanceof index_2.SecurityError) {
                    this.metrics.blockedRequests++;
                    throw error;
                }
                throw error;
            }
        };
    }
    isExemptRequest(request) {
        const ip = index_2.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        const path = request.url;
        return (this.config.exemptPaths.some(exemptPath => path.startsWith(exemptPath)) ||
            this.config.exemptIPs.includes(ip) ||
            this.config.exemptUserAgents.some(ua => userAgent.includes(ua)));
    }
    async applyCustomRules(request, reply) {
        const sortedRules = this.config.customRules.sort((a, b) => a.priority - b.priority);
        for (const rule of sortedRules) {
            if (rule.condition(request)) {
                switch (rule.action) {
                    case 'deny':
                        throw new index_2.SecurityError(rule.message || `Access denied by security rule: ${rule.name}`, 'CUSTOM_RULE_DENY', 403);
                    case 'captcha':
                        if (this.botDetection) {
                            await this.botDetection.requireCaptchaChallenge(request, reply);
                        }
                        break;
                    case 'challenge':
                        break;
                    case 'log':
                        await audit_logger_1.auditLogger.logSecurity('custom_rule_triggered', undefined, request, { ruleName: rule.name, action: rule.action });
                        break;
                }
            }
        }
    }
    async collectSecurityMetrics(request) {
        const securityContext = request.securityContext;
        if (securityContext?.riskScore > 70) {
            this.metrics.suspiciousRequests++;
        }
        this.metrics.averageRiskScore = ((this.metrics.averageRiskScore * (this.metrics.totalRequests - 1) + securityContext?.riskScore) /
            this.metrics.totalRequests);
    }
    async calculateRequestRiskScore(request) {
        let score = 0;
        if (this.botDetection) {
            score += 0;
        }
        if (this.xssProtection) {
            score += 0;
        }
        const ip = index_2.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        if (await this.isHighRiskIP(ip)) {
            score += 30;
        }
        if (this.isSuspiciousUserAgent(userAgent)) {
            score += 20;
        }
        if (this.isHighRiskPath(request.url)) {
            score += 15;
        }
        return Math.min(score, 100);
    }
    async identifyThreats(request) {
        const threats = [];
        if (this.containsSQLInjection(request)) {
            threats.push('sql_injection');
            this.metrics.sqlInjectionAttempts++;
        }
        if (this.containsXSS(request)) {
            threats.push('xss_attempt');
            this.metrics.xssAttempts++;
        }
        if (await this.isKnownThreat(request)) {
            threats.push('known_threat');
            this.metrics.threatIntelHits++;
        }
        return threats;
    }
    async registerEnhancedSecurityRoutes(fastify) {
        fastify.get('/api/security/dashboard', async (request, reply) => {
            return reply.send({
                success: true,
                data: {
                    metrics: this.getSecurityMetrics(),
                    config: {
                        securityLevel: this.config.securityLevel,
                        environment: this.config.environment,
                        features: this.config.features
                    },
                    components: this.getComponentStatuses()
                }
            });
        });
        fastify.get('/api/security/alerts', async (request, reply) => {
            const alerts = this.securityMonitor?.getRecentAlerts() || [];
            return reply.send({ success: true, data: alerts });
        });
        fastify.post('/api/security/block-ip', {
            preHandler: index_1.validationMiddleware.sanitizeNone
        }, async (request, reply) => {
            const { ip, reason, duration } = request.body;
            if (this.rateLimiter) {
                await this.rateLimiter.blockIP(ip, duration || 3600000);
            }
            await audit_logger_1.auditLogger.logSecurity('ip_blocked', undefined, request, { ip, reason });
            return reply.send({ success: true, message: 'IP blocked successfully' });
        });
        if (this.xssProtection) {
            fastify.post('/api/security/csp-report', this.xssProtection.createCSPReportHandler());
        }
        if (this.botDetection) {
            fastify.post('/api/security/captcha-verify', this.botDetection.createCaptchaMiddleware());
        }
    }
    enhancedErrorHandler() {
        return async (error, request, reply) => {
            if (error instanceof index_2.SecurityError) {
                await audit_logger_1.auditLogger.logSecurity('security_error', request.securityContext?.userId, request, {
                    error: error.message,
                    code: error.code,
                    statusCode: error.statusCode,
                    securityContext: request.securityContext
                });
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.code,
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
            request.log.error('Unhandled error in security middleware', { error });
            return reply.status(500).send({
                success: false,
                error: 'INTERNAL_ERROR',
                message: 'An internal error occurred'
            });
        };
    }
    async isHighRiskIP(ip) {
        const key = `threat:ip:${ip}`;
        const result = await this.redis.get(key);
        return result !== null;
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
            '/admin', '/api/admin', '/api/auth/login',
            '/api/user/delete', '/wp-admin', '/.env'
        ];
        return highRiskPaths.some(riskPath => path.startsWith(riskPath));
    }
    containsSQLInjection(request) {
        const sqlPatterns = /union|select|insert|update|delete|drop|create|alter/i;
        const content = JSON.stringify({
            url: request.url,
            query: request.query,
            body: request.body
        });
        return sqlPatterns.test(content);
    }
    containsXSS(request) {
        const xssPatterns = /<script|javascript:|on\w+\s*=/i;
        const content = JSON.stringify({
            url: request.url,
            query: request.query,
            body: request.body
        });
        return xssPatterns.test(content);
    }
    async isKnownThreat(request) {
        return false;
    }
    startMetricsCollection() {
        setInterval(() => {
            const keys = Object.keys(this.metrics);
            keys.forEach(key => {
                if (typeof this.metrics[key] === 'number' && key !== 'averageRiskScore') {
                    this.metrics[key] = Math.floor(this.metrics[key] * 0.9);
                }
            });
        }, 60000);
    }
    startThreatIntelligenceSync() {
        if (!this.config.features.enableThreatIntelligence)
            return;
        setInterval(async () => {
            try {
                await this.syncThreatIntelligence();
            }
            catch (error) {
                console.error('Threat intelligence sync error:', error);
            }
        }, 30 * 60 * 1000);
    }
    async syncThreatIntelligence() {
        console.log('Syncing threat intelligence...');
    }
    getSecurityMetrics() {
        return { ...this.metrics };
    }
    getComponentStatuses() {
        return {
            coreMiddleware: true,
            botDetection: !!this.botDetection,
            fileUploadSecurity: !!this.fileUploadSecurity,
            xssProtection: !!this.xssProtection,
            securityMonitor: !!this.securityMonitor,
            rateLimiter: !!this.rateLimiter
        };
    }
    async addCustomRule(rule) {
        this.config.customRules.push(rule);
        this.config.customRules.sort((a, b) => a.priority - b.priority);
    }
    async removeCustomRule(ruleName) {
        const index = this.config.customRules.findIndex(rule => rule.name === ruleName);
        if (index !== -1) {
            this.config.customRules.splice(index, 1);
            return true;
        }
        return false;
    }
    updateConfiguration(updates) {
        this.config = { ...this.config, ...updates };
    }
}
exports.EnhancedSecurityMiddleware = EnhancedSecurityMiddleware;
function createEnhancedSecurityMiddleware(redis, prisma, config) {
    return new EnhancedSecurityMiddleware(redis, prisma, config);
}
//# sourceMappingURL=enhanced-security-middleware.js.map