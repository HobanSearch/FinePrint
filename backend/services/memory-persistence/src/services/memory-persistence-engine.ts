/**
 * Memory Persistence Engine
 * Core engine for persisting and retrieving AI memory across services
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createServiceLogger } from '../logger';
import { Prisma, PrismaClient } from '@prisma/client';

const logger = createServiceLogger('memory-persistence-engine');

export interface MemoryEntry {
  id: string;
  serviceId: string;
  agentId: string;
  memoryType: 'working' | 'episodic' | 'semantic' | 'procedural' | 'business';
  domain: string;
  content: any;
  metadata: {
    timestamp: Date;
    version: number;
    tags: string[];
    correlationId?: string;
    sessionId?: string;
    userId?: string;
    importance: number;
    accessCount: number;
    lastAccessed: Date;
    expiresAt?: Date;
  };
  embeddings?: number[];
  relationships: {
    relatedMemories: string[];
    causedBy?: string;
    causes?: string[];
  };
}

export interface MemoryQuery {
  serviceId?: string;
  agentId?: string;
  memoryType?: string;
  domain?: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  minImportance?: number;
  searchText?: string;
  limit?: number;
  offset?: number;
}

export interface MemoryAggregation {
  serviceId: string;
  domain: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  totalMemories: number;
  byType: Record<string, number>;
  averageImportance: number;
  topTags: Array<{ tag: string; count: number }>;
  accessPatterns: {
    totalAccesses: number;
    averageAccessesPerMemory: number;
    mostAccessed: MemoryEntry[];
  };
}

export class MemoryPersistenceEngine extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private s3Client: S3Client;
  private pgPool: Pool;
  private initialized: boolean = false;
  private cacheExpiry: number = 3600; // 1 hour
  private archiveThreshold: number = 30; // 30 days

  constructor() {
    super();
    
    // Initialize Prisma
    this.prisma = new PrismaClient({
      log: ['error', 'warn'],
    });

    // Initialize Redis
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 2, // Dedicated DB for memory persistence
    });

    // Initialize PostgreSQL pool for vector operations
    this.pgPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'fineprintai',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    });

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      } : undefined,
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Memory Persistence Engine...');

      // Test database connections
      await this.prisma.$connect();
      await this.redis.ping();
      await this.pgPool.query('SELECT 1');

      // Create tables if not exists
      await this.createTables();

      // Set up background jobs
      this.setupBackgroundJobs();

      this.initialized = true;
      logger.info('Memory Persistence Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Memory Persistence Engine', { error });
      throw error;
    }
  }

  /**
   * Store a memory entry
   */
  async storeMemory(memory: Omit<MemoryEntry, 'id'>): Promise<MemoryEntry> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullMemory: MemoryEntry = { ...memory, id };

    try {
      // Store in hot cache (Redis)
      await this.storeInCache(fullMemory);

      // Store in warm storage (PostgreSQL)
      await this.storeInDatabase(fullMemory);

      // If memory has embeddings, store in vector DB
      if (fullMemory.embeddings) {
        await this.storeEmbeddings(fullMemory);
      }

      // Emit event
      this.emit('memory:stored', {
        id: fullMemory.id,
        serviceId: fullMemory.serviceId,
        agentId: fullMemory.agentId,
        type: fullMemory.memoryType,
        domain: fullMemory.domain,
      });

      logger.debug('Memory stored successfully', {
        id: fullMemory.id,
        type: fullMemory.memoryType,
        domain: fullMemory.domain,
      });

      return fullMemory;
    } catch (error) {
      logger.error('Failed to store memory', { error, memoryId: id });
      throw error;
    }
  }

  /**
   * Retrieve memory by ID
   */
  async getMemory(id: string): Promise<MemoryEntry | null> {
    try {
      // Check hot cache first
      const cached = await this.getFromCache(id);
      if (cached) {
        await this.updateAccessMetrics(id);
        return cached;
      }

      // Check warm storage
      const stored = await this.getFromDatabase(id);
      if (stored) {
        // Restore to cache
        await this.storeInCache(stored);
        await this.updateAccessMetrics(id);
        return stored;
      }

      // Check cold storage (S3)
      const archived = await this.getFromArchive(id);
      if (archived) {
        // Restore to warm storage and cache
        await this.storeInDatabase(archived);
        await this.storeInCache(archived);
        await this.updateAccessMetrics(id);
        return archived;
      }

      return null;
    } catch (error) {
      logger.error('Failed to retrieve memory', { error, memoryId: id });
      throw error;
    }
  }

  /**
   * Query memories based on criteria
   */
  async queryMemories(query: MemoryQuery): Promise<MemoryEntry[]> {
    try {
      const results = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM memories
        WHERE 1=1
        ${query.serviceId ? Prisma.sql`AND service_id = ${query.serviceId}` : Prisma.empty}
        ${query.agentId ? Prisma.sql`AND agent_id = ${query.agentId}` : Prisma.empty}
        ${query.memoryType ? Prisma.sql`AND memory_type = ${query.memoryType}` : Prisma.empty}
        ${query.domain ? Prisma.sql`AND domain = ${query.domain}` : Prisma.empty}
        ${query.tags && query.tags.length > 0 ? Prisma.sql`AND tags && ${query.tags}` : Prisma.empty}
        ${query.startDate ? Prisma.sql`AND created_at >= ${query.startDate}` : Prisma.empty}
        ${query.endDate ? Prisma.sql`AND created_at <= ${query.endDate}` : Prisma.empty}
        ${query.minImportance ? Prisma.sql`AND importance >= ${query.minImportance}` : Prisma.empty}
        ${query.searchText ? Prisma.sql`AND content::text ILIKE ${`%${query.searchText}%`}` : Prisma.empty}
        ORDER BY created_at DESC
        LIMIT ${query.limit || 100}
        OFFSET ${query.offset || 0}
      `;

      return results.map(this.dbRowToMemoryEntry);
    } catch (error) {
      logger.error('Failed to query memories', { error, query });
      throw error;
    }
  }

  /**
   * Search memories by semantic similarity
   */
  async searchBySimilarity(
    embeddings: number[],
    domain: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<MemoryEntry[]> {
    try {
      const query = `
        SELECT m.*, 1 - (e.embedding <=> $1::vector) as similarity
        FROM memories m
        JOIN memory_embeddings e ON m.id = e.memory_id
        WHERE m.domain = $2
        AND 1 - (e.embedding <=> $1::vector) > $3
        ORDER BY similarity DESC
        LIMIT $4
      `;

      const results = await this.pgPool.query(query, [
        `[${embeddings.join(',')}]`,
        domain,
        threshold,
        limit,
      ]);

      return results.rows.map(row => ({
        ...this.dbRowToMemoryEntry(row),
        similarity: row.similarity,
      }));
    } catch (error) {
      logger.error('Failed to search by similarity', { error });
      throw error;
    }
  }

  /**
   * Get memory aggregations for analytics
   */
  async getMemoryAggregations(
    serviceId: string,
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<MemoryAggregation> {
    try {
      const [
        totalCount,
        typeBreakdown,
        avgImportance,
        topTags,
        accessStats,
      ] = await Promise.all([
        this.getTotalMemoryCount(serviceId, domain, timeRange),
        this.getMemoryTypeBreakdown(serviceId, domain, timeRange),
        this.getAverageImportance(serviceId, domain, timeRange),
        this.getTopTags(serviceId, domain, timeRange),
        this.getAccessStatistics(serviceId, domain, timeRange),
      ]);

      return {
        serviceId,
        domain,
        timeRange,
        totalMemories: totalCount,
        byType: typeBreakdown,
        averageImportance: avgImportance,
        topTags,
        accessPatterns: accessStats,
      };
    } catch (error) {
      logger.error('Failed to get memory aggregations', { error });
      throw error;
    }
  }

  /**
   * Archive old memories to cold storage
   */
  async archiveOldMemories(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.archiveThreshold);

      const query = `
        SELECT * FROM memories
        WHERE created_at < $1
        AND archived = false
        LIMIT 1000
      `;

      const results = await this.pgPool.query(query, [cutoffDate]);
      let archivedCount = 0;

      for (const row of results.rows) {
        const memory = this.dbRowToMemoryEntry(row);
        await this.archiveMemory(memory);
        archivedCount++;
      }

      logger.info('Archived old memories', { count: archivedCount });
      return archivedCount;
    } catch (error) {
      logger.error('Failed to archive old memories', { error });
      throw error;
    }
  }

  /**
   * Create relationship between memories
   */
  async createMemoryRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: 'causes' | 'references' | 'follows'
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO memory_relationships (source_id, target_id, relationship_type)
        VALUES (${sourceId}, ${targetId}, ${relationshipType})
        ON CONFLICT DO NOTHING
      `;

      logger.debug('Memory relationship created', {
        sourceId,
        targetId,
        relationshipType,
      });
    } catch (error) {
      logger.error('Failed to create memory relationship', { error });
      throw error;
    }
  }

  /**
   * Get related memories
   */
  async getRelatedMemories(
    memoryId: string,
    relationshipType?: string,
    depth: number = 1
  ): Promise<MemoryEntry[]> {
    try {
      // Recursive CTE to traverse relationships
      const query = `
        WITH RECURSIVE related AS (
          SELECT target_id as id, 1 as depth
          FROM memory_relationships
          WHERE source_id = $1
          ${relationshipType ? `AND relationship_type = $2` : ''}
          
          UNION ALL
          
          SELECT mr.target_id as id, r.depth + 1
          FROM memory_relationships mr
          JOIN related r ON mr.source_id = r.id
          WHERE r.depth < $3
        )
        SELECT DISTINCT m.*
        FROM memories m
        JOIN related r ON m.id = r.id
      `;

      const params = relationshipType
        ? [memoryId, relationshipType, depth]
        : [memoryId, depth];

      const results = await this.pgPool.query(query, params);
      return results.rows.map(this.dbRowToMemoryEntry);
    } catch (error) {
      logger.error('Failed to get related memories', { error });
      throw error;
    }
  }

  // Private helper methods

  private async storeInCache(memory: MemoryEntry): Promise<void> {
    const key = `memory:${memory.id}`;
    const ttl = memory.metadata.expiresAt
      ? Math.floor((memory.metadata.expiresAt.getTime() - Date.now()) / 1000)
      : this.cacheExpiry;

    await this.redis.setex(key, ttl, JSON.stringify(memory));
  }

  private async getFromCache(id: string): Promise<MemoryEntry | null> {
    const key = `memory:${id}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async storeInDatabase(memory: MemoryEntry): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO memories (
        id, service_id, agent_id, memory_type, domain,
        content, metadata, created_at, updated_at
      ) VALUES (
        ${memory.id}, ${memory.serviceId}, ${memory.agentId},
        ${memory.memoryType}, ${memory.domain},
        ${JSON.stringify(memory.content)}::jsonb,
        ${JSON.stringify(memory.metadata)}::jsonb,
        ${memory.metadata.timestamp}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;
  }

  private async getFromDatabase(id: string): Promise<MemoryEntry | null> {
    const result = await this.pgPool.query(
      'SELECT * FROM memories WHERE id = $1',
      [id]
    );
    
    return result.rows[0] ? this.dbRowToMemoryEntry(result.rows[0]) : null;
  }

  private async storeEmbeddings(memory: MemoryEntry): Promise<void> {
    if (!memory.embeddings) return;

    await this.pgPool.query(
      `INSERT INTO memory_embeddings (memory_id, embedding)
       VALUES ($1, $2::vector)
       ON CONFLICT (memory_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [memory.id, `[${memory.embeddings.join(',')}]`]
    );
  }

  private async archiveMemory(memory: MemoryEntry): Promise<void> {
    const key = `memories/${memory.serviceId}/${memory.domain}/${memory.id}.json`;
    
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || 'fineprintai-memories',
        Key: key,
        Body: JSON.stringify(memory),
        ContentType: 'application/json',
        Metadata: {
          serviceId: memory.serviceId,
          agentId: memory.agentId,
          domain: memory.domain,
          memoryType: memory.memoryType,
        },
      })
    );

    // Mark as archived in database
    await this.pgPool.query(
      'UPDATE memories SET archived = true WHERE id = $1',
      [memory.id]
    );
  }

  private async getFromArchive(id: string): Promise<MemoryEntry | null> {
    // This would need to search S3 by metadata or maintain an index
    // For now, return null
    return null;
  }

  private async updateAccessMetrics(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE memories
      SET metadata = jsonb_set(
        jsonb_set(
          metadata,
          '{accessCount}',
          (COALESCE((metadata->>'accessCount')::int, 0) + 1)::text::jsonb
        ),
        '{lastAccessed}',
        to_jsonb(NOW())
      )
      WHERE id = ${id}
    `;
  }

  private dbRowToMemoryEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      serviceId: row.service_id,
      agentId: row.agent_id,
      memoryType: row.memory_type,
      domain: row.domain,
      content: row.content,
      metadata: {
        ...row.metadata,
        timestamp: new Date(row.metadata.timestamp),
        lastAccessed: new Date(row.metadata.lastAccessed),
        expiresAt: row.metadata.expiresAt ? new Date(row.metadata.expiresAt) : undefined,
      },
      embeddings: row.embeddings,
      relationships: {
        relatedMemories: row.related_memories || [],
        causedBy: row.caused_by,
        causes: row.causes || [],
      },
    };
  }

  private async createTables(): Promise<void> {
    // Create memories table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id VARCHAR(255) PRIMARY KEY,
        service_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        memory_type VARCHAR(50) NOT NULL,
        domain VARCHAR(100) NOT NULL,
        content JSONB NOT NULL,
        metadata JSONB NOT NULL,
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        INDEX idx_service_agent (service_id, agent_id),
        INDEX idx_domain_type (domain, memory_type),
        INDEX idx_created_at (created_at),
        INDEX idx_importance ((metadata->>'importance')::float)
      )
    `);

    // Create embeddings table with pgvector
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        memory_id VARCHAR(255) PRIMARY KEY REFERENCES memories(id),
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create relationships table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS memory_relationships (
        source_id VARCHAR(255) REFERENCES memories(id),
        target_id VARCHAR(255) REFERENCES memories(id),
        relationship_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (source_id, target_id, relationship_type)
      )
    `);
  }

  private setupBackgroundJobs(): void {
    // Archive old memories daily
    setInterval(() => {
      this.archiveOldMemories().catch(error => {
        logger.error('Background archive job failed', { error });
      });
    }, 24 * 60 * 60 * 1000);

    // Clean up expired memories hourly
    setInterval(() => {
      this.cleanupExpiredMemories().catch(error => {
        logger.error('Background cleanup job failed', { error });
      });
    }, 60 * 60 * 1000);
  }

  private async cleanupExpiredMemories(): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM memories
      WHERE (metadata->>'expiresAt')::timestamp < NOW()
    `;
  }

  private async getTotalMemoryCount(
    serviceId: string,
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<number> {
    const result = await this.pgPool.query(
      `SELECT COUNT(*) as count FROM memories
       WHERE service_id = $1 AND domain = $2
       AND created_at BETWEEN $3 AND $4`,
      [serviceId, domain, timeRange.start, timeRange.end]
    );
    return parseInt(result.rows[0].count);
  }

  private async getMemoryTypeBreakdown(
    serviceId: string,
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    const result = await this.pgPool.query(
      `SELECT memory_type, COUNT(*) as count FROM memories
       WHERE service_id = $1 AND domain = $2
       AND created_at BETWEEN $3 AND $4
       GROUP BY memory_type`,
      [serviceId, domain, timeRange.start, timeRange.end]
    );
    
    return result.rows.reduce((acc, row) => {
      acc[row.memory_type] = parseInt(row.count);
      return acc;
    }, {});
  }

  private async getAverageImportance(
    serviceId: string,
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<number> {
    const result = await this.pgPool.query(
      `SELECT AVG((metadata->>'importance')::float) as avg_importance
       FROM memories
       WHERE service_id = $1 AND domain = $2
       AND created_at BETWEEN $3 AND $4`,
      [serviceId, domain, timeRange.start, timeRange.end]
    );
    return result.rows[0].avg_importance || 0;
  }

  private async getTopTags(
    serviceId: string,
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Array<{ tag: string; count: number }>> {
    const result = await this.pgPool.query(
      `SELECT tag, COUNT(*) as count
       FROM memories,
       LATERAL jsonb_array_elements_text(metadata->'tags') as tag
       WHERE service_id = $1 AND domain = $2
       AND created_at BETWEEN $3 AND $4
       GROUP BY tag
       ORDER BY count DESC
       LIMIT 10`,
      [serviceId, domain, timeRange.start, timeRange.end]
    );
    
    return result.rows.map(row => ({
      tag: row.tag,
      count: parseInt(row.count),
    }));
  }

  private async getAccessStatistics(
    serviceId: string,
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<MemoryAggregation['accessPatterns']> {
    const [totalAccesses, avgAccesses, mostAccessed] = await Promise.all([
      this.pgPool.query(
        `SELECT SUM((metadata->>'accessCount')::int) as total
         FROM memories
         WHERE service_id = $1 AND domain = $2
         AND created_at BETWEEN $3 AND $4`,
        [serviceId, domain, timeRange.start, timeRange.end]
      ),
      this.pgPool.query(
        `SELECT AVG((metadata->>'accessCount')::int) as avg
         FROM memories
         WHERE service_id = $1 AND domain = $2
         AND created_at BETWEEN $3 AND $4`,
        [serviceId, domain, timeRange.start, timeRange.end]
      ),
      this.pgPool.query(
        `SELECT * FROM memories
         WHERE service_id = $1 AND domain = $2
         AND created_at BETWEEN $3 AND $4
         ORDER BY (metadata->>'accessCount')::int DESC
         LIMIT 5`,
        [serviceId, domain, timeRange.start, timeRange.end]
      ),
    ]);

    return {
      totalAccesses: parseInt(totalAccesses.rows[0].total || '0'),
      averageAccessesPerMemory: parseFloat(avgAccesses.rows[0].avg || '0'),
      mostAccessed: mostAccessed.rows.map(this.dbRowToMemoryEntry),
    };
  }

  isHealthy(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pgPool.end();
    this.redis.disconnect();
    logger.info('Memory Persistence Engine shutdown complete');
  }
}