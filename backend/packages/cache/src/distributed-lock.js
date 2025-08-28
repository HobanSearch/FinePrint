"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockUtils = exports.DistributedLockManager = void 0;
const crypto_1 = require("crypto");
class DistributedLockManager {
    redis;
    config;
    instanceId;
    activeLocks = new Map();
    constructor(redis, config = {
        timeout: 30000,
        retryDelay: 100,
        maxRetries: 10,
        drift: 0.01
    }) {
        this.redis = redis;
        this.config = config;
        this.instanceId = (0, crypto_1.randomBytes)(8).toString('hex');
        process.on('SIGINT', () => this.releaseAllLocks());
        process.on('SIGTERM', () => this.releaseAllLocks());
    }
    async acquireLock(key, timeout, maxRetries) {
        const lockKey = `lock:${key}`;
        const lockTimeout = timeout || this.config.timeout;
        const retries = maxRetries || this.config.maxRetries;
        const lockValue = `${this.instanceId}:${Date.now()}:${(0, crypto_1.randomBytes)(4).toString('hex')}`;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const startTime = Date.now();
                const result = await this.redis.set(lockKey, lockValue, 'PX', lockTimeout, 'NX');
                if (result === 'OK') {
                    const now = Date.now();
                    const drift = Math.round(lockTimeout * this.config.drift) + 2;
                    const validTime = lockTimeout - (now - startTime) - drift;
                    if (validTime > 0) {
                        const lock = {
                            key: lockKey,
                            value: lockValue,
                            expiresAt: now + validTime,
                            acquired: true
                        };
                        this.activeLocks.set(lockKey, lock);
                        if (lockTimeout > 10000) {
                            this.setupAutoRenewal(lock);
                        }
                        return lock;
                    }
                    else {
                        await this.releaseLock(lockKey, lockValue);
                    }
                }
                if (attempt < retries) {
                    await this.sleep(this.config.retryDelay * Math.pow(2, attempt));
                }
            }
            catch (error) {
                if (attempt === retries) {
                    throw new Error(`Failed to acquire lock ${key}: ${error.message}`);
                }
            }
        }
        return null;
    }
    async releaseLock(keyOrLock, lockValue) {
        const lockKey = typeof keyOrLock === 'string' ? keyOrLock : keyOrLock.key;
        const value = typeof keyOrLock === 'string' ? lockValue : keyOrLock.value;
        if (!value) {
            throw new Error('Lock value is required for release');
        }
        try {
            const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
            const result = await this.redis.eval(script, 1, lockKey, value);
            const released = result === 1;
            if (released) {
                this.activeLocks.delete(lockKey);
            }
            return released;
        }
        catch (error) {
            throw new Error(`Failed to release lock ${lockKey}: ${error.message}`);
        }
    }
    async extendLock(lock, additionalTime) {
        try {
            const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("PEXPIRE", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
            const result = await this.redis.eval(script, 1, lock.key, lock.value, additionalTime);
            if (result === 1) {
                lock.expiresAt = Date.now() + additionalTime;
                return true;
            }
            return false;
        }
        catch (error) {
            throw new Error(`Failed to extend lock ${lock.key}: ${error.message}`);
        }
    }
    async isLockValid(lock) {
        try {
            const currentValue = await this.redis.get(lock.key);
            return currentValue === lock.value && Date.now() < lock.expiresAt;
        }
        catch (error) {
            return false;
        }
    }
    async withLock(key, fn, timeout, maxRetries) {
        const lock = await this.acquireLock(key, timeout, maxRetries);
        if (!lock) {
            throw new Error(`Failed to acquire lock for key: ${key}`);
        }
        try {
            return await fn();
        }
        finally {
            await this.releaseLock(lock);
        }
    }
    async tryWithLock(key, fn, timeout) {
        const lock = await this.acquireLock(key, timeout, 0);
        if (!lock) {
            return null;
        }
        try {
            return await fn();
        }
        finally {
            await this.releaseLock(lock);
        }
    }
    async getLockInfo(key) {
        const lockKey = `lock:${key}`;
        try {
            const pipeline = this.redis.pipeline();
            pipeline.get(lockKey);
            pipeline.pttl(lockKey);
            const results = await pipeline.exec();
            if (!results || results.some(([err]) => err)) {
                return { locked: false };
            }
            const [getValue, ttlValue] = results;
            const value = getValue[1];
            const ttl = ttlValue[1];
            return {
                locked: value !== null,
                value: value || undefined,
                ttl: ttl > 0 ? ttl : undefined
            };
        }
        catch (error) {
            return { locked: false };
        }
    }
    async releaseAllLocks() {
        const promises = Array.from(this.activeLocks.values()).map(lock => this.releaseLock(lock).catch(err => console.error(`Failed to release lock ${lock.key}:`, err)));
        await Promise.allSettled(promises);
        this.activeLocks.clear();
    }
    getActiveLocks() {
        return Array.from(this.activeLocks.values());
    }
    cleanupExpiredLocks() {
        const now = Date.now();
        for (const [key, lock] of this.activeLocks.entries()) {
            if (now >= lock.expiresAt) {
                this.activeLocks.delete(key);
            }
        }
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    setupAutoRenewal(lock) {
        const renewalInterval = Math.max(1000, (lock.expiresAt - Date.now()) * 0.3);
        const renewal = setInterval(async () => {
            try {
                const stillValid = await this.isLockValid(lock);
                if (!stillValid) {
                    clearInterval(renewal);
                    this.activeLocks.delete(lock.key);
                    return;
                }
                const timeRemaining = lock.expiresAt - Date.now();
                if (timeRemaining < renewalInterval * 2) {
                    const extended = await this.extendLock(lock, this.config.timeout);
                    if (!extended) {
                        clearInterval(renewal);
                        this.activeLocks.delete(lock.key);
                    }
                }
            }
            catch (error) {
                clearInterval(renewal);
                this.activeLocks.delete(lock.key);
            }
        }, renewalInterval);
        setTimeout(() => {
            clearInterval(renewal);
        }, lock.expiresAt - Date.now());
    }
}
exports.DistributedLockManager = DistributedLockManager;
class LockUtils {
    static generateCacheLockKey(operation, key) {
        return `cache:${operation}:${key}`;
    }
    static generateRefreshLockKey(key) {
        return `refresh:${key}`;
    }
    static generateWarmupLockKey(pattern) {
        return `warmup:${pattern}`;
    }
    static isValidLockKey(key) {
        return /^[a-zA-Z0-9:._-]+$/.test(key) && key.length <= 250;
    }
    static parseLockValue(value) {
        const parts = value.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid lock value format');
        }
        return {
            instanceId: parts[0],
            timestamp: parseInt(parts[1], 10),
            random: parts[2]
        };
    }
}
exports.LockUtils = LockUtils;
//# sourceMappingURL=distributed-lock.js.map