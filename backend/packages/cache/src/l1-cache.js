"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.L1Cache = void 0;
const events_1 = require("events");
class L1Cache extends events_1.EventEmitter {
    maxSize;
    maxMemory;
    defaultTtl;
    checkPeriod;
    cache = new Map();
    accessOrder = new Map();
    timers = new Map();
    stats;
    accessCounter = 0;
    totalMemoryUsage = 0;
    constructor(maxSize = 10000, maxMemory = 128 * 1024 * 1024, defaultTtl = 3600, checkPeriod = 300) {
        super();
        this.maxSize = maxSize;
        this.maxMemory = maxMemory;
        this.defaultTtl = defaultTtl;
        this.checkPeriod = checkPeriod;
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalOperations: 0,
            averageLatency: 0,
            errorRate: 0,
            memoryUsage: 0,
            keyCount: 0,
            evictions: 0
        };
        this.startCleanupTimer();
    }
    async get(key) {
        const startTime = Date.now();
        try {
            const cached = this.cache.get(key);
            if (!cached) {
                this.recordMiss(key, Date.now() - startTime);
                return null;
            }
            if (this.isExpired(cached)) {
                this.delete(key);
                this.recordMiss(key, Date.now() - startTime);
                return null;
            }
            this.updateAccess(key, cached);
            this.recordHit(key, Date.now() - startTime);
            return cached.data;
        }
        catch (error) {
            this.recordError(key, 'get', error);
            return null;
        }
    }
    async set(key, value, options = {}) {
        const startTime = Date.now();
        try {
            const serialized = JSON.stringify(value);
            const size = Buffer.byteLength(serialized, 'utf8');
            if (this.totalMemoryUsage + size > this.maxMemory) {
                this.evictToMakeSpace(size);
            }
            const ttl = options.ttl ?? this.defaultTtl;
            const expiresAt = ttl > 0 ? Date.now() + (ttl * 1000) : undefined;
            const cacheValue = {
                data: value,
                metadata: {
                    key,
                    createdAt: Date.now(),
                    expiresAt,
                    ttl,
                    tags: options.tags,
                    version: options.version,
                    size,
                    accessCount: 0,
                    lastAccessedAt: Date.now()
                }
            };
            if (this.cache.has(key)) {
                this.removeInternal(key);
            }
            this.cache.set(key, cacheValue);
            this.accessOrder.set(key, this.accessCounter++);
            this.totalMemoryUsage += size;
            if (expiresAt) {
                const timer = setTimeout(() => {
                    this.delete(key);
                    this.emit('expire', { event: 'expire', key, layer: 'l1' });
                }, ttl * 1000);
                this.timers.set(key, timer);
            }
            if (this.cache.size > this.maxSize) {
                this.evictLRU();
            }
            this.updateStats();
            this.emit('set', {
                event: 'set',
                key,
                layer: 'l1',
                size,
                duration: Date.now() - startTime
            });
            return true;
        }
        catch (error) {
            this.recordError(key, 'set', error);
            return false;
        }
    }
    async delete(key) {
        const startTime = Date.now();
        try {
            const existed = this.cache.has(key);
            if (existed) {
                this.removeInternal(key);
                this.updateStats();
                this.emit('delete', {
                    event: 'delete',
                    key,
                    layer: 'l1',
                    duration: Date.now() - startTime
                });
            }
            return existed;
        }
        catch (error) {
            this.recordError(key, 'delete', error);
            return false;
        }
    }
    async exists(key) {
        const cached = this.cache.get(key);
        return cached ? !this.isExpired(cached) : false;
    }
    async mget(keys) {
        const results = [];
        for (const key of keys) {
            const value = await this.get(key);
            results.push(value);
        }
        return results;
    }
    async mset(keyValuePairs, options = {}) {
        let success = true;
        for (const [key, value] of Object.entries(keyValuePairs)) {
            const result = await this.set(key, value, options);
            if (!result)
                success = false;
        }
        return success;
    }
    async clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.cache.clear();
        this.accessOrder.clear();
        this.timers.clear();
        this.totalMemoryUsage = 0;
        this.updateStats();
    }
    getStats() {
        return { ...this.stats };
    }
    getKeys(pattern) {
        const keys = Array.from(this.cache.keys());
        if (!pattern)
            return keys;
        const regexPattern = new RegExp(pattern.replace(/\*/g, '.*'));
        return keys.filter(key => regexPattern.test(key));
    }
    async deleteByPattern(pattern) {
        const keys = this.getKeys(pattern);
        let deleted = 0;
        for (const key of keys) {
            const result = await this.delete(key);
            if (result)
                deleted++;
        }
        return deleted;
    }
    async deleteByTags(tags) {
        let deleted = 0;
        for (const [key, cached] of this.cache.entries()) {
            if (cached.metadata.tags && cached.metadata.tags.some(tag => tags.includes(tag))) {
                const result = await this.delete(key);
                if (result)
                    deleted++;
            }
        }
        return deleted;
    }
    getMemoryUsage() {
        return this.totalMemoryUsage;
    }
    getSize() {
        return this.cache.size;
    }
    isExpired(cached) {
        return cached.metadata.expiresAt ? Date.now() > cached.metadata.expiresAt : false;
    }
    updateAccess(key, cached) {
        cached.metadata.lastAccessedAt = Date.now();
        cached.metadata.accessCount = (cached.metadata.accessCount || 0) + 1;
        this.accessOrder.set(key, this.accessCounter++);
    }
    removeInternal(key) {
        const cached = this.cache.get(key);
        if (cached) {
            this.totalMemoryUsage -= cached.metadata.size || 0;
        }
        this.cache.delete(key);
        this.accessOrder.delete(key);
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }
    evictLRU() {
        if (this.cache.size === 0)
            return;
        let lruKey;
        let lruAccess = Infinity;
        for (const [key, accessTime] of this.accessOrder.entries()) {
            if (accessTime < lruAccess) {
                lruAccess = accessTime;
                lruKey = key;
            }
        }
        if (lruKey) {
            this.removeInternal(lruKey);
            this.stats.evictions++;
            this.emit('evict', {
                event: 'evict',
                key: lruKey,
                layer: 'l1'
            });
        }
    }
    evictToMakeSpace(requiredSize) {
        const targetMemory = this.maxMemory * 0.8;
        while (this.totalMemoryUsage + requiredSize > targetMemory && this.cache.size > 0) {
            this.evictLRU();
        }
    }
    recordHit(key, duration) {
        this.stats.hits++;
        this.stats.totalOperations++;
        this.updateLatency(duration);
        this.updateHitRate();
        this.emit('hit', {
            event: 'hit',
            key,
            layer: 'l1',
            duration
        });
    }
    recordMiss(key, duration) {
        this.stats.misses++;
        this.stats.totalOperations++;
        this.updateLatency(duration);
        this.updateHitRate();
        this.emit('miss', {
            event: 'miss',
            key,
            layer: 'l1',
            duration
        });
    }
    recordError(key, operation, error) {
        this.stats.totalOperations++;
        this.updateErrorRate();
        this.emit('error', {
            event: 'error',
            key,
            layer: 'l1',
            error
        });
    }
    updateLatency(duration) {
        const total = this.stats.averageLatency * (this.stats.totalOperations - 1);
        this.stats.averageLatency = (total + duration) / this.stats.totalOperations;
    }
    updateHitRate() {
        this.stats.hitRate = this.stats.totalOperations > 0
            ? this.stats.hits / this.stats.totalOperations
            : 0;
    }
    updateErrorRate() {
    }
    updateStats() {
        this.stats.keyCount = this.cache.size;
        this.stats.memoryUsage = this.totalMemoryUsage;
    }
    startCleanupTimer() {
        setInterval(() => {
            this.cleanup();
        }, this.checkPeriod * 1000);
    }
    cleanup() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, cached] of this.cache.entries()) {
            if (this.isExpired(cached)) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.removeInternal(key);
            this.emit('expire', {
                event: 'expire',
                key,
                layer: 'l1'
            });
        }
        if (expiredKeys.length > 0) {
            this.updateStats();
        }
    }
}
exports.L1Cache = L1Cache;
//# sourceMappingURL=l1-cache.js.map