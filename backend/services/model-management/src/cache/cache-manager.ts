/**
 * Advanced Multi-tier Cache Manager with Semantic Similarity
 */

import { Redis } from 'ioredis';
import { LRUCache } from 'lru-cache';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import pino from 'pino';
import { 
  CacheConfig, 
  CacheEntry, 
  CacheTier, 
  CacheStats, 
  CacheOperation,
  SemanticSearchParams,
  SemanticSearchResult,
  CacheWarmingStrategy,
  CacheEvictionPolicy,
  EvictionStrategy,
  CompressionStats,
  CacheHealthMetrics,
  HealthStatus,
  CachedResponse,
  CacheMetadata
} from './types';
import { ModelCapability } from '../types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CacheManager {
  private memoryCache: LRUCache<string, CacheEntry>;
  private redis: Redis;
  private s3Client?: S3Client;
  private config: CacheConfig;
  private logger: pino.Logger;
  private stats: Map<CacheTier, CacheStats>;
  private operations: CacheOperation[] = [];
  private warmingStrategies: Map<string, CacheWarmingStrategy> = new Map();
  private evictionPolicies: Map<CacheTier, CacheEvictionPolicy>;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(redis: Redis, config?: Partial<CacheConfig>) {
    this.redis = redis;
    this.logger = pino({ name: 'cache-manager' });
    
    // Default configuration
    this.config = {
      memory: {
        enabled: true,
        maxSize: 1024 * 1024 * 1024, // 1GB
        ttl: 3600, // 1 hour
        checkPeriod: 600, // 10 minutes
        ...config?.memory
      },
      redis: {
        enabled: true,
        maxSize: 10 * 1024 * 1024 * 1024, // 10GB
        ttl: 86400, // 24 hours
        prefix: 'cache:',
        compression: true,
        ...config?.redis
      },
      s3: {
        enabled: !!process.env.AWS_S3_BUCKET,
        bucket: process.env.AWS_S3_BUCKET || '',
        region: process.env.AWS_REGION || 'us-east-1',
        prefix: 'cache/',
        ttl: 604800, // 7 days
        archiveAfterDays: 30,
        ...config?.s3
      },
      similarity: {
        threshold: 0.85,
        maxDistance: 10,
        vectorDimensions: 384,
        embeddingModel: 'all-MiniLM-L6-v2',
        ...config?.similarity
      }
    };

    // Initialize memory cache with size tracking
    this.memoryCache = new LRUCache<string, CacheEntry>({
      max: 10000, // max items
      maxSize: this.config.memory.maxSize,
      sizeCalculation: (entry) => entry.size,
      ttl: this.config.memory.ttl * 1000, // convert to ms
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (entry, key) => {
        this.logger.debug({ key, tier: 'memory' }, 'Evicting from memory cache');
        this.demoteEntry(key, entry);
      }
    });

    // Initialize S3 client if configured
    if (this.config.s3.enabled && this.config.s3.bucket) {
      this.s3Client = new S3Client({
        region: this.config.s3.region
      });
    }

    // Initialize stats tracking
    this.stats = new Map([
      [CacheTier.MEMORY, this.initializeStats(CacheTier.MEMORY)],
      [CacheTier.REDIS, this.initializeStats(CacheTier.REDIS)],
      [CacheTier.S3, this.initializeStats(CacheTier.S3)]
    ]);

    // Initialize eviction policies
    this.evictionPolicies = new Map([
      [CacheTier.MEMORY, {
        tier: CacheTier.MEMORY,
        strategy: EvictionStrategy.LRU,
        threshold: 90,
        targetSize: 80,
        protectedPatterns: ['critical:', 'enterprise:']
      }],
      [CacheTier.REDIS, {
        tier: CacheTier.REDIS,
        strategy: EvictionStrategy.HYBRID,
        threshold: 85,
        targetSize: 75,
        protectedPatterns: ['critical:', 'premium:'],
        maxAge: 86400 * 7 // 7 days
      }],
      [CacheTier.S3, {
        tier: CacheTier.S3,
        strategy: EvictionStrategy.TTL,
        threshold: 95,
        targetSize: 90,
        protectedPatterns: [],
        maxAge: 86400 * 30 // 30 days
      }]
    ]);

    // Start background tasks
    this.startMaintenanceTasks();
  }

  /**
   * Get cached entry with semantic similarity matching
   */
  async get(key: string, params?: SemanticSearchParams): Promise<CacheEntry | null> {
    const startTime = Date.now();
    let entry: CacheEntry | null = null;
    let tier: CacheTier | null = null;

    try {
      // Try exact match first
      entry = await this.getExact(key);
      
      // If no exact match and semantic search is requested
      if (!entry && params) {
        const semanticResults = await this.semanticSearch(params);
        if (semanticResults.length > 0) {
          entry = semanticResults[0].entry;
          // Update metadata to indicate semantic match
          if (entry.metadata) {
            entry.metadata.similarityScore = semanticResults[0].score;
          }
        }
      }

      if (entry) {
        // Update access stats
        entry.lastAccessed = new Date();
        entry.hits++;
        
        // Promote to higher tier if frequently accessed
        if (entry.hits > 10 && entry.tier !== CacheTier.MEMORY) {
          await this.promoteEntry(key, entry);
        }

        // Record operation
        this.recordOperation('GET', key, entry.tier, true, Date.now() - startTime);
        
        // Update stats
        this.updateHitRate(entry.tier, true);
      } else {
        // Record miss
        this.recordOperation('GET', key, CacheTier.MEMORY, false, Date.now() - startTime);
        this.updateHitRate(CacheTier.MEMORY, false);
      }

      return entry;
    } catch (error) {
      this.logger.error({ error, key }, 'Cache get error');
      this.recordOperation('GET', key, tier || CacheTier.MEMORY, false, Date.now() - startTime, error.message);
      return null;
    }
  }

  /**
   * Get exact cache entry without similarity matching
   */
  private async getExact(key: string): Promise<CacheEntry | null> {
    // Check memory cache first
    let entry = this.memoryCache.get(key);
    if (entry) {
      this.logger.debug({ key, tier: 'memory' }, 'Cache hit');
      return entry;
    }

    // Check Redis
    if (this.config.redis.enabled) {
      const redisKey = `${this.config.redis.prefix}${key}`;
      const data = await this.redis.get(redisKey);
      if (data) {
        try {
          let parsed: CacheEntry;
          if (this.config.redis.compression) {
            const decompressed = await gunzip(Buffer.from(data, 'base64'));
            parsed = JSON.parse(decompressed.toString());
          } else {
            parsed = JSON.parse(data);
          }
          
          // Restore dates
          parsed.created = new Date(parsed.created);
          parsed.expires = new Date(parsed.expires);
          parsed.lastAccessed = new Date(parsed.lastAccessed);
          
          this.logger.debug({ key, tier: 'redis' }, 'Cache hit');
          
          // Promote to memory if hot
          if (parsed.hits > 5) {
            this.memoryCache.set(key, parsed);
          }
          
          return parsed;
        } catch (error) {
          this.logger.error({ error, key }, 'Failed to parse Redis cache entry');
        }
      }
    }

    // Check S3
    if (this.config.s3.enabled && this.s3Client) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.config.s3.bucket,
          Key: `${this.config.s3.prefix}${key}`
        });
        
        const response = await this.s3Client.send(command);
        if (response.Body) {
          const bodyString = await this.streamToString(response.Body as Readable);
          const parsed: CacheEntry = JSON.parse(bodyString);
          
          // Restore dates
          parsed.created = new Date(parsed.created);
          parsed.expires = new Date(parsed.expires);
          parsed.lastAccessed = new Date(parsed.lastAccessed);
          
          this.logger.debug({ key, tier: 's3' }, 'Cache hit');
          
          // Promote to Redis if accessed
          if (this.config.redis.enabled) {
            await this.setTier(key, parsed, CacheTier.REDIS);
          }
          
          return parsed;
        }
      } catch (error) {
        if (error.name !== 'NoSuchKey') {
          this.logger.error({ error, key }, 'S3 get error');
        }
      }
    }

    return null;
  }

  /**
   * Set cache entry with automatic tiering
   */
  async set(
    key: string, 
    value: CachedResponse,
    metadata: CacheMetadata,
    modelId: string,
    capabilities: ModelCapability[],
    ttl?: number
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const now = new Date();
      const effectiveTtl = ttl || this.config.memory.ttl;
      
      // Calculate size
      const size = Buffer.byteLength(JSON.stringify(value));
      
      // Generate hashes
      const documentHash = this.generateHash(metadata.documentType + metadata.documentSize);
      const requestHash = this.generateHash(JSON.stringify({ modelId, capabilities, metadata }));
      
      // Create cache entry
      const entry: CacheEntry = {
        key,
        documentHash,
        requestHash,
        modelId,
        capabilities,
        value,
        metadata,
        created: now,
        expires: new Date(now.getTime() + effectiveTtl * 1000),
        lastAccessed: now,
        hits: 0,
        tier: CacheTier.MEMORY,
        compressed: false,
        size
      };

      // Generate embedding for semantic search if large enough
      if (size > 1024) { // Only for entries > 1KB
        entry.embedding = await this.generateEmbedding(value);
      }

      // Determine initial tier based on size and importance
      const targetTier = this.determineTargetTier(entry);
      
      // Store in appropriate tier
      await this.setTier(key, entry, targetTier);
      
      // Record operation
      this.recordOperation('SET', key, targetTier, true, Date.now() - startTime);
      
      // Update stats
      const stats = this.stats.get(targetTier);
      if (stats) {
        stats.totalEntries++;
        stats.totalSize += size;
      }
      
      this.logger.info({ 
        key, 
        tier: targetTier, 
        size, 
        ttl: effectiveTtl,
        compressed: entry.compressed 
      }, 'Cache entry set');
      
    } catch (error) {
      this.logger.error({ error, key }, 'Cache set error');
      this.recordOperation('SET', key, CacheTier.MEMORY, false, Date.now() - startTime, error.message);
      throw error;
    }
  }

  /**
   * Semantic similarity search
   */
  async semanticSearch(params: SemanticSearchParams): Promise<SemanticSearchResult[]> {
    const results: SemanticSearchResult[] = [];
    
    try {
      // Generate embedding for query if not provided
      const queryEmbedding = params.embedding || await this.generateEmbedding(params.query);
      
      // Search across all tiers
      const allEntries = await this.getAllEntries();
      
      for (const entry of allEntries) {
        if (!entry.embedding) continue;
        
        // Filter by capabilities if specified
        if (params.capabilities && params.capabilities.length > 0) {
          const hasCapability = params.capabilities.some(cap => 
            entry.capabilities.includes(cap)
          );
          if (!hasCapability) continue;
        }
        
        // Filter by document type if specified
        if (params.documentType && entry.metadata.documentType !== params.documentType) {
          continue;
        }
        
        // Calculate similarity
        const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
        
        if (similarity >= params.threshold) {
          results.push({
            key: entry.key,
            score: similarity,
            entry,
            tier: entry.tier
          });
        }
      }
      
      // Sort by score descending
      results.sort((a, b) => b.score - a.score);
      
      // Limit results
      return results.slice(0, params.maxResults);
      
    } catch (error) {
      this.logger.error({ error, params }, 'Semantic search error');
      return [];
    }
  }

  /**
   * Warm cache with predicted entries
   */
  async warmCache(strategy: CacheWarmingStrategy): Promise<void> {
    this.logger.info({ strategy: strategy.name }, 'Starting cache warming');
    
    try {
      const entriesToWarm: string[] = [];
      
      for (const source of strategy.sources) {
        switch (source.type) {
          case 'POPULAR':
            const popularKeys = await this.getPopularKeys(source.criteria.limit || 100);
            entriesToWarm.push(...popularKeys);
            break;
            
          case 'PREDICTED':
            const predictedKeys = await this.predictKeys(source.criteria);
            entriesToWarm.push(...predictedKeys);
            break;
            
          case 'PATTERN':
            const patternKeys = await this.getKeysByPattern(source.criteria.pattern);
            entriesToWarm.push(...patternKeys);
            break;
        }
      }
      
      // Deduplicate and limit
      const uniqueKeys = [...new Set(entriesToWarm)].slice(0, strategy.maxEntries);
      
      // Warm entries
      let warmed = 0;
      for (const key of uniqueKeys) {
        const entry = await this.get(key);
        if (entry && entry.tier !== strategy.targetTier) {
          await this.promoteEntry(key, entry, strategy.targetTier);
          warmed++;
        }
      }
      
      this.logger.info({ 
        strategy: strategy.name, 
        warmed, 
        total: uniqueKeys.length 
      }, 'Cache warming completed');
      
    } catch (error) {
      this.logger.error({ error, strategy: strategy.name }, 'Cache warming error');
    }
  }

  /**
   * Delete cache entry from all tiers
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    let deleted = false;
    
    try {
      // Delete from memory
      deleted = this.memoryCache.delete(key) || deleted;
      
      // Delete from Redis
      if (this.config.redis.enabled) {
        const redisKey = `${this.config.redis.prefix}${key}`;
        const result = await this.redis.del(redisKey);
        deleted = result > 0 || deleted;
      }
      
      // Delete from S3
      if (this.config.s3.enabled && this.s3Client) {
        try {
          const command = new DeleteObjectCommand({
            Bucket: this.config.s3.bucket,
            Key: `${this.config.s3.prefix}${key}`
          });
          await this.s3Client.send(command);
          deleted = true;
        } catch (error) {
          this.logger.error({ error, key }, 'S3 delete error');
        }
      }
      
      this.recordOperation('DELETE', key, CacheTier.MEMORY, deleted, Date.now() - startTime);
      
      return deleted;
    } catch (error) {
      this.logger.error({ error, key }, 'Cache delete error');
      this.recordOperation('DELETE', key, CacheTier.MEMORY, false, Date.now() - startTime, error.message);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.logger.warn('Clearing all cache entries');
    
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear Redis
    if (this.config.redis.enabled) {
      const keys = await this.redis.keys(`${this.config.redis.prefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
    
    // Note: S3 clearing should be done carefully, implementing pagination
    // This is left as a manual operation for safety
    
    // Reset stats
    for (const tier of [CacheTier.MEMORY, CacheTier.REDIS, CacheTier.S3]) {
      this.stats.set(tier, this.initializeStats(tier));
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Map<CacheTier, CacheStats>> {
    // Update current stats
    const memoryStats = this.stats.get(CacheTier.MEMORY)!;
    memoryStats.totalEntries = this.memoryCache.size;
    memoryStats.totalSize = this.memoryCache.calculatedSize || 0;
    
    if (this.config.redis.enabled) {
      const redisStats = this.stats.get(CacheTier.REDIS)!;
      const keys = await this.redis.keys(`${this.config.redis.prefix}*`);
      redisStats.totalEntries = keys.length;
      
      // Calculate total size (sampling for performance)
      if (keys.length > 0) {
        const sampleSize = Math.min(100, keys.length);
        const sampleKeys = keys.slice(0, sampleSize);
        let totalSize = 0;
        
        for (const key of sampleKeys) {
          const size = await this.redis.strlen(key);
          totalSize += size;
        }
        
        redisStats.totalSize = (totalSize / sampleSize) * keys.length;
      }
    }
    
    return this.stats;
  }

  /**
   * Get cache health metrics
   */
  async getHealth(): Promise<CacheHealthMetrics> {
    const memoryHealth = await this.checkTierHealth(CacheTier.MEMORY);
    const redisHealth = await this.checkTierHealth(CacheTier.REDIS);
    const s3Health = await this.checkTierHealth(CacheTier.S3);
    
    const overallStatus = this.determineOverallHealth([
      memoryHealth.status,
      redisHealth.status,
      s3Health.status
    ]);
    
    const recentOps = this.operations.slice(-1000);
    const errors = recentOps.filter(op => !op.success);
    
    return {
      overall: overallStatus,
      tiers: {
        memory: memoryHealth,
        redis: redisHealth,
        s3: s3Health
      },
      performance: {
        avgGetTime: this.calculateAvgTime(recentOps.filter(op => op.operation === 'GET')),
        avgSetTime: this.calculateAvgTime(recentOps.filter(op => op.operation === 'SET')),
        p95GetTime: this.calculatePercentile(recentOps.filter(op => op.operation === 'GET'), 95),
        p95SetTime: this.calculatePercentile(recentOps.filter(op => op.operation === 'SET'), 95),
        throughput: recentOps.length / 60 // ops per second over last minute
      },
      errors: {
        total: errors.length,
        byType: this.groupErrorsByType(errors),
        rate: errors.length / (recentOps.length || 1),
        lastError: errors.length > 0 ? {
          message: errors[errors.length - 1].error!,
          timestamp: errors[errors.length - 1].timestamp,
          operation: errors[errors.length - 1].operation
        } : undefined
      }
    };
  }

  // Private helper methods

  private async setTier(key: string, entry: CacheEntry, tier: CacheTier): Promise<void> {
    entry.tier = tier;
    
    switch (tier) {
      case CacheTier.MEMORY:
        this.memoryCache.set(key, entry);
        break;
        
      case CacheTier.REDIS:
        if (this.config.redis.enabled) {
          const redisKey = `${this.config.redis.prefix}${key}`;
          let data: string;
          
          if (this.config.redis.compression) {
            const compressed = await gzip(JSON.stringify(entry));
            data = compressed.toString('base64');
            entry.compressed = true;
          } else {
            data = JSON.stringify(entry);
          }
          
          await this.redis.setex(
            redisKey, 
            this.config.redis.ttl,
            data
          );
        }
        break;
        
      case CacheTier.S3:
        if (this.config.s3.enabled && this.s3Client) {
          const command = new PutObjectCommand({
            Bucket: this.config.s3.bucket,
            Key: `${this.config.s3.prefix}${key}`,
            Body: JSON.stringify(entry),
            ContentType: 'application/json',
            Metadata: {
              modelId: entry.modelId,
              documentType: entry.metadata.documentType,
              created: entry.created.toISOString()
            }
          });
          
          await this.s3Client.send(command);
        }
        break;
    }
  }

  private determineTargetTier(entry: CacheEntry): CacheTier {
    // Large entries go to S3
    if (entry.size > 10 * 1024 * 1024) { // > 10MB
      return CacheTier.S3;
    }
    
    // Enterprise tier entries stay in memory
    if (entry.metadata.userTier === 'ENTERPRISE') {
      return CacheTier.MEMORY;
    }
    
    // Medium entries go to Redis
    if (entry.size > 1024 * 1024) { // > 1MB
      return CacheTier.REDIS;
    }
    
    // Default to memory
    return CacheTier.MEMORY;
  }

  private async promoteEntry(key: string, entry: CacheEntry, targetTier?: CacheTier): Promise<void> {
    const newTier = targetTier || this.getHigherTier(entry.tier);
    if (newTier !== entry.tier) {
      await this.setTier(key, entry, newTier);
      this.recordOperation('PROMOTE', key, newTier, true, 0);
      this.logger.debug({ key, from: entry.tier, to: newTier }, 'Entry promoted');
    }
  }

  private async demoteEntry(key: string, entry: CacheEntry): Promise<void> {
    const newTier = this.getLowerTier(entry.tier);
    if (newTier !== entry.tier) {
      await this.setTier(key, entry, newTier);
      this.recordOperation('DEMOTE', key, newTier, true, 0);
      this.logger.debug({ key, from: entry.tier, to: newTier }, 'Entry demoted');
    }
  }

  private getHigherTier(current: CacheTier): CacheTier {
    switch (current) {
      case CacheTier.S3:
        return CacheTier.REDIS;
      case CacheTier.REDIS:
        return CacheTier.MEMORY;
      default:
        return current;
    }
  }

  private getLowerTier(current: CacheTier): CacheTier {
    switch (current) {
      case CacheTier.MEMORY:
        return CacheTier.REDIS;
      case CacheTier.REDIS:
        return CacheTier.S3;
      default:
        return current;
    }
  }

  private async generateEmbedding(content: any): Promise<number[]> {
    // In production, this would call an embedding service
    // For now, generate a mock embedding
    const text = JSON.stringify(content);
    const hash = crypto.createHash('sha256').update(text).digest();
    const embedding = [];
    
    for (let i = 0; i < this.config.similarity.vectorDimensions; i++) {
      embedding.push(hash[i % hash.length] / 255);
    }
    
    return embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private generateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async getAllEntries(): Promise<CacheEntry[]> {
    const entries: CacheEntry[] = [];
    
    // Get from memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      entries.push(entry);
    }
    
    // Get from Redis (sampling for performance)
    if (this.config.redis.enabled) {
      const keys = await this.redis.keys(`${this.config.redis.prefix}*`);
      const sampleSize = Math.min(1000, keys.length);
      const sampleKeys = keys.slice(0, sampleSize);
      
      for (const key of sampleKeys) {
        const data = await this.redis.get(key);
        if (data) {
          try {
            let parsed: CacheEntry;
            if (this.config.redis.compression) {
              const decompressed = await gunzip(Buffer.from(data, 'base64'));
              parsed = JSON.parse(decompressed.toString());
            } else {
              parsed = JSON.parse(data);
            }
            entries.push(parsed);
          } catch (error) {
            this.logger.error({ error, key }, 'Failed to parse Redis entry');
          }
        }
      }
    }
    
    return entries;
  }

  private async getPopularKeys(limit: number): Promise<string[]> {
    const allEntries = await this.getAllEntries();
    
    // Sort by hits descending
    allEntries.sort((a, b) => b.hits - a.hits);
    
    return allEntries.slice(0, limit).map(e => e.key);
  }

  private async predictKeys(criteria: any): Promise<string[]> {
    // Implement ML-based prediction logic
    // For now, return recent keys
    const recentOps = this.operations
      .filter(op => op.operation === 'GET' && op.success)
      .slice(-100)
      .map(op => op.key);
    
    return [...new Set(recentOps)];
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    const regex = new RegExp(pattern);
    
    // Check memory cache
    for (const [key] of this.memoryCache.entries()) {
      if (regex.test(key)) {
        keys.push(key);
      }
    }
    
    // Check Redis
    if (this.config.redis.enabled) {
      const redisKeys = await this.redis.keys(`${this.config.redis.prefix}*`);
      for (const key of redisKeys) {
        const cleanKey = key.replace(this.config.redis.prefix, '');
        if (regex.test(cleanKey)) {
          keys.push(cleanKey);
        }
      }
    }
    
    return keys;
  }

  private recordOperation(
    operation: CacheOperation['operation'],
    key: string,
    tier: CacheTier,
    success: boolean,
    duration: number,
    error?: string
  ): void {
    const op: CacheOperation = {
      operation,
      key,
      tier,
      success,
      duration,
      timestamp: new Date(),
      error
    };
    
    this.operations.push(op);
    
    // Keep only last 10000 operations
    if (this.operations.length > 10000) {
      this.operations = this.operations.slice(-10000);
    }
  }

  private updateHitRate(tier: CacheTier, hit: boolean): void {
    const stats = this.stats.get(tier);
    if (stats) {
      const total = stats.hitRate * 100 + stats.missRate * 100;
      if (hit) {
        stats.hitRate = ((stats.hitRate * total) + 1) / (total + 1);
        stats.missRate = (stats.missRate * total) / (total + 1);
      } else {
        stats.missRate = ((stats.missRate * total) + 1) / (total + 1);
        stats.hitRate = (stats.hitRate * total) / (total + 1);
      }
    }
  }

  private initializeStats(tier: CacheTier): CacheStats {
    return {
      tier,
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      evictionRate: 0,
      avgRetrievalTime: 0,
      costSavings: 0,
      popularKeys: [],
      ageDistribution: {
        last1Hour: 0,
        last24Hours: 0,
        last7Days: 0,
        older: 0
      }
    };
  }

  private async checkTierHealth(tier: CacheTier): Promise<any> {
    const stats = this.stats.get(tier);
    if (!stats) {
      return {
        status: HealthStatus.UNHEALTHY,
        utilization: 0,
        responseTime: 0,
        errorRate: 0,
        lastCheck: new Date()
      };
    }
    
    let utilization = 0;
    let responseTime = 0;
    let status = HealthStatus.HEALTHY;
    
    switch (tier) {
      case CacheTier.MEMORY:
        utilization = (this.memoryCache.calculatedSize || 0) / this.config.memory.maxSize * 100;
        responseTime = 1; // Memory is fast
        break;
        
      case CacheTier.REDIS:
        if (this.config.redis.enabled) {
          const info = await this.redis.info('memory');
          const usedMemory = parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0');
          utilization = usedMemory / this.config.redis.maxSize * 100;
          responseTime = 5; // Redis is pretty fast
        }
        break;
        
      case CacheTier.S3:
        utilization = stats.totalSize / (100 * 1024 * 1024 * 1024) * 100; // Assume 100GB limit
        responseTime = 50; // S3 is slower
        break;
    }
    
    // Determine health status
    if (utilization > 90 || stats.missRate > 0.5) {
      status = HealthStatus.UNHEALTHY;
    } else if (utilization > 75 || stats.missRate > 0.3) {
      status = HealthStatus.DEGRADED;
    }
    
    const recentErrors = this.operations
      .filter(op => op.tier === tier && !op.success)
      .length;
    
    const errorRate = recentErrors / Math.max(this.operations.filter(op => op.tier === tier).length, 1);
    
    return {
      status,
      utilization,
      responseTime,
      errorRate,
      lastCheck: new Date()
    };
  }

  private determineOverallHealth(statuses: HealthStatus[]): HealthStatus {
    if (statuses.includes(HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }
    if (statuses.includes(HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }

  private calculateAvgTime(operations: CacheOperation[]): number {
    if (operations.length === 0) return 0;
    const sum = operations.reduce((acc, op) => acc + op.duration, 0);
    return sum / operations.length;
  }

  private calculatePercentile(operations: CacheOperation[], percentile: number): number {
    if (operations.length === 0) return 0;
    
    const sorted = operations.map(op => op.duration).sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    
    return sorted[Math.min(index, sorted.length - 1)];
  }

  private groupErrorsByType(errors: CacheOperation[]): Record<string, number> {
    const groups: Record<string, number> = {};
    
    for (const error of errors) {
      const type = error.error?.split(':')[0] || 'unknown';
      groups[type] = (groups[type] || 0) + 1;
    }
    
    return groups;
  }

  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  private startMaintenanceTasks(): void {
    // Periodic stats update
    setInterval(() => {
      this.updateStats();
    }, 60000); // Every minute
    
    // Periodic eviction check
    setInterval(() => {
      this.checkEviction();
    }, this.config.memory.checkPeriod * 1000);
    
    // Periodic health check
    setInterval(() => {
      this.getHealth().then(health => {
        if (health.overall === HealthStatus.UNHEALTHY) {
          this.logger.error({ health }, 'Cache health is unhealthy');
        }
      });
    }, 30000); // Every 30 seconds
  }

  private async updateStats(): Promise<void> {
    const stats = await this.getStats();
    
    // Update age distribution
    const now = Date.now();
    const hour = 3600000;
    const day = 86400000;
    const week = 604800000;
    
    for (const [tier, stat] of stats) {
      const entries = tier === CacheTier.MEMORY ? 
        Array.from(this.memoryCache.values()) : 
        [];
      
      stat.ageDistribution = {
        last1Hour: entries.filter(e => now - e.created.getTime() < hour).length,
        last24Hours: entries.filter(e => now - e.created.getTime() < day).length,
        last7Days: entries.filter(e => now - e.created.getTime() < week).length,
        older: entries.filter(e => now - e.created.getTime() >= week).length
      };
      
      // Update popular keys
      stat.popularKeys = entries
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 10)
        .map(e => ({
          key: e.key,
          hits: e.hits,
          lastAccessed: e.lastAccessed,
          tier: e.tier
        }));
    }
  }

  private async checkEviction(): Promise<void> {
    for (const [tier, policy] of this.evictionPolicies) {
      const stats = this.stats.get(tier);
      if (!stats) continue;
      
      let utilization = 0;
      
      switch (tier) {
        case CacheTier.MEMORY:
          utilization = (this.memoryCache.calculatedSize || 0) / this.config.memory.maxSize * 100;
          break;
        case CacheTier.REDIS:
          if (this.config.redis.enabled) {
            const info = await this.redis.info('memory');
            const usedMemory = parseInt(info.match(/used_memory:(\d+)/)?.[1] || '0');
            utilization = usedMemory / this.config.redis.maxSize * 100;
          }
          break;
      }
      
      if (utilization > policy.threshold) {
        this.logger.info({ tier, utilization, threshold: policy.threshold }, 'Starting eviction');
        await this.evict(tier, policy);
      }
    }
  }

  private async evict(tier: CacheTier, policy: CacheEvictionPolicy): Promise<void> {
    // Implement eviction based on strategy
    // This is a simplified version
    
    if (tier === CacheTier.MEMORY) {
      // LRU is handled automatically by LRUCache
      return;
    }
    
    if (tier === CacheTier.REDIS && this.config.redis.enabled) {
      const keys = await this.redis.keys(`${this.config.redis.prefix}*`);
      
      // Sort keys based on strategy
      // For simplicity, just remove oldest entries
      const keysWithTTL = await Promise.all(
        keys.map(async key => ({
          key,
          ttl: await this.redis.ttl(key)
        }))
      );
      
      keysWithTTL.sort((a, b) => a.ttl - b.ttl);
      
      // Remove entries until we reach target size
      const toRemove = Math.floor(keys.length * (1 - policy.targetSize / 100));
      for (let i = 0; i < toRemove; i++) {
        await this.redis.del(keysWithTTL[i].key);
      }
      
      this.logger.info({ tier, removed: toRemove }, 'Eviction completed');
    }
  }

  /**
   * Destroy cache manager and cleanup resources
   */
  async destroy(): Promise<void> {
    this.logger.info('Destroying cache manager');
    
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear intervals
    // Note: In production, store interval IDs and clear them here
    
    this.logger.info('Cache manager destroyed');
  }
}