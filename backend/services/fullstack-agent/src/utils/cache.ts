import NodeCache from 'node-cache';
import { Redis } from 'ioredis';
import { Logger } from './logger';
import { config } from '@/config';

export interface CacheOptions {
  ttl?: number;
  checkPeriod?: number;
  useRedis?: boolean;
}

export class Cache {
  private readonly logger = Logger.getInstance();
  private nodeCache: NodeCache;
  private redis?: Redis;
  private readonly prefix: string;
  private readonly useRedis: boolean;

  constructor(namespace: string = 'default', options: CacheOptions = {}) {
    this.prefix = `${config.redis.keyPrefix}${namespace}:`;
    this.useRedis = options.useRedis || false;

    // Initialize NodeCache for local caching
    this.nodeCache = new NodeCache({
      stdTTL: options.ttl || config.redis.ttl,
      checkperiod: options.checkPeriod || 600,
      useClones: false,
    });

    // Initialize Redis if configured
    if (this.useRedis && config.redis.url) {
      this.initializeRedis();
    }
  }

  private initializeRedis(): void {
    try {
      this.redis = new Redis(config.redis.url, {
        keyPrefix: this.prefix,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
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
    } catch (error) {
      this.logger.error('Failed to initialize Redis', { error: error.message });
      this.useRedis = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Try local cache first
      const localValue = this.nodeCache.get<T>(key);
      if (localValue !== undefined) {
        this.logger.trace('Cache hit (local)', { key });
        return localValue;
      }

      // Try Redis if available
      if (this.redis && this.useRedis) {
        const redisValue = await this.redis.get(key);
        if (redisValue) {
          const parsedValue = JSON.parse(redisValue) as T;
          
          // Store in local cache for faster access
          this.nodeCache.set(key, parsedValue);
          
          this.logger.trace('Cache hit (redis)', { key });
          return parsedValue;
        }
      }

      this.logger.trace('Cache miss', { key });
      return null;
    } catch (error) {
      this.logger.warn('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const effectiveTtl = ttl || config.redis.ttl;

      // Store in local cache
      this.nodeCache.set(key, value, effectiveTtl);

      // Store in Redis if available
      if (this.redis && this.useRedis) {
        const serialized = JSON.stringify(value);
        if (effectiveTtl > 0) {
          await this.redis.setex(key, effectiveTtl, serialized);
        } else {
          await this.redis.set(key, serialized);
        }
      }

      this.logger.trace('Cache set', { key, ttl: effectiveTtl });
    } catch (error) {
      this.logger.warn('Cache set error', { key, error: error.message });
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      // Delete from local cache
      this.nodeCache.del(key);

      // Delete from Redis if available
      if (this.redis && this.useRedis) {
        await this.redis.del(key);
      }

      this.logger.trace('Cache delete', { key });
    } catch (error) {
      this.logger.warn('Cache delete error', { key, error: error.message });
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    try {
      // Check local cache first
      if (this.nodeCache.has(key)) {
        return true;
      }

      // Check Redis if available
      if (this.redis && this.useRedis) {
        const exists = await this.redis.exists(key);
        return exists === 1;
      }

      return false;
    } catch (error) {
      this.logger.warn('Cache has error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Clear cache (supports patterns)
   */
  async clear(pattern?: string): Promise<void> {
    try {
      if (!pattern || pattern === '*') {
        // Clear all
        this.nodeCache.flushAll();
        
        if (this.redis && this.useRedis) {
          const keys = await this.redis.keys('*');
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        }
        
        this.logger.debug('Cache cleared (all)', { prefix: this.prefix });
      } else {
        // Clear by pattern
        const localKeys = this.nodeCache.keys();
        const matchingLocalKeys = localKeys.filter(key => 
          this.matchesPattern(key, pattern)
        );
        this.nodeCache.del(matchingLocalKeys);

        if (this.redis && this.useRedis) {
          const redisKeys = await this.redis.keys(pattern);
          if (redisKeys.length > 0) {
            await this.redis.del(...redisKeys);
          }
        }

        this.logger.debug('Cache cleared (pattern)', { pattern, prefix: this.prefix });
      }
    } catch (error) {
      this.logger.warn('Cache clear error', { pattern, error: error.message });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    local: {
      keys: number;
      hits: number;
      misses: number;
      ksize: number;
      vsize: number;
    };
    redis?: {
      connected: boolean;
      memory?: string;
      keys?: number;
    };
  } {
    const localStats = this.nodeCache.getStats();
    
    const stats: any = {
      local: localStats,
    };

    if (this.redis && this.useRedis) {
      stats.redis = {
        connected: this.redis.status === 'ready',
      };
    }

    return stats;
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    try {
      const allKeys = new Set<string>();

      // Get local keys
      const localKeys = this.nodeCache.keys();
      localKeys.forEach(key => {
        if (this.matchesPattern(key, pattern)) {
          allKeys.add(key);
        }
      });

      // Get Redis keys if available
      if (this.redis && this.useRedis) {
        const redisKeys = await this.redis.keys(pattern);
        redisKeys.forEach(key => allKeys.add(key));
      }

      return Array.from(allKeys);
    } catch (error) {
      this.logger.warn('Cache keys error', { pattern, error: error.message });
      return [];
    }
  }

  /**
   * Set multiple values at once
   */
  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const promises = keyValuePairs.map(({ key, value, ttl }) => 
        this.set(key, value, ttl)
      );
      
      await Promise.all(promises);
      
      this.logger.trace('Cache mset', { count: keyValuePairs.length });
    } catch (error) {
      this.logger.warn('Cache mset error', { error: error.message });
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const promises = keys.map(key => this.get<T>(key));
      const results = await Promise.all(promises);
      
      this.logger.trace('Cache mget', { count: keys.length });
      return results;
    } catch (error) {
      this.logger.warn('Cache mget error', { error: error.message });
      return new Array(keys.length).fill(null);
    }
  }

  /**
   * Increment numeric value
   */
  async increment(key: string, delta: number = 1): Promise<number> {
    try {
      let currentValue = await this.get<number>(key) || 0;
      currentValue += delta;
      await this.set(key, currentValue);
      
      this.logger.trace('Cache increment', { key, delta, newValue: currentValue });
      return currentValue;
    } catch (error) {
      this.logger.warn('Cache increment error', { key, error: error.message });
      return 0;
    }
  }

  /**
   * Set value with expiration
   */
  async expire(key: string, ttl: number): Promise<void> {
    try {
      const value = await this.get(key);
      if (value !== null) {
        await this.set(key, value, ttl);
      }
      
      this.logger.trace('Cache expire', { key, ttl });
    } catch (error) {
      this.logger.warn('Cache expire error', { key, error: error.message });
    }
  }

  /**
   * Get time to live for key
   */
  async ttl(key: string): Promise<number> {
    try {
      if (this.redis && this.useRedis) {
        return await this.redis.ttl(key);
      }
      
      // For local cache, we don't have direct TTL access
      // Return -1 (no expiration) or -2 (key doesn't exist)
      return this.nodeCache.has(key) ? -1 : -2;
    } catch (error) {
      this.logger.warn('Cache ttl error', { key, error: error.message });
      return -2;
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      this.nodeCache.close();
      
      if (this.redis) {
        await this.redis.quit();
      }
      
      this.logger.debug('Cache connections closed', { prefix: this.prefix });
    } catch (error) {
      this.logger.warn('Cache close error', { error: error.message });
    }
  }

  // Private helper methods

  private matchesPattern(str: string, pattern: string): boolean {
    if (pattern === '*') return true;
    
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }
}