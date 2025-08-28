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
exports.CachePerformanceUtils = exports.CacheManager = exports.rateLimitCache = exports.apiCache = exports.analysisCache = exports.sessionCache = exports.cache = exports.MetricsCollector = exports.InvalidationManager = exports.PubSubUtils = exports.PubSubCoordinator = exports.LockUtils = exports.DistributedLockManager = exports.compressionPresets = exports.CompressionManager = exports.L1Cache = exports.CacheConfigFactory = exports.EnhancedCacheManager = void 0;
var enhanced_cache_manager_1 = require("./enhanced-cache-manager");
Object.defineProperty(exports, "EnhancedCacheManager", { enumerable: true, get: function () { return enhanced_cache_manager_1.EnhancedCacheManager; } });
var config_factory_1 = require("./config-factory");
Object.defineProperty(exports, "CacheConfigFactory", { enumerable: true, get: function () { return config_factory_1.CacheConfigFactory; } });
var l1_cache_1 = require("./l1-cache");
Object.defineProperty(exports, "L1Cache", { enumerable: true, get: function () { return l1_cache_1.L1Cache; } });
var compression_1 = require("./compression");
Object.defineProperty(exports, "CompressionManager", { enumerable: true, get: function () { return compression_1.CompressionManager; } });
Object.defineProperty(exports, "compressionPresets", { enumerable: true, get: function () { return compression_1.compressionPresets; } });
var distributed_lock_1 = require("./distributed-lock");
Object.defineProperty(exports, "DistributedLockManager", { enumerable: true, get: function () { return distributed_lock_1.DistributedLockManager; } });
Object.defineProperty(exports, "LockUtils", { enumerable: true, get: function () { return distributed_lock_1.LockUtils; } });
var pubsub_coordinator_1 = require("./pubsub-coordinator");
Object.defineProperty(exports, "PubSubCoordinator", { enumerable: true, get: function () { return pubsub_coordinator_1.PubSubCoordinator; } });
Object.defineProperty(exports, "PubSubUtils", { enumerable: true, get: function () { return pubsub_coordinator_1.PubSubUtils; } });
var invalidation_manager_1 = require("./invalidation-manager");
Object.defineProperty(exports, "InvalidationManager", { enumerable: true, get: function () { return invalidation_manager_1.InvalidationManager; } });
var metrics_collector_1 = require("./metrics-collector");
Object.defineProperty(exports, "MetricsCollector", { enumerable: true, get: function () { return metrics_collector_1.MetricsCollector; } });
__exportStar(require("./types"), exports);
const logger_1 = require("@fineprintai/logger");
const enhanced_cache_manager_2 = require("./enhanced-cache-manager");
const config_factory_2 = require("./config-factory");
const logger = (0, logger_1.createServiceLogger)('cache');
exports.cache = new enhanced_cache_manager_2.EnhancedCacheManager(config_factory_2.CacheConfigFactory.createFromEnv());
exports.sessionCache = new enhanced_cache_manager_2.EnhancedCacheManager(config_factory_2.CacheConfigFactory.createSpecialized('session'));
exports.analysisCache = new enhanced_cache_manager_2.EnhancedCacheManager(config_factory_2.CacheConfigFactory.createSpecialized('analysis'));
exports.apiCache = new enhanced_cache_manager_2.EnhancedCacheManager(config_factory_2.CacheConfigFactory.createSpecialized('api'));
exports.rateLimitCache = new enhanced_cache_manager_2.EnhancedCacheManager(config_factory_2.CacheConfigFactory.createSpecialized('ratelimit'));
Promise.all([
    exports.cache.initialize(),
    exports.sessionCache.initialize(),
    exports.analysisCache.initialize(),
    exports.apiCache.initialize(),
    exports.rateLimitCache.initialize()
]).then(() => {
    logger.info('All cache instances initialized successfully');
}).catch(error => {
    logger.error('Failed to initialize cache instances', { error });
});
class CacheManager {
    enhanced;
    initialized = false;
    constructor(prefix = 'fpa') {
        const config = config_factory_2.CacheConfigFactory.createFromEnv();
        config.l2.keyPrefix = prefix;
        this.enhanced = new enhanced_cache_manager_2.EnhancedCacheManager(config, prefix);
        this.enhanced.initialize().then(() => {
            this.initialized = true;
        }).catch(error => {
            logger.error('Failed to initialize legacy cache manager', { error, prefix });
        });
    }
    async ensureInitialized() {
        if (!this.initialized) {
            await this.enhanced.initialize();
            this.initialized = true;
        }
    }
    async get(key) {
        await this.ensureInitialized();
        return this.enhanced.get(key);
    }
    async set(key, value, ttlSeconds) {
        await this.ensureInitialized();
        return this.enhanced.set(key, value, { ttl: ttlSeconds });
    }
    async del(key) {
        await this.ensureInitialized();
        return this.enhanced.delete(key);
    }
    async exists(key) {
        await this.ensureInitialized();
        return this.enhanced.exists(key);
    }
    async expire(key, ttlSeconds) {
        await this.ensureInitialized();
        const currentValue = await this.enhanced.get(key);
        if (currentValue !== null) {
            return this.enhanced.set(key, currentValue, { ttl: ttlSeconds });
        }
        return false;
    }
    async ttl(key) {
        await this.ensureInitialized();
        return -1;
    }
    async mget(keys) {
        await this.ensureInitialized();
        return this.enhanced.mget(keys);
    }
    async mset(keyValuePairs, ttlSeconds) {
        await this.ensureInitialized();
        return this.enhanced.mset(keyValuePairs, { ttl: ttlSeconds });
    }
    async increment(key, by = 1) {
        await this.ensureInitialized();
        const current = await this.enhanced.get(key) || 0;
        const newValue = current + by;
        await this.enhanced.set(key, newValue);
        return newValue;
    }
    async decrement(key, by = 1) {
        return this.increment(key, -by);
    }
    async keys(pattern) {
        await this.ensureInitialized();
        logger.warn('keys() method is not optimized for production use');
        return [];
    }
    async deleteByPattern(pattern) {
        await this.ensureInitialized();
        return this.enhanced.invalidateByPattern(pattern);
    }
    async hget(hash, field) {
        await this.ensureInitialized();
        const hashData = await this.enhanced.get(hash);
        return hashData ? hashData[field] : null;
    }
    async hset(hash, field, value) {
        await this.ensureInitialized();
        const hashData = await this.enhanced.get(hash) || {};
        hashData[field] = value;
        return this.enhanced.set(hash, hashData);
    }
    async hgetall(hash) {
        await this.ensureInitialized();
        return await this.enhanced.get(hash) || {};
    }
    async hdel(hash, field) {
        await this.ensureInitialized();
        const hashData = await this.enhanced.get(hash);
        if (hashData && field in hashData) {
            delete hashData[field];
            await this.enhanced.set(hash, hashData);
            return true;
        }
        return false;
    }
    async lpush(list, ...values) {
        await this.ensureInitialized();
        const listData = await this.enhanced.get(list) || [];
        listData.unshift(...values);
        await this.enhanced.set(list, listData);
        return listData.length;
    }
    async rpush(list, ...values) {
        await this.ensureInitialized();
        const listData = await this.enhanced.get(list) || [];
        listData.push(...values);
        await this.enhanced.set(list, listData);
        return listData.length;
    }
    async lpop(list) {
        await this.ensureInitialized();
        const listData = await this.enhanced.get(list);
        if (listData && listData.length > 0) {
            const value = listData.shift();
            await this.enhanced.set(list, listData);
            return value;
        }
        return null;
    }
    async rpop(list) {
        await this.ensureInitialized();
        const listData = await this.enhanced.get(list);
        if (listData && listData.length > 0) {
            const value = listData.pop();
            await this.enhanced.set(list, listData);
            return value;
        }
        return null;
    }
    async lrange(list, start, stop) {
        await this.ensureInitialized();
        const listData = await this.enhanced.get(list) || [];
        return listData.slice(start, stop + 1);
    }
    async sadd(set, ...members) {
        await this.ensureInitialized();
        const setData = new Set(await this.enhanced.get(set) || []);
        let added = 0;
        for (const member of members) {
            if (!setData.has(member)) {
                setData.add(member);
                added++;
            }
        }
        await this.enhanced.set(set, Array.from(setData));
        return added;
    }
    async srem(set, ...members) {
        await this.ensureInitialized();
        const setData = new Set(await this.enhanced.get(set) || []);
        let removed = 0;
        for (const member of members) {
            if (setData.has(member)) {
                setData.delete(member);
                removed++;
            }
        }
        await this.enhanced.set(set, Array.from(setData));
        return removed;
    }
    async smembers(set) {
        await this.ensureInitialized();
        return await this.enhanced.get(set) || [];
    }
    async sismember(set, member) {
        await this.ensureInitialized();
        const setData = await this.enhanced.get(set) || [];
        return setData.includes(member);
    }
    async publish(channel, message) {
        logger.warn('publish() method requires pub/sub coordinator setup');
        return 0;
    }
    async ping() {
        await this.ensureInitialized();
        const health = await this.enhanced.healthCheck();
        return health.healthy;
    }
    async disconnect() {
        if (this.initialized) {
            return this.enhanced.disconnect();
        }
    }
    getRawClient() {
        return this.enhanced.redis;
    }
    getEnhanced() {
        return this.enhanced;
    }
}
exports.CacheManager = CacheManager;
exports.default = exports.cache;
class CachePerformanceUtils {
    static async measureOperation(operation, operationName) {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;
        logger.performance(`cache.${operationName}`, duration);
        return { result, duration };
    }
    static async batchGet(cacheManager, keys, batchSize = 100) {
        const results = new Map();
        for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            const batchResults = await cacheManager.mget(batch);
            batch.forEach((key, index) => {
                results.set(key, batchResults[index]);
            });
        }
        return results;
    }
    static async warmupFrequentlyAccessed(cacheManager, dataLoader, frequentKeys) {
        try {
            const data = await dataLoader(frequentKeys);
            const success = await cacheManager.mset(data, {
                ttl: 3600,
                priority: 'high',
                tags: ['warmup', 'frequent']
            });
            const warmedCount = success ? Object.keys(data).length : 0;
            logger.info('Cache warmup completed', { warmedCount, totalKeys: frequentKeys.length });
            return warmedCount;
        }
        catch (error) {
            logger.error('Cache warmup failed', { error, keyCount: frequentKeys.length });
            return 0;
        }
    }
    static async monitorHealth(cacheManager) {
        try {
            const health = await cacheManager.healthCheck();
            const stats = cacheManager.getStats();
            logger.info('Cache health check', {
                healthy: health.healthy,
                latency: health.latency,
                l1HitRate: stats.l1.hitRate,
                l2HitRate: stats.l2.hitRate,
                overallHitRate: stats.overall.hitRate,
                l1KeyCount: stats.l1.keyCount,
                l2KeyCount: stats.l2.keyCount,
                errors: health.errors
            });
            if (stats.overall.hitRate < 0.8) {
                logger.warn('Low cache hit rate detected', {
                    hitRate: stats.overall.hitRate,
                    recommendation: 'Consider adjusting TTL or cache warming strategy'
                });
            }
            if (health.latency > 200) {
                logger.warn('High cache latency detected', {
                    latency: health.latency,
                    recommendation: 'Check Redis connection and network'
                });
            }
        }
        catch (error) {
            logger.error('Cache health monitoring failed', { error });
        }
    }
}
exports.CachePerformanceUtils = CachePerformanceUtils;
process.on('SIGINT', async () => {
    logger.info('Shutting down cache instances...');
    await Promise.all([
        exports.cache.disconnect(),
        exports.sessionCache.disconnect(),
        exports.analysisCache.disconnect(),
        exports.apiCache.disconnect(),
        exports.rateLimitCache.disconnect()
    ]);
    logger.info('All cache instances disconnected');
});
process.on('SIGTERM', async () => {
    logger.info('Shutting down cache instances...');
    await Promise.all([
        exports.cache.disconnect(),
        exports.sessionCache.disconnect(),
        exports.analysisCache.disconnect(),
        exports.apiCache.disconnect(),
        exports.rateLimitCache.disconnect()
    ]);
    logger.info('All cache instances disconnected');
});
//# sourceMappingURL=index.js.map