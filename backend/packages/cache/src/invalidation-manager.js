"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidationManager = void 0;
const events_1 = require("events");
const logger_1 = require("@fineprintai/logger");
class InvalidationManager extends events_1.EventEmitter {
    redis;
    pubsub;
    config;
    keyPrefix;
    logger = (0, logger_1.createServiceLogger)('cache-invalidation');
    tagIndex = new Map();
    keyTags = new Map();
    patternHandlers = new Map();
    constructor(redis, pubsub, config, keyPrefix = 'fpa') {
        super();
        this.redis = redis;
        this.pubsub = pubsub;
        this.config = config;
        this.keyPrefix = keyPrefix;
        this.setupPubSubHandlers();
    }
    async registerKeyWithTags(key, tags) {
        if (!tags || tags.length === 0)
            return;
        try {
            this.updateLocalIndices(key, tags);
            const tagKey = this.getTagIndexKey();
            const keyTagsKey = this.getKeyTagsKey(key);
            const pipeline = this.redis.pipeline();
            pipeline.sadd(keyTagsKey, ...tags);
            pipeline.expire(keyTagsKey, 86400);
            for (const tag of tags) {
                const tagKeySet = this.getTagKeysKey(tag);
                pipeline.sadd(tagKeySet, key);
                pipeline.expire(tagKeySet, 86400);
            }
            await pipeline.exec();
            this.logger.debug('Registered key with tags', { key, tags });
        }
        catch (error) {
            this.logger.error('Failed to register key with tags', { error, key, tags });
        }
    }
    async unregisterKey(key) {
        try {
            const tags = this.keyTags.get(key);
            if (tags) {
                this.removeFromLocalIndices(key, Array.from(tags));
            }
            const keyTagsKey = this.getKeyTagsKey(key);
            const currentTags = await this.redis.smembers(keyTagsKey);
            if (currentTags.length > 0) {
                const pipeline = this.redis.pipeline();
                for (const tag of currentTags) {
                    const tagKeySet = this.getTagKeysKey(tag);
                    pipeline.srem(tagKeySet, key);
                }
                pipeline.del(keyTagsKey);
                await pipeline.exec();
            }
            this.logger.debug('Unregistered key', { key, tags: currentTags });
        }
        catch (error) {
            this.logger.error('Failed to unregister key', { error, key });
        }
    }
    async invalidateByTags(tags, notifyCluster = true) {
        if (!tags || tags.length === 0)
            return 0;
        try {
            const keysToInvalidate = new Set();
            for (const tag of tags) {
                const localKeys = this.tagIndex.get(tag);
                if (localKeys) {
                    localKeys.forEach(key => keysToInvalidate.add(key));
                }
            }
            for (const tag of tags) {
                const tagKeySet = this.getTagKeysKey(tag);
                const redisKeys = await this.redis.smembers(tagKeySet);
                redisKeys.forEach(key => keysToInvalidate.add(key));
            }
            let invalidatedCount = 0;
            if (keysToInvalidate.size > 0) {
                const keyArray = Array.from(keysToInvalidate);
                const batchSize = 100;
                for (let i = 0; i < keyArray.length; i += batchSize) {
                    const batch = keyArray.slice(i, i + batchSize);
                    const prefixedKeys = batch.map(key => `${this.keyPrefix}:${key}`);
                    const deletedCount = await this.redis.del(...prefixedKeys);
                    invalidatedCount += deletedCount;
                    for (const key of batch) {
                        await this.unregisterKey(key);
                    }
                }
                if (notifyCluster) {
                    await this.pubsub.publishInvalidation(undefined, undefined, tags);
                }
                this.emit('invalidate', {
                    event: 'invalidate',
                    key: `tags:${tags.join(',')}`,
                    layer: 'both',
                    metadata: { tags, count: invalidatedCount }
                });
            }
            this.logger.info('Invalidated keys by tags', {
                tags,
                keysCount: keysToInvalidate.size,
                invalidatedCount
            });
            return invalidatedCount;
        }
        catch (error) {
            this.logger.error('Failed to invalidate by tags', { error, tags });
            return 0;
        }
    }
    async invalidateByPattern(pattern, notifyCluster = true) {
        try {
            const prefixedPattern = `${this.keyPrefix}:${pattern}`;
            const matchingKeys = await this.redis.keys(prefixedPattern);
            if (matchingKeys.length === 0) {
                return 0;
            }
            const batchSize = 100;
            let invalidatedCount = 0;
            for (let i = 0; i < matchingKeys.length; i += batchSize) {
                const batch = matchingKeys.slice(i, i + batchSize);
                const deletedCount = await this.redis.del(...batch);
                invalidatedCount += deletedCount;
                for (const prefixedKey of batch) {
                    const key = prefixedKey.replace(`${this.keyPrefix}:`, '');
                    await this.unregisterKey(key);
                }
            }
            if (notifyCluster) {
                await this.pubsub.publishInvalidation(undefined, pattern, undefined);
            }
            if (this.config.cascadeDelete) {
                await this.processCascadeInvalidation(pattern);
            }
            this.emit('invalidate', {
                event: 'invalidate',
                key: `pattern:${pattern}`,
                layer: 'both',
                metadata: { pattern, count: invalidatedCount }
            });
            this.logger.info('Invalidated keys by pattern', {
                pattern,
                matchingKeys: matchingKeys.length,
                invalidatedCount
            });
            return invalidatedCount;
        }
        catch (error) {
            this.logger.error('Failed to invalidate by pattern', { error, pattern });
            return 0;
        }
    }
    async invalidateKey(key, notifyCluster = true) {
        try {
            const prefixedKey = `${this.keyPrefix}:${key}`;
            const deleted = await this.redis.del(prefixedKey);
            if (deleted > 0) {
                await this.unregisterKey(key);
                if (notifyCluster) {
                    await this.pubsub.publishInvalidation(key);
                }
                this.emit('invalidate', {
                    event: 'invalidate',
                    key,
                    layer: 'both'
                });
                this.logger.debug('Invalidated key', { key });
                return true;
            }
            return false;
        }
        catch (error) {
            this.logger.error('Failed to invalidate key', { error, key });
            return false;
        }
    }
    async getKeysByTags(tags) {
        const allKeys = new Set();
        try {
            for (const tag of tags) {
                const localKeys = this.tagIndex.get(tag);
                if (localKeys) {
                    localKeys.forEach(key => allKeys.add(key));
                }
            }
            for (const tag of tags) {
                const tagKeySet = this.getTagKeysKey(tag);
                const redisKeys = await this.redis.smembers(tagKeySet);
                redisKeys.forEach(key => allKeys.add(key));
            }
            return Array.from(allKeys);
        }
        catch (error) {
            this.logger.error('Failed to get keys by tags', { error, tags });
            return [];
        }
    }
    async getTagsForKey(key) {
        try {
            const localTags = this.keyTags.get(key);
            if (localTags && localTags.size > 0) {
                return Array.from(localTags);
            }
            const keyTagsKey = this.getKeyTagsKey(key);
            const redisTags = await this.redis.smembers(keyTagsKey);
            return redisTags;
        }
        catch (error) {
            this.logger.error('Failed to get tags for key', { error, key });
            return [];
        }
    }
    registerPattern(pattern) {
        this.patternHandlers.set(pattern.name, pattern);
        this.logger.debug('Registered invalidation pattern', {
            name: pattern.name,
            pattern: pattern.pattern
        });
    }
    unregisterPattern(name) {
        const removed = this.patternHandlers.delete(name);
        this.logger.debug('Unregistered invalidation pattern', { name, removed });
        return removed;
    }
    async executePattern(name, context) {
        const pattern = this.patternHandlers.get(name);
        if (!pattern) {
            this.logger.warn('Invalidation pattern not found', { name });
            return 0;
        }
        try {
            let invalidatedCount = 0;
            if (pattern.pattern) {
                invalidatedCount += await this.invalidateByPattern(pattern.pattern, true);
            }
            if (pattern.tags && pattern.tags.length > 0) {
                invalidatedCount += await this.invalidateByTags(pattern.tags, true);
            }
            if (pattern.cascade && this.config.cascadeDelete) {
                await this.processCascadeInvalidation(pattern.pattern);
            }
            this.logger.info('Executed invalidation pattern', {
                name,
                pattern: pattern.pattern,
                tags: pattern.tags,
                invalidatedCount
            });
            return invalidatedCount;
        }
        catch (error) {
            this.logger.error('Failed to execute invalidation pattern', { error, name });
            return 0;
        }
    }
    getStats() {
        return {
            totalTags: this.tagIndex.size,
            totalKeys: this.keyTags.size,
            registeredPatterns: this.patternHandlers.size,
            tagIndexSize: Array.from(this.tagIndex.values()).reduce((sum, set) => sum + set.size, 0),
            keyIndexSize: Array.from(this.keyTags.values()).reduce((sum, set) => sum + set.size, 0)
        };
    }
    async cleanup() {
        try {
            const pipeline = this.redis.pipeline();
            const expiredKeys = [];
            for (const key of this.keyTags.keys()) {
                const prefixedKey = `${this.keyPrefix}:${key}`;
                const exists = await this.redis.exists(prefixedKey);
                if (!exists) {
                    expiredKeys.push(key);
                }
            }
            for (const key of expiredKeys) {
                await this.unregisterKey(key);
            }
            this.logger.debug('Cleaned up invalidation indices', {
                expiredKeys: expiredKeys.length
            });
        }
        catch (error) {
            this.logger.error('Failed to cleanup invalidation indices', { error });
        }
    }
    setupPubSubHandlers() {
        this.pubsub.onInvalidation(async (message) => {
            try {
                if (message.key) {
                    await this.unregisterKey(message.key);
                }
                if (message.pattern) {
                    const localKeys = Array.from(this.keyTags.keys()).filter(key => {
                        const regex = new RegExp(message.pattern.replace(/\*/g, '.*'));
                        return regex.test(key);
                    });
                    for (const key of localKeys) {
                        await this.unregisterKey(key);
                    }
                }
                if (message.tags) {
                    for (const tag of message.tags) {
                        const taggedKeys = this.tagIndex.get(tag);
                        if (taggedKeys) {
                            for (const key of Array.from(taggedKeys)) {
                                await this.unregisterKey(key);
                            }
                        }
                    }
                }
                this.logger.debug('Processed invalidation message', {
                    key: message.key,
                    pattern: message.pattern,
                    tags: message.tags,
                    fromInstance: message.instanceId
                });
            }
            catch (error) {
                this.logger.error('Error processing invalidation message', { error, message });
            }
        });
    }
    updateLocalIndices(key, tags) {
        let keyTagSet = this.keyTags.get(key);
        if (!keyTagSet) {
            keyTagSet = new Set();
            this.keyTags.set(key, keyTagSet);
        }
        tags.forEach(tag => keyTagSet.add(tag));
        for (const tag of tags) {
            let tagKeySet = this.tagIndex.get(tag);
            if (!tagKeySet) {
                tagKeySet = new Set();
                this.tagIndex.set(tag, tagKeySet);
            }
            tagKeySet.add(key);
        }
    }
    removeFromLocalIndices(key, tags) {
        this.keyTags.delete(key);
        for (const tag of tags) {
            const tagKeySet = this.tagIndex.get(tag);
            if (tagKeySet) {
                tagKeySet.delete(key);
                if (tagKeySet.size === 0) {
                    this.tagIndex.delete(tag);
                }
            }
        }
    }
    async processCascadeInvalidation(pattern) {
        for (const [name, registeredPattern] of this.patternHandlers.entries()) {
            if (registeredPattern.cascade && registeredPattern.pattern !== pattern) {
                if (this.shouldCascade(pattern, registeredPattern.pattern)) {
                    await this.executePattern(name);
                }
            }
        }
    }
    shouldCascade(triggerPattern, targetPattern) {
        const triggerPrefix = triggerPattern.split('*')[0];
        const targetPrefix = targetPattern.split('*')[0];
        return triggerPrefix.length > 0 &&
            targetPrefix.startsWith(triggerPrefix) &&
            triggerPrefix !== targetPrefix;
    }
    getTagIndexKey() {
        return `${this.keyPrefix}:tags:index`;
    }
    getKeyTagsKey(key) {
        return `${this.keyPrefix}:key:tags:${key}`;
    }
    getTagKeysKey(tag) {
        return `${this.keyPrefix}:tag:keys:${tag}`;
    }
}
exports.InvalidationManager = InvalidationManager;
//# sourceMappingURL=invalidation-manager.js.map