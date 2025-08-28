import { redis, dbLogger as logger } from './client.js'
import { z } from 'zod'

// Cache key patterns and TTL constants
export const CacheKeys = {
  USER_SESSION: 'session:',
  USER_PROFILE: 'user:profile:',
  USER_DASHBOARD: 'user:dashboard:',
  DOCUMENT_METADATA: 'document:',
  ANALYSIS_RESULT: 'analysis:',
  PATTERN_LIBRARY: 'patterns:',
  API_RATE_LIMIT: 'rate_limit:',
  NOTIFICATION_PREFS: 'notifications:',
  TEAM_MEMBERS: 'team:members:',
  SUBSCRIPTION_STATUS: 'subscription:',
  DOCUMENT_MONITORING: 'monitoring:',
  SEARCH_RESULTS: 'search:',
  ANALYTICS_SUMMARY: 'analytics:',
  SYSTEM_CONFIG: 'config:'
} as const

export const CacheTTL = {
  SHORT: 300,        // 5 minutes
  MEDIUM: 1800,      // 30 minutes  
  LONG: 3600,        // 1 hour
  DAILY: 86400,      // 24 hours
  WEEKLY: 604800,    // 7 days
  SESSION: 3600      // 1 hour (matches JWT expiry)
} as const

// Zod schemas for cache validation
const UserSessionSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  role: z.string(),
  subscriptionTier: z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),
  permissions: z.array(z.string()),
  loginAt: z.string(),
  expiresAt: z.string()
})

const DocumentMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  documentType: z.enum(['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other']),
  url: z.string().optional(),
  documentHash: z.string(),
  contentLength: z.number().optional(),
  language: z.string(),
  monitoringEnabled: z.boolean(),
  lastAnalyzedAt: z.string().optional(),
  overallRiskScore: z.number().optional()
})

const AnalysisResultSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'expired']),
  overallRiskScore: z.number().optional(),
  executiveSummary: z.string().optional(),
  keyFindings: z.array(z.string()),
  recommendations: z.array(z.string()),
  findings: z.array(z.object({
    id: z.string(),
    category: z.string(),
    title: z.string(),
    description: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    confidenceScore: z.number().optional()
  })),
  processingTimeMs: z.number().optional(),
  completedAt: z.string().optional()
})

const UserDashboardSchema = z.object({
  totalDocuments: z.number(),
  totalAnalyses: z.number(),
  avgRiskScore: z.number().optional(),
  monitoredDocuments: z.number(),
  totalActions: z.number(),
  lastAnalysisAt: z.string().optional(),
  recentFindings: z.array(z.object({
    category: z.string(),
    severity: z.string(),
    count: z.number()
  })),
  subscriptionUsage: z.object({
    used: z.number(),
    limit: z.number(),
    resetDate: z.string()
  })
})

const NotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  browserEnabled: z.boolean(),
  webhookEnabled: z.boolean(),
  webhookUrl: z.string().optional(),
  analysisComplete: z.boolean(),
  documentChanges: z.boolean(),
  highRiskFindings: z.boolean(),
  weeklySummary: z.boolean(),
  marketingEmails: z.boolean()
})

// Cache service class with type safety and validation
export class CacheService {
  private static instance: CacheService

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService()
    }
    return CacheService.instance
  }

  // Generic cache operations with validation
  private async setValidated<T>(
    key: string, 
    data: T, 
    schema: z.ZodSchema<T>, 
    ttl: number
  ): Promise<void> {
    try {
      const validated = schema.parse(data)
      await redis.setex(key, ttl, JSON.stringify(validated))
      logger.debug({ key, ttl }, 'Cache set successfully')
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error({ error: error.issues, key }, 'Cache validation failed')
      } else {
        logger.error({ error, key }, 'Cache set failed')
      }
      throw error
    }
  }

  private async getValidated<T>(key: string, schema: z.ZodSchema<T>): Promise<T | null> {
    try {
      const cached = await redis.get(key)
      if (!cached) return null

      const parsed = JSON.parse(cached)
      const validated = schema.parse(parsed)
      logger.debug({ key }, 'Cache hit')
      return validated
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn({ error: error.issues, key }, 'Cached data validation failed, removing')
        await redis.del(key)
      } else {
        logger.error({ error, key }, 'Cache get failed')
      }
      return null
    }
  }

  // User session management
  async setUserSession(sessionToken: string, sessionData: z.infer<typeof UserSessionSchema>): Promise<void> {
    const key = CacheKeys.USER_SESSION + sessionToken
    await this.setValidated(key, sessionData, UserSessionSchema, CacheTTL.SESSION)
  }

  async getUserSession(sessionToken: string): Promise<z.infer<typeof UserSessionSchema> | null> {
    const key = CacheKeys.USER_SESSION + sessionToken
    return this.getValidated(key, UserSessionSchema)
  }

  async invalidateUserSession(sessionToken: string): Promise<void> {
    const key = CacheKeys.USER_SESSION + sessionToken
    await redis.del(key)
    logger.info({ sessionToken }, 'User session invalidated')
  }

  // User dashboard caching
  async setUserDashboard(userId: string, dashboardData: z.infer<typeof UserDashboardSchema>): Promise<void> {
    const key = CacheKeys.USER_DASHBOARD + userId
    await this.setValidated(key, dashboardData, UserDashboardSchema, CacheTTL.MEDIUM)
  }

  async getUserDashboard(userId: string): Promise<z.infer<typeof UserDashboardSchema> | null> {
    const key = CacheKeys.USER_DASHBOARD + userId
    return this.getValidated(key, UserDashboardSchema)
  }

  // Document metadata caching
  async setDocumentMetadata(documentHash: string, metadata: z.infer<typeof DocumentMetadataSchema>): Promise<void> {
    const key = CacheKeys.DOCUMENT_METADATA + documentHash
    await this.setValidated(key, metadata, DocumentMetadataSchema, CacheTTL.LONG)
  }

  async getDocumentMetadata(documentHash: string): Promise<z.infer<typeof DocumentMetadataSchema> | null> {
    const key = CacheKeys.DOCUMENT_METADATA + documentHash
    return this.getValidated(key, DocumentMetadataSchema)
  }

  // Analysis result caching
  async setAnalysisResult(analysisId: string, result: z.infer<typeof AnalysisResultSchema>): Promise<void> {
    const key = CacheKeys.ANALYSIS_RESULT + analysisId
    await this.setValidated(key, result, AnalysisResultSchema, CacheTTL.DAILY)
  }

  async getAnalysisResult(analysisId: string): Promise<z.infer<typeof AnalysisResultSchema> | null> {
    const key = CacheKeys.ANALYSIS_RESULT + analysisId
    return this.getValidated(key, AnalysisResultSchema)
  }

  // Notification preferences caching
  async setNotificationPreferences(userId: string, prefs: z.infer<typeof NotificationPreferencesSchema>): Promise<void> {
    const key = CacheKeys.NOTIFICATION_PREFS + userId
    await this.setValidated(key, prefs, NotificationPreferencesSchema, CacheTTL.LONG)
  }

  async getNotificationPreferences(userId: string): Promise<z.infer<typeof NotificationPreferencesSchema> | null> {
    const key = CacheKeys.NOTIFICATION_PREFS + userId
    return this.getValidated(key, NotificationPreferencesSchema)
  }

  // Pattern library caching
  async setPatternLibrary(patterns: any[]): Promise<void> {
    const key = CacheKeys.PATTERN_LIBRARY + 'all'
    await redis.setex(key, CacheTTL.DAILY, JSON.stringify(patterns))
  }

  async getPatternLibrary(): Promise<any[] | null> {
    const key = CacheKeys.PATTERN_LIBRARY + 'all'
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error }, 'Failed to get pattern library from cache')
      return null
    }
  }

  // Rate limiting
  async incrementRateLimit(identifier: string, window: number = 3600): Promise<number> {
    const key = CacheKeys.API_RATE_LIMIT + identifier
    const current = await redis.incr(key)
    
    if (current === 1) {
      await redis.expire(key, window)
    }
    
    return current
  }

  async getRateLimit(identifier: string): Promise<number> {
    const key = CacheKeys.API_RATE_LIMIT + identifier
    const current = await redis.get(key)
    return current ? parseInt(current, 10) : 0
  }

  async resetRateLimit(identifier: string): Promise<void> {
    const key = CacheKeys.API_RATE_LIMIT + identifier
    await redis.del(key)
  }

  // Team membership caching
  async setTeamMembers(teamId: string, members: any[]): Promise<void> {
    const key = CacheKeys.TEAM_MEMBERS + teamId
    await redis.setex(key, CacheTTL.MEDIUM, JSON.stringify(members))
  }

  async getTeamMembers(teamId: string): Promise<any[] | null> {
    const key = CacheKeys.TEAM_MEMBERS + teamId
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get team members from cache')
      return null
    }
  }

  // Subscription status caching
  async setSubscriptionStatus(userId: string, status: any): Promise<void> {
    const key = CacheKeys.SUBSCRIPTION_STATUS + userId
    await redis.setex(key, CacheTTL.MEDIUM, JSON.stringify(status))
  }

  async getSubscriptionStatus(userId: string): Promise<any | null> {
    const key = CacheKeys.SUBSCRIPTION_STATUS + userId
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get subscription status from cache')
      return null
    }
  }

  // Document monitoring cache
  async setDocumentMonitoring(documentId: string, monitoringData: any): Promise<void> {
    const key = CacheKeys.DOCUMENT_MONITORING + documentId
    await redis.setex(key, CacheTTL.LONG, JSON.stringify(monitoringData))
  }

  async getDocumentMonitoring(documentId: string): Promise<any | null> {
    const key = CacheKeys.DOCUMENT_MONITORING + documentId
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to get document monitoring from cache')
      return null
    }
  }

  // Search results caching
  async setSearchResults(query: string, userId: string, results: any): Promise<void> {
    const key = CacheKeys.SEARCH_RESULTS + `${userId}:${Buffer.from(query).toString('base64')}`
    await redis.setex(key, CacheTTL.SHORT, JSON.stringify(results))
  }

  async getSearchResults(query: string, userId: string): Promise<any | null> {
    const key = CacheKeys.SEARCH_RESULTS + `${userId}:${Buffer.from(query).toString('base64')}`
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, query, userId }, 'Failed to get search results from cache')
      return null
    }
  }

  // Analytics summary caching
  async setAnalyticsSummary(date: string, summary: any): Promise<void> {
    const key = CacheKeys.ANALYTICS_SUMMARY + date
    await redis.setex(key, CacheTTL.DAILY, JSON.stringify(summary))
  }

  async getAnalyticsSummary(date: string): Promise<any | null> {
    const key = CacheKeys.ANALYTICS_SUMMARY + date
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, date }, 'Failed to get analytics summary from cache')
      return null
    }
  }

  // System configuration caching
  async setSystemConfig(configKey: string, config: any): Promise<void> {
    const key = CacheKeys.SYSTEM_CONFIG + configKey
    await redis.setex(key, CacheTTL.LONG, JSON.stringify(config))
  }

  async getSystemConfig(configKey: string): Promise<any | null> {
    const key = CacheKeys.SYSTEM_CONFIG + configKey
    try {
      const cached = await redis.get(key)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      logger.error({ error, configKey }, 'Failed to get system config from cache')
      return null
    }
  }

  // Cache invalidation utilities
  async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [
      CacheKeys.USER_PROFILE + userId,
      CacheKeys.USER_DASHBOARD + userId,
      CacheKeys.NOTIFICATION_PREFS + userId,
      CacheKeys.SUBSCRIPTION_STATUS + userId
    ]

    const pipeline = redis.pipeline()
    patterns.forEach(pattern => pipeline.del(pattern))
    await pipeline.exec()

    logger.info({ userId }, 'User cache invalidated')
  }

  async invalidateDocumentCache(documentHash: string): Promise<void> {
    const key = CacheKeys.DOCUMENT_METADATA + documentHash
    await redis.del(key)
    logger.info({ documentHash }, 'Document cache invalidated')
  }

  async invalidateAnalysisCache(analysisId: string): Promise<void> {
    const key = CacheKeys.ANALYSIS_RESULT + analysisId
    await redis.del(key)
    logger.info({ analysisId }, 'Analysis cache invalidated')
  }

  async invalidateTeamCache(teamId: string): Promise<void> {
    const key = CacheKeys.TEAM_MEMBERS + teamId
    await redis.del(key)
    logger.info({ teamId }, 'Team cache invalidated')
  }

  // Cache statistics
  async getCacheStats(): Promise<{
    totalKeys: number
    usedMemory: string
    hitRate: string
    evictedKeys: string
  }> {
    const info = await redis.info('memory')
    const stats = await redis.info('stats')
    
    const totalKeys = await redis.dbsize()
    const usedMemory = this.extractInfoValue(info, 'used_memory_human')
    const hitRate = this.calculateHitRate(stats)
    const evictedKeys = this.extractInfoValue(stats, 'evicted_keys')

    return {
      totalKeys,
      usedMemory,
      hitRate,
      evictedKeys
    }
  }

  private extractInfoValue(info: string, key: string): string {
    const match = info.match(new RegExp(`${key}:(.+)`))
    return match ? match[1].trim() : 'N/A'
  }

  private calculateHitRate(stats: string): string {
    const hits = this.extractInfoValue(stats, 'keyspace_hits')
    const misses = this.extractInfoValue(stats, 'keyspace_misses')
    
    if (hits === 'N/A' || misses === 'N/A') return 'N/A'
    
    const hitCount = parseInt(hits, 10)
    const missCount = parseInt(misses, 10)
    const total = hitCount + missCount
    
    if (total === 0) return '0%'
    
    const rate = (hitCount / total * 100).toFixed(2)
    return `${rate}%`
  }

  // Bulk operations
  async mget(keys: string[]): Promise<(string | null)[]> {
    try {
      return await redis.mget(...keys)
    } catch (error) {
      logger.error({ error, keys }, 'Cache mget failed')
      return keys.map(() => null)
    }
  }

  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    try {
      const pipeline = redis.pipeline()
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const serialized = JSON.stringify(value)
        if (ttl) {
          pipeline.setex(key, ttl, serialized)
        } else {
          pipeline.set(key, serialized)
        }
      })
      
      await pipeline.exec()
      logger.debug({ count: Object.keys(keyValuePairs).length }, 'Cache mset completed')
    } catch (error) {
      logger.error({ error, keyCount: Object.keys(keyValuePairs).length }, 'Cache mset failed')
      throw error
    }
  }

  // Pattern-based deletion
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await redis.keys(pattern)
      if (keys.length === 0) return 0
      
      await redis.del(...keys)
      logger.info({ pattern, deletedCount: keys.length }, 'Pattern-based cache deletion completed')
      return keys.length
    } catch (error) {
      logger.error({ error, pattern }, 'Pattern-based cache deletion failed')
      throw error
    }
  }
}

// Export singleton instance
export const cacheService = CacheService.getInstance()

// Export schemas for external validation
export {
  UserSessionSchema,
  DocumentMetadataSchema,
  AnalysisResultSchema,
  UserDashboardSchema,
  NotificationPreferencesSchema
}