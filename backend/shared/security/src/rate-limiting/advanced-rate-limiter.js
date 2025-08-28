"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedRateLimiter = void 0;
exports.createRateLimiter = createRateLimiter;
const index_1 = require("../index");
class AdvancedRateLimiter {
    redis;
    rules = [];
    threatMetrics;
    keyPrefix = 'ratelimit:';
    threatKeyPrefix = 'threat:';
    constructor(redisClient) {
        this.redis = redisClient;
        this.threatMetrics = {
            suspiciousIPs: new Set(),
            blockedIPs: new Set(),
            rateLimitViolations: new Map(),
            lastViolation: new Map()
        };
        this.initializeDefaultRules();
        this.startCleanupJob();
    }
    addRule(rule) {
        const insertIndex = this.rules.findIndex(r => r.priority > rule.priority);
        if (insertIndex === -1) {
            this.rules.push(rule);
        }
        else {
            this.rules.splice(insertIndex, 0, rule);
        }
    }
    middleware() {
        return async (request, reply) => {
            const applicableRules = this.findApplicableRules(request);
            const clientIP = index_1.SecurityUtils.extractClientIP(request);
            if (this.threatMetrics.blockedIPs.has(clientIP)) {
                throw new index_1.RateLimitError('IP address is blocked due to suspicious activity');
            }
            for (const rule of applicableRules) {
                await this.applyRule(request, reply, rule);
            }
            await this.updateThreatMetrics(clientIP, false);
        };
    }
    async applyRule(request, reply, rule) {
        const key = this.generateKey(request, rule);
        const now = Date.now();
        const windowStart = now - rule.config.windowMs;
        try {
            const result = await this.slidingWindowCheck(key, rule.config.maxRequests, rule.config.windowMs, now);
            const rateLimitInfo = {
                limit: rule.config.maxRequests,
                remaining: Math.max(0, rule.config.maxRequests - result.count),
                reset: new Date(result.windowStart + rule.config.windowMs),
                retryAfter: result.count >= rule.config.maxRequests
                    ? Math.ceil((result.windowStart + rule.config.windowMs - now) / 1000)
                    : undefined
            };
            if (rule.config.standardHeaders !== false) {
                reply.header('RateLimit-Limit', rateLimitInfo.limit.toString());
                reply.header('RateLimit-Remaining', rateLimitInfo.remaining.toString());
                reply.header('RateLimit-Reset', Math.ceil(rateLimitInfo.reset.getTime() / 1000).toString());
            }
            if (rule.config.legacyHeaders) {
                reply.header('X-RateLimit-Limit', rateLimitInfo.limit.toString());
                reply.header('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
                reply.header('X-RateLimit-Reset', Math.ceil(rateLimitInfo.reset.getTime() / 1000).toString());
            }
            if (result.count > rule.config.maxRequests) {
                const clientIP = index_1.SecurityUtils.extractClientIP(request);
                await this.updateThreatMetrics(clientIP, true);
                if (rule.config.onLimitReached) {
                    rule.config.onLimitReached(request);
                }
                if (rateLimitInfo.retryAfter) {
                    reply.header('Retry-After', rateLimitInfo.retryAfter.toString());
                }
                request.log.warn('Rate limit exceeded', {
                    rule: rule.name,
                    clientIP,
                    userAgent: request.headers['user-agent'],
                    path: request.url,
                    method: request.method,
                    count: result.count,
                    limit: rule.config.maxRequests
                });
                throw new index_1.RateLimitError(rule.config.message || 'Too many requests');
            }
        }
        catch (error) {
            if (error instanceof index_1.RateLimitError) {
                throw error;
            }
            request.log.error('Rate limiter error', { error, rule: rule.name });
        }
    }
    async slidingWindowCheck(key, limit, windowMs, now) {
        const windowStart = now - windowMs;
        const redisKey = `${this.keyPrefix}${key}`;
        const luaScript = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local window_ms = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local limit = tonumber(ARGV[4])
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      
      -- Get current count
      local count = redis.call('ZCARD', key)
      
      -- Add current request
      redis.call('ZADD', key, now, now .. ':' .. math.random())
      
      -- Set expiration
      redis.call('EXPIRE', key, math.ceil(window_ms / 1000))
      
      -- Return count and window info
      return {count + 1, window_start}
    `;
        const result = await this.redis.eval(luaScript, 1, redisKey, windowStart.toString(), windowMs.toString(), now.toString(), limit.toString());
        return {
            count: result[0],
            windowStart: result[1],
            requests: []
        };
    }
    generateKey(request, rule) {
        if (rule.config.keyGenerator) {
            return rule.config.keyGenerator(request);
        }
        const clientIP = index_1.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        const userAgentHash = require('crypto')
            .createHash('md5')
            .update(userAgent)
            .digest('hex')
            .substring(0, 8);
        return `${rule.name}:${clientIP}:${userAgentHash}`;
    }
    findApplicableRules(request) {
        return this.rules.filter(rule => {
            if (rule.path) {
                if (typeof rule.path === 'string') {
                    if (!request.url.startsWith(rule.path))
                        return false;
                }
                else if (rule.path instanceof RegExp) {
                    if (!rule.path.test(request.url))
                        return false;
                }
            }
            if (rule.method) {
                const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
                if (!methods.includes(request.method))
                    return false;
            }
            if (rule.condition && !rule.condition(request)) {
                return false;
            }
            return true;
        });
    }
    async updateThreatMetrics(clientIP, isViolation) {
        const now = Date.now();
        if (isViolation) {
            const currentCount = this.threatMetrics.rateLimitViolations.get(clientIP) || 0;
            this.threatMetrics.rateLimitViolations.set(clientIP, currentCount + 1);
            this.threatMetrics.lastViolation.set(clientIP, now);
            if (currentCount >= 3) {
                this.threatMetrics.suspiciousIPs.add(clientIP);
            }
            if (currentCount >= 10) {
                this.threatMetrics.blockedIPs.add(clientIP);
                await this.redis.setex(`${this.threatKeyPrefix}blocked:${clientIP}`, 3600, now.toString());
            }
        }
    }
    initializeDefaultRules() {
        this.addRule({
            name: 'global',
            config: {
                windowMs: 15 * 60 * 1000,
                maxRequests: 1000,
                message: 'Too many requests from this IP'
            },
            priority: 1000
        });
        this.addRule({
            name: 'api',
            path: '/api',
            config: {
                windowMs: 60 * 1000,
                maxRequests: 100,
                message: 'API rate limit exceeded'
            },
            priority: 900
        });
        this.addRule({
            name: 'auth',
            path: '/api/auth',
            config: {
                windowMs: 15 * 60 * 1000,
                maxRequests: 10,
                message: 'Too many authentication attempts'
            },
            priority: 100
        });
        this.addRule({
            name: 'login',
            path: '/api/auth/login',
            method: 'POST',
            config: {
                windowMs: 15 * 60 * 1000,
                maxRequests: 5,
                message: 'Too many login attempts'
            },
            priority: 50
        });
        this.addRule({
            name: 'password-reset',
            path: '/api/auth/reset-password',
            method: 'POST',
            config: {
                windowMs: 60 * 60 * 1000,
                maxRequests: 3,
                message: 'Too many password reset attempts'
            },
            priority: 50
        });
        this.addRule({
            name: 'analysis',
            path: '/api/analysis',
            method: 'POST',
            config: {
                windowMs: 60 * 60 * 1000,
                maxRequests: 50,
                message: 'Analysis rate limit exceeded'
            },
            priority: 200
        });
        this.addRule({
            name: 'upload',
            path: '/api/documents/upload',
            method: 'POST',
            config: {
                windowMs: 60 * 60 * 1000,
                maxRequests: 20,
                message: 'Upload rate limit exceeded'
            },
            priority: 200
        });
    }
    async getRateLimitStatus(request) {
        const applicableRules = this.findApplicableRules(request);
        const status = {};
        for (const rule of applicableRules) {
            const key = this.generateKey(request, rule);
            const now = Date.now();
            try {
                const result = await this.slidingWindowCheck(key, rule.config.maxRequests, rule.config.windowMs, now);
                status[rule.name] = {
                    limit: rule.config.maxRequests,
                    remaining: Math.max(0, rule.config.maxRequests - result.count),
                    reset: new Date(result.windowStart + rule.config.windowMs)
                };
            }
            catch (error) {
            }
        }
        return status;
    }
    async blockIP(ip, durationMs = 3600000) {
        this.threatMetrics.blockedIPs.add(ip);
        await this.redis.setex(`${this.threatKeyPrefix}blocked:${ip}`, Math.ceil(durationMs / 1000), Date.now().toString());
    }
    async unblockIP(ip) {
        this.threatMetrics.blockedIPs.delete(ip);
        this.threatMetrics.suspiciousIPs.delete(ip);
        this.threatMetrics.rateLimitViolations.delete(ip);
        this.threatMetrics.lastViolation.delete(ip);
        await this.redis.del(`${this.threatKeyPrefix}blocked:${ip}`);
    }
    getThreatMetrics() {
        return {
            suspiciousIPs: new Set(this.threatMetrics.suspiciousIPs),
            blockedIPs: new Set(this.threatMetrics.blockedIPs),
            rateLimitViolations: new Map(this.threatMetrics.rateLimitViolations),
            lastViolation: new Map(this.threatMetrics.lastViolation)
        };
    }
    async resetRateLimit(key) {
        await this.redis.del(`${this.keyPrefix}${key}`);
    }
    startCleanupJob() {
        setInterval(async () => {
            try {
                const blockedKeys = await this.redis.keys(`${this.threatKeyPrefix}blocked:*`);
                const pipeline = this.redis.pipeline();
                for (const key of blockedKeys) {
                    const ttl = await this.redis.ttl(key);
                    if (ttl <= 0) {
                        const ip = key.replace(`${this.threatKeyPrefix}blocked:`, '');
                        this.threatMetrics.blockedIPs.delete(ip);
                        pipeline.del(key);
                    }
                }
                await pipeline.exec();
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                for (const [ip, lastViolation] of this.threatMetrics.lastViolation.entries()) {
                    if (lastViolation < oneHourAgo) {
                        this.threatMetrics.rateLimitViolations.delete(ip);
                        this.threatMetrics.lastViolation.delete(ip);
                        this.threatMetrics.suspiciousIPs.delete(ip);
                    }
                }
            }
            catch (error) {
                console.error('Rate limiter cleanup error:', error);
            }
        }, 5 * 60 * 1000);
    }
    createIPLimiter(config) {
        return async (request, reply) => {
            const rule = {
                name: 'custom-ip-limiter',
                config: {
                    ...config,
                    keyGenerator: config.keyGenerator || ((req) => index_1.SecurityUtils.extractClientIP(req))
                },
                priority: 500
            };
            await this.applyRule(request, reply, rule);
        };
    }
    createUserLimiter(config) {
        return async (request, reply) => {
            const rule = {
                name: 'custom-user-limiter',
                config: {
                    ...config,
                    keyGenerator: config.keyGenerator || ((req) => {
                        const authHeader = req.headers.authorization;
                        if (authHeader) {
                            try {
                                const token = authHeader.split(' ')[1];
                                const jwt = require('jsonwebtoken');
                                const decoded = jwt.decode(token);
                                return decoded?.sub || index_1.SecurityUtils.extractClientIP(req);
                            }
                            catch {
                                return index_1.SecurityUtils.extractClientIP(req);
                            }
                        }
                        return index_1.SecurityUtils.extractClientIP(req);
                    })
                },
                priority: 500
            };
            await this.applyRule(request, reply, rule);
        };
    }
}
exports.AdvancedRateLimiter = AdvancedRateLimiter;
function createRateLimiter(redisClient) {
    return new AdvancedRateLimiter(redisClient);
}
//# sourceMappingURL=advanced-rate-limiter.js.map