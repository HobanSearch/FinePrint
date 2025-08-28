// Redis Caching Service for Configuration Management
// Provides high-performance caching with TTL, invalidation, and distribution

import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  tags?: string[];
  version?: number;
}

export interface CacheEntry<T = any> {
  value: T;
  createdAt: number;
  expiresAt: number;
  version?: number;
  tags?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
}

export class CacheService extends EventEmitter {
  private redis: Redis;
  private defaultTTL: number;
  private keyPrefix: string;
  private stats: CacheStats;
  private compressionThreshold: number;

  constructor(
    redis: Redis,
    options: {
      defaultTTL?: number;
      keyPrefix?: string;
      compressionThreshold?: number;
    } = {}
  ) {
    super();
    
    this.redis = redis;
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes
    this.keyPrefix = options.keyPrefix || 'cache:';
    this.compressionThreshold = options.compressionThreshold || 1024; // 1KB
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      totalKeys: 0,
      memoryUsage: 0,
    };

    // Set up periodic stats update
    this.startStatsUpdater();
  }

  // Get a value from cache
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const cached = await this.redis.get(fullKey);
      
      if (!cached) {
        this.stats.misses++;
        this.updateHitRate();
        this.emit('cacheMiss', key);
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if expired (additional safety check)
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.redis.del(fullKey);
        this.stats.misses++;
        this.updateHitRate();
        this.emit('cacheExpired', key);
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();
      this.emit('cacheHit', key);
      return entry.value;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }
  }

  // Set a value in cache
  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const ttl = options.ttl || this.defaultTTL;
      const fullKey = this.buildKey(key, options.prefix);
      
      const entry: CacheEntry<T> = {
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        version: options.version,
        tags: options.tags,
      };

      const serialized = JSON.stringify(entry);
      
      // Use compression for large values
      let finalValue = serialized;
      if (serialized.length > this.compressionThreshold) {
        // In a real implementation, you might use compression here
        // For now, we'll just store the serialized value
        finalValue = serialized;
      }

      await this.redis.setex(fullKey, ttl, finalValue);
      
      // Add to tag indexes if tags are provided
      if (options.tags && options.tags.length > 0) {
        await this.addToTagIndexes(fullKey, options.tags, ttl);
      }

      this.stats.sets++;
      this.emit('cacheSet', key, options);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  // Get multiple values from cache
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    try {
      const fullKeys = keys.map(key => this.buildKey(key));
      const cached = await this.redis.mget(...fullKeys);
      
      const results: (T | null)[] = [];
      
      for (let i = 0; i < cached.length; i++) {
        const value = cached[i];
        const originalKey = keys[i];
        
        if (!value) {
          results.push(null);
          this.stats.misses++;
          this.emit('cacheMiss', originalKey);
          continue;
        }

        try {
          const entry: CacheEntry<T> = JSON.parse(value);
          
          // Check if expired
          if (entry.expiresAt && Date.now() > entry.expiresAt) {
            await this.redis.del(fullKeys[i]);
            results.push(null);
            this.stats.misses++;
            this.emit('cacheExpired', originalKey);
            continue;
          }

          results.push(entry.value);
          this.stats.hits++;
          this.emit('cacheHit', originalKey);
        } catch (parseError) {
          console.error(`Failed to parse cached value for key ${originalKey}:`, parseError);
          results.push(null);
          this.stats.misses++;
        }
      }

      this.updateHitRate();
      return results;
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  // Set multiple values in cache
  async mset<T = any>(
    entries: Array<{ key: string; value: T; options?: CacheOptions }>
  ): Promise<void> {
    if (entries.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();
      const tagOperations: Array<{ key: string; tags: string[]; ttl: number }> = [];

      for (const { key, value, options = {} } of entries) {
        const ttl = options.ttl || this.defaultTTL;
        const fullKey = this.buildKey(key, options.prefix);
        
        const entry: CacheEntry<T> = {
          value,
          createdAt: Date.now(),
          expiresAt: Date.now() + (ttl * 1000),
          version: options.version,
          tags: options.tags,
        };

        const serialized = JSON.stringify(entry);
        pipeline.setex(fullKey, ttl, serialized);

        // Collect tag operations
        if (options.tags && options.tags.length > 0) {
          tagOperations.push({ key: fullKey, tags: options.tags, ttl });
        }

        this.stats.sets++;
      }

      await pipeline.exec();

      // Handle tag indexes
      for (const { key, tags, ttl } of tagOperations) {
        await this.addToTagIndexes(key, tags, ttl);
      }

      this.emit('cacheMset', entries.length);
    } catch (error) {
      console.error('Cache mset error:', error);
      throw error;
    }
  }

  // Delete a value from cache
  async del(key: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      
      // Get the entry to check for tags before deletion
      const cached = await this.redis.get(fullKey);
      if (cached) {
        try {
          const entry: CacheEntry = JSON.parse(cached);
          if (entry.tags && entry.tags.length > 0) {
            await this.removeFromTagIndexes(fullKey, entry.tags);
          }
        } catch (parseError) {
          // Continue with deletion even if we can't parse tags
        }
      }

      const result = await this.redis.del(fullKey);
      
      if (result > 0) {
        this.stats.deletes++;
        this.emit('cacheDelete', key);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  // Delete multiple keys
  async mdel(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;

    try {
      const fullKeys = keys.map(key => this.buildKey(key));
      const result = await this.redis.del(...fullKeys);
      
      this.stats.deletes += result;
      this.emit('cacheMdelete', keys.length, result);
      
      return result;
    } catch (error) {
      console.error('Cache mdel error:', error);
      return 0;
    }
  }

  // Invalidate cache by tags
  async invalidateByTags(tags: string[]): Promise<number> {
    if (tags.length === 0) return 0;

    try {
      let allKeys = new Set<string>();
      
      // Get all keys for each tag
      for (const tag of tags) {
        const tagKeys = await this.redis.smembers(this.buildTagKey(tag));
        tagKeys.forEach(key => allKeys.add(key));
      }

      if (allKeys.size === 0) return 0;

      // Delete all keys
      const keysArray = Array.from(allKeys);
      const result = await this.redis.del(...keysArray);

      // Clean up tag indexes
      const pipeline = this.redis.pipeline();
      for (const tag of tags) {
        pipeline.del(this.buildTagKey(tag));
      }
      await pipeline.exec();

      this.stats.deletes += result;
      this.emit('cacheInvalidateByTags', tags, result);
      
      return result;
    } catch (error) {
      console.error('Cache invalidate by tags error:', error);
      return 0;
    }
  }

  // Clear all cache with optional pattern
  async clear(pattern?: string): Promise<number> {
    try {
      const searchPattern = pattern 
        ? `${this.keyPrefix}${pattern}*`
        : `${this.keyPrefix}*`;
      
      const keys = await this.redis.keys(searchPattern);
      
      if (keys.length === 0) return 0;

      const result = await this.redis.del(...keys);
      
      // Also clear tag indexes
      const tagKeys = await this.redis.keys(`${this.keyPrefix}tag:*`);
      if (tagKeys.length > 0) {
        await this.redis.del(...tagKeys);
      }

      this.stats.deletes += result;
      this.emit('cacheClear', pattern, result);
      
      return result;
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }

  // Check if a key exists
  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  // Get TTL for a key
  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      console.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // Extend TTL for a key
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      console.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Reset statistics
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      totalKeys: 0,
      memoryUsage: 0,
    };
    this.emit('statsReset');
  }

  // Get cache size information
  async getSize(): Promise<{
    keyCount: number;
    memoryUsage: number;
    averageKeySize: number;
  }> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const keyCount = keys.length;
      
      // Get memory usage (this is Redis-specific)
      const info = await this.redis.memory('usage', this.keyPrefix + '*');
      const memoryUsage = info || 0;
      
      const averageKeySize = keyCount > 0 ? memoryUsage / keyCount : 0;

      return {
        keyCount,
        memoryUsage,
        averageKeySize,
      };
    } catch (error) {
      console.error('Cache size calculation error:', error);
      return {
        keyCount: 0,
        memoryUsage: 0,
        averageKeySize: 0,
      };
    }
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      const info = await this.redis.info('memory');
      
      return {
        healthy: true,
        details: {
          latency,
          memoryInfo: info,
          stats: this.getStats(),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: String(error),
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Private helper methods

  private buildKey(key: string, prefix?: string): string {
    return `${prefix || this.keyPrefix}${key}`;
  }

  private buildTagKey(tag: string): string {
    return `${this.keyPrefix}tag:${tag}`;
  }

  private async addToTagIndexes(key: string, tags: string[], ttl: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const tag of tags) {
      const tagKey = this.buildTagKey(tag);
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, ttl + 60); // Give tag index a bit more TTL
    }
    
    await pipeline.exec();
  }

  private async removeFromTagIndexes(key: string, tags: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const tag of tags) {
      const tagKey = this.buildTagKey(tag);
      pipeline.srem(tagKey, key);
    }
    
    await pipeline.exec();
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  private startStatsUpdater(): void {
    // Update stats every 30 seconds
    setInterval(async () => {
      try {
        const size = await this.getSize();
        this.stats.totalKeys = size.keyCount;
        this.stats.memoryUsage = size.memoryUsage;
      } catch (error) {
        console.error('Failed to update cache stats:', error);
      }
    }, 30000);
  }
}