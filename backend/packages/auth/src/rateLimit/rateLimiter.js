"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRateLimiter = void 0;
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('rate-limiter');
class AuthRateLimiter {
    cache;
    config;
    rules = new Map();
    suspiciousActivityPatterns = [];
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.initializeRules();
        this.initializeSuspiciousActivityPatterns();
    }
    initializeRules() {
        for (const rule of this.config.rules) {
            this.rules.set(rule.id, rule);
        }
        logger.info('Rate limiting rules initialized', {
            ruleCount: this.rules.size
        });
    }
    initializeSuspiciousActivityPatterns() {
        this.suspiciousActivityPatterns = [
            {
                id: 'rapid-fire-requests',
                name: 'Rapid Fire Requests',
                description: 'Too many requests in very short time',
                detector: (attempts) => {
                    const recent = attempts.filter(a => Date.now() - a.timestamp.getTime() < 10000);
                    return recent.length >= 20;
                },
                severity: 'high',
                action: 'block',
                blockDuration: 300000
            },
            {
                id: 'pattern-brute-force',
                name: 'Brute Force Pattern',
                description: 'Systematic password attempts',
                detector: (attempts, context) => {
                    const failed = attempts.filter(a => !a.success);
                    const recent = failed.filter(a => Date.now() - a.timestamp.getTime() < 300000);
                    return recent.length >= 10;
                },
                severity: 'critical',
                action: 'escalate',
                blockDuration: 900000
            },
            {
                id: 'distributed-attack',
                name: 'Distributed Attack',
                description: 'Attack from multiple IPs with same pattern',
                detector: (attempts, context) => {
                    return false;
                },
                severity: 'critical',
                action: 'alert',
                blockDuration: 1800000
            },
            {
                id: 'credential-stuffing',
                name: 'Credential Stuffing',
                description: 'Using leaked credentials',
                detector: (attempts, context) => {
                    const uniqueUserAgents = new Set(attempts.map(a => a.metadata?.userAgent).filter(Boolean));
                    const failureRate = attempts.filter(a => !a.success).length / attempts.length;
                    return uniqueUserAgents.size > 5 && failureRate > 0.8;
                },
                severity: 'high',
                action: 'block',
                blockDuration: 600000
            }
        ];
        logger.info('Suspicious activity patterns initialized', {
            patternCount: this.suspiciousActivityPatterns.length
        });
    }
    async checkRateLimit(request) {
        try {
            const rule = this.findApplicableRule(request);
            if (!rule) {
                return this.createPassInfo(request);
            }
            if (this.shouldSkipRequest(request, rule)) {
                return this.createPassInfo(request, rule);
            }
            const key = this.generateKey(request, rule);
            const bucket = await this.getBucket(key, rule);
            if (bucket.blocked && bucket.blockedUntil && bucket.blockedUntil > new Date()) {
                return this.createBlockedInfo(bucket, rule, key);
            }
            const now = new Date();
            const windowStart = new Date(now.getTime() - rule.windowMs);
            const windowAttempts = bucket.attempts.filter(attempt => attempt.timestamp >= windowStart);
            const currentWeight = windowAttempts.reduce((sum, attempt) => sum + attempt.weight, 0);
            const requestWeight = this.calculateRequestWeight(request, rule);
            if (currentWeight + requestWeight > rule.max) {
                if (rule.blockDuration) {
                    bucket.blocked = true;
                    bucket.blockedUntil = new Date(now.getTime() + rule.blockDuration);
                }
                await this.updateBucket(key, bucket, rule);
                await this.checkSuspiciousActivity(key, bucket, request);
                return this.createLimitExceededInfo(bucket, rule, key, windowAttempts);
            }
            const attempt = {
                timestamp: now,
                success: true,
                weight: requestWeight,
                metadata: {
                    userAgent: request.userAgent,
                    path: request.path,
                    userId: request.userId
                }
            };
            bucket.attempts.push(attempt);
            bucket.totalAttempts++;
            bucket.totalWeight += requestWeight;
            bucket.lastAttempt = now;
            const analysisWindow = Math.max(rule.windowMs * 2, 3600000);
            const analysisStart = new Date(now.getTime() - analysisWindow);
            bucket.attempts = bucket.attempts.filter(a => a.timestamp >= analysisStart);
            await this.updateBucket(key, bucket, rule);
            return this.createAllowedInfo(bucket, rule, key, windowAttempts, requestWeight);
        }
        catch (error) {
            logger.error('Rate limit check failed', { error, request: request.path });
            return this.createPassInfo(request);
        }
    }
    async recordResult(key, success, metadata) {
        try {
            const bucket = await this.cache.get(`rate-limit:${key}`);
            if (!bucket || bucket.attempts.length === 0) {
                return;
            }
            const lastAttempt = bucket.attempts[bucket.attempts.length - 1];
            lastAttempt.success = success;
            if (metadata) {
                lastAttempt.metadata = { ...lastAttempt.metadata, ...metadata };
            }
            const rule = this.rules.get(bucket.rule);
            if (rule) {
                await this.updateBucket(key.replace('rate-limit:', ''), bucket, rule);
            }
            logger.debug('Request result recorded', { key, success });
        }
        catch (error) {
            logger.error('Failed to record request result', { error, key, success });
        }
    }
    async applyDynamicRateLimit(userId, multiplier, duration, reason) {
        try {
            const dynamicLimit = {
                userId,
                multiplier,
                expires: new Date(Date.now() + duration),
                reason
            };
            await this.cache.set(`dynamic-rate-limit:${userId}`, dynamicLimit, Math.floor(duration / 1000));
            logger.info('Dynamic rate limit applied', {
                userId: userId.substring(0, 8) + '...',
                multiplier,
                duration,
                reason
            });
        }
        catch (error) {
            logger.error('Failed to apply dynamic rate limit', { error, userId });
        }
    }
    async removeDynamicRateLimit(userId) {
        try {
            await this.cache.del(`dynamic-rate-limit:${userId}`);
            logger.info('Dynamic rate limit removed', {
                userId: userId.substring(0, 8) + '...'
            });
        }
        catch (error) {
            logger.error('Failed to remove dynamic rate limit', { error, userId });
        }
    }
    async blockIP(ip, duration, reason, severity = 'medium') {
        try {
            const blockInfo = {
                ip,
                reason,
                severity,
                blockedAt: new Date(),
                expiresAt: new Date(Date.now() + duration)
            };
            await this.cache.set(`ip-block:${ip}`, blockInfo, Math.floor(duration / 1000));
            logger.warn('IP address blocked', {
                ip,
                duration,
                reason,
                severity
            });
        }
        catch (error) {
            logger.error('Failed to block IP address', { error, ip });
        }
    }
    async unblockIP(ip) {
        try {
            await this.cache.del(`ip-block:${ip}`);
            logger.info('IP address unblocked', { ip });
        }
        catch (error) {
            logger.error('Failed to unblock IP address', { error, ip });
        }
    }
    async isIPBlocked(ip) {
        try {
            const blockInfo = await this.cache.get(`ip-block:${ip}`);
            return !!blockInfo;
        }
        catch (error) {
            logger.error('Failed to check IP block status', { error, ip });
            return false;
        }
    }
    async getStats() {
        try {
            const bucketKeys = await this.cache.keys('rate-limit:*');
            let totalRequests = 0;
            let blockedRequests = 0;
            const ruleStats = {};
            const ipCounts = {};
            const endpointCounts = {};
            for (const key of bucketKeys) {
                const bucket = await this.cache.get(key);
                if (!bucket)
                    continue;
                totalRequests += bucket.totalAttempts;
                if (bucket.blocked) {
                    blockedRequests++;
                }
                if (!ruleStats[bucket.rule]) {
                    ruleStats[bucket.rule] = { requests: 0, blocked: 0, averageWeight: 0 };
                }
                ruleStats[bucket.rule].requests += bucket.totalAttempts;
                if (bucket.blocked) {
                    ruleStats[bucket.rule].blocked++;
                }
                const totalWeight = bucket.attempts.reduce((sum, a) => sum + a.weight, 0);
                ruleStats[bucket.rule].averageWeight = totalWeight / bucket.attempts.length || 0;
                const keyParts = key.split(':');
                if (keyParts.length >= 3) {
                    const ip = keyParts[keyParts.length - 1];
                    ipCounts[ip] = (ipCounts[ip] || 0) + (bucket.blocked ? 1 : 0);
                }
            }
            const topBlockedIPs = Object.entries(ipCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([ip, count]) => ({ ip, count }));
            const topBlockedEndpoints = Object.entries(ruleStats)
                .sort(([, a], [, b]) => b.blocked - a.blocked)
                .slice(0, 10)
                .map(([endpoint, stats]) => ({ endpoint, count: stats.blocked }));
            return {
                totalRequests,
                blockedRequests,
                ruleStats,
                topBlockedIPs,
                topBlockedEndpoints
            };
        }
        catch (error) {
            logger.error('Failed to get rate limit stats', { error });
            return {
                totalRequests: 0,
                blockedRequests: 0,
                ruleStats: {},
                topBlockedIPs: [],
                topBlockedEndpoints: []
            };
        }
    }
    findApplicableRule(request) {
        for (const rule of this.rules.values()) {
            if (this.matchesRule(request, rule)) {
                return rule;
            }
        }
        return null;
    }
    matchesRule(request, rule) {
        if (typeof rule.endpoint === 'string') {
            if (!request.path.includes(rule.endpoint)) {
                return false;
            }
        }
        else if (rule.endpoint instanceof RegExp) {
            if (!rule.endpoint.test(request.path)) {
                return false;
            }
        }
        if (rule.method) {
            const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
            if (!methods.includes(request.method)) {
                return false;
            }
        }
        if (rule.condition && !rule.condition(request)) {
            return false;
        }
        return true;
    }
    shouldSkipRequest(request, rule) {
        if (this.config.skipFunction && this.config.skipFunction(request)) {
            return true;
        }
        return false;
    }
    generateKey(request, rule) {
        if (rule.keyGenerator) {
            return rule.keyGenerator(request);
        }
        if (this.config.keyGenerator) {
            return this.config.keyGenerator(request);
        }
        const parts = [rule.id];
        if (request.userId) {
            parts.push(`user:${request.userId}`);
        }
        else {
            parts.push(`ip:${request.ip}`);
        }
        return parts.join(':');
    }
    async getBucket(key, rule) {
        const cacheKey = `rate-limit:${key}`;
        let bucket = await this.cache.get(cacheKey);
        if (!bucket) {
            bucket = {
                attempts: [],
                totalAttempts: 0,
                totalWeight: 0,
                blocked: false,
                createdAt: new Date(),
                lastAttempt: new Date(),
                rule: rule.id
            };
        }
        return bucket;
    }
    async updateBucket(key, bucket, rule) {
        const cacheKey = `rate-limit:${key}`;
        const ttl = Math.max(Math.floor(rule.windowMs / 1000), Math.floor((rule.blockDuration || 0) / 1000), 3600);
        await this.cache.set(cacheKey, bucket, ttl);
    }
    calculateRequestWeight(request, rule) {
        let weight = 1;
        if (rule.weights) {
            if (request.path && rule.weights[request.path]) {
                weight = rule.weights[request.path];
            }
            else if (request.method && rule.weights[request.method]) {
                weight = rule.weights[request.method];
            }
        }
        if (request.userId) {
        }
        return weight;
    }
    async checkSuspiciousActivity(key, bucket, request) {
        try {
            for (const pattern of this.suspiciousActivityPatterns) {
                const context = {
                    ip: request.ip,
                    userId: request.userId,
                    path: request.path,
                    userAgent: request.userAgent
                };
                if (pattern.detector(bucket.attempts, context)) {
                    logger.warn('Suspicious activity pattern detected', {
                        pattern: pattern.name,
                        severity: pattern.severity,
                        key,
                        ip: request.ip,
                        userId: request.userId?.substring(0, 8) + '...'
                    });
                    switch (pattern.action) {
                        case 'block':
                            await this.blockIP(request.ip, pattern.blockDuration, pattern.name, pattern.severity);
                            break;
                        case 'alert':
                            logger.error('Security alert triggered', {
                                pattern: pattern.name,
                                severity: pattern.severity,
                                context
                            });
                            break;
                        case 'escalate':
                            await this.blockIP(request.ip, pattern.blockDuration, pattern.name, pattern.severity);
                            logger.error('Security escalation triggered', {
                                pattern: pattern.name,
                                severity: pattern.severity,
                                context
                            });
                            break;
                    }
                    await this.cache.lpush('audit:suspicious-activity', {
                        pattern: pattern.name,
                        severity: pattern.severity,
                        action: pattern.action,
                        context,
                        timestamp: new Date()
                    });
                    break;
                }
            }
        }
        catch (error) {
            logger.error('Failed to check suspicious activity', { error, key });
        }
    }
    createAllowedInfo(bucket, rule, key, windowAttempts, requestWeight) {
        const currentWeight = windowAttempts.reduce((sum, attempt) => sum + attempt.weight, 0);
        const remaining = Math.max(0, rule.max - currentWeight - requestWeight);
        const reset = new Date(Date.now() + rule.windowMs);
        return {
            total: rule.max,
            remaining,
            reset,
            blocked: false,
            rule,
            key
        };
    }
    createBlockedInfo(bucket, rule, key) {
        const retryAfter = bucket.blockedUntil
            ? Math.ceil((bucket.blockedUntil.getTime() - Date.now()) / 1000)
            : Math.ceil(rule.windowMs / 1000);
        return {
            total: rule.max,
            remaining: 0,
            reset: bucket.blockedUntil || new Date(Date.now() + rule.windowMs),
            retryAfter,
            blocked: true,
            rule,
            key
        };
    }
    createLimitExceededInfo(bucket, rule, key, windowAttempts) {
        const retryAfter = rule.blockDuration
            ? Math.ceil(rule.blockDuration / 1000)
            : Math.ceil(rule.windowMs / 1000);
        return {
            total: rule.max,
            remaining: 0,
            reset: new Date(Date.now() + rule.windowMs),
            retryAfter,
            blocked: true,
            rule,
            key
        };
    }
    createPassInfo(request, rule) {
        return {
            total: Infinity,
            remaining: Infinity,
            reset: new Date(Date.now() + 3600000),
            blocked: false,
            rule: rule || {
                id: 'none',
                name: 'No Limit',
                endpoint: request.path,
                windowMs: 3600000,
                max: Infinity
            },
            key: 'pass'
        };
    }
    async performMaintenance() {
        try {
            logger.info('Starting rate limiter maintenance');
            const bucketKeys = await this.cache.keys('rate-limit:*');
            let cleanedBuckets = 0;
            let cleanedAttempts = 0;
            for (const key of bucketKeys) {
                const bucket = await this.cache.get(key);
                if (!bucket)
                    continue;
                const rule = this.rules.get(bucket.rule);
                if (!rule) {
                    await this.cache.del(key);
                    cleanedBuckets++;
                    continue;
                }
                const cutoff = new Date(Date.now() - (rule.windowMs * 2));
                const originalLength = bucket.attempts.length;
                bucket.attempts = bucket.attempts.filter(a => a.timestamp > cutoff);
                if (bucket.attempts.length !== originalLength) {
                    cleanedAttempts += originalLength - bucket.attempts.length;
                    await this.updateBucket(key.replace('rate-limit:', ''), bucket, rule);
                }
                if (bucket.blocked && bucket.blockedUntil && bucket.blockedUntil < new Date()) {
                    bucket.blocked = false;
                    bucket.blockedUntil = undefined;
                    await this.updateBucket(key.replace('rate-limit:', ''), bucket, rule);
                }
            }
            const ipBlockKeys = await this.cache.keys('ip-block:*');
            let cleanedIPBlocks = 0;
            for (const key of ipBlockKeys) {
                const blockInfo = await this.cache.get(key);
                if (blockInfo && blockInfo.expiresAt < new Date()) {
                    await this.cache.del(key);
                    cleanedIPBlocks++;
                }
            }
            logger.info('Rate limiter maintenance completed', {
                cleanedBuckets,
                cleanedAttempts,
                cleanedIPBlocks
            });
        }
        catch (error) {
            logger.error('Rate limiter maintenance failed', { error });
        }
    }
}
exports.AuthRateLimiter = AuthRateLimiter;
//# sourceMappingURL=rateLimiter.js.map