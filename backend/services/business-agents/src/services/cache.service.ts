/**
 * Cache Service for Business Agents
 */

import Redis from 'ioredis';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import { config } from '../config';
import { AgentType } from '../types';
import { logger } from '../utils/logger';

export class CacheService {
  private redis: Redis;
  private localCache: NodeCache;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      enableReadyCheck: config.redis.enableReadyCheck,
      lazyConnect: config.redis.lazyConnect,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    // Initialize local cache for hot data
    this.localCache = new NodeCache({
      stdTTL: 300, // 5 minutes default
      checkperiod: 60, // Check for expired keys every 60 seconds
      useClones: false // For better performance
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Redis connected for cache service');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error in cache service:', error);
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready for cache service');
    });
  }

  private generateKey(
    agentType: AgentType,
    operation: string,
    params: any
  ): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ agentType, operation, params }))
      .digest('hex');
    
    return `${agentType}:${operation}:${hash}`;
  }

  async get<T>(
    agentType: AgentType,
    operation: string,
    params: any
  ): Promise<T | null> {
    const key = this.generateKey(agentType, operation, params);

    try {
      // Check local cache first
      const localValue = this.localCache.get<T>(key);
      if (localValue !== undefined) {
        this.cacheHits++;
        logger.debug(`Local cache hit for ${key}`);
        return localValue;
      }

      // Check Redis
      const redisValue = await this.redis.get(key);
      if (redisValue) {
        this.cacheHits++;
        const parsed = JSON.parse(redisValue) as T;
        
        // Store in local cache for faster subsequent access
        this.localCache.set(key, parsed, 60); // 1 minute in local cache
        
        logger.debug(`Redis cache hit for ${key}`);
        return parsed;
      }

      this.cacheMisses++;
      logger.debug(`Cache miss for ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for ${key}:`, error);
      return null;
    }
  }

  async set<T>(
    agentType: AgentType,
    operation: string,
    params: any,
    value: T,
    ttl?: number
  ): Promise<void> {
    const key = this.generateKey(agentType, operation, params);
    const cacheConfig = config.cache[agentType];
    const finalTTL = ttl ?? cacheConfig.ttl;

    try {
      const serialized = JSON.stringify(value);
      
      // Check size limit
      const sizeInMB = Buffer.byteLength(serialized) / (1024 * 1024);
      if (sizeInMB > cacheConfig.maxSize) {
        logger.warn(`Cache value too large (${sizeInMB}MB) for ${key}, skipping cache`);
        return;
      }

      // Store in Redis
      await this.redis.setex(key, finalTTL, serialized);
      
      // Store in local cache with shorter TTL
      this.localCache.set(key, value, Math.min(finalTTL, 300));
      
      logger.debug(`Cached ${key} for ${finalTTL}s`);
    } catch (error) {
      logger.error(`Cache set error for ${key}:`, error);
    }
  }

  async invalidate(
    agentType: AgentType,
    operation?: string,
    params?: any
  ): Promise<void> {
    try {
      if (operation && params) {
        // Invalidate specific key
        const key = this.generateKey(agentType, operation, params);
        await this.redis.del(key);
        this.localCache.del(key);
        logger.debug(`Invalidated cache for ${key}`);
      } else if (operation) {
        // Invalidate all keys for operation
        const pattern = `${config.redis.keyPrefix}${agentType}:${operation}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys.map(k => k.replace(config.redis.keyPrefix, '')));
          keys.forEach(k => this.localCache.del(k.replace(config.redis.keyPrefix, '')));
          logger.debug(`Invalidated ${keys.length} cache keys for ${agentType}:${operation}`);
        }
      } else {
        // Invalidate all keys for agent type
        const pattern = `${config.redis.keyPrefix}${agentType}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys.map(k => k.replace(config.redis.keyPrefix, '')));
          keys.forEach(k => this.localCache.del(k.replace(config.redis.keyPrefix, '')));
          logger.debug(`Invalidated ${keys.length} cache keys for ${agentType}`);
        }
      }
    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }
  }

  async warmUp(
    agentType: AgentType,
    preloadData: Array<{ operation: string; params: any; value: any }>
  ): Promise<void> {
    try {
      for (const item of preloadData) {
        await this.set(agentType, item.operation, item.params, item.value);
      }
      logger.info(`Warmed up cache for ${agentType} with ${preloadData.length} items`);
    } catch (error) {
      logger.error(`Cache warm-up error for ${agentType}:`, error);
    }
  }

  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    localCacheKeys: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      localCacheKeys: this.localCache.keys().length
    };
  }

  resetStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  async flush(): Promise<void> {
    try {
      const pattern = `${config.redis.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys.map(k => k.replace(config.redis.keyPrefix, '')));
      }
      this.localCache.flushAll();
      this.resetStats();
      logger.info('Cache flushed successfully');
    } catch (error) {
      logger.error('Cache flush error:', error);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
    this.localCache.close();
    logger.info('Cache service closed');
  }
}

export const cacheService = new CacheService();