/**
 * Redis caching layer for high-performance content delivery
 * Implements multi-layer caching with automatic warming and invalidation
 */

import Redis from 'ioredis';
import { CacheEntry, CacheError } from '../types';
import { logger } from '../utils/logger';

export class RedisCache {
  private client: Redis;
  private memoryCache: Map<string, CacheEntry>;
  private readonly maxMemoryCacheSize = 1000;
  private readonly defaultTTL = 300; // 5 minutes

  constructor(
    private readonly config: {
      host: string;
      port: number;
      password?: string;
      db: number;
      keyPrefix: string;
    }
  ) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      }
    });

    this.memoryCache = new Map();
    this.setupEventHandlers();
    this.startCacheMaintenace();
  }

  /**
   * Get value from cache (multi-layer)
   */
  async get(key: string): Promise<any | null> {
    const startTime = Date.now();

    try {
      // L1: Check memory cache
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && this.isValid(memoryEntry)) {
        memoryEntry.hits++;
        memoryEntry.lastAccess = new Date();
        logger.debug({ 
          key, 
          latency: Date.now() - startTime,
          layer: 'memory' 
        }, 'Cache hit (memory)');
        return memoryEntry.value;
      }

      // L2: Check Redis cache
      const redisValue = await this.client.get(key);
      if (redisValue) {
        const value = JSON.parse(redisValue);
        
        // Promote to memory cache
        this.addToMemoryCache(key, value, this.defaultTTL);
        
        logger.debug({ 
          key, 
          latency: Date.now() - startTime,
          layer: 'redis' 
        }, 'Cache hit (Redis)');
        return value;
      }

      logger.debug({ key }, 'Cache miss');
      return null;

    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      throw new CacheError(`Failed to get cache key: ${key}`);
    }
  }

  /**
   * Set value in cache (multi-layer)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const effectiveTTL = ttl || this.defaultTTL;

    try {
      // Set in Redis
      await this.client.setex(
        key,
        effectiveTTL,
        JSON.stringify(value)
      );

      // Set in memory cache
      this.addToMemoryCache(key, value, effectiveTTL);

      logger.debug({ key, ttl: effectiveTTL }, 'Cache set');

    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
      throw new CacheError(`Failed to set cache key: ${key}`);
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.memoryCache.delete(key);
      logger.debug({ key }, 'Cache key deleted');
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
      throw new CacheError(`Failed to delete cache key: ${key}`);
    }
  }

  /**
   * Delete keys by pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.keys(pattern);
      
      if (keys.length > 0) {
        // Delete from Redis
        await this.client.del(...keys.map(k => k.replace(this.config.keyPrefix, '')));
        
        // Delete from memory cache
        for (const key of keys) {
          this.memoryCache.delete(key);
        }
        
        logger.info({ pattern, count: keys.length }, 'Cache pattern deleted');
      }
    } catch (error) {
      logger.error({ error, pattern }, 'Cache pattern delete error');
      throw new CacheError(`Failed to delete cache pattern: ${pattern}`);
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(`${this.config.keyPrefix}${pattern}`);
    } catch (error) {
      logger.error({ error, pattern }, 'Cache keys error');
      return [];
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Get remaining TTL for key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache TTL error');
      return -1;
    }
  }

  /**
   * Invalidate cache for content update
   */
  async invalidateContent(category: string, page?: string): Promise<void> {
    const pattern = page ? `content:${category}:${page}:*` : `content:${category}:*`;
    await this.deletePattern(pattern);
    logger.info({ category, page }, 'Content cache invalidated');
  }

  /**
   * Warm cache with frequently accessed content
   */
  async warmCache(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const startTime = Date.now();
    let warmed = 0;

    for (const entry of entries) {
      try {
        await this.set(entry.key, entry.value, entry.ttl);
        warmed++;
      } catch (error) {
        logger.error({ error, key: entry.key }, 'Cache warming error');
      }
    }

    logger.info({ 
      warmed, 
      total: entries.length,
      duration: Date.now() - startTime 
    }, 'Cache warmed');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memorySize: number;
    memoryHits: number;
    redisSize: number;
    hitRate: number;
    avgLatency: number;
  }> {
    const info = await this.client.info('stats');
    const keyspaceInfo = await this.client.info('keyspace');
    
    // Calculate memory cache stats
    let totalHits = 0;
    for (const entry of this.memoryCache.values()) {
      totalHits += entry.hits;
    }

    // Parse Redis stats
    const redisKeys = parseInt(
      keyspaceInfo.match(/keys=(\d+)/)?.[1] || '0'
    );

    return {
      memorySize: this.memoryCache.size,
      memoryHits: totalHits,
      redisSize: redisKeys,
      hitRate: 0, // Would need to track hits/misses
      avgLatency: 0 // Would need to track latencies
    };
  }

  /**
   * Clear all cache
   */
  async flush(): Promise<void> {
    try {
      await this.client.flushdb();
      this.memoryCache.clear();
      logger.warn('Cache flushed');
    } catch (error) {
      logger.error({ error }, 'Cache flush error');
      throw new CacheError('Failed to flush cache');
    }
  }

  /**
   * Add entry to memory cache with LRU eviction
   */
  private addToMemoryCache(key: string, value: any, ttl: number): void {
    // Evict oldest entries if at capacity
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const oldestKey = this.findOldestEntry();
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    const entry: CacheEntry = {
      key,
      value,
      ttl,
      hits: 0,
      createdAt: new Date(),
      lastAccess: new Date()
    };

    this.memoryCache.set(key, entry);
  }

  /**
   * Find oldest cache entry for eviction
   */
  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestAccess = new Date();

    for (const [key, entry] of this.memoryCache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    const now = Date.now();
    const created = entry.createdAt.getTime();
    const age = (now - created) / 1000; // Age in seconds
    
    return age < entry.ttl;
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis cache connected');
    });

    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis cache error');
    });

    this.client.on('close', () => {
      logger.warn('Redis cache connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis cache reconnecting');
    });
  }

  /**
   * Start periodic cache maintenance
   */
  private startCacheMaintenace(): void {
    // Clean expired entries every minute
    setInterval(() => {
      this.cleanExpiredEntries();
    }, 60000);

    // Log stats every 5 minutes
    setInterval(async () => {
      const stats = await this.getStats();
      logger.info({ stats }, 'Cache statistics');
    }, 300000);
  }

  /**
   * Clean expired entries from memory cache
   */
  private cleanExpiredEntries(): void {
    let cleaned = 0;
    
    for (const [key, entry] of this.memoryCache) {
      if (!this.isValid(entry)) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Expired cache entries cleaned');
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis cache connection closed');
  }
}

/**
 * Cache warmer for pre-loading popular content
 */
export class CacheWarmer {
  constructor(
    private readonly cache: RedisCache,
    private readonly contentLoader: () => Promise<Array<{
      key: string;
      value: any;
      ttl?: number;
    }>>
  ) {}

  /**
   * Warm cache on startup
   */
  async warmOnStartup(): Promise<void> {
    logger.info('Starting cache warming');
    
    try {
      const entries = await this.contentLoader();
      await this.cache.warmCache(entries);
    } catch (error) {
      logger.error({ error }, 'Cache warming failed');
    }
  }

  /**
   * Schedule periodic cache warming
   */
  schedulePeriodic(intervalMs: number = 3600000): void {
    setInterval(async () => {
      await this.warmOnStartup();
    }, intervalMs);
  }
}