"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('rate-limiter');
class RateLimiter {
    rules = new Map();
    initialized = false;
    constructor() {
        this.setupDefaultRules();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.loadCustomRules();
            this.initialized = true;
            logger.info('Rate limiter initialized successfully', {
                rulesCount: this.rules.size,
                rules: Array.from(this.rules.keys()),
            });
        }
        catch (error) {
            logger.error('Failed to initialize rate limiter', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            const keys = await cache_1.cache.keys('ratelimit:*');
            if (keys.length > 0) {
                await Promise.all(keys.map(key => cache_1.cache.del(key)));
            }
            this.rules.clear();
            this.initialized = false;
            logger.info('Rate limiter shut down successfully');
        }
        catch (error) {
            logger.error('Error during rate limiter shutdown', { error });
        }
    }
    async checkLimit(socket, eventType) {
        try {
            const applicableRules = this.getApplicableRules(socket, eventType);
            for (const rule of applicableRules) {
                const allowed = await this.checkRule(socket, rule, eventType);
                if (!allowed) {
                    logger.debug('Rate limit exceeded', {
                        userId: socket.userId,
                        socketId: socket.id,
                        rule: rule.name,
                        eventType,
                    });
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            logger.error('Error checking rate limit', { error, socketId: socket.id, eventType });
            return true;
        }
    }
    async recordRequest(socket, eventType, success = true) {
        try {
            const applicableRules = this.getApplicableRules(socket, eventType);
            for (const rule of applicableRules) {
                if (success && rule.config.skipSuccessfulRequests)
                    continue;
                if (!success && rule.config.skipFailedRequests)
                    continue;
                await this.recordForRule(socket, rule, eventType);
            }
        }
        catch (error) {
            logger.error('Error recording request', { error, socketId: socket.id, eventType });
        }
    }
    async getRateLimitInfo(socket, ruleName) {
        try {
            const rule = this.rules.get(ruleName);
            if (!rule)
                return null;
            const key = this.generateKey(socket, rule);
            const windowStart = this.getWindowStart(rule.config.windowMs);
            const cacheKey = `${key}:${windowStart}`;
            const hits = await cache_1.cache.get(cacheKey) || 0;
            const remaining = Math.max(0, rule.config.maxRequests - hits);
            const resetTime = windowStart + rule.config.windowMs;
            const msBeforeNext = Math.max(0, resetTime - Date.now());
            return {
                totalHits: hits,
                totalHitsInWindow: hits,
                remainingPoints: remaining,
                msBeforeNext,
                isFirstInWindow: hits === 0,
            };
        }
        catch (error) {
            logger.error('Error getting rate limit info', { error, socketId: socket.id, ruleName });
            return null;
        }
    }
    async resetUserLimits(userId) {
        try {
            const keys = await cache_1.cache.keys(`ratelimit:user:${userId}:*`);
            if (keys.length > 0) {
                await Promise.all(keys.map(key => cache_1.cache.del(key)));
            }
            logger.info('User rate limits reset', { userId, keysCleared: keys.length });
        }
        catch (error) {
            logger.error('Error resetting user limits', { error, userId });
        }
    }
    async getGlobalStats() {
        try {
            const totalRequests = await cache_1.cache.get('ratelimit:global:total') || 0;
            const blockedRequests = await cache_1.cache.get('ratelimit:global:blocked') || 0;
            const userKeys = await cache_1.cache.keys('ratelimit:user:*');
            const ipKeys = await cache_1.cache.keys('ratelimit:ip:*');
            const topUsers = await this.getTopEntries(userKeys, 'user');
            const topIPs = await this.getTopEntries(ipKeys, 'ip');
            return {
                totalRequests,
                blockedRequests,
                topUsers,
                topIPs,
            };
        }
        catch (error) {
            logger.error('Error getting global stats', { error });
            return {
                totalRequests: 0,
                blockedRequests: 0,
                topUsers: [],
                topIPs: [],
            };
        }
    }
    addRule(rule) {
        this.rules.set(rule.name, rule);
        logger.info('Rate limit rule added', { ruleName: rule.name, config: rule.config });
    }
    removeRule(ruleName) {
        const removed = this.rules.delete(ruleName);
        if (removed) {
            logger.info('Rate limit rule removed', { ruleName });
        }
        return removed;
    }
    getRules() {
        return Array.from(this.rules.values());
    }
    setupDefaultRules() {
        this.addRule({
            name: 'connection',
            config: {
                windowMs: 60 * 1000,
                maxRequests: 10,
                keyGenerator: (socket) => `ip:${this.getClientIP(socket)}`,
            },
        });
        this.addRule({
            name: 'messages_regular',
            config: {
                windowMs: 60 * 1000,
                maxRequests: 60,
                keyGenerator: (socket) => `user:${socket.userId}`,
            },
            userTypes: ['free', 'basic'],
        });
        this.addRule({
            name: 'messages_premium',
            config: {
                windowMs: 60 * 1000,
                maxRequests: 120,
                keyGenerator: (socket) => `user:${socket.userId}`,
            },
            userTypes: ['premium', 'enterprise'],
        });
        this.addRule({
            name: 'subscriptions',
            config: {
                windowMs: 5 * 60 * 1000,
                maxRequests: 50,
                keyGenerator: (socket) => `user:${socket.userId}`,
            },
            eventTypes: ['subscribe', 'unsubscribe'],
        });
        this.addRule({
            name: 'analysis_requests',
            config: {
                windowMs: 60 * 1000,
                maxRequests: 10,
                keyGenerator: (socket) => `user:${socket.userId}`,
            },
            eventTypes: ['request_analysis_status', 'start_analysis'],
        });
        this.addRule({
            name: 'global_ip',
            config: {
                windowMs: 60 * 1000,
                maxRequests: 300,
                keyGenerator: (socket) => `ip:${this.getClientIP(socket)}`,
                onLimitReached: (socket, info) => {
                    this.handleGlobalIPLimit(socket, info);
                },
            },
        });
    }
    async loadCustomRules() {
        try {
            const customRules = config_1.config.websocket?.rateLimiting?.customRules || [];
            for (const ruleConfig of customRules) {
                this.addRule(ruleConfig);
            }
            logger.debug('Custom rate limit rules loaded', { count: customRules.length });
        }
        catch (error) {
            logger.error('Error loading custom rules', { error });
        }
    }
    getApplicableRules(socket, eventType) {
        const applicableRules = [];
        for (const rule of this.rules.values()) {
            if (rule.eventTypes && eventType && !rule.eventTypes.includes(eventType)) {
                continue;
            }
            if (rule.userTypes) {
                const userType = this.getUserType(socket);
                if (!rule.userTypes.includes(userType)) {
                    continue;
                }
            }
            applicableRules.push(rule);
        }
        return applicableRules;
    }
    async checkRule(socket, rule, eventType) {
        const key = this.generateKey(socket, rule);
        const windowStart = this.getWindowStart(rule.config.windowMs);
        const cacheKey = `${key}:${windowStart}`;
        try {
            const currentHits = await cache_1.cache.get(cacheKey) || 0;
            if (currentHits >= rule.config.maxRequests) {
                await this.incrementBlockedCounter(socket);
                if (rule.config.onLimitReached) {
                    const info = await this.getRateLimitInfo(socket, rule.name);
                    if (info) {
                        rule.config.onLimitReached(socket, info);
                    }
                }
                return false;
            }
            return true;
        }
        catch (error) {
            logger.error('Error checking rate limit rule', { error, rule: rule.name });
            return true;
        }
    }
    async recordForRule(socket, rule, eventType) {
        const key = this.generateKey(socket, rule);
        const windowStart = this.getWindowStart(rule.config.windowMs);
        const cacheKey = `${key}:${windowStart}`;
        const ttl = Math.ceil(rule.config.windowMs / 1000);
        try {
            await cache_1.cache.increment(cacheKey);
            await cache_1.cache.expire(cacheKey, ttl);
            await cache_1.cache.increment('ratelimit:global:total');
        }
        catch (error) {
            logger.error('Error recording request for rule', { error, rule: rule.name });
        }
    }
    generateKey(socket, rule) {
        if (rule.config.keyGenerator) {
            return `ratelimit:${rule.config.keyGenerator(socket)}`;
        }
        return `ratelimit:user:${socket.userId}`;
    }
    getWindowStart(windowMs) {
        return Math.floor(Date.now() / windowMs) * windowMs;
    }
    getClientIP(socket) {
        return socket.handshake.headers['x-forwarded-for'] ||
            socket.handshake.headers['x-real-ip'] ||
            socket.handshake.address ||
            'unknown';
    }
    getUserType(socket) {
        if (socket.isAdmin)
            return 'admin';
        return 'free';
    }
    async incrementBlockedCounter(socket) {
        try {
            await cache_1.cache.increment('ratelimit:global:blocked');
            await cache_1.cache.increment(`ratelimit:user:${socket.userId}:blocked`);
        }
        catch (error) {
            logger.error('Error incrementing blocked counter', { error });
        }
    }
    async getTopEntries(keys, type) {
        try {
            const entries = [];
            for (const key of keys.slice(0, 100)) {
                const requests = await cache_1.cache.get(key) || 0;
                if (requests > 0) {
                    const identifier = key.split(':')[2];
                    if (type === 'user') {
                        entries.push({ userId: identifier, requests });
                    }
                    else {
                        entries.push({ ip: identifier, requests });
                    }
                }
            }
            return entries
                .sort((a, b) => b.requests - a.requests)
                .slice(0, 10);
        }
        catch (error) {
            logger.error('Error getting top entries', { error, type });
            return [];
        }
    }
    handleGlobalIPLimit(socket, info) {
        const ip = this.getClientIP(socket);
        logger.warn('Global IP rate limit exceeded', {
            ip,
            userId: socket.userId,
            socketId: socket.id,
            totalHits: info.totalHits,
            msBeforeNext: info.msBeforeNext,
        });
    }
    createEventMiddleware() {
        return async (socket, eventType, next) => {
            try {
                const allowed = await this.checkLimit(socket, eventType);
                if (!allowed) {
                    socket.emit('rate_limit_exceeded', {
                        event: eventType,
                        message: 'Rate limit exceeded',
                        retryAfter: 60,
                        timestamp: new Date(),
                    });
                    return;
                }
                await this.recordRequest(socket, eventType, true);
                next();
            }
            catch (error) {
                logger.error('Error in rate limit middleware', { error, socketId: socket.id, eventType });
                next();
            }
        };
    }
    async cleanup() {
        try {
            const keys = await cache_1.cache.keys('ratelimit:*');
            let cleanedCount = 0;
            for (const key of keys) {
                const ttl = await cache_1.cache.ttl(key);
                if (ttl === -1) {
                    await cache_1.cache.del(key);
                    cleanedCount++;
                }
            }
            if (cleanedCount > 0) {
                logger.info('Rate limit cleanup completed', { cleanedKeys: cleanedCount });
            }
        }
        catch (error) {
            logger.error('Error during rate limit cleanup', { error });
        }
    }
}
exports.RateLimiter = RateLimiter;
//# sourceMappingURL=rateLimiter.js.map