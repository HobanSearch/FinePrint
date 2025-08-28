/**
 * Storage Manager - Multi-Tier Storage Orchestration
 * Manages data flow between hot (Redis), warm (PostgreSQL), and cold (S3) storage tiers
 */

import { RedisStorageService, CachedMemory } from './redis-storage';
import { PostgreSQLStorageService } from './postgresql-storage';
import { S3StorageService, ArchivedMemory } from './s3-storage';
import { TierMigrationService } from './tier-migration';
import { 
  StorageTier, 
  MemoryType, 
  ImportanceLevel,
  MemoryFilter,
  MemorySearchResult,
  CreateMemoryInput,
  UpdateMemoryInput,
  VectorSearchConfig,
  MemoryStorageError,
  MemoryNotFoundError
} from '../../types';
import { Logger } from '../../utils/logger';
import { Metrics } from '../../utils/metrics';
import { EmbeddingService } from '../embedding-service';

export interface StorageManagerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    ttl: number;
    maxMemorySize: number;
    keyPrefix: string;
    compressionEnabled: boolean;
  };
  postgresql: {
    databaseUrl: string;
    maxConnections: number;
    connectionTimeout: number;
    queryTimeout: number;
    enableVectorSearch: boolean;
    vectorDimensions: number;
  };
  s3: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    compressionLevel: number;
    keyPrefix: string;
    lifecycleRules: {
      transitionToIA: number;
      transitionToGlacier: number;
      expiration: number;
    };
  };
  tierMigration: {
    hotToWarmDays: number;
    warmToColdDays: number;
    batchSize: number;
    migrationSchedule: string;
  };
}

export class StorageManager {
  private redisStorage: RedisStorageService;
  private postgresStorage: PostgreSQLStorageService;
  private s3Storage: S3StorageService;
  private tierMigration: TierMigrationService;
  private embeddingService: EmbeddingService;
  private logger: Logger;
  private metrics: Metrics;
  private config: StorageManagerConfig;

  constructor(config: StorageManagerConfig) {
    this.config = config;
    this.logger = Logger.getInstance('StorageManager');
    this.metrics = Metrics.getInstance();

    // Initialize storage services
    this.redisStorage = new RedisStorageService(config.redis);
    this.postgresStorage = new PostgreSQLStorageService(config.postgresql);
    this.s3Storage = new S3StorageService(config.s3);
    
    // Initialize supporting services
    this.embeddingService = new EmbeddingService();
    this.tierMigration = new TierMigrationService({
      storageManager: this,
      config: config.tierMigration,
    });
  }

  /**
   * Create a new memory across appropriate tiers
   */
  async createMemory(input: CreateMemoryInput): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Generate embedding for semantic search
      const embedding = await this.embeddingService.generateEmbedding(
        `${input.title} ${input.description || ''} ${JSON.stringify(input.content)}`
      );

      // Create in PostgreSQL (warm tier) first for durability
      const memoryId = await this.postgresStorage.create(input, embedding);

      // Also cache in Redis (hot tier) for fast access
      const cachedMemory: CachedMemory = {
        id: memoryId,
        type: input.type,
        title: input.title,
        content: input.content,
        metadata: input.metadata || {},
        embedding,
        importance: input.importanceLevel || ImportanceLevel.MEDIUM,
        accessCount: 0,
        lastAccessed: new Date(),
        createdAt: new Date(),
        version: 1,
      };

      await this.redisStorage.store(cachedMemory);

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('storage_manager.create.duration', responseTime);
      this.metrics.increment('storage_manager.create.success');

      this.logger.info(`Created memory ${memoryId} across tiers (${responseTime}ms)`);
      
      return memoryId;
    } catch (error) {
      this.metrics.increment('storage_manager.create.errors');
      this.logger.error('Failed to create memory:', error);
      throw new MemoryStorageError(`Failed to create memory: ${error.message}`, 'WARM');
    }
  }

  /**
   * Retrieve memory with tier fallback strategy
   */
  async retrieveMemory(memoryId: string): Promise<MemorySearchResult | null> {
    const startTime = Date.now();
    
    try {
      // Try hot tier first (Redis)
      const cachedMemory = await this.redisStorage.retrieve(memoryId);
      if (cachedMemory) {
        const result: MemorySearchResult = {
          id: cachedMemory.id,
          type: cachedMemory.type,
          title: cachedMemory.title,
          content: cachedMemory.content,
          metadata: cachedMemory.metadata,
          createdAt: cachedMemory.createdAt,
          updatedAt: cachedMemory.lastAccessed,
        };

        this.metrics.increment('storage_manager.retrieve.hot_hit');
        this.logger.debug(`Retrieved memory ${memoryId} from hot tier`);
        return result;
      }

      // Try warm tier (PostgreSQL)
      const warmMemory = await this.postgresStorage.retrieve(memoryId);
      if (warmMemory) {
        // Cache in Redis for future access
        const cachedMemory: CachedMemory = {
          id: warmMemory.id,
          type: warmMemory.type,
          title: warmMemory.title,
          content: warmMemory.content,
          metadata: warmMemory.metadata,
          embedding: [], // Would need to fetch from DB
          importance: ImportanceLevel.MEDIUM, // Would need to fetch from DB
          accessCount: 1,
          lastAccessed: new Date(),
          createdAt: warmMemory.createdAt,
          version: 1,
        };

        // Fire and forget - don't wait for Redis caching
        this.redisStorage.store(cachedMemory).catch(error => {
          this.logger.warn(`Failed to cache memory ${memoryId} in Redis:`, error);
        });

        this.metrics.increment('storage_manager.retrieve.warm_hit');
        this.logger.debug(`Retrieved memory ${memoryId} from warm tier`);
        return warmMemory;
      }

      // Try cold tier (S3) - requires S3 location lookup
      const s3Key = await this.getS3KeyForMemory(memoryId);
      if (s3Key) {
        const archivedMemory = await this.s3Storage.retrieve(s3Key);
        if (archivedMemory) {
          const result: MemorySearchResult = {
            id: archivedMemory.id,
            type: archivedMemory.type,
            title: archivedMemory.title,
            content: archivedMemory.content,
            metadata: archivedMemory.metadata,
            createdAt: archivedMemory.archivedAt,
            updatedAt: archivedMemory.archivedAt,
          };

          // Cache in warm tier for faster future access
          this.postgresStorage.create({
            type: archivedMemory.type,
            category: 'restored',
            title: archivedMemory.title,
            description: 'Restored from cold storage',
            content: archivedMemory.content,
            metadata: archivedMemory.metadata,
            agentId: 'system',
            importanceLevel: archivedMemory.importance,
          }).catch(error => {
            this.logger.warn(`Failed to restore memory ${memoryId} to warm tier:`, error);
          });

          this.metrics.increment('storage_manager.retrieve.cold_hit');
          this.logger.debug(`Retrieved memory ${memoryId} from cold tier`);
          return result;
        }
      }

      // Memory not found in any tier
      this.metrics.increment('storage_manager.retrieve.miss');
      return null;

    } catch (error) {
      this.metrics.increment('storage_manager.retrieve.errors');
      this.logger.error(`Failed to retrieve memory ${memoryId}:`, error);
      throw error;
    } finally {
      const responseTime = Date.now() - startTime;
      this.metrics.histogram('storage_manager.retrieve.duration', responseTime);
    }
  }

  /**
   * Update memory across tiers
   */
  async updateMemory(memoryId: string, updates: UpdateMemoryInput): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Generate new embedding if content changed
      let embedding: number[] | undefined;
      if (updates.content) {
        const text = `${updates.title || ''} ${JSON.stringify(updates.content)}`;
        embedding = await this.embeddingService.generateEmbedding(text);
      }

      // Update in PostgreSQL (authoritative source)
      await this.postgresStorage.update(memoryId, updates, embedding);

      // Update in Redis if present
      const cachedMemory = await this.redisStorage.retrieve(memoryId);
      if (cachedMemory) {
        const updatedCache: Partial<CachedMemory> = {
          ...updates,
          embedding: embedding || cachedMemory.embedding,
          version: cachedMemory.version + 1,
        };
        await this.redisStorage.update(memoryId, updatedCache);
      }

      // Note: S3 updates would require re-archiving, handled separately

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('storage_manager.update.duration', responseTime);
      this.metrics.increment('storage_manager.update.success');

      this.logger.info(`Updated memory ${memoryId} across tiers (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('storage_manager.update.errors');
      this.logger.error(`Failed to update memory ${memoryId}:`, error);
      throw error;
    }
  }

  /**
   * Delete memory from all tiers
   */
  async deleteMemory(memoryId: string): Promise<void> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Delete from PostgreSQL (soft delete)
      try {
        await this.postgresStorage.delete(memoryId);
      } catch (error) {
        errors.push(`PostgreSQL: ${error.message}`);
      }

      // Delete from Redis
      try {
        await this.redisStorage.delete(memoryId);
      } catch (error) {
        errors.push(`Redis: ${error.message}`);
      }

      // Delete from S3 if present
      try {
        const s3Key = await this.getS3KeyForMemory(memoryId);
        if (s3Key) {
          await this.s3Storage.delete(s3Key);
        }
      } catch (error) {
        errors.push(`S3: ${error.message}`);
      }

      if (errors.length > 0) {
        throw new Error(`Partial deletion errors: ${errors.join(', ')}`);
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('storage_manager.delete.duration', responseTime);
      this.metrics.increment('storage_manager.delete.success');

      this.logger.info(`Deleted memory ${memoryId} from all tiers (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('storage_manager.delete.errors');
      this.logger.error(`Failed to delete memory ${memoryId}:`, error);
      throw error;
    }
  }

  /**
   * Search memories across tiers with intelligent routing
   */
  async searchMemories(
    filters: MemoryFilter,
    options: {
      page?: number;
      pageSize?: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'importanceScore' | 'accessCount';
      sortOrder?: 'asc' | 'desc';
      preferTier?: StorageTier;
    } = {}
  ): Promise<{ results: MemorySearchResult[]; total: number; tier: StorageTier }> {
    const startTime = Date.now();
    
    try {
      // Determine optimal tier for search based on filters and preferences
      const targetTier = this.determineOptimalSearchTier(filters, options.preferTier);

      let results: { results: MemorySearchResult[]; total: number };
      let usedTier: StorageTier;

      switch (targetTier) {
        case StorageTier.HOT:
          // Search in Redis with fallback
          try {
            const redisResults = await this.redisStorage.search({
              types: filters.types,
              importance: filters.importanceLevels,
              limit: options.pageSize,
              sortBy: options.sortBy === 'accessCount' ? 'accessCount' : 'createdAt',
            });

            results = {
              results: redisResults.map(memory => ({
                id: memory.id,
                type: memory.type,
                title: memory.title,
                content: memory.content,
                metadata: memory.metadata,
                createdAt: memory.createdAt,
                updatedAt: memory.lastAccessed,
              })),
              total: redisResults.length,
            };
            usedTier = StorageTier.HOT;
          } catch (error) {
            // Fallback to warm tier
            results = await this.postgresStorage.search(filters, options);
            usedTier = StorageTier.WARM;
          }
          break;

        case StorageTier.WARM:
          results = await this.postgresStorage.search(filters, options);
          usedTier = StorageTier.WARM;
          break;

        case StorageTier.COLD:
          // Cold tier search is more complex and typically avoided
          // For now, fallback to warm tier
          results = await this.postgresStorage.search(filters, options);
          usedTier = StorageTier.WARM;
          break;

        default:
          results = await this.postgresStorage.search(filters, options);
          usedTier = StorageTier.WARM;
      }

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('storage_manager.search.duration', responseTime);
      this.metrics.increment(`storage_manager.search.${usedTier.toLowerCase()}`);

      this.logger.debug(`Searched memories in ${usedTier} tier: ${results.results.length}/${results.total} (${responseTime}ms)`);

      return { ...results, tier: usedTier };
    } catch (error) {
      this.metrics.increment('storage_manager.search.errors');
      this.logger.error('Failed to search memories:', error);
      throw error;
    }
  }

  /**
   * Vector similarity search with tier optimization
   */
  async vectorSearch(
    queryEmbedding: number[],
    config: VectorSearchConfig,
    filters?: MemoryFilter
  ): Promise<Array<{ memory: MemorySearchResult; similarity: number; tier: StorageTier }>> {
    const startTime = Date.now();
    
    try {
      const results: Array<{ memory: MemorySearchResult; similarity: number; tier: StorageTier }> = [];

      // Search in hot tier first (Redis)
      try {
        const redisResults = await this.redisStorage.vectorSearch(queryEmbedding, {
          threshold: config.threshold,
          limit: Math.min(config.maxResults, 50),
          types: filters?.types,
        });

        for (const result of redisResults) {
          results.push({
            memory: {
              id: result.memory.id,
              type: result.memory.type,
              title: result.memory.title,
              content: result.memory.content,
              metadata: result.memory.metadata,
              createdAt: result.memory.createdAt,
              updatedAt: result.memory.lastAccessed,
            },
            similarity: result.similarity,
            tier: StorageTier.HOT,
          });
        }
      } catch (error) {
        this.logger.warn('Redis vector search failed, trying PostgreSQL:', error);
      }

      // Search in warm tier (PostgreSQL) if needed
      if (results.length < config.maxResults) {
        try {
          const pgResults = await this.postgresStorage.vectorSearch(queryEmbedding, config, filters);
          
          for (const result of pgResults) {
            // Avoid duplicates from Redis
            if (!results.some(r => r.memory.id === result.memory.id)) {
              results.push({
                memory: result.memory,
                similarity: result.similarity,
                tier: StorageTier.WARM,
              });
            }
          }
        } catch (error) {
          this.logger.warn('PostgreSQL vector search failed:', error);
        }
      }

      // Sort by similarity and limit results
      results.sort((a, b) => b.similarity - a.similarity);
      const limitedResults = results.slice(0, config.maxResults);

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('storage_manager.vector_search.duration', responseTime);
      this.metrics.increment('storage_manager.vector_search.success');

      this.logger.debug(`Vector search found ${limitedResults.length} similar memories (${responseTime}ms)`);

      return limitedResults;
    } catch (error) {
      this.metrics.increment('storage_manager.vector_search.errors');
      this.logger.error('Failed to perform vector search:', error);
      throw error;
    }
  }

  /**
   * Move memory between storage tiers
   */
  async moveMemoryToTier(memoryId: string, targetTier: StorageTier): Promise<void> {
    return this.tierMigration.moveMemoryToTier(memoryId, targetTier);
  }

  /**
   * Get comprehensive storage statistics
   */
  async getStorageStats(): Promise<{
    redis: any;
    postgresql: any;
    s3: any;
    tierDistribution: Record<StorageTier, number>;
    totalMemories: number;
    totalSize: number;
  }> {
    try {
      const [redisStats, pgStats, s3Stats] = await Promise.all([
        this.redisStorage.getStats(),
        this.postgresStorage.getStats(),
        this.s3Storage.getStats(),
      ]);

      return {
        redis: redisStats,
        postgresql: pgStats,
        s3: s3Stats,
        tierDistribution: {
          [StorageTier.HOT]: redisStats.totalMemories,
          [StorageTier.WARM]: pgStats.totalMemories,
          [StorageTier.COLD]: s3Stats.totalObjects,
        },
        totalMemories: redisStats.totalMemories + pgStats.totalMemories + s3Stats.totalObjects,
        totalSize: redisStats.totalSize + s3Stats.totalSize,
      };
    } catch (error) {
      this.logger.error('Failed to get storage stats:', error);
      throw error;
    }
  }

  /**
   * Health check for all storage tiers
   */
  async healthCheck(): Promise<{
    overall: boolean;
    redis: { healthy: boolean; details: any };
    postgresql: { healthy: boolean; details: any };
    s3: { healthy: boolean; details: any };
  }> {
    const [redisHealth, pgHealth, s3Health] = await Promise.all([
      this.redisStorage.healthCheck(),
      this.postgresStorage.healthCheck(),
      this.s3Storage.healthCheck(),
    ]);

    return {
      overall: redisHealth.healthy && pgHealth.healthy && s3Health.healthy,
      redis: redisHealth,
      postgresql: pgHealth,
      s3: s3Health,
    };
  }

  /**
   * Close all storage connections
   */
  async close(): Promise<void> {
    await Promise.all([
      this.redisStorage.close(),
      this.postgresStorage.close(),
      // S3 doesn't need explicit closing
    ]);

    this.logger.info('All storage connections closed');
  }

  // Private helper methods

  private determineOptimalSearchTier(
    filters: MemoryFilter,
    preferTier?: StorageTier
  ): StorageTier {
    if (preferTier) {
      return preferTier;
    }

    // Use hot tier for simple, recent searches
    if (
      filters.dateRange &&
      filters.dateRange.from > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    ) {
      return StorageTier.HOT;
    }

    // Use warm tier for complex searches and vector operations
    if (filters.vectorSearch || filters.textSearch) {
      return StorageTier.WARM;
    }

    // Default to warm tier
    return StorageTier.WARM;
  }

  private async getS3KeyForMemory(memoryId: string): Promise<string | null> {
    // This would typically lookup the S3 key from metadata in PostgreSQL
    // For now, return null to indicate not in cold storage
    try {
      const memory = await this.postgresStorage.retrieve(memoryId);
      return memory?.metadata.s3Location as string || null;
    } catch (error) {
      return null;
    }
  }

  // Expose storage services for direct access if needed
  get redis(): RedisStorageService {
    return this.redisStorage;
  }

  get postgresql(): PostgreSQLStorageService {
    return this.postgresStorage;
  }

  get s3(): S3StorageService {
    return this.s3Storage;
  }

  get migration(): TierMigrationService {
    return this.tierMigration;
  }
}