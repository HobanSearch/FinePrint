/**
 * PostgreSQL Storage Service - Warm Tier
 * Provides sub-10ms access to frequently accessed memories with pgvector support
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { 
  StorageTier, 
  MemoryType, 
  ImportanceLevel, 
  MemoryFilter,
  MemorySearchResult,
  VectorSearchConfig,
  CreateMemoryInput,
  UpdateMemoryInput
} from '../../types';
import { Logger } from '../../utils/logger';
import { Metrics } from '../../utils/metrics';

export interface PostgreSQLStorageConfig {
  databaseUrl: string;
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
  enableVectorSearch: boolean;
  vectorDimensions: number;
}

export class PostgreSQLStorageService {
  private prisma: PrismaClient;
  private logger: Logger;
  private metrics: Metrics;
  private config: PostgreSQLStorageConfig;

  constructor(config: PostgreSQLStorageConfig) {
    this.config = config;
    this.logger = Logger.getInstance('PostgreSQLStorage');
    this.metrics = Metrics.getInstance();
    
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.prisma.$on('query', (e) => {
      this.metrics.histogram('postgresql.query.duration', e.duration);
      if (e.duration > 1000) { // Log slow queries
        this.logger.warn('Slow query detected:', {
          query: e.query,
          params: e.params,
          duration: e.duration,
        });
      }
    });

    this.prisma.$on('error', (e) => {
      this.logger.error('PostgreSQL error:', e);
      this.metrics.increment('postgresql.errors');
    });
  }

  /**
   * Create a new memory
   */
  async create(input: CreateMemoryInput, embedding?: number[]): Promise<string> {
    const startTime = Date.now();
    
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Create base memory
        const memory = await tx.memory.create({
          data: {
            type: input.type,
            category: input.category,
            title: input.title,
            description: input.description,
            content: input.content,
            metadata: input.metadata || {},
            tags: input.tags || [],
            embedding: embedding || [],
            agentId: input.agentId,
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            parentId: input.parentId,
            importanceLevel: input.importanceLevel || ImportanceLevel.MEDIUM,
            validUntil: input.validUntil,
            contextDate: input.contextDate,
          },
        });

        // Create type-specific memory records
        await this.createTypeSpecificMemory(tx, memory.id, input);

        return memory.id;
      });

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('postgresql.create.duration', responseTime);
      this.metrics.increment('postgresql.create.success');

      this.logger.debug(`Created memory ${result} in PostgreSQL (${responseTime}ms)`);
      return result;
    } catch (error) {
      this.metrics.increment('postgresql.create.errors');
      this.logger.error('Failed to create memory in PostgreSQL:', error);
      throw error;
    }
  }

  /**
   * Retrieve memory by ID
   */
  async retrieve(memoryId: string, includeRelations = false): Promise<MemorySearchResult | null> {
    const startTime = Date.now();
    
    try {
      const memory = await this.prisma.memory.findUnique({
        where: { 
          id: memoryId,
          isDeleted: false,
        },
        include: includeRelations ? {
          parent: true,
          children: true,
          relatedFrom: {
            include: { toMemory: true },
          },
          relatedTo: {
            include: { fromMemory: true },
          },
          workingMemory: true,
          episodicMemory: true,
          semanticMemory: true,
          proceduralMemory: true,
          businessMemory: true,
        } : undefined,
      });

      if (!memory) {
        this.metrics.increment('postgresql.retrieve.miss');
        return null;
      }

      // Update access tracking
      await this.updateAccessTracking(memoryId);

      const result: MemorySearchResult = {
        id: memory.id,
        type: memory.type as MemoryType,
        title: memory.title,
        content: memory.content as Record<string, any>,
        metadata: memory.metadata as Record<string, any>,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
      };

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('postgresql.retrieve.duration', responseTime);
      this.metrics.increment('postgresql.retrieve.hit');

      this.logger.debug(`Retrieved memory ${memoryId} from PostgreSQL (${responseTime}ms)`);
      return result;
    } catch (error) {
      this.metrics.increment('postgresql.retrieve.errors');
      this.logger.error(`Failed to retrieve memory ${memoryId} from PostgreSQL:`, error);
      throw error;
    }
  }

  /**
   * Update existing memory
   */
  async update(memoryId: string, updates: UpdateMemoryInput, embedding?: number[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.prisma.memory.update({
        where: { id: memoryId },
        data: {
          ...updates,
          embedding: embedding,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('postgresql.update.duration', responseTime);
      this.metrics.increment('postgresql.update.success');

      this.logger.debug(`Updated memory ${memoryId} in PostgreSQL (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('postgresql.update.errors');
      this.logger.error(`Failed to update memory ${memoryId} in PostgreSQL:`, error);
      throw error;
    }
  }

  /**
   * Soft delete memory
   */
  async delete(memoryId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.prisma.memory.update({
        where: { id: memoryId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('postgresql.delete.duration', responseTime);
      this.metrics.increment('postgresql.delete.success');

      this.logger.debug(`Deleted memory ${memoryId} from PostgreSQL (${responseTime}ms)`);
    } catch (error) {
      this.metrics.increment('postgresql.delete.errors');
      this.logger.error(`Failed to delete memory ${memoryId} from PostgreSQL:`, error);
      throw error;
    }
  }

  /**
   * Search memories with filters
   */
  async search(
    filters: MemoryFilter,
    options: {
      page?: number;
      pageSize?: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'importanceScore' | 'accessCount';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ results: MemorySearchResult[]; total: number }> {
    const startTime = Date.now();
    
    try {
      const page = options.page || 1;
      const pageSize = options.pageSize || 20;
      const skip = (page - 1) * pageSize;

      // Build where clause
      const where: Prisma.MemoryWhereInput = {
        isDeleted: false,
        ...(filters.types && { type: { in: filters.types } }),
        ...(filters.agentIds && { agentId: { in: filters.agentIds } }),
        ...(filters.categories && { category: { in: filters.categories } }),
        ...(filters.tags && { tags: { hasSome: filters.tags } }),
        ...(filters.importanceLevels && { importanceLevel: { in: filters.importanceLevels } }),
        ...(filters.storageTiers && { currentTier: { in: filters.storageTiers } }),
        ...(filters.dateRange && {
          createdAt: {
            gte: filters.dateRange.from,
            lte: filters.dateRange.to,
          },
        }),
        ...(filters.textSearch && {
          OR: [
            { title: { contains: filters.textSearch, mode: 'insensitive' } },
            { description: { contains: filters.textSearch, mode: 'insensitive' } },
          ],
        }),
      };

      // Build order by clause
      const orderBy: Prisma.MemoryOrderByWithRelationInput = {};
      if (options.sortBy) {
        orderBy[options.sortBy] = options.sortOrder || 'desc';
      } else {
        orderBy.createdAt = 'desc';
      }

      // Execute search
      const [results, total] = await Promise.all([
        this.prisma.memory.findMany({
          where,
          orderBy,
          skip,
          take: pageSize,
          select: {
            id: true,
            type: true,
            title: true,
            content: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            importanceScore: true,
            accessCount: true,
          },
        }),
        this.prisma.memory.count({ where }),
      ]);

      const searchResults: MemorySearchResult[] = results.map((memory) => ({
        id: memory.id,
        type: memory.type as MemoryType,
        title: memory.title,
        content: memory.content as Record<string, any>,
        metadata: memory.metadata as Record<string, any>,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        rank: 0, // Will be calculated if needed
      }));

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('postgresql.search.duration', responseTime);
      this.metrics.increment('postgresql.search.success');

      this.logger.debug(`Searched PostgreSQL and found ${searchResults.length}/${total} memories (${responseTime}ms)`);

      return { results: searchResults, total };
    } catch (error) {
      this.metrics.increment('postgresql.search.errors');
      this.logger.error('Failed to search memories in PostgreSQL:', error);
      throw error;
    }
  }

  /**
   * Vector similarity search using pgvector
   */
  async vectorSearch(
    queryEmbedding: number[],
    config: VectorSearchConfig,
    filters?: MemoryFilter
  ): Promise<Array<{ memory: MemorySearchResult; similarity: number }>> {
    const startTime = Date.now();
    
    if (!this.config.enableVectorSearch) {
      throw new Error('Vector search is not enabled');
    }

    try {
      // Build base WHERE clause for filters
      const whereConditions: string[] = ['m.is_deleted = false'];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.types) {
        whereConditions.push(`m.type = ANY($${paramIndex})`);
        params.push(filters.types);
        paramIndex++;
      }

      if (filters?.agentIds) {
        whereConditions.push(`m.agent_id = ANY($${paramIndex})`);
        params.push(filters.agentIds);
        paramIndex++;
      }

      if (filters?.importanceLevels) {
        whereConditions.push(`m.importance_level = ANY($${paramIndex})`);
        params.push(filters.importanceLevels);
        paramIndex++;
      }

      if (filters?.dateRange) {
        whereConditions.push(`m.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        params.push(filters.dateRange.from, filters.dateRange.to);
        paramIndex += 2;
      }

      // Add embedding parameter
      whereConditions.push(`array_length(m.embedding, 1) = $${paramIndex}`);
      params.push(queryEmbedding.length);
      paramIndex++;

      // Add query embedding for similarity calculation
      params.push(JSON.stringify(queryEmbedding));
      const embeddingParam = `$${paramIndex}`;
      paramIndex++;

      // Build similarity calculation based on algorithm
      let similaritySQL: string;
      switch (config.algorithm) {
        case 'cosine':
          similaritySQL = `
            (m.embedding::vector <=> ${embeddingParam}::vector) as distance,
            1 - (m.embedding::vector <=> ${embeddingParam}::vector) as similarity
          `;
          break;
        case 'euclidean':
          similaritySQL = `
            (m.embedding::vector <-> ${embeddingParam}::vector) as distance,
            1 / (1 + (m.embedding::vector <-> ${embeddingParam}::vector)) as similarity
          `;
          break;
        case 'dot_product':
          similaritySQL = `
            (m.embedding::vector <#> ${embeddingParam}::vector) as distance,
            (m.embedding::vector <#> ${embeddingParam}::vector) as similarity
          `;
          break;
        default:
          throw new Error(`Unsupported similarity algorithm: ${config.algorithm}`);
      }

      const whereClause = whereConditions.join(' AND ');

      const query = `
        SELECT 
          m.id,
          m.type,
          m.title,
          m.content,
          m.metadata,
          m.created_at,
          m.updated_at,
          ${similaritySQL}
        FROM memories m
        WHERE ${whereClause}
          AND 1 - (m.embedding::vector <=> ${embeddingParam}::vector) >= $${paramIndex}
        ORDER BY similarity DESC
        LIMIT $${paramIndex + 1}
      `;

      params.push(config.threshold, config.maxResults);

      const results = await this.prisma.$queryRawUnsafe(query, ...params) as any[];

      const searchResults = results.map((row) => ({
        memory: {
          id: row.id,
          type: row.type as MemoryType,
          title: row.title,
          content: row.content,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        } as MemorySearchResult,
        similarity: parseFloat(row.similarity),
      }));

      const responseTime = Date.now() - startTime;
      this.metrics.histogram('postgresql.vector_search.duration', responseTime);
      this.metrics.increment('postgresql.vector_search.success');

      this.logger.debug(`Vector search found ${searchResults.length} similar memories (${responseTime}ms)`);

      return searchResults;
    } catch (error) {
      this.metrics.increment('postgresql.vector_search.errors');
      this.logger.error('Failed to perform vector search in PostgreSQL:', error);
      throw error;
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalMemories: number;
    memoryTypes: Record<MemoryType, number>;
    importanceLevels: Record<ImportanceLevel, number>;
    storageTiers: Record<StorageTier, number>;
    averageAccessCount: number;
    topAgents: Array<{ agentId: string; count: number }>;
  }> {
    try {
      const [
        totalMemories,
        typeStats,
        importanceStats,
        tierStats,
        accessStats,
        agentStats,
      ] = await Promise.all([
        this.prisma.memory.count({ where: { isDeleted: false } }),
        this.prisma.memory.groupBy({
          by: ['type'],
          where: { isDeleted: false },
          _count: true,
        }),
        this.prisma.memory.groupBy({
          by: ['importanceLevel'],
          where: { isDeleted: false },
          _count: true,
        }),
        this.prisma.memory.groupBy({
          by: ['currentTier'],
          where: { isDeleted: false },
          _count: true,
        }),
        this.prisma.memory.aggregate({
          where: { isDeleted: false },
          _avg: { accessCount: true },
        }),
        this.prisma.memory.groupBy({
          by: ['agentId'],
          where: { isDeleted: false },
          _count: true,
          orderBy: { _count: { agentId: 'desc' } },
          take: 10,
        }),
      ]);

      return {
        totalMemories,
        memoryTypes: typeStats.reduce((acc, stat) => {
          acc[stat.type as MemoryType] = stat._count;
          return acc;
        }, {} as Record<MemoryType, number>),
        importanceLevels: importanceStats.reduce((acc, stat) => {
          acc[stat.importanceLevel as ImportanceLevel] = stat._count;
          return acc;
        }, {} as Record<ImportanceLevel, number>),
        storageTiers: tierStats.reduce((acc, stat) => {
          acc[stat.currentTier as StorageTier] = stat._count;
          return acc;
        }, {} as Record<StorageTier, number>),
        averageAccessCount: accessStats._avg.accessCount || 0,
        topAgents: agentStats.map(stat => ({
          agentId: stat.agentId,
          count: stat._count,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get PostgreSQL stats:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;

      return {
        healthy: true,
        details: {
          responseTime,
          connected: true,
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
   * Close database connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.info('PostgreSQL connection closed');
  }

  // Private helper methods

  private async createTypeSpecificMemory(
    tx: Prisma.TransactionClient,
    memoryId: string,
    input: CreateMemoryInput
  ): Promise<void> {
    const typeData = input.content.typeSpecific;
    if (!typeData) return;

    switch (input.type) {
      case MemoryType.WORKING:
        await tx.workingMemory.create({
          data: {
            memoryId,
            priority: typeData.priority || 5,
            ttlSeconds: typeData.ttlSeconds || 3600,
            taskContext: typeData.taskContext || {},
            dependencies: typeData.dependencies || [],
            processingTime: typeData.processingTime,
            memoryUsage: typeData.memoryUsage,
          },
        });
        break;

      case MemoryType.EPISODIC:
        await tx.episodicMemory.create({
          data: {
            memoryId,
            episodeType: typeData.episodeType,
            duration: typeData.duration,
            outcome: typeData.outcome,
            participants: typeData.participants || [],
            location: typeData.location,
            environment: typeData.environment || {},
            inputModalities: typeData.inputModalities || [],
            outputActions: typeData.outputActions || [],
            emotionalTone: typeData.emotionalTone,
            significance: typeData.significance || 0.5,
          },
        });
        break;

      case MemoryType.SEMANTIC:
        await tx.semanticMemory.create({
          data: {
            memoryId,
            concept: typeData.concept,
            domain: typeData.domain,
            facts: typeData.facts || [],
            rules: typeData.rules || [],
            exceptions: typeData.exceptions || [],
            certaintyLevel: typeData.certaintyLevel || 0.5,
            evidenceCount: typeData.evidenceCount || 1,
            contradictionCount: typeData.contradictionCount || 0,
            abstractionLevel: typeData.abstractionLevel || 5,
            applicability: typeData.applicability || [],
          },
        });
        break;

      case MemoryType.PROCEDURAL:
        await tx.proceduralMemory.create({
          data: {
            memoryId,
            procedureName: typeData.procedureName,
            skillDomain: typeData.skillDomain,
            steps: typeData.steps || [],
            conditions: typeData.conditions || {},
            parameters: typeData.parameters || {},
            successRate: typeData.successRate || 0.5,
            avgExecutionTime: typeData.avgExecutionTime,
            complexity: typeData.complexity || 5,
            practiceCount: typeData.practiceCount || 0,
            masteryLevel: typeData.masteryLevel || 0.0,
            lastPracticed: typeData.lastPracticed,
            variations: typeData.variations || [],
            adaptability: typeData.adaptability || 0.5,
          },
        });
        break;

      case MemoryType.BUSINESS:
        await tx.businessMemory.create({
          data: {
            memoryId,
            businessDomain: typeData.businessDomain,
            metricType: typeData.metricType,
            customerSegment: typeData.customerSegment,
            industryVertical: typeData.industryVertical,
            companySize: typeData.companySize,
            kpiValue: typeData.kpiValue,
            trend: typeData.trend,
            benchmarkValue: typeData.benchmarkValue,
            competitorInfo: typeData.competitorInfo || {},
            marketConditions: typeData.marketConditions || {},
            seasonality: typeData.seasonality || {},
            revenueImpact: typeData.revenueImpact,
            costImpact: typeData.costImpact,
            roi: typeData.roi,
          },
        });
        break;
    }
  }

  private async updateAccessTracking(memoryId: string): Promise<void> {
    await this.prisma.memory.update({
      where: { id: memoryId },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }
}