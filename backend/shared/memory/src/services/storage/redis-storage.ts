/**
 * Redis Storage Service - Hot Tier
 * Provides sub-second access to frequently accessed memories
 */

import Redis from 'ioredis';
import { StorageTier, MemoryType, ImportanceLevel } from '../../types';
import { Logger } from '../../utils/logger';
import { Metrics } from '../../utils/metrics';

export interface RedisStorageConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  ttl: number;
  maxMemorySize: number;
  keyPrefix: string;
  compressionEnabled: boolean;
}

export interface CachedMemory {
  id: string;
  type: MemoryType;
  title: string;
  content: Record<string, any>;
  metadata: Record<string, any>;
  embedding?: number[];
  importance: ImportanceLevel;
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  version: number;
}

export class RedisStorageService {
  private redis: Redis;
  private logger: Logger;
  private metrics: Metrics;
  private config: RedisStorageConfig;

  constructor(config: RedisStorageConfig) {
    this.config = config;
    this.logger = Logger.getInstance('RedisStorage');
    this.metrics = Metrics.getInstance();
    
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: config.keyPrefix,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.logger.info('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
      this.metrics.increment('redis.connection.errors');
    });

    this.redis.on('ready', () => {
      this.logger.info('Redis is ready');
    });
  }

  /**
   * Store memory in Redis hot tier
   */
  async store(memory: CachedMemory): Promise<void> {
    const startTime = Date.now();
    
    try {
      const key = this.getMemoryKey(memory.id);
      const compressed = this.config.compressionEnabled ? 
        await this.compress(memory) : memory;
      
      const pipeline = this.redis.pipeline();
      
      // Store the memory
      pipeline.setex(
        key,
        this.config.ttl,
        JSON.stringify(compressed)
      );
      
      // Update access tracking
      pipeline.zadd(
        'memory:access_count',
        memory.accessCount,
        memory.id
      );
      
      // Update type-based index
      pipeline.sadd(
        `memory:type:${memory.type}`,
        memory.id
      );
      
      // Update importance-based index  
      pipeline.sadd(
        `memory:importance:${memory.importance}`,
        memory.id
      );
      
      // Store embedding if present for vector search
      if (memory.embedding) {
        pipeline.hset(
          'memory:embeddings',
          memory.id,
          JSON.stringify(memory.embedding)
        );
      }
      
      await pipeline.exec();
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.store.duration', responseTime);
      this.metrics.increment('redis.store.success');
      
      this.logger.debug(`Stored memory ${memory.id} in Redis (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('redis.store.errors');
      this.logger.error(`Failed to store memory ${memory.id} in Redis:`, error);
      throw error;
    }
  }

  /**
   * Retrieve memory from Redis hot tier
   */
  async retrieve(memoryId: string): Promise<CachedMemory | null> {
    const startTime = Date.now();
    
    try {
      const key = this.getMemoryKey(memoryId);
      const data = await this.redis.get(key);
      
      if (!data) {
        this.metrics.increment('redis.retrieve.miss');
        return null;
      }
      
      let memory = JSON.parse(data) as CachedMemory;
      
      if (this.config.compressionEnabled) {
        memory = await this.decompress(memory);
      }
      
      // Update access tracking
      await this.updateAccessTracking(memoryId, memory.accessCount + 1);
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.retrieve.duration', responseTime);
      this.metrics.increment('redis.retrieve.hit');
      
      this.logger.debug(`Retrieved memory ${memoryId} from Redis (${responseTime}ms)`);
      
      return memory;
    } catch (error) {
      this.metrics.increment('redis.retrieve.errors');
      this.logger.error(`Failed to retrieve memory ${memoryId} from Redis:`, error);
      throw error;
    }
  }

  /**
   * Update existing memory in Redis
   */
  async update(memoryId: string, updates: Partial<CachedMemory>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const existing = await this.retrieve(memoryId);
      if (!existing) {
        throw new Error(`Memory ${memoryId} not found in Redis`);
      }
      
      const updated = { ...existing, ...updates, version: existing.version + 1 };
      await this.store(updated);
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.update.duration', responseTime);
      this.metrics.increment('redis.update.success');
      
      this.logger.debug(`Updated memory ${memoryId} in Redis (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('redis.update.errors');
      this.logger.error(`Failed to update memory ${memoryId} in Redis:`, error);
      throw error;
    }
  }

  /**
   * Delete memory from Redis hot tier
   */
  async delete(memoryId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const memory = await this.retrieve(memoryId);
      if (!memory) {
        return; // Already deleted
      }
      
      const pipeline = this.redis.pipeline();
      
      // Delete main memory
      pipeline.del(this.getMemoryKey(memoryId));
      
      // Remove from indexes
      pipeline.zrem('memory:access_count', memoryId);
      pipeline.srem(`memory:type:${memory.type}`, memoryId);
      pipeline.srem(`memory:importance:${memory.importance}`, memoryId);
      pipeline.hdel('memory:embeddings', memoryId);
      
      await pipeline.exec();
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.delete.duration', responseTime);
      this.metrics.increment('redis.delete.success');
      
      this.logger.debug(`Deleted memory ${memoryId} from Redis (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('redis.delete.errors');
      this.logger.error(`Failed to delete memory ${memoryId} from Redis:`, error);
      throw error;
    }
  }

  /**
   * Search memories by type and importance
   */
  async search(
    filters: {
      types?: MemoryType[];
      importance?: ImportanceLevel[];
      limit?: number;
      sortBy?: 'accessCount' | 'createdAt';
    }
  ): Promise<CachedMemory[]> {
    const startTime = Date.now();
    
    try {
      let memoryIds: string[] = [];
      
      if (filters.types?.length) {
        // Get intersection of all type sets
        const typeKeys = filters.types.map(type => `memory:type:${type}`);
        if (typeKeys.length === 1) {
          memoryIds = await this.redis.smembers(typeKeys[0]);
        } else {
          memoryIds = await this.redis.sinter(...typeKeys);
        }
      } else {
        // Get all memory IDs from access count sorted set
        memoryIds = await this.redis.zrevrange(
          'memory:access_count',
          0,
          filters.limit || 100
        );
      }
      
      // Filter by importance if specified
      if (filters.importance?.length) {
        const importanceIds = new Set<string>();
        for (const importance of filters.importance) {
          const ids = await this.redis.smembers(`memory:importance:${importance}`);
          ids.forEach(id => importanceIds.add(id));
        }
        memoryIds = memoryIds.filter(id => importanceIds.has(id));
      }
      
      // Retrieve memories
      const memories: CachedMemory[] = [];
      for (const id of memoryIds) {
        const memory = await this.retrieve(id);
        if (memory) {
          memories.push(memory);
        }
      }
      
      // Sort results
      if (filters.sortBy === 'accessCount') {
        memories.sort((a, b) => b.accessCount - a.accessCount);
      } else if (filters.sortBy === 'createdAt') {
        memories.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.search.duration', responseTime);
      this.metrics.increment('redis.search.success');
      
      this.logger.debug(`Searched Redis and found ${memories.length} memories (${responseTime}ms)`);
      
      return memories.slice(0, filters.limit || 100);
    } catch (error) {
      this.metrics.increment('redis.search.errors');
      this.logger.error('Failed to search memories in Redis:', error);
      throw error;
    }
  }

  /**
   * Vector similarity search using Redis vector capabilities
   */
  async vectorSearch(
    queryEmbedding: number[],
    options: {
      threshold?: number;
      limit?: number;
      types?: MemoryType[];
    } = {}
  ): Promise<Array<{ memory: CachedMemory; similarity: number }>> {
    const startTime = Date.now();
    
    try {
      // Get all embeddings
      const embeddings = await this.redis.hgetall('memory:embeddings');
      const results: Array<{ memory: CachedMemory; similarity: number }> = [];
      
      for (const [memoryId, embeddingStr] of Object.entries(embeddings)) {
        const embedding = JSON.parse(embeddingStr) as number[];
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        
        if (similarity >= (options.threshold || 0.5)) {
          const memory = await this.retrieve(memoryId);
          if (memory && (!options.types || options.types.includes(memory.type))) {
            results.push({ memory, similarity });
          }
        }
      }
      
      // Sort by similarity and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.vector_search.duration', responseTime);
      this.metrics.increment('redis.vector_search.success');
      
      this.logger.debug(`Vector search found ${results.length} similar memories (${responseTime}ms)`);
      
      return results.slice(0, options.limit || 50);
    } catch (error) {
      this.metrics.increment('redis.vector_search.errors');
      this.logger.error('Failed to perform vector search in Redis:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalMemories: number;
    memoryTypes: Record<MemoryType, number>;
    importanceLevels: Record<ImportanceLevel, number>;
    totalSize: number;
    hitRate: number;
    missRate: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const totalSize = this.parseRedisInfo(info, 'used_memory');
      
      const stats = {
        totalMemories: await this.redis.zcard('memory:access_count'),
        memoryTypes: {} as Record<MemoryType, number>,
        importanceLevels: {} as Record<ImportanceLevel, number>,
        totalSize,
        hitRate: this.metrics.getHistogramStats('redis.retrieve.hit')?.total || 0,
        missRate: this.metrics.getHistogramStats('redis.retrieve.miss')?.total || 0,
      };
      
      // Get counts by type
      for (const type of Object.values(MemoryType)) {
        stats.memoryTypes[type] = await this.redis.scard(`memory:type:${type}`);
      }
      
      // Get counts by importance
      for (const importance of Object.values(ImportanceLevel)) {
        stats.importanceLevels[importance] = await this.redis.scard(`memory:importance:${importance}`);
      }
      
      return stats;
    } catch (error) {
      this.logger.error('Failed to get Redis stats:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - start;
      
      const info = await this.redis.info();
      
      return {
        healthy: true,
        details: {
          responseTime,
          connected: this.redis.status === 'ready',
          memory: this.parseRedisInfo(info, 'used_memory'),
          connections: this.parseRedisInfo(info, 'connected_clients'),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error.message },
      };
    }
  }

  /**
   * Cleanup expired memories and optimize indexes
   */
  async cleanup(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get all memory keys that might be expired
      const pattern = `${this.config.keyPrefix}memory:*`;
      const keys = await this.redis.keys(pattern);
      
      let cleaned = 0;
      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -2) { // Key doesn't exist (expired)
          const memoryId = key.replace(`${this.config.keyPrefix}memory:`, '');
          await this.delete(memoryId);
          cleaned++;
        }
      }
      
      // Optimize sorted sets by removing zero-scored items
      await this.redis.zremrangebyscore('memory:access_count', 0, 0);
      
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('redis.cleanup.duration', responseTime);
      
      this.logger.info(`Redis cleanup completed: removed ${cleaned} expired memories (${responseTime}ms)`);
    } catch (error) {
      this.logger.error('Failed to cleanup Redis:', error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.logger.info('Redis connection closed');
  }

  // Private helper methods

  private getMemoryKey(memoryId: string): string {
    return `memory:${memoryId}`;
  }

  private async updateAccessTracking(memoryId: string, accessCount: number): Promise<void> {
    await this.redis.zadd('memory:access_count', accessCount, memoryId);
  }

  private async compress(memory: CachedMemory): Promise<CachedMemory> {
    // Simple JSON compression - could be enhanced with gzip
    return {
      ...memory,
      content: JSON.stringify(memory.content),
      metadata: JSON.stringify(memory.metadata),
    } as any;
  }

  private async decompress(memory: any): Promise<CachedMemory> {
    return {
      ...memory,
      content: typeof memory.content === 'string' ? JSON.parse(memory.content) : memory.content,
      metadata: typeof memory.metadata === 'string' ? JSON.parse(memory.metadata) : memory.metadata,
      lastAccessed: new Date(memory.lastAccessed),
      createdAt: new Date(memory.createdAt),
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private parseRedisInfo(info: string, key: string): number {
    const match = info.match(new RegExp(`${key}:(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
  }
}