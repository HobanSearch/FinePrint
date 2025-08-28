import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import Redis from 'ioredis'
import { QdrantClient } from '@qdrant/js-client-rest'
import { pino } from 'pino'

const logger = pino({
  name: 'database-client',
  level: process.env.LOG_LEVEL || 'info'
})

// Prisma Client Configuration
const prismaGlobalForDB = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = prismaGlobalForDB.prisma ?? new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
})

// Enhanced logging for Prisma queries
prisma.$on('query', (e) => {
  logger.debug({
    query: e.query,
    params: e.params,
    duration: e.duration + 'ms',
    target: e.target
  }, 'Database query executed')
})

prisma.$on('error', (e) => {
  logger.error({
    message: e.message,
    target: e.target
  }, 'Database error occurred')
})

if (process.env.NODE_ENV !== 'production') {
  prismaGlobalForDB.prisma = prisma
}

// Redis Client Configuration
const redisGlobalForDB = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = redisGlobalForDB.redis ?? new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    maxMemoryPolicy: 'allkeys-lru',
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    keyPrefix: 'fineprintai:',
    connectionName: 'api-server'
  }
)

redis.on('connect', () => {
  logger.info('Redis connection established')
})

redis.on('error', (error) => {
  logger.error({ error }, 'Redis connection error')
})

redis.on('ready', () => {
  logger.info('Redis client ready')
})

if (process.env.NODE_ENV !== 'production') {
  redisGlobalForDB.redis = redis
}

// Qdrant Client Configuration
const qdrantGlobalForDB = globalThis as unknown as {
  qdrant: QdrantClient | undefined
}

export const qdrant = qdrantGlobalForDB.qdrant ?? new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  timeout: 30000,
  apiKey: process.env.QDRANT_API_KEY
})

if (process.env.NODE_ENV !== 'production') {
  qdrantGlobalForDB.qdrant = qdrant
}

// Database Connection Manager
export class DatabaseManager {
  private static instance: DatabaseManager
  private isConnected = false
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor() {
    this.setupHealthChecks()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  async connect(): Promise<void> {
    try {
      // Test Prisma connection
      await prisma.$connect()
      logger.info('Prisma connected successfully')

      // Test Redis connection
      await redis.connect()
      await redis.ping()
      logger.info('Redis connected successfully')

      // Test Qdrant connection
      await qdrant.getCollections()
      logger.info('Qdrant connected successfully')

      this.isConnected = true
      logger.info('All database connections established')
    } catch (error) {
      logger.error({ error }, 'Failed to establish database connections')
      throw error
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval)
      }

      await prisma.$disconnect()
      await redis.disconnect()
      
      this.isConnected = false
      logger.info('All database connections closed')
    } catch (error) {
      logger.error({ error }, 'Error closing database connections')
      throw error
    }
  }

  isHealthy(): boolean {
    return this.isConnected
  }

  private setupHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        // Check Prisma connection
        await prisma.$queryRaw`SELECT 1`
        
        // Check Redis connection
        await redis.ping()
        
        // Check Qdrant connection
        await qdrant.getCollections()
        
        if (!this.isConnected) {
          this.isConnected = true
          logger.info('Database health check: All services healthy')
        }
      } catch (error) {
        if (this.isConnected) {
          this.isConnected = false
          logger.error({ error }, 'Database health check failed')
        }
      }
    }, 30000) // Check every 30 seconds
  }

  async checkHealth(): Promise<{
    prisma: { status: string; latency?: number; error?: string }
    redis: { status: string; latency?: number; error?: string }
    qdrant: { status: string; latency?: number; error?: string }
  }> {
    const results = {
      prisma: { status: 'unknown' as string },
      redis: { status: 'unknown' as string },
      qdrant: { status: 'unknown' as string }
    }

    // Check Prisma
    try {
      const start = Date.now()
      await prisma.$queryRaw`SELECT 1`
      results.prisma = {
        status: 'healthy',
        latency: Date.now() - start
      }
    } catch (error) {
      results.prisma = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Check Redis
    try {
      const start = Date.now()
      await redis.ping()
      results.redis = {
        status: 'healthy',
        latency: Date.now() - start
      }
    } catch (error) {
      results.redis = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Check Qdrant
    try {
      const start = Date.now()
      await qdrant.getCollections()
      results.qdrant = {
        status: 'healthy',
        latency: Date.now() - start
      }
    } catch (error) {
      results.qdrant = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    return results
  }
}

// Utility functions for common database operations
export class DatabaseUtils {
  // Generate secure hash for documents (privacy-first)
  static generateDocumentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex')
  }

  // Generate secure hash for passwords
  static async hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcryptjs')
    return bcrypt.hash(password, 12)
  }

  // Verify password
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const bcrypt = await import('bcryptjs')
    return bcrypt.compare(password, hash)
  }

  // Generate secure session token
  static generateSessionToken(): string {
    return createHash('sha256')
      .update(Date.now().toString())
      .update(Math.random().toString())
      .digest('hex')
  }

  // Sanitize user input for database queries
  static sanitizeInput(input: string): string {
    return input.trim().replace(/[<>]/g, '')
  }

  // Check if user has permission for resource
  static async checkUserPermission(
    userId: string, 
    resourceType: string, 
    resourceId: string, 
    action: string
  ): Promise<boolean> {
    // Implementation depends on your permission system
    // This is a basic example
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          teamMemberships: {
            include: {
              team: true
            }
          }
        }
      })

      if (!user) return false

      // Admin users have all permissions
      if (user.email.endsWith('@fineprintai.com')) return true

      // Check ownership or team membership based on resource type
      switch (resourceType) {
        case 'document':
          const document = await prisma.document.findUnique({
            where: { id: resourceId }
          })
          return document?.userId === userId || 
                 user.teamMemberships.some(tm => tm.teamId === document?.teamId)

        case 'analysis':
          const analysis = await prisma.documentAnalysis.findUnique({
            where: { id: resourceId }
          })
          return analysis?.userId === userId

        default:
          return false
      }
    } catch (error) {
      logger.error({ error, userId, resourceType, resourceId, action }, 'Permission check failed')
      return false
    }
  }

  // Soft delete utility
  static async softDelete(model: any, id: string): Promise<void> {
    await model.update({
      where: { id },
      data: { deletedAt: new Date() }
    })
  }

  // Get paginated results
  static getPaginationParams(page: number = 1, limit: number = 20): {
    skip: number
    take: number
  } {
    const normalizedPage = Math.max(1, page)
    const normalizedLimit = Math.max(1, Math.min(100, limit))
    
    return {
      skip: (normalizedPage - 1) * normalizedLimit,
      take: normalizedLimit
    }
  }

  // Format pagination response
  static formatPaginationResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): {
    data: T[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  } {
    const totalPages = Math.ceil(total / limit)
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  }
}

// Cache utilities
export class CacheUtils {
  private static readonly DEFAULT_TTL = 3600 // 1 hour

  // Get from cache with JSON parsing
  static async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, key }, 'Cache get failed')
      return null
    }
  }

  // Set cache with JSON serialization
  static async set<T>(key: string, value: T, ttl: number = CacheUtils.DEFAULT_TTL): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(value))
    } catch (error) {
      logger.error({ error, key }, 'Cache set failed')
    }
  }

  // Delete from cache
  static async delete(key: string): Promise<void> {
    try {
      await redis.del(key)
    } catch (error) {
      logger.error({ error, key }, 'Cache delete failed')
    }
  }

  // Cache analysis results
  static async cacheAnalysisResult(analysisId: string, result: any, ttl: number = 86400): Promise<void> {
    await CacheUtils.set(`analysis:${analysisId}`, result, ttl)
  }

  // Get cached analysis result
  static async getCachedAnalysisResult(analysisId: string): Promise<any | null> {
    return CacheUtils.get(`analysis:${analysisId}`)
  }

  // Cache user session
  static async cacheUserSession(sessionToken: string, userData: any, ttl: number = 3600): Promise<void> {
    await CacheUtils.set(`session:${sessionToken}`, userData, ttl)
  }

  // Get cached user session
  static async getCachedUserSession(sessionToken: string): Promise<any | null> {
    return CacheUtils.get(`session:${sessionToken}`)
  }

  // Invalidate user cache
  static async invalidateUserCache(userId: string): Promise<void> {
    const pattern = `user:${userId}:*`
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }

  // Cache document metadata
  static async cacheDocumentMetadata(documentHash: string, metadata: any, ttl: number = 7200): Promise<void> {
    await CacheUtils.set(`document:${documentHash}`, metadata, ttl)
  }

  // Get cached document metadata
  static async getCachedDocumentMetadata(documentHash: string): Promise<any | null> {
    return CacheUtils.get(`document:${documentHash}`)
  }
}

// Initialize database connections
export const dbManager = DatabaseManager.getInstance()

// Export utility instances
export { logger as dbLogger }