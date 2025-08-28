"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedCacheManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const events_1 = require("events");
const config_1 = require("@fineprintai/config");
const logger_1 = require("@fineprintai/logger");
const l1_cache_1 = require("./l1-cache");
const compression_1 = require("./compression");
const distributed_lock_1 = require("./distributed-lock");
const pubsub_coordinator_1 = require("./pubsub-coordinator");
const invalidation_manager_1 = require("./invalidation-manager");
const metrics_collector_1 = require("./metrics-collector");
class EnhancedCacheManager extends events_1.EventEmitter {
    cacheConfig;
    keyPrefix;
    logger = (0, logger_1.createServiceLogger)('enhanced-cache');
    redis;
    l1Cache;
    compression;
    lockManager;
    pubsub;
    invalidation;
    metrics;
    circuitBreaker = {
        state: 'closed',
        failures: 0,
        lastFailureTime: 0,
        nextAttempt: 0
    };
    refreshJobs = new Map();
    warmupStrategies = new Map();
    isInitialized = false;
    constructor(cacheConfig, keyPrefix = 'fpa') {
        super();
        this.cacheConfig = cacheConfig;
        this.keyPrefix = keyPrefix;
        this.redis = this.createRedisConnection();
        this.l1Cache = new l1_cache_1.L1Cache(cacheConfig.l1.maxSize, cacheConfig.l1.maxMemory, cacheConfig.l1.ttl, cacheConfig.l1.checkPeriod);
        this.compression = new compression_1.CompressionManager(cacheConfig.l2.compression);
        this.lockManager = new distributed_lock_1.DistributedLockManager(this.redis);
        const pubsubConfig = pubsub_coordinator_1.PubSubUtils.createDefaultConfig(`cache-${Date.now()}`);
        this.pubsub = new pubsub_coordinator_1.PubSubCoordinator(this.getRedisConfig(), pubsubConfig);
        this.invalidation = new invalidation_manager_1.InvalidationManager(this.redis, this.pubsub, { patterns: [], cascadeDelete: true, notifySubscribers: true }, this.keyPrefix);
        this.metrics = new metrics_collector_1.MetricsCollector(this.pubsub, {
            enabled: cacheConfig.monitoring.enabled,
            metricsInterval: cacheConfig.monitoring.metricsInterval,
            slowLogThreshold: cacheConfig.monitoring.slowLogThreshold,
            maxHistorySize: 1000,
            maxTopKeys: 100,
            maxSlowQueries: 50
        });
        this.setupEventHandlers();
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            await this.redis.connect();
            await this.pubsub.initialize();
            this.setupCircuitBreakerRecovery();
            this.isInitialized = true;
            this.logger.info('Enhanced cache manager initialized', {
                l1Enabled: this.cacheConfig.l1.enabled,
                l2Enabled: this.cacheConfig.l2.enabled,
                compressionEnabled: this.cacheConfig.l2.compression.enabled,
                monitoringEnabled: this.cacheConfig.monitoring.enabled
            });
        }
        catch (error) {
            this.logger.error('Failed to initialize cache manager', { error });
            throw error;
        }
    }
    async get(key, options = {}) {
        const startTime = Date.now();
        try {
            if (this.circuitBreaker.state === 'open') {
                if (Date.now() < this.circuitBreaker.nextAttempt) {
                    return null;
                }
                this.circuitBreaker.state = 'half-open';
            }
            if (this.cacheConfig.l1.enabled) {
                const l1Result = await this.l1Cache.get(key);
                if (l1Result !== null) {
                    this.metrics.recordHit('l1', key, Date.now() - startTime);
                    return l1Result;
                }
                this.metrics.recordMiss('l1', key, Date.now() - startTime);
            }
            if (this.cacheConfig.l2.enabled) {
                const l2StartTime = Date.now();
                const l2Result = await this.getFromL2(key);
                const l2Duration = Date.now() - l2StartTime;
                if (l2Result !== null) {
                    this.metrics.recordHit('l2', key, l2Duration);
                    if (this.cacheConfig.l1.enabled) {
                        await this.l1Cache.set(key, l2Result, options);
                    }
                    if (options.refreshAhead) {
                        this.scheduleRefreshAhead(key, options);
                    }
                    this.recordCircuitBreakerSuccess();
                    return l2Result;
                }
                this.metrics.recordMiss('l2', key, l2Duration);
            }
            this.recordCircuitBreakerSuccess();
            return null;
        }
        catch (error) {
            this.recordCircuitBreakerFailure();
            this.logger.error('Cache get error', { key, error });
            return null;
        }
    }
    async set(key, value, options = {}) {
        const startTime = Date.now();
        try {
            if (this.circuitBreaker.state === 'open') {
                return false;
            }
            let success = true;
            if (this.cacheConfig.l1.enabled) {
                const l1Success = await this.l1Cache.set(key, value, options);
                if (!l1Success)
                    success = false;
                this.metrics.recordOperation('l1', 'set', key, Date.now() - startTime, l1Success);
            }
            if (this.cacheConfig.l2.enabled) {
                const l2StartTime = Date.now();
                const l2Success = await this.setInL2(key, value, options);
                if (!l2Success)
                    success = false;
                this.metrics.recordOperation('l2', 'set', key, Date.now() - l2StartTime, l2Success);
            }
            if (options.tags && options.tags.length > 0) {
                await this.invalidation.registerKeyWithTags(key, options.tags);
            }
            await this.pubsub.publishSet(key, value);
            this.recordCircuitBreakerSuccess();
            return success;
        }
        catch (error) {
            this.recordCircuitBreakerFailure();
            this.logger.error('Cache set error', { key, error });
            return false;
        }
    }
    async delete(key) {
        const startTime = Date.now();
        try {
            let success = true;
            if (this.cacheConfig.l1.enabled) {
                const l1Success = await this.l1Cache.delete(key);
                this.metrics.recordOperation('l1', 'delete', key, Date.now() - startTime, l1Success);
            }
            if (this.cacheConfig.l2.enabled) {
                const l2StartTime = Date.now();
                const prefixedKey = this.getPrefixedKey(key);
                const deleted = await this.redis.del(prefixedKey);
                const l2Success = deleted > 0;
                this.metrics.recordOperation('l2', 'delete', key, Date.now() - l2StartTime, l2Success);
                if (!l2Success)
                    success = false;
            }
            await this.invalidation.unregisterKey(key);
            await this.pubsub.publishDelete(key);
            return success;
        }
        catch (error) {
            this.logger.error('Cache delete error', { key, error });
            return false;
        }
    }
    async exists(key) {
        try {
            if (this.cacheConfig.l1.enabled) {
                const l1Exists = await this.l1Cache.exists(key);
                if (l1Exists)
                    return true;
            }
            if (this.cacheConfig.l2.enabled) {
                const prefixedKey = this.getPrefixedKey(key);
                const l2Exists = await this.redis.exists(prefixedKey);
                return l2Exists === 1;
            }
            return false;
        }
        catch (error) {
            this.logger.error('Cache exists error', { key, error });
            return false;
        }
    }
    async mget(keys) {
        const results = new Array(keys.length).fill(null);
        const missingKeys = [];
        if (this.cacheConfig.l1.enabled) {
            const l1Results = await this.l1Cache.mget(keys);
            for (let i = 0; i < keys.length; i++) {
                if (l1Results[i] !== null) {
                    results[i] = l1Results[i];
                }
                else {
                    missingKeys.push(i);
                }
            }
        }
        else {
            missingKeys.push(...keys.map((_, i) => i));
        }
        if (this.cacheConfig.l2.enabled && missingKeys.length > 0) {
            const missingKeyNames = missingKeys.map(i => keys[i]);
            const prefixedKeys = missingKeyNames.map(key => this.getPrefixedKey(key));
            try {
                const l2Results = await this.redis.mget(...prefixedKeys);
                for (let i = 0; i < missingKeys.length; i++) {
                    const resultIndex = missingKeys[i];
                    const l2Result = l2Results[i];
                    if (l2Result) {
                        const parsed = await this.parseL2Value(l2Result);
                        results[resultIndex] = parsed;
                        if (this.cacheConfig.l1.enabled && parsed !== null) {
                            await this.l1Cache.set(keys[resultIndex], parsed);
                        }
                    }
                }
            }
            catch (error) {
                this.logger.error('Cache mget L2 error', { keys: missingKeyNames, error });
            }
        }
        return results;
    }
    async mset(keyValuePairs, options = {}) {
        let success = true;
        if (this.cacheConfig.l1.enabled) {
            const l1Success = await this.l1Cache.mset(keyValuePairs, options);
            if (!l1Success)
                success = false;
        }
        if (this.cacheConfig.l2.enabled) {
            try {
                const pipeline = this.redis.pipeline();
                const ttl = options.ttl ?? this.cacheConfig.l2.ttl;
                for (const [key, value] of Object.entries(keyValuePairs)) {
                    const prefixedKey = this.getPrefixedKey(key);
                    const serialized = await this.serializeForL2(value);
                    if (ttl > 0) {
                        pipeline.setex(prefixedKey, ttl, serialized.data);
                    }
                    else {
                        pipeline.set(prefixedKey, serialized.data);
                    }
                    if (serialized.compressed) {
                        pipeline.hset(`${prefixedKey}:meta`, 'compressed', '1');
                        pipeline.expire(`${prefixedKey}:meta`, ttl);
                    }
                }
                await pipeline.exec();
            }
            catch (error) {
                this.logger.error('Cache mset L2 error', { keys: Object.keys(keyValuePairs), error });
                success = false;
            }
        }
        return success;
    }
    async invalidateByTags(tags) {
        return this.invalidation.invalidateByTags(tags);
    }
    async invalidateByPattern(pattern) {
        return this.invalidation.invalidateByPattern(pattern);
    }
    async batch(operations) {
        const results = [];
        for (const op of operations) {
            try {
                let result;
                switch (op.operation) {
                    case 'get':
                        result = await this.get(op.key);
                        results.push({ key: op.key, success: true, value: result });
                        break;
                    case 'set':
                        result = await this.set(op.key, op.value, op.options);
                        results.push({ key: op.key, success: result });
                        break;
                    case 'delete':
                        result = await this.delete(op.key);
                        results.push({ key: op.key, success: result });
                        break;
                    default:
                        results.push({
                            key: op.key,
                            success: false,
                            error: new Error(`Unknown operation: ${op.operation}`)
                        });
                }
            }
            catch (error) {
                results.push({ key: op.key, success: false, error: error });
            }
        }
        return results;
    }
    async acquireLock(key, timeout) {
        return this.lockManager.acquireLock(key, timeout);
    }
    async releaseLock(lock) {
        return this.lockManager.releaseLock(lock);
    }
    async withLock(key, fn, timeout) {
        return this.lockManager.withLock(key, fn, timeout);
    }
    async warmup(pattern, loader, options = {}) {
        const lockKey = distributed_lock_1.LockUtils.generateWarmupLockKey(pattern);
        return this.lockManager.withLock(lockKey, async () => {
            let warmedCount = 0;
            try {
                const keys = await this.getKeysToWarmup(pattern);
                for (const key of keys) {
                    try {
                        const data = await loader(key);
                        const success = await this.set(key, data, options);
                        if (success)
                            warmedCount++;
                    }
                    catch (error) {
                        this.logger.error('Warmup error for key', { key, error });
                    }
                }
                this.logger.info('Cache warmup completed', { pattern, warmedCount });
            }
            catch (error) {
                this.logger.error('Cache warmup failed', { pattern, error });
            }
            return warmedCount;
        });
    }
    createDocumentCacheKey(documentId, analysisType, version, model) {
        const parts = [documentId, analysisType];
        if (version)
            parts.push(version);
        if (model)
            parts.push(model);
        return `doc:${parts.join(':')}`;
    }
    async cacheDocumentAnalysis(key, result, baseTtl = 3600) {
        const confidenceMultiplier = Math.max(0.5, result.confidence);
        const adjustedTtl = Math.floor(baseTtl * confidenceMultiplier);
        const cacheKey = this.createDocumentCacheKey(key.documentId, key.analysisType, key.version, key.model);
        const tags = [
            `doc:${key.documentId}`,
            `analysis:${key.analysisType}`,
            ...result.patterns.map(p => `pattern:${p}`)
        ];
        return this.set(cacheKey, result, {
            ttl: adjustedTtl,
            tags,
            priority: result.confidence > 0.8 ? 'high' : 'normal',
            refreshAhead: result.confidence > 0.9,
            refreshThreshold: 20
        });
    }
    async getDocumentAnalysis(key) {
        const exactKey = this.createDocumentCacheKey(key.documentId, key.analysisType, key.version, key.model);
        let result = await this.get(exactKey);
        if (result)
            return result;
        if (key.version) {
            const noVersionKey = this.createDocumentCacheKey(key.documentId, key.analysisType, undefined, key.model);
            result = await this.get(noVersionKey);
            if (result)
                return result;
        }
        if (key.model) {
            const noModelKey = this.createDocumentCacheKey(key.documentId, key.analysisType, key.version);
            result = await this.get(noModelKey);
            if (result)
                return result;
        }
        return null;
    }
    async invalidateDocumentAnalysis(documentId) {
        return this.invalidateByTags([`doc:${documentId}`]);
    }
    getStats() {
        return this.metrics.getStats();
    }
    getMetrics() {
        return this.metrics.getMetrics();
    }
    exportPrometheusMetrics() {
        return this.metrics.exportPrometheusMetrics();
    }
    async healthCheck() {
        const startTime = Date.now();
        const errors = [];
        let l1Healthy = true;
        let l1Latency = 0;
        if (this.cacheConfig.l1.enabled) {
            try {
                const l1Start = Date.now();
                await this.l1Cache.set('health_check', { timestamp: Date.now() }, { ttl: 60 });
                await this.l1Cache.get('health_check');
                await this.l1Cache.delete('health_check');
                l1Latency = Date.now() - l1Start;
            }
            catch (error) {
                l1Healthy = false;
                errors.push(`L1 cache error: ${error.message}`);
            }
        }
        let l2Healthy = true;
        let l2Latency = 0;
        if (this.cacheConfig.l2.enabled) {
            try {
                const l2Start = Date.now();
                const result = await this.redis.ping();
                l2Healthy = result === 'PONG';
                l2Latency = Date.now() - l2Start;
                if (!l2Healthy) {
                    errors.push('L2 cache ping failed');
                }
            }
            catch (error) {
                l2Healthy = false;
                errors.push(`L2 cache error: ${error.message}`);
            }
        }
        const totalLatency = Date.now() - startTime;
        const healthy = l1Healthy && l2Healthy && errors.length === 0;
        return {
            healthy,
            latency: totalLatency,
            errors,
            timestamp: Date.now(),
            layers: {
                l1: { healthy: l1Healthy, latency: l1Latency },
                l2: { healthy: l2Healthy, latency: l2Latency }
            }
        };
    }
    async disconnect() {
        try {
            for (const timer of this.refreshJobs.values()) {
                clearTimeout(timer);
            }
            this.refreshJobs.clear();
            this.metrics.stop();
            await this.lockManager.releaseAllLocks();
            await this.l1Cache.clear();
            await this.pubsub.disconnect();
            await this.redis.disconnect();
            this.isInitialized = false;
            this.logger.info('Enhanced cache manager disconnected');
        }
        catch (error) {
            this.logger.error('Error during cache manager disconnect', { error });
        }
    }
    createRedisConnection() {
        const redisConfig = this.getRedisConfig();
        const redis = new ioredis_1.default({
            ...redisConfig,
            lazyConnect: true,
            maxRetriesPerRequest: this.cacheConfig.l2.maxRetries,
            retryDelayOnFailover: this.cacheConfig.l2.retryDelay,
            enableReadyCheck: true,
        });
        redis.on('connect', () => {
            this.logger.info('Redis connected');
        });
        redis.on('error', (error) => {
            this.logger.error('Redis connection error', { error });
            this.recordCircuitBreakerFailure();
        });
        redis.on('ready', () => {
            this.logger.info('Redis ready');
        });
        return redis;
    }
    getRedisConfig() {
        if (this.cacheConfig.l2.cluster) {
            return {
                enableOfflineQueue: false,
                ...this.cacheConfig.l2.nodes ? { host: this.cacheConfig.l2.nodes } : { url: this.cacheConfig.l2.url }
            };
        }
        return {
            url: this.cacheConfig.l2.url || config_1.config.redis.url,
            maxRetries: this.cacheConfig.l2.maxRetries,
            retryDelayOnFailover: this.cacheConfig.l2.retryDelay,
            enableReadyCheck: true
        };
    }
    getPrefixedKey(key) {
        return `${this.keyPrefix}:${key}`;
    }
    async getFromL2(key) {
        const prefixedKey = this.getPrefixedKey(key);
        try {
            const result = await this.redis.get(prefixedKey);
            if (!result)
                return null;
            return this.parseL2Value(result);
        }
        catch (error) {
            this.logger.error('L2 cache get error', { key, error });
            return null;
        }
    }
    async setInL2(key, value, options) {
        const prefixedKey = this.getPrefixedKey(key);
        const ttl = options.ttl ?? this.cacheConfig.l2.ttl;
        try {
            const serialized = await this.serializeForL2(value);
            const pipeline = this.redis.pipeline();
            if (ttl > 0) {
                pipeline.setex(prefixedKey, ttl, serialized.data);
            }
            else {
                pipeline.set(prefixedKey, serialized.data);
            }
            if (serialized.compressed) {
                pipeline.hset(`${prefixedKey}:meta`, 'compressed', '1', 'originalSize', serialized.originalSize.toString(), 'compressedSize', serialized.compressedSize.toString());
                if (ttl > 0) {
                    pipeline.expire(`${prefixedKey}:meta`, ttl);
                }
            }
            await pipeline.exec();
            if (serialized.compressed) {
                this.metrics.recordCompression(serialized.originalSize, serialized.compressedSize);
            }
            return true;
        }
        catch (error) {
            this.logger.error('L2 cache set error', { key, error });
            return false;
        }
    }
    async serializeForL2(value) {
        const serialized = JSON.stringify(value);
        const compressionResult = this.compression.compress(serialized);
        return {
            data: compressionResult.data.toString(),
            compressed: compressionResult.compressed,
            originalSize: compressionResult.originalSize,
            compressedSize: compressionResult.compressedSize
        };
    }
    async parseL2Value(data) {
        try {
            const decompressed = this.compression.decompress(data, data.startsWith('H4sI'));
            return JSON.parse(decompressed);
        }
        catch (error) {
            this.logger.error('Failed to parse L2 value', { error });
            return null;
        }
    }
    scheduleRefreshAhead(key, options) {
        if (!options.refreshThreshold)
            return;
        const ttl = options.ttl ?? this.cacheConfig.l2.ttl;
        const refreshTime = ttl * (options.refreshThreshold / 100) * 1000;
        const existingTimer = this.refreshJobs.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(async () => {
            try {
                this.emit('refreshAhead', { key, options });
                this.refreshJobs.delete(key);
            }
            catch (error) {
                this.logger.error('Refresh ahead error', { key, error });
            }
        }, refreshTime);
        this.refreshJobs.set(key, timer);
    }
    setupEventHandlers() {
        this.l1Cache.on('hit', (data) => this.emit('hit', data));
        this.l1Cache.on('miss', (data) => this.emit('miss', data));
        this.l1Cache.on('set', (data) => this.emit('set', data));
        this.l1Cache.on('delete', (data) => this.emit('delete', data));
        this.l1Cache.on('evict', (data) => this.emit('evict', data));
        this.l1Cache.on('expire', (data) => this.emit('expire', data));
        this.invalidation.on('invalidate', (data) => this.emit('invalidate', data));
        this.metrics.on('metrics', (data) => this.emit('metrics', data));
        this.pubsub.onInvalidation(async (message) => {
            if (message.key) {
                await this.l1Cache.delete(message.key);
            }
            if (message.pattern) {
                await this.l1Cache.deleteByPattern(message.pattern);
            }
            if (message.tags) {
                await this.l1Cache.deleteByTags(message.tags);
            }
        });
    }
    setupCircuitBreakerRecovery() {
        setInterval(() => {
            if (this.circuitBreaker.state === 'open' && Date.now() >= this.circuitBreaker.nextAttempt) {
                this.circuitBreaker.state = 'half-open';
                this.logger.info('Circuit breaker state changed to half-open');
            }
        }, 5000);
    }
    recordCircuitBreakerSuccess() {
        if (this.circuitBreaker.state === 'half-open') {
            this.circuitBreaker.state = 'closed';
            this.circuitBreaker.failures = 0;
            this.logger.info('Circuit breaker closed after successful operation');
        }
    }
    recordCircuitBreakerFailure() {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailureTime = Date.now();
        const threshold = 5;
        const timeout = 30000;
        if (this.circuitBreaker.failures >= threshold && this.circuitBreaker.state === 'closed') {
            this.circuitBreaker.state = 'open';
            this.circuitBreaker.nextAttempt = Date.now() + timeout;
            this.logger.warn('Circuit breaker opened due to failures', {
                failures: this.circuitBreaker.failures,
                nextAttempt: this.circuitBreaker.nextAttempt
            });
        }
    }
    async getKeysToWarmup(pattern) {
        try {
            const prefixedPattern = this.getPrefixedKey(pattern);
            return await this.redis.keys(prefixedPattern);
        }
        catch (error) {
            this.logger.error('Failed to get keys for warmup', { pattern, error });
            return [];
        }
    }
}
exports.EnhancedCacheManager = EnhancedCacheManager;
//# sourceMappingURL=enhanced-cache-manager.js.map