"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cache = void 0;
const node_cache_1 = __importDefault(require("node-cache"));
const ioredis_1 = require("ioredis");
const logger_1 = require("./logger");
const config_1 = require("@/config");
class Cache {
    logger = logger_1.Logger.getInstance();
    nodeCache;
    redis;
    prefix;
    useRedis;
    constructor(namespace = 'default', options = {}) {
        this.prefix = `${config_1.config.redis.keyPrefix}${namespace}:`;
        this.useRedis = options.useRedis || false;
        this.nodeCache = new node_cache_1.default({
            stdTTL: options.ttl || config_1.config.redis.ttl,
            checkperiod: options.checkPeriod || 600,
            useClones: false,
        });
        if (this.useRedis && config_1.config.redis.url) {
            this.initializeRedis();
        }
    }
    initializeRedis() {
        try {
            this.redis = new ioredis_1.Redis(config_1.config.redis.url, {
                keyPrefix: this.prefix,
                maxRetriesPerRequest: config_1.config.redis.maxRetriesPerRequest,
                retryDelayOnFailover: config_1.config.redis.retryDelayOnFailover,
                lazyConnect: true,
            });
            this.redis.on('connect', () => {
                this.logger.debug('Redis connected', { prefix: this.prefix });
            });
            this.redis.on('error', (error) => {
                this.logger.error('Redis error', { error: error.message, prefix: this.prefix });
            });
            this.redis.on('close', () => {
                this.logger.warn('Redis connection closed', { prefix: this.prefix });
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize Redis', { error: error.message });
            this.useRedis = false;
        }
    }
    async get(key) {
        try {
            const localValue = this.nodeCache.get(key);
            if (localValue !== undefined) {
                this.logger.trace('Cache hit (local)', { key });
                return localValue;
            }
            if (this.redis && this.useRedis) {
                const redisValue = await this.redis.get(key);
                if (redisValue) {
                    const parsedValue = JSON.parse(redisValue);
                    this.nodeCache.set(key, parsedValue);
                    this.logger.trace('Cache hit (redis)', { key });
                    return parsedValue;
                }
            }
            this.logger.trace('Cache miss', { key });
            return null;
        }
        catch (error) {
            this.logger.warn('Cache get error', { key, error: error.message });
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            const effectiveTtl = ttl || config_1.config.redis.ttl;
            this.nodeCache.set(key, value, effectiveTtl);
            if (this.redis && this.useRedis) {
                const serialized = JSON.stringify(value);
                if (effectiveTtl > 0) {
                    await this.redis.setex(key, effectiveTtl, serialized);
                }
                else {
                    await this.redis.set(key, serialized);
                }
            }
            this.logger.trace('Cache set', { key, ttl: effectiveTtl });
        }
        catch (error) {
            this.logger.warn('Cache set error', { key, error: error.message });
        }
    }
    async delete(key) {
        try {
            this.nodeCache.del(key);
            if (this.redis && this.useRedis) {
                await this.redis.del(key);
            }
            this.logger.trace('Cache delete', { key });
        }
        catch (error) {
            this.logger.warn('Cache delete error', { key, error: error.message });
        }
    }
    async has(key) {
        try {
            if (this.nodeCache.has(key)) {
                return true;
            }
            if (this.redis && this.useRedis) {
                const exists = await this.redis.exists(key);
                return exists === 1;
            }
            return false;
        }
        catch (error) {
            this.logger.warn('Cache has error', { key, error: error.message });
            return false;
        }
    }
    async clear(pattern) {
        try {
            if (!pattern || pattern === '*') {
                this.nodeCache.flushAll();
                if (this.redis && this.useRedis) {
                    const keys = await this.redis.keys('*');
                    if (keys.length > 0) {
                        await this.redis.del(...keys);
                    }
                }
                this.logger.debug('Cache cleared (all)', { prefix: this.prefix });
            }
            else {
                const localKeys = this.nodeCache.keys();
                const matchingLocalKeys = localKeys.filter(key => this.matchesPattern(key, pattern));
                this.nodeCache.del(matchingLocalKeys);
                if (this.redis && this.useRedis) {
                    const redisKeys = await this.redis.keys(pattern);
                    if (redisKeys.length > 0) {
                        await this.redis.del(...redisKeys);
                    }
                }
                this.logger.debug('Cache cleared (pattern)', { pattern, prefix: this.prefix });
            }
        }
        catch (error) {
            this.logger.warn('Cache clear error', { pattern, error: error.message });
        }
    }
    getStats() {
        const localStats = this.nodeCache.getStats();
        const stats = {
            local: localStats,
        };
        if (this.redis && this.useRedis) {
            stats.redis = {
                connected: this.redis.status === 'ready',
            };
        }
        return stats;
    }
    async keys(pattern = '*') {
        try {
            const allKeys = new Set();
            const localKeys = this.nodeCache.keys();
            localKeys.forEach(key => {
                if (this.matchesPattern(key, pattern)) {
                    allKeys.add(key);
                }
            });
            if (this.redis && this.useRedis) {
                const redisKeys = await this.redis.keys(pattern);
                redisKeys.forEach(key => allKeys.add(key));
            }
            return Array.from(allKeys);
        }
        catch (error) {
            this.logger.warn('Cache keys error', { pattern, error: error.message });
            return [];
        }
    }
    async mset(keyValuePairs) {
        try {
            const promises = keyValuePairs.map(({ key, value, ttl }) => this.set(key, value, ttl));
            await Promise.all(promises);
            this.logger.trace('Cache mset', { count: keyValuePairs.length });
        }
        catch (error) {
            this.logger.warn('Cache mset error', { error: error.message });
        }
    }
    async mget(keys) {
        try {
            const promises = keys.map(key => this.get(key));
            const results = await Promise.all(promises);
            this.logger.trace('Cache mget', { count: keys.length });
            return results;
        }
        catch (error) {
            this.logger.warn('Cache mget error', { error: error.message });
            return new Array(keys.length).fill(null);
        }
    }
    async increment(key, delta = 1) {
        try {
            let currentValue = await this.get(key) || 0;
            currentValue += delta;
            await this.set(key, currentValue);
            this.logger.trace('Cache increment', { key, delta, newValue: currentValue });
            return currentValue;
        }
        catch (error) {
            this.logger.warn('Cache increment error', { key, error: error.message });
            return 0;
        }
    }
    async expire(key, ttl) {
        try {
            const value = await this.get(key);
            if (value !== null) {
                await this.set(key, value, ttl);
            }
            this.logger.trace('Cache expire', { key, ttl });
        }
        catch (error) {
            this.logger.warn('Cache expire error', { key, error: error.message });
        }
    }
    async ttl(key) {
        try {
            if (this.redis && this.useRedis) {
                return await this.redis.ttl(key);
            }
            return this.nodeCache.has(key) ? -1 : -2;
        }
        catch (error) {
            this.logger.warn('Cache ttl error', { key, error: error.message });
            return -2;
        }
    }
    async close() {
        try {
            this.nodeCache.close();
            if (this.redis) {
                await this.redis.quit();
            }
            this.logger.debug('Cache connections closed', { prefix: this.prefix });
        }
        catch (error) {
            this.logger.warn('Cache close error', { error: error.message });
        }
    }
    matchesPattern(str, pattern) {
        if (pattern === '*')
            return true;
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(str);
    }
}
exports.Cache = Cache;
//# sourceMappingURL=cache.js.map