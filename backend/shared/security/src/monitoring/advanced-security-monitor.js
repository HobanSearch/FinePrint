"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedSecurityMonitor = void 0;
exports.createAdvancedSecurityMonitor = createAdvancedSecurityMonitor;
const index_1 = require("../index");
class AdvancedSecurityMonitor {
    config;
    redis;
    prisma;
    eventBuffer = [];
    behaviorProfiles = new Map();
    alertQueue = [];
    threatIntelCache = new Map();
    eventCounters = new Map();
    lastAggregation = Date.now();
    suspiciousPatterns = [
        {
            name: 'rapid_auth_failures',
            pattern: (events) => {
                const authFailures = events.filter(e => e.type === 'authentication_failure' &&
                    Date.now() - e.timestamp < 5 * 60 * 1000);
                return authFailures.length > 5;
            },
            severity: 'high',
            description: 'Multiple authentication failures detected'
        },
        {
            name: 'distributed_attack',
            pattern: (events) => {
                const recentEvents = events.filter(e => Date.now() - e.timestamp < 10 * 60 * 1000);
                const uniqueIPs = new Set(recentEvents.map(e => e.source.ip));
                return uniqueIPs.size > 10 && recentEvents.length > 50;
            },
            severity: 'critical',
            description: 'Distributed attack pattern detected'
        },
        {
            name: 'privilege_escalation_sequence',
            pattern: (events) => {
                const escalationEvents = events.filter(e => e.type === 'privilege_escalation_attempt' ||
                    e.type === 'authorization_violation');
                return escalationEvents.length > 3;
            },
            severity: 'high',
            description: 'Privilege escalation sequence detected'
        },
        {
            name: 'data_exfiltration_pattern',
            pattern: (events) => {
                const dataEvents = events.filter(e => e.type === 'data_exfiltration_attempt' &&
                    Date.now() - e.timestamp < 30 * 60 * 1000);
                return dataEvents.length > 2;
            },
            severity: 'critical',
            description: 'Data exfiltration pattern detected'
        }
    ];
    constructor(redis, prisma, config = {}) {
        this.redis = redis;
        this.prisma = prisma;
        this.config = {
            enabled: true,
            realTimeMonitoring: true,
            anomalyDetection: true,
            automaticResponse: true,
            threatIntelligence: true,
            behavioralAnalysis: true,
            alertThresholds: {
                low: 30,
                medium: 50,
                high: 70,
                critical: 90
            },
            retentionDays: 30,
            aggregationWindow: 60000,
            maxEventsPerSecond: 1000,
            ...config
        };
        this.startEventProcessor();
        this.startAnomalyDetector();
        this.startPatternDetector();
        this.startCleanupJob();
    }
    middleware() {
        return async (request, reply) => {
            if (!this.config.enabled) {
                return;
            }
            const startTime = Date.now();
            const source = await this.extractSourceInfo(request);
            const target = this.extractTargetInfo(request);
            const indicators = await this.analyzeRequest(request);
            const riskScore = this.calculateRiskScore(indicators, source, target);
            const baseEvent = {
                id: index_1.SecurityUtils.generateUUID(),
                timestamp: startTime,
                source,
                target,
                riskScore,
                indicators
            };
            reply.addHook('onSend', async (request, reply) => {
                const responseTime = Date.now() - startTime;
                const statusCode = reply.statusCode;
                const securityEvents = await this.detectSecurityEvents(request, reply, baseEvent);
                for (const event of securityEvents) {
                    await this.logSecurityEvent(event);
                }
                if (this.config.behavioralAnalysis && source.userId) {
                    await this.updateBehaviorProfile(source.userId, request, responseTime);
                }
                if (this.config.realTimeMonitoring) {
                    await this.performRealTimeAnalysis(securityEvents);
                }
            });
            request.securityMonitor = {
                startTime,
                riskScore,
                indicators
            };
        };
    }
    async extractSourceInfo(request) {
        const ip = index_1.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        const userId = this.extractUserId(request);
        const sessionId = this.extractSessionId(request);
        const geoLocation = await this.getGeoLocation(ip);
        return {
            ip,
            userAgent,
            userId,
            sessionId,
            geoLocation
        };
    }
    extractTargetInfo(request) {
        return {
            endpoint: request.url,
            method: request.method,
            resource: this.extractResourceId(request)
        };
    }
    async analyzeRequest(request) {
        const indicators = [];
        if (this.config.threatIntelligence) {
            const ip = index_1.SecurityUtils.extractClientIP(request);
            const threatIntel = await this.checkThreatIntelligence(ip);
            indicators.push(...threatIntel);
        }
        const userAgent = request.headers['user-agent'] || '';
        const uaIndicators = this.analyzeUserAgent(userAgent);
        indicators.push(...uaIndicators);
        const patternIndicators = await this.analyzeRequestPatterns(request);
        indicators.push(...patternIndicators);
        const signatureIndicators = this.checkAttackSignatures(request);
        indicators.push(...signatureIndicators);
        return indicators;
    }
    calculateRiskScore(indicators, source, target) {
        let score = 0;
        for (const indicator of indicators) {
            score += indicator.confidence;
        }
        if (source.geoLocation) {
            const highRiskCountries = ['CN', 'RU', 'KP', 'IR'];
            if (highRiskCountries.includes(source.geoLocation.country)) {
                score += 20;
            }
        }
        const sensitiveEndpoints = ['/admin', '/api/admin', '/api/auth', '/api/user'];
        if (sensitiveEndpoints.some(endpoint => target.endpoint.startsWith(endpoint))) {
            score += 15;
        }
        const hour = new Date().getHours();
        if (hour < 6 || hour > 22) {
            score += 10;
        }
        return Math.min(score, 100);
    }
    async detectSecurityEvents(request, reply, baseEvent) {
        const events = [];
        const statusCode = reply.statusCode;
        if (statusCode === 401) {
            events.push({
                ...baseEvent,
                type: 'authentication_failure',
                severity: 'medium',
                details: {
                    statusCode,
                    endpoint: request.url,
                    method: request.method
                }
            });
        }
        if (statusCode === 403) {
            events.push({
                ...baseEvent,
                type: 'authorization_violation',
                severity: 'high',
                details: {
                    statusCode,
                    endpoint: request.url,
                    method: request.method
                }
            });
        }
        if (statusCode === 429) {
            events.push({
                ...baseEvent,
                type: 'rate_limit_exceeded',
                severity: 'medium',
                details: {
                    statusCode,
                    endpoint: request.url,
                    method: request.method
                }
            });
        }
        if (baseEvent.riskScore && baseEvent.riskScore > this.config.alertThresholds.medium) {
            events.push({
                ...baseEvent,
                type: 'suspicious_activity',
                severity: this.getSeverityFromRiskScore(baseEvent.riskScore),
                details: {
                    riskScore: baseEvent.riskScore,
                    indicators: baseEvent.indicators
                }
            });
        }
        return events;
    }
    async logSecurityEvent(event) {
        this.eventBuffer.push(event);
        if (event.severity === 'critical') {
            await this.processCriticalEvent(event);
        }
        const key = `security:events:${event.source.ip}:${Date.now()}`;
        await this.redis.setex(key, 86400, JSON.stringify(event));
        this.incrementEventCounter(event.type, event.source.ip);
    }
    async processCriticalEvent(event) {
        if (this.config.automaticResponse) {
            await this.executeSecurityResponse(event, 'block');
        }
        const alert = {
            id: index_1.SecurityUtils.generateUUID(),
            timestamp: Date.now(),
            severity: event.severity,
            title: `Critical Security Event: ${event.type}`,
            description: `Critical security event detected from ${event.source.ip}`,
            events: [event],
            indicators: event.indicators,
            recommendation: this.generateRecommendation(event),
            acknowledged: false,
            resolved: false
        };
        this.alertQueue.push(alert);
        await this.sendSecurityAlert(alert);
    }
    async executeSecurityResponse(event, action) {
        const response = {
            action,
            timestamp: Date.now(),
            automated: true,
            details: {
                reason: `Automated response to ${event.type}`,
                riskScore: event.riskScore
            }
        };
        switch (action) {
            case 'block':
                await this.blockIP(event.source.ip, 'Automated security response');
                break;
            case 'quarantine':
                await this.quarantineUser(event.source.userId);
                break;
            case 'challenge':
                await this.requireAdditionalAuth(event.source.userId);
                break;
        }
        event.response = response;
    }
    analyzeUserAgent(userAgent) {
        const indicators = [];
        const botPatterns = [
            /bot/i, /crawler/i, /spider/i, /scraper/i,
            /sqlmap/i, /nikto/i, /burp/i, /nmap/i
        ];
        for (const pattern of botPatterns) {
            if (pattern.test(userAgent)) {
                indicators.push({
                    type: 'suspicious_user_agent',
                    value: userAgent,
                    confidence: 60,
                    source: 'user_agent_analysis',
                    description: 'Bot or security tool detected in user agent'
                });
                break;
            }
        }
        if (!userAgent || userAgent.length < 10) {
            indicators.push({
                type: 'minimal_user_agent',
                value: userAgent,
                confidence: 40,
                source: 'user_agent_analysis',
                description: 'Minimal or missing user agent'
            });
        }
        return indicators;
    }
    async checkThreatIntelligence(ip) {
        const indicators = [];
        const cached = this.threatIntelCache.get(ip);
        if (cached) {
            return [cached];
        }
        const threatKey = `threat:ip:${ip}`;
        const threatData = await this.redis.get(threatKey);
        if (threatData) {
            const threat = JSON.parse(threatData);
            const indicator = {
                type: 'malicious_ip',
                value: ip,
                confidence: threat.confidence || 80,
                source: threat.source || 'threat_intelligence',
                description: threat.description || 'Known malicious IP address'
            };
            indicators.push(indicator);
            this.threatIntelCache.set(ip, indicator);
        }
        return indicators;
    }
    async analyzeRequestPatterns(request) {
        const indicators = [];
        const ip = index_1.SecurityUtils.extractClientIP(request);
        const requestCount = await this.getRecentRequestCount(ip);
        if (requestCount > 100) {
            indicators.push({
                type: 'high_request_frequency',
                value: requestCount.toString(),
                confidence: 70,
                source: 'pattern_analysis',
                description: 'Unusually high request frequency detected'
            });
        }
        if (request.url.includes('../') || request.url.includes('..\\')) {
            indicators.push({
                type: 'directory_traversal',
                value: request.url,
                confidence: 90,
                source: 'pattern_analysis',
                description: 'Directory traversal attempt detected'
            });
        }
        const sqlPatterns = /union|select|insert|update|delete|drop|create|alter/i;
        if (sqlPatterns.test(request.url)) {
            indicators.push({
                type: 'sql_injection_attempt',
                value: request.url,
                confidence: 85,
                source: 'pattern_analysis',
                description: 'SQL injection pattern detected in URL'
            });
        }
        return indicators;
    }
    checkAttackSignatures(request) {
        const indicators = [];
        const suspiciousHeaders = {
            'x-forwarded-for': /(<script|javascript:|data:)/i,
            'user-agent': /(sqlmap|nikto|burpsuite|nmap)/i,
            'referer': /(javascript:|data:|vbscript:)/i
        };
        for (const [header, pattern] of Object.entries(suspiciousHeaders)) {
            const value = request.headers[header];
            if (value && pattern.test(value)) {
                indicators.push({
                    type: 'malicious_header',
                    value: `${header}: ${value}`,
                    confidence: 80,
                    source: 'signature_detection',
                    description: `Malicious pattern detected in ${header} header`
                });
            }
        }
        return indicators;
    }
    startEventProcessor() {
        setInterval(async () => {
            if (this.eventBuffer.length === 0)
                return;
            const batchSize = Math.min(this.eventBuffer.length, 100);
            const batch = this.eventBuffer.splice(0, batchSize);
            try {
                if (this.prisma) {
                    await this.storeEventsInDatabase(batch);
                }
                await this.detectAttackPatterns(batch);
            }
            catch (error) {
                console.error('Event processing error:', error);
                this.eventBuffer.unshift(...batch);
            }
        }, this.config.aggregationWindow);
    }
    startAnomalyDetector() {
        if (!this.config.anomalyDetection)
            return;
        setInterval(async () => {
            for (const [userId, profile] of this.behaviorProfiles.entries()) {
                const anomaly = await this.detectBehaviorAnomaly(profile);
                if (anomaly.isAnomaly) {
                    const event = {
                        id: index_1.SecurityUtils.generateUUID(),
                        timestamp: Date.now(),
                        type: 'anomaly_detected',
                        severity: 'medium',
                        source: {
                            ip: 'unknown',
                            userAgent: 'unknown',
                            userId
                        },
                        target: {
                            endpoint: 'user_behavior',
                            method: 'ANALYSIS'
                        },
                        details: {
                            anomalyScore: anomaly.score,
                            reasons: anomaly.reasons,
                            baseline: anomaly.baseline,
                            current: anomaly.current
                        },
                        riskScore: anomaly.score,
                        indicators: [{
                                type: 'behavioral_anomaly',
                                value: userId,
                                confidence: anomaly.score,
                                source: 'anomaly_detection',
                                description: `Behavioral anomaly detected: ${anomaly.reasons.join(', ')}`
                            }]
                    };
                    await this.logSecurityEvent(event);
                }
            }
        }, 5 * 60 * 1000);
    }
    startPatternDetector() {
        setInterval(async () => {
            const recentEvents = await this.getRecentEvents(30 * 60 * 1000);
            for (const patternDef of this.suspiciousPatterns) {
                if (patternDef.pattern(recentEvents)) {
                    const alert = {
                        id: index_1.SecurityUtils.generateUUID(),
                        timestamp: Date.now(),
                        severity: patternDef.severity,
                        title: `Attack Pattern Detected: ${patternDef.name}`,
                        description: patternDef.description,
                        events: recentEvents.filter(e => Date.now() - e.timestamp < 10 * 60 * 1000),
                        indicators: [],
                        recommendation: this.generatePatternRecommendation(patternDef.name),
                        acknowledged: false,
                        resolved: false
                    };
                    this.alertQueue.push(alert);
                    await this.sendSecurityAlert(alert);
                }
            }
        }, 60 * 1000);
    }
    startCleanupJob() {
        setInterval(async () => {
            const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
            const keys = await this.redis.keys('security:events:*');
            const pipeline = this.redis.pipeline();
            for (const key of keys) {
                const timestamp = parseInt(key.split(':').pop() || '0');
                if (timestamp < cutoff) {
                    pipeline.del(key);
                }
            }
            await pipeline.exec();
            for (const [userId, profile] of this.behaviorProfiles.entries()) {
                if (Date.now() - profile.lastUpdated > 24 * 60 * 60 * 1000) {
                    this.behaviorProfiles.delete(userId);
                }
            }
            if (this.threatIntelCache.size > 10000) {
                this.threatIntelCache.clear();
            }
        }, 60 * 60 * 1000);
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
    extractSessionId(request) {
        return undefined;
    }
    extractResourceId(request) {
        const matches = request.url.match(/\/([a-f0-9-]{36})\b/);
        return matches ? matches[1] : undefined;
    }
    async getGeoLocation(ip) {
        return undefined;
    }
    getSeverityFromRiskScore(score) {
        if (score >= this.config.alertThresholds.critical)
            return 'critical';
        if (score >= this.config.alertThresholds.high)
            return 'high';
        if (score >= this.config.alertThresholds.medium)
            return 'medium';
        return 'low';
    }
    incrementEventCounter(eventType, ip) {
        const key = `${eventType}:${ip}`;
        const current = this.eventCounters.get(key) || 0;
        this.eventCounters.set(key, current + 1);
    }
    async getRecentRequestCount(ip) {
        const key = `requests:${ip}`;
        const count = await this.redis.get(key);
        return count ? parseInt(count, 10) : 0;
    }
    async getRecentEvents(timeWindow) {
        return [];
    }
    async detectBehaviorAnomaly(profile) {
        return {
            isAnomaly: false,
            score: 0,
            reasons: [],
            baseline: {},
            current: {}
        };
    }
    async updateBehaviorProfile(userId, request, responseTime) {
    }
    async performRealTimeAnalysis(events) {
    }
    async storeEventsInDatabase(events) {
    }
    async detectAttackPatterns(events) {
    }
    async blockIP(ip, reason) {
        const key = `security:blocked:${ip}`;
        await this.redis.setex(key, 3600, JSON.stringify({ reason, timestamp: Date.now() }));
    }
    async quarantineUser(userId) {
        if (!userId)
            return;
    }
    async requireAdditionalAuth(userId) {
        if (!userId)
            return;
    }
    generateRecommendation(event) {
        switch (event.type) {
            case 'authentication_failure':
                return 'Consider implementing account lockout policies and MFA';
            case 'sql_injection_attempt':
                return 'Review input validation and use parameterized queries';
            case 'xss_attempt':
                return 'Implement proper output encoding and CSP headers';
            default:
                return 'Review security policies and monitoring rules';
        }
    }
    generatePatternRecommendation(patternName) {
        switch (patternName) {
            case 'rapid_auth_failures':
                return 'Implement progressive delays and account lockouts';
            case 'distributed_attack':
                return 'Consider rate limiting and DDoS protection';
            default:
                return 'Investigate and implement appropriate countermeasures';
        }
    }
    async sendSecurityAlert(alert) {
        console.log('Security Alert:', alert.title);
    }
    getStatistics() {
        return {
            eventsBuffered: this.eventBuffer.length,
            behaviorProfiles: this.behaviorProfiles.size,
            pendingAlerts: this.alertQueue.length,
            threatIntelEntries: this.threatIntelCache.size,
            config: this.config
        };
    }
    getRecentAlerts(count = 10) {
        return this.alertQueue.slice(-count);
    }
    acknowledgeAlert(alertId) {
        const alert = this.alertQueue.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            return true;
        }
        return false;
    }
}
exports.AdvancedSecurityMonitor = AdvancedSecurityMonitor;
function createAdvancedSecurityMonitor(redis, prisma, config) {
    return new AdvancedSecurityMonitor(redis, prisma, config);
}
//# sourceMappingURL=advanced-security-monitor.js.map