"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMonitor = exports.SecuritySeverity = exports.SecurityEventType = void 0;
exports.createSecurityMonitor = createSecurityMonitor;
const index_1 = require("../index");
var SecurityEventType;
(function (SecurityEventType) {
    SecurityEventType["LOGIN_SUCCESS"] = "login_success";
    SecurityEventType["LOGIN_FAILURE"] = "login_failure";
    SecurityEventType["LOGOUT"] = "logout";
    SecurityEventType["PASSWORD_CHANGE"] = "password_change";
    SecurityEventType["MFA_SETUP"] = "mfa_setup";
    SecurityEventType["MFA_SUCCESS"] = "mfa_success";
    SecurityEventType["MFA_FAILURE"] = "mfa_failure";
    SecurityEventType["ACCOUNT_LOCKED"] = "account_locked";
    SecurityEventType["ACCESS_DENIED"] = "access_denied";
    SecurityEventType["PRIVILEGE_ESCALATION"] = "privilege_escalation";
    SecurityEventType["UNAUTHORIZED_ACCESS"] = "unauthorized_access";
    SecurityEventType["XSS_ATTEMPT"] = "xss_attempt";
    SecurityEventType["SQL_INJECTION"] = "sql_injection";
    SecurityEventType["PATH_TRAVERSAL"] = "path_traversal";
    SecurityEventType["COMMAND_INJECTION"] = "command_injection";
    SecurityEventType["RATE_LIMIT_EXCEEDED"] = "rate_limit_exceeded";
    SecurityEventType["DDoS_ATTACK"] = "ddos_attack";
    SecurityEventType["SENSITIVE_DATA_ACCESS"] = "sensitive_data_access";
    SecurityEventType["DATA_EXPORT"] = "data_export";
    SecurityEventType["BULK_DOWNLOAD"] = "bulk_download";
    SecurityEventType["SYSTEM_ERROR"] = "system_error";
    SecurityEventType["CONFIGURATION_CHANGE"] = "configuration_change";
    SecurityEventType["SERVICE_RESTART"] = "service_restart";
    SecurityEventType["SUSPICIOUS_BEHAVIOR"] = "suspicious_behavior";
    SecurityEventType["LOCATION_ANOMALY"] = "location_anomaly";
    SecurityEventType["TIME_ANOMALY"] = "time_anomaly";
    SecurityEventType["UNUSUAL_TRAFFIC"] = "unusual_traffic";
})(SecurityEventType || (exports.SecurityEventType = SecurityEventType = {}));
var SecuritySeverity;
(function (SecuritySeverity) {
    SecuritySeverity["LOW"] = "low";
    SecuritySeverity["MEDIUM"] = "medium";
    SecuritySeverity["HIGH"] = "high";
    SecuritySeverity["CRITICAL"] = "critical";
})(SecuritySeverity || (exports.SecuritySeverity = SecuritySeverity = {}));
class SecurityMonitor {
    redis;
    threatIntel;
    alertRules = [];
    anomalyConfig;
    eventKeyPrefix = 'security:event:';
    alertKeyPrefix = 'security:alert:';
    metricsKeyPrefix = 'security:metrics:';
    constructor(redisClient) {
        this.redis = redisClient;
        this.threatIntel = {
            maliciousIPs: new Set(),
            knownAttackers: new Set(),
            suspiciousUserAgents: new Set(),
            blockedCountries: new Set(),
            honeypotTokens: new Set()
        };
        this.anomalyConfig = {
            enabled: true,
            sensitivity: 0.7,
            windowSize: 60,
            thresholds: {
                requestRate: 1000,
                errorRate: 0.1,
                geolocationChange: true,
                unusualHours: true
            }
        };
        this.initializeDefaultRules();
        this.startThreatIntelUpdate();
    }
    async logSecurityEvent(event) {
        const securityEvent = {
            id: index_1.SecurityUtils.generateUUID(),
            timestamp: new Date(),
            riskScore: 0,
            blocked: false,
            ...event
        };
        securityEvent.riskScore = this.calculateRiskScore(securityEvent);
        await this.checkThreatIntelligence(securityEvent);
        const eventKey = `${this.eventKeyPrefix}${securityEvent.id}`;
        await this.redis.setex(eventKey, 7 * 24 * 60 * 60, JSON.stringify(securityEvent));
        await this.updateSecurityMetrics(securityEvent);
        await this.processAlertRules(securityEvent);
        if (this.anomalyConfig.enabled) {
            await this.detectAnomalies(securityEvent);
        }
        this.logToApplication(securityEvent);
    }
    middleware() {
        return async (request, reply) => {
            const startTime = Date.now();
            const clientIP = index_1.SecurityUtils.extractClientIP(request);
            const userAgent = request.headers['user-agent'] || '';
            if (this.threatIntel.maliciousIPs.has(clientIP)) {
                await this.logSecurityEvent({
                    type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
                    severity: SecuritySeverity.HIGH,
                    sourceIP: clientIP,
                    userAgent,
                    details: { reason: 'malicious_ip', ip: clientIP },
                    blocked: true
                });
                throw new Error('Access denied');
            }
            if (this.threatIntel.suspiciousUserAgents.has(userAgent)) {
                await this.logSecurityEvent({
                    type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
                    severity: SecuritySeverity.MEDIUM,
                    sourceIP: clientIP,
                    userAgent,
                    details: { reason: 'suspicious_user_agent', userAgent },
                    blocked: false
                });
            }
            reply.addHook('onSend', async (request, reply, payload) => {
                const responseTime = Date.now() - startTime;
                const statusCode = reply.statusCode;
                if (statusCode >= 400) {
                    await this.logSecurityEvent({
                        type: SecurityEventType.SYSTEM_ERROR,
                        severity: statusCode >= 500 ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM,
                        sourceIP: clientIP,
                        userAgent,
                        details: {
                            path: request.url,
                            method: request.method,
                            statusCode,
                            responseTime
                        }
                    });
                }
                if (responseTime > 5000) {
                    await this.logSecurityEvent({
                        type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
                        severity: SecuritySeverity.MEDIUM,
                        sourceIP: clientIP,
                        userAgent,
                        details: {
                            reason: 'slow_response',
                            responseTime,
                            path: request.url
                        }
                    });
                }
            });
        };
    }
    calculateRiskScore(event) {
        let score = 0;
        const eventTypeScores = {
            [SecurityEventType.LOGIN_SUCCESS]: 1,
            [SecurityEventType.LOGIN_FAILURE]: 3,
            [SecurityEventType.LOGOUT]: 1,
            [SecurityEventType.PASSWORD_CHANGE]: 2,
            [SecurityEventType.MFA_SETUP]: 2,
            [SecurityEventType.MFA_SUCCESS]: 1,
            [SecurityEventType.MFA_FAILURE]: 4,
            [SecurityEventType.ACCOUNT_LOCKED]: 5,
            [SecurityEventType.ACCESS_DENIED]: 4,
            [SecurityEventType.PRIVILEGE_ESCALATION]: 8,
            [SecurityEventType.UNAUTHORIZED_ACCESS]: 7,
            [SecurityEventType.XSS_ATTEMPT]: 6,
            [SecurityEventType.SQL_INJECTION]: 8,
            [SecurityEventType.PATH_TRAVERSAL]: 7,
            [SecurityEventType.COMMAND_INJECTION]: 9,
            [SecurityEventType.RATE_LIMIT_EXCEEDED]: 3,
            [SecurityEventType.DDoS_ATTACK]: 7,
            [SecurityEventType.SENSITIVE_DATA_ACCESS]: 4,
            [SecurityEventType.DATA_EXPORT]: 3,
            [SecurityEventType.BULK_DOWNLOAD]: 5,
            [SecurityEventType.SYSTEM_ERROR]: 2,
            [SecurityEventType.CONFIGURATION_CHANGE]: 3,
            [SecurityEventType.SERVICE_RESTART]: 2,
            [SecurityEventType.SUSPICIOUS_BEHAVIOR]: 5,
            [SecurityEventType.LOCATION_ANOMALY]: 4,
            [SecurityEventType.TIME_ANOMALY]: 3,
            [SecurityEventType.UNUSUAL_TRAFFIC]: 4
        };
        score += eventTypeScores[event.type] || 0;
        const severityMultipliers = {
            [SecuritySeverity.LOW]: 1,
            [SecuritySeverity.MEDIUM]: 2,
            [SecuritySeverity.HIGH]: 3,
            [SecuritySeverity.CRITICAL]: 5
        };
        score *= severityMultipliers[event.severity];
        if (this.threatIntel.maliciousIPs.has(event.sourceIP)) {
            score += 5;
        }
        if (event.userAgent && this.threatIntel.suspiciousUserAgents.has(event.userAgent)) {
            score += 3;
        }
        if (event.userId && this.threatIntel.knownAttackers.has(event.userId)) {
            score += 10;
        }
        return Math.min(score, 10);
    }
    async checkThreatIntelligence(event) {
        if (this.threatIntel.maliciousIPs.has(event.sourceIP)) {
            event.riskScore += 5;
            event.details.threatIntel = 'malicious_ip';
        }
        if (event.details && typeof event.details === 'object') {
            const eventStr = JSON.stringify(event.details);
            for (const token of this.threatIntel.honeypotTokens) {
                if (eventStr.includes(token)) {
                    event.riskScore = 10;
                    event.severity = SecuritySeverity.CRITICAL;
                    event.details.threatIntel = 'honeypot_trigger';
                    break;
                }
            }
        }
    }
    async updateSecurityMetrics(event) {
        const now = new Date();
        const hourKey = `${this.metricsKeyPrefix}hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        const dayKey = `${this.metricsKeyPrefix}day:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        const pipeline = this.redis.pipeline();
        pipeline.hincrby(hourKey, event.type, 1);
        pipeline.hincrby(hourKey, 'total', 1);
        pipeline.hincrby(dayKey, event.type, 1);
        pipeline.hincrby(dayKey, 'total', 1);
        pipeline.expire(hourKey, 7 * 24 * 60 * 60);
        pipeline.expire(dayKey, 30 * 24 * 60 * 60);
        pipeline.lpush(`${this.metricsKeyPrefix}risk_scores`, event.riskScore);
        pipeline.ltrim(`${this.metricsKeyPrefix}risk_scores`, 0, 999);
        await pipeline.exec();
    }
    async processAlertRules(event) {
        for (const rule of this.alertRules) {
            if (!rule.enabled || !rule.eventTypes.includes(event.type)) {
                continue;
            }
            const cooldownKey = `${this.alertKeyPrefix}cooldown:${rule.id}`;
            const cooldownExists = await this.redis.exists(cooldownKey);
            if (cooldownExists) {
                continue;
            }
            const conditionsMet = rule.conditions.every(condition => this.evaluateCondition(event, condition));
            if (conditionsMet) {
                for (const action of rule.actions) {
                    await this.executeAlertAction(event, action);
                }
                await this.redis.setex(cooldownKey, rule.cooldownMinutes * 60, event.id);
            }
        }
    }
    evaluateCondition(event, condition) {
        const value = this.getEventValue(event, condition.field);
        switch (condition.operator) {
            case 'equals':
                return value === condition.value;
            case 'contains':
                return typeof value === 'string' && value.includes(condition.value);
            case 'greater_than':
                return typeof value === 'number' && value > condition.value;
            case 'less_than':
                return typeof value === 'number' && value < condition.value;
            case 'regex':
                return typeof value === 'string' && new RegExp(condition.value).test(value);
            default:
                return false;
        }
    }
    getEventValue(event, field) {
        const parts = field.split('.');
        let value = event;
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            }
            else {
                return undefined;
            }
        }
        return value;
    }
    async executeAlertAction(event, action) {
        switch (action.type) {
            case 'email':
                console.log('EMAIL ALERT:', event);
                break;
            case 'webhook':
                console.log('WEBHOOK ALERT:', event);
                break;
            case 'slack':
                console.log('SLACK ALERT:', event);
                break;
            case 'block_ip':
                this.threatIntel.maliciousIPs.add(event.sourceIP);
                await this.redis.sadd('blocked_ips', event.sourceIP);
                break;
            case 'disable_user':
                if (event.userId) {
                    console.log('DISABLE USER:', event.userId);
                }
                break;
        }
    }
    async detectAnomalies(event) {
        const rateKey = `${this.metricsKeyPrefix}rate:${event.sourceIP}`;
        const requestCount = await this.redis.incr(rateKey);
        await this.redis.expire(rateKey, this.anomalyConfig.windowSize * 60);
        if (requestCount > this.anomalyConfig.thresholds.requestRate) {
            await this.logSecurityEvent({
                type: SecurityEventType.UNUSUAL_TRAFFIC,
                severity: SecuritySeverity.HIGH,
                sourceIP: event.sourceIP,
                userAgent: event.userAgent,
                details: {
                    reason: 'high_request_rate',
                    count: requestCount,
                    threshold: this.anomalyConfig.thresholds.requestRate
                }
            });
        }
        if (event.type === SecurityEventType.SYSTEM_ERROR) {
            const errorKey = `${this.metricsKeyPrefix}errors:${event.sourceIP}`;
            const totalKey = `${this.metricsKeyPrefix}total:${event.sourceIP}`;
            const errorCount = await this.redis.incr(errorKey);
            const totalCount = await this.redis.get(totalKey) || '1';
            const errorRate = errorCount / parseInt(totalCount);
            if (errorRate > this.anomalyConfig.thresholds.errorRate) {
                await this.logSecurityEvent({
                    type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
                    severity: SecuritySeverity.MEDIUM,
                    sourceIP: event.sourceIP,
                    userAgent: event.userAgent,
                    details: {
                        reason: 'high_error_rate',
                        errorRate,
                        threshold: this.anomalyConfig.thresholds.errorRate
                    }
                });
            }
        }
    }
    logToApplication(event) {
        const logData = {
            eventId: event.id,
            type: event.type,
            severity: event.severity,
            sourceIP: event.sourceIP,
            riskScore: event.riskScore,
            blocked: event.blocked,
            details: index_1.SecurityUtils.sanitizeForLog(event.details)
        };
        if (event.severity === SecuritySeverity.CRITICAL) {
            console.error('CRITICAL SECURITY EVENT:', logData);
        }
        else if (event.severity === SecuritySeverity.HIGH) {
            console.warn('HIGH SECURITY EVENT:', logData);
        }
        else {
            console.info('SECURITY EVENT:', logData);
        }
    }
    initializeDefaultRules() {
        this.alertRules.push({
            id: 'multiple-failed-logins',
            name: 'Multiple Failed Login Attempts',
            eventTypes: [SecurityEventType.LOGIN_FAILURE],
            conditions: [
                { field: 'riskScore', operator: 'greater_than', value: 5 }
            ],
            actions: [
                { type: 'email', config: { recipient: 'security@fineprintai.com' } },
                { type: 'block_ip', config: {} }
            ],
            enabled: true,
            cooldownMinutes: 15
        });
        this.alertRules.push({
            id: 'sql-injection',
            name: 'SQL Injection Attempt',
            eventTypes: [SecurityEventType.SQL_INJECTION],
            conditions: [],
            actions: [
                { type: 'email', config: { recipient: 'security@fineprintai.com' } },
                { type: 'webhook', config: { url: 'https://hooks.slack.com/...' } },
                { type: 'block_ip', config: {} }
            ],
            enabled: true,
            cooldownMinutes: 5
        });
        this.alertRules.push({
            id: 'critical-events',
            name: 'Critical Security Events',
            eventTypes: [
                SecurityEventType.PRIVILEGE_ESCALATION,
                SecurityEventType.COMMAND_INJECTION,
                SecurityEventType.UNAUTHORIZED_ACCESS
            ],
            conditions: [
                { field: 'severity', operator: 'equals', value: SecuritySeverity.CRITICAL }
            ],
            actions: [
                { type: 'email', config: { recipient: 'security@fineprintai.com' } },
                { type: 'slack', config: { channel: '#security-alerts' } },
                { type: 'webhook', config: { url: 'https://security.fineprintai.com/webhook' } }
            ],
            enabled: true,
            cooldownMinutes: 1
        });
    }
    startThreatIntelUpdate() {
        setInterval(async () => {
            try {
                await this.updateThreatIntelligence();
            }
            catch (error) {
                console.error('Threat intelligence update failed:', error);
            }
        }, 60 * 60 * 1000);
        this.updateThreatIntelligence();
    }
    async updateThreatIntelligence() {
        const exampleMaliciousIPs = [
            '192.168.1.100',
            '10.0.0.50',
        ];
        for (const ip of exampleMaliciousIPs) {
            this.threatIntel.maliciousIPs.add(ip);
        }
        const suspiciousUserAgents = [
            'sqlmap',
            'nikto',
            'nmap',
            'masscan',
            'w3af',
            'burp',
            'crawler'
        ];
        for (const ua of suspiciousUserAgents) {
            this.threatIntel.suspiciousUserAgents.add(ua);
        }
        for (let i = 0; i < 10; i++) {
            const token = index_1.SecurityUtils.generateSecureRandom(16);
            this.threatIntel.honeypotTokens.add(token);
        }
    }
    async getSecurityMetrics(timeframe = 'hour') {
        const now = new Date();
        let key;
        if (timeframe === 'hour') {
            key = `${this.metricsKeyPrefix}hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        }
        else {
            key = `${this.metricsKeyPrefix}day:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        }
        return this.redis.hgetall(key);
    }
    async getRecentEvents(limit = 100) {
        const keys = await this.redis.keys(`${this.eventKeyPrefix}*`);
        const events = [];
        for (const key of keys.slice(0, limit)) {
            const eventData = await this.redis.get(key);
            if (eventData) {
                events.push(JSON.parse(eventData));
            }
        }
        return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }
}
exports.SecurityMonitor = SecurityMonitor;
function createSecurityMonitor(redisClient) {
    return new SecurityMonitor(redisClient);
}
//# sourceMappingURL=security-monitor.js.map