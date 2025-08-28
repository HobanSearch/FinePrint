import { prisma, redis, dbLogger as logger } from './client.js'
import { PrismaClient } from '@prisma/client'
import { performance } from 'perf_hooks'

// Performance monitoring constants
const SLOW_QUERY_THRESHOLD = 1000 // milliseconds
const CACHE_PERFORMANCE_KEY = 'performance:query_stats'
const PERFORMANCE_METRICS_RETENTION = 7 * 24 * 60 * 60 // 7 days in seconds

// Query performance metrics interface
interface QueryMetrics {
  query: string
  duration: number
  timestamp: number
  params?: any[]
  error?: string
  cacheHit?: boolean
  resultCount?: number
}

interface PerformanceStats {
  totalQueries: number
  averageDuration: number
  slowQueries: number
  errorRate: number
  cacheHitRate: number
  topSlowQueries: Array<{
    query: string
    avgDuration: number
    count: number
  }>
  queryDistribution: Record<string, number>
}

// Performance monitoring service
export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private queryMetrics: QueryMetrics[] = []
  private maxMetricsBuffer = 10000

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  // Track query performance
  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    params?: any[]
  ): Promise<T> {
    const startTime = performance.now()
    const timestamp = Date.now()
    let error: string | undefined
    let result: T
    let resultCount: number | undefined

    try {
      result = await queryFn()
      
      // Try to determine result count
      if (Array.isArray(result)) {
        resultCount = result.length
      } else if (result && typeof result === 'object' && 'length' in result) {
        resultCount = (result as any).length
      }

      return result
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      const duration = performance.now() - startTime
      
      const metrics: QueryMetrics = {
        query: queryName,
        duration,
        timestamp,
        params,
        error,
        resultCount
      }

      this.recordMetrics(metrics)
      
      // Log slow queries
      if (duration > SLOW_QUERY_THRESHOLD) {
        logger.warn({
          query: queryName,
          duration: `${duration.toFixed(2)}ms`,
          params,
          resultCount,
          error
        }, 'Slow query detected')
      }
    }
  }

  // Track cached query performance
  async trackCachedQuery<T>(
    queryName: string,
    cacheKey: string,
    queryFn: () => Promise<T>,
    cacheFn: {
      get: () => Promise<T | null>
      set: (value: T, ttl?: number) => Promise<void>
    },
    ttl?: number
  ): Promise<T> {
    const startTime = performance.now()
    const timestamp = Date.now()
    let cacheHit = false
    let result: T

    try {
      // Try cache first
      const cached = await cacheFn.get()
      if (cached !== null) {
        cacheHit = true
        result = cached
      } else {
        // Cache miss - execute query
        result = await queryFn()
        await cacheFn.set(result, ttl)
      }

      return result
    } finally {
      const duration = performance.now() - startTime
      
      const metrics: QueryMetrics = {
        query: queryName,
        duration,
        timestamp,
        cacheHit,
        resultCount: Array.isArray(result) ? result.length : undefined
      }

      this.recordMetrics(metrics)
      
      logger.debug({
        query: queryName,
        duration: `${duration.toFixed(2)}ms`,
        cacheHit,
        cacheKey
      }, 'Cached query executed')
    }
  }

  // Record metrics in buffer and Redis
  private recordMetrics(metrics: QueryMetrics): void {
    // Add to in-memory buffer
    this.queryMetrics.push(metrics)
    
    // Keep buffer size manageable
    if (this.queryMetrics.length > this.maxMetricsBuffer) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxMetricsBuffer)
    }

    // Store in Redis for persistence (fire and forget)
    this.storeMetricsInRedis(metrics).catch(error => {
      logger.warn({ error }, 'Failed to store metrics in Redis')
    })
  }

  // Store metrics in Redis
  private async storeMetricsInRedis(metrics: QueryMetrics): Promise<void> {
    try {
      const key = `${CACHE_PERFORMANCE_KEY}:${new Date().toISOString().split('T')[0]}`
      await redis.lpush(key, JSON.stringify(metrics))
      await redis.expire(key, PERFORMANCE_METRICS_RETENTION)
    } catch (error) {
      // Silent fail - metrics storage shouldn't break queries
    }
  }

  // Get performance statistics
  getPerformanceStats(timeWindowMinutes: number = 60): PerformanceStats {
    const cutoffTime = Date.now() - (timeWindowMinutes * 60 * 1000)
    const recentMetrics = this.queryMetrics.filter(m => m.timestamp > cutoffTime)

    if (recentMetrics.length === 0) {
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        errorRate: 0,
        cacheHitRate: 0,
        topSlowQueries: [],
        queryDistribution: {}
      }
    }

    const totalQueries = recentMetrics.length
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0)
    const averageDuration = totalDuration / totalQueries

    const slowQueries = recentMetrics.filter(m => m.duration > SLOW_QUERY_THRESHOLD).length
    const errorQueries = recentMetrics.filter(m => m.error).length
    const cacheHits = recentMetrics.filter(m => m.cacheHit === true).length
    const cachedQueries = recentMetrics.filter(m => m.cacheHit !== undefined).length

    // Group queries by name for top slow queries
    const queryGroups: Record<string, QueryMetrics[]> = {}
    recentMetrics.forEach(metric => {
      if (!queryGroups[metric.query]) {
        queryGroups[metric.query] = []
      }
      queryGroups[metric.query].push(metric)
    })

    const topSlowQueries = Object.entries(queryGroups)
      .map(([query, metrics]) => ({
        query,
        avgDuration: metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
        count: metrics.length
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10)

    // Query distribution
    const queryDistribution: Record<string, number> = {}
    recentMetrics.forEach(metric => {
      queryDistribution[metric.query] = (queryDistribution[metric.query] || 0) + 1
    })

    return {
      totalQueries,
      averageDuration: Math.round(averageDuration * 100) / 100,
      slowQueries,
      errorRate: errorQueries / totalQueries,
      cacheHitRate: cachedQueries > 0 ? cacheHits / cachedQueries : 0,
      topSlowQueries,
      queryDistribution
    }
  }

  // Get historical performance data from Redis
  async getHistoricalStats(days: number = 7): Promise<PerformanceStats[]> {
    const stats: PerformanceStats[] = []
    
    for (let day = 0; day < days; day++) {
      const date = new Date(Date.now() - day * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      const key = `${CACHE_PERFORMANCE_KEY}:${dateStr}`
      
      try {
        const metricsData = await redis.lrange(key, 0, -1)
        const metrics: QueryMetrics[] = metricsData.map(data => JSON.parse(data))
        
        if (metrics.length > 0) {
          stats.push(this.calculateStatsFromMetrics(metrics))
        }
      } catch (error) {
        logger.warn({ error, date: dateStr }, 'Failed to retrieve historical stats')
      }
    }
    
    return stats.reverse() // Return in chronological order
  }

  private calculateStatsFromMetrics(metrics: QueryMetrics[]): PerformanceStats {
    const totalQueries = metrics.length
    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0)
    const averageDuration = totalDuration / totalQueries

    const slowQueries = metrics.filter(m => m.duration > SLOW_QUERY_THRESHOLD).length
    const errorQueries = metrics.filter(m => m.error).length
    const cacheHits = metrics.filter(m => m.cacheHit === true).length
    const cachedQueries = metrics.filter(m => m.cacheHit !== undefined).length

    const queryGroups: Record<string, QueryMetrics[]> = {}
    metrics.forEach(metric => {
      if (!queryGroups[metric.query]) {
        queryGroups[metric.query] = []
      }
      queryGroups[metric.query].push(metric)
    })

    const topSlowQueries = Object.entries(queryGroups)
      .map(([query, queryMetrics]) => ({
        query,
        avgDuration: queryMetrics.reduce((sum, m) => sum + m.duration, 0) / queryMetrics.length,
        count: queryMetrics.length
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10)

    const queryDistribution: Record<string, number> = {}
    metrics.forEach(metric => {
      queryDistribution[metric.query] = (queryDistribution[metric.query] || 0) + 1
    })

    return {
      totalQueries,
      averageDuration: Math.round(averageDuration * 100) / 100,
      slowQueries,
      errorRate: errorQueries / totalQueries,
      cacheHitRate: cachedQueries > 0 ? cacheHits / cachedQueries : 0,
      topSlowQueries,
      queryDistribution
    }
  }

  // Clear metrics buffer
  clearMetrics(): void {
    this.queryMetrics = []
    logger.info('Performance metrics buffer cleared')
  }
}

// Query optimization utilities
export class QueryOptimizer {
  private static instance: QueryOptimizer

  static getInstance(): QueryOptimizer {
    if (!QueryOptimizer.instance) {
      QueryOptimizer.instance = new QueryOptimizer()
    }
    return QueryOptimizer.instance
  }

  // Analyze slow queries and suggest optimizations
  async analyzeSlowQueries(): Promise<Array<{
    query: string
    avgDuration: number
    count: number
    suggestions: string[]
  }>> {
    const monitor = PerformanceMonitor.getInstance()
    const stats = monitor.getPerformanceStats(60 * 24) // Last 24 hours
    
    return stats.topSlowQueries.map(query => ({
      ...query,
      suggestions: this.generateOptimizationSuggestions(query.query, query.avgDuration)
    }))
  }

  // Generate optimization suggestions based on query patterns
  private generateOptimizationSuggestions(queryName: string, avgDuration: number): string[] {
    const suggestions: string[] = []
    
    // Query-specific suggestions
    if (queryName.includes('findMany') || queryName.includes('search')) {
      suggestions.push('Consider adding pagination with take/skip parameters')
      suggestions.push('Ensure proper indexes exist for filter conditions')
      
      if (avgDuration > 2000) {
        suggestions.push('Consider implementing result caching')
        suggestions.push('Review if all selected fields are necessary')
      }
    }
    
    if (queryName.includes('include') || queryName.includes('nested')) {
      suggestions.push('Review nested includes - consider using select instead')
      suggestions.push('Check if all related data is needed')
    }
    
    if (queryName.includes('count') && avgDuration > 500) {
      suggestions.push('Consider caching count results')
      suggestions.push('Use approximate counts for large datasets')
    }
    
    if (queryName.includes('aggregate') || queryName.includes('groupBy')) {
      suggestions.push('Consider pre-computing aggregations')
      suggestions.push('Add appropriate database indexes for grouping fields')
    }
    
    // General suggestions based on duration
    if (avgDuration > 5000) {
      suggestions.push('CRITICAL: Query is very slow, consider query redesign')
      suggestions.push('Consider breaking complex queries into smaller parts')
    } else if (avgDuration > 2000) {
      suggestions.push('HIGH: Query performance needs attention')
      suggestions.push('Review query execution plan')
    } else if (avgDuration > 1000) {
      suggestions.push('MEDIUM: Consider optimization')
    }
    
    return suggestions
  }

  // Database connection pool monitoring
  async getConnectionPoolStats(): Promise<{
    activeConnections: number
    idleConnections: number
    totalConnections: number
    waitingRequests: number
    maxConnections: number
  }> {
    try {
      // Note: This would need to be implemented based on your connection pool
      // For Prisma, this information might not be directly available
      // This is a placeholder implementation
      
      const result = await prisma.$queryRaw`
        SELECT 
          count(*) as total_connections,
          sum(case when state = 'active' then 1 else 0 end) as active_connections,
          sum(case when state = 'idle' then 1 else 0 end) as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      ` as any[]

      const stats = result[0] || {}
      
      return {
        activeConnections: parseInt(stats.active_connections) || 0,
        idleConnections: parseInt(stats.idle_connections) || 0,
        totalConnections: parseInt(stats.total_connections) || 0,
        waitingRequests: 0, // Would need separate tracking
        maxConnections: 20  // Based on your configuration
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get connection pool stats')
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        waitingRequests: 0,
        maxConnections: 20
      }
    }
  }

  // Index effectiveness analysis
  async analyzeIndexEffectiveness(): Promise<Array<{
    schemaName: string
    tableName: string
    indexName: string
    indexScans: number
    tupleReads: number
    tuplesReturned: number
    effectiveness: number
    recommendation: string
  }>> {
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuple_reads,
          idx_tup_fetch as tuples_returned,
          CASE 
            WHEN idx_scan = 0 THEN 0
            ELSE round((idx_tup_fetch::float / idx_tup_read::float) * 100, 2)
          END as effectiveness
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC, effectiveness DESC
      ` as any[]

      return result.map(row => ({
        schemaName: row.schemaname,
        tableName: row.tablename,
        indexName: row.indexname,
        indexScans: parseInt(row.index_scans) || 0,
        tupleReads: parseInt(row.tuple_reads) || 0,
        tuplesReturned: parseInt(row.tuples_returned) || 0,
        effectiveness: parseFloat(row.effectiveness) || 0,
        recommendation: this.getIndexRecommendation(
          parseInt(row.index_scans) || 0,
          parseFloat(row.effectiveness) || 0
        )
      }))
    } catch (error) {
      logger.error({ error }, 'Failed to analyze index effectiveness')
      return []
    }
  }

  private getIndexRecommendation(scans: number, effectiveness: number): string {
    if (scans === 0) {
      return 'UNUSED: Consider dropping this index if not needed'
    } else if (effectiveness < 10) {
      return 'LOW EFFECTIVENESS: Review index definition and usage patterns'
    } else if (effectiveness < 50) {
      return 'MEDIUM EFFECTIVENESS: Consider optimization'
    } else {
      return 'GOOD: Index is performing well'
    }
  }

  // Table statistics and bloat analysis
  async getTableStats(): Promise<Array<{
    tableName: string
    rowCount: number
    totalSize: string
    indexSize: string
    toastSize: string
    bloatRatio: number
    lastVacuum: string | null
    lastAnalyze: string | null
    recommendation: string
  }>> {
    try {
      const result = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as row_count,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_size_pretty(pg_indexes_size(relid)) as index_size,
          pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid) - pg_indexes_size(relid)) as toast_size,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze,
          CASE 
            WHEN n_dead_tup = 0 THEN 0
            ELSE round((n_dead_tup::float / GREATEST(n_live_tup, 1)::float) * 100, 2)
          END as bloat_ratio
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(relid) DESC
      ` as any[]

      return result.map(row => ({
        tableName: row.tablename,
        rowCount: parseInt(row.row_count) || 0,
        totalSize: row.total_size,
        indexSize: row.index_size,
        toastSize: row.toast_size,
        bloatRatio: parseFloat(row.bloat_ratio) || 0,
        lastVacuum: row.last_vacuum || row.last_autovacuum,
        lastAnalyze: row.last_analyze || row.last_autoanalyze,
        recommendation: this.getTableRecommendation(
          parseFloat(row.bloat_ratio) || 0,
          row.last_vacuum || row.last_autovacuum,
          row.last_analyze || row.last_autoanalyze
        )
      }))
    } catch (error) {
      logger.error({ error }, 'Failed to get table stats')
      return []
    }
  }

  private getTableRecommendation(
    bloatRatio: number,
    lastVacuum: string | null,
    lastAnalyze: string | null
  ): string {
    const recommendations: string[] = []
    
    if (bloatRatio > 50) {
      recommendations.push('HIGH BLOAT: Consider VACUUM FULL')
    } else if (bloatRatio > 20) {
      recommendations.push('MEDIUM BLOAT: Schedule regular VACUUM')
    }
    
    if (!lastVacuum) {
      recommendations.push('Never vacuumed: Needs maintenance')
    } else {
      const vacuumAge = Date.now() - new Date(lastVacuum).getTime()
      if (vacuumAge > 7 * 24 * 60 * 60 * 1000) { // 7 days
        recommendations.push('VACUUM overdue')
      }
    }
    
    if (!lastAnalyze) {
      recommendations.push('Never analyzed: Statistics may be stale')
    } else {
      const analyzeAge = Date.now() - new Date(lastAnalyze).getTime()
      if (analyzeAge > 24 * 60 * 60 * 1000) { // 1 day
        recommendations.push('ANALYZE recommended')
      }
    }
    
    return recommendations.length > 0 ? recommendations.join('; ') : 'OK'
  }

  // Generate optimization report
  async generateOptimizationReport(): Promise<{
    summary: {
      totalSlowQueries: number
      averageQueryTime: number
      cacheHitRate: number
      connectionPoolUtilization: number
    }
    slowQueries: Array<{
      query: string
      avgDuration: number
      count: number
      suggestions: string[]
    }>
    indexAnalysis: Array<{
      tableName: string
      indexName: string
      effectiveness: number
      recommendation: string
    }>
    tableStats: Array<{
      tableName: string
      rowCount: number
      totalSize: string
      bloatRatio: number
      recommendation: string
    }>
    recommendations: string[]
  }> {
    try {
      const monitor = PerformanceMonitor.getInstance()
      const perfStats = monitor.getPerformanceStats(60 * 24) // 24 hours
      const slowQueries = await this.analyzeSlowQueries()
      const indexAnalysis = await this.analyzeIndexEffectiveness()
      const tableStats = await this.getTableStats()
      const connectionStats = await this.getConnectionPoolStats()

      const recommendations: string[] = []

      // Generate high-level recommendations
      if (perfStats.slowQueries > perfStats.totalQueries * 0.1) {
        recommendations.push('High number of slow queries detected - review query patterns')
      }

      if (perfStats.cacheHitRate < 0.8) {
        recommendations.push('Low cache hit rate - consider improving caching strategy')
      }

      const poolUtilization = connectionStats.activeConnections / connectionStats.maxConnections
      if (poolUtilization > 0.8) {
        recommendations.push('High connection pool utilization - consider increasing pool size')
      }

      const highBloatTables = tableStats.filter(t => t.bloatRatio > 20)
      if (highBloatTables.length > 0) {
        recommendations.push(`${highBloatTables.length} tables have high bloat - schedule maintenance`)
      }

      return {
        summary: {
          totalSlowQueries: perfStats.slowQueries,
          averageQueryTime: perfStats.averageDuration,
          cacheHitRate: perfStats.cacheHitRate,
          connectionPoolUtilization: poolUtilization
        },
        slowQueries,
        indexAnalysis,
        tableStats,
        recommendations
      }
    } catch (error) {
      logger.error({ error }, 'Failed to generate optimization report')
      throw error
    }
  }
}

// Database health monitoring
export class DatabaseHealthMonitor {
  private static instance: DatabaseHealthMonitor

  static getInstance(): DatabaseHealthMonitor {
    if (!DatabaseHealthMonitor.instance) {
      DatabaseHealthMonitor.instance = new DatabaseHealthMonitor()
    }
    return DatabaseHealthMonitor.instance
  }

  // Comprehensive health check
  async performHealthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical'
    checks: Array<{
      name: string
      status: 'pass' | 'warn' | 'fail'
      message: string
      value?: number
      threshold?: number
    }>
    recommendations: string[]
  }> {
    const checks = []
    const recommendations: string[] = []

    try {
      // Database connectivity
      const connectivityStart = performance.now()
      await prisma.$queryRaw`SELECT 1`
      const connectivityTime = performance.now() - connectivityStart
      
      checks.push({
        name: 'Database Connectivity',
        status: connectivityTime < 100 ? 'pass' : connectivityTime < 500 ? 'warn' : 'fail',
        message: `Connection established in ${connectivityTime.toFixed(2)}ms`,
        value: connectivityTime,
        threshold: 100
      })

      // Connection pool health
      const poolStats = await QueryOptimizer.getInstance().getConnectionPoolStats()
      const poolUtilization = poolStats.activeConnections / poolStats.maxConnections
      
      checks.push({
        name: 'Connection Pool',
        status: poolUtilization < 0.7 ? 'pass' : poolUtilization < 0.9 ? 'warn' : 'fail',
        message: `${poolStats.activeConnections}/${poolStats.maxConnections} connections active`,
        value: poolUtilization,
        threshold: 0.7
      })

      // Query performance
      const perfStats = PerformanceMonitor.getInstance().getPerformanceStats(60)
      const avgQueryTime = perfStats.averageDuration
      
      checks.push({
        name: 'Query Performance',
        status: avgQueryTime < 500 ? 'pass' : avgQueryTime < 1000 ? 'warn' : 'fail',
        message: `Average query time: ${avgQueryTime.toFixed(2)}ms`,
        value: avgQueryTime,
        threshold: 500
      })

      // Cache performance
      checks.push({
        name: 'Cache Hit Rate',
        status: perfStats.cacheHitRate > 0.8 ? 'pass' : perfStats.cacheHitRate > 0.6 ? 'warn' : 'fail',
        message: `Cache hit rate: ${(perfStats.cacheHitRate * 100).toFixed(1)}%`,
        value: perfStats.cacheHitRate,
        threshold: 0.8
      })

      // Database size and bloat
      const tableStats = await QueryOptimizer.getInstance().getTableStats()
      const avgBloat = tableStats.reduce((sum, t) => sum + t.bloatRatio, 0) / tableStats.length
      
      checks.push({
        name: 'Table Bloat',
        status: avgBloat < 20 ? 'pass' : avgBloat < 40 ? 'warn' : 'fail',
        message: `Average table bloat: ${avgBloat.toFixed(1)}%`,
        value: avgBloat,
        threshold: 20
      })

      // Generate recommendations
      checks.forEach(check => {
        if (check.status === 'fail') {
          recommendations.push(`CRITICAL: ${check.name} - ${check.message}`)
        } else if (check.status === 'warn') {
          recommendations.push(`WARNING: ${check.name} - ${check.message}`)
        }
      })

      // Determine overall health
      const criticalCount = checks.filter(c => c.status === 'fail').length
      const warningCount = checks.filter(c => c.status === 'warn').length
      
      let overall: 'healthy' | 'degraded' | 'critical'
      if (criticalCount > 0) {
        overall = 'critical'
      } else if (warningCount > checks.length / 2) {
        overall = 'degraded'
      } else {
        overall = 'healthy'
      }

      return {
        overall,
        checks,
        recommendations
      }
    } catch (error) {
      logger.error({ error }, 'Health check failed')
      return {
        overall: 'critical',
        checks: [{
          name: 'Database Health Check',
          status: 'fail',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        recommendations: ['Database health check failed - immediate attention required']
      }
    }
  }

  // Automated maintenance tasks
  async performMaintenance(): Promise<{
    completed: string[]
    failed: string[]
    recommendations: string[]
  }> {
    const completed: string[] = []
    const failed: string[] = []
    const recommendations: string[] = []

    try {
      // Update table statistics
      logger.info('Starting automated maintenance tasks')
      
      const tableStats = await QueryOptimizer.getInstance().getTableStats()
      const staleTables = tableStats.filter(t => {
        if (!t.lastAnalyze) return true
        const analyzeAge = Date.now() - new Date(t.lastAnalyze).getTime()
        return analyzeAge > 24 * 60 * 60 * 1000 // 1 day
      })

      for (const table of staleTables.slice(0, 5)) { // Limit to 5 tables per run
        try {
          await prisma.$executeRawUnsafe(`ANALYZE "${table.tableName}"`)
          completed.push(`Analyzed table: ${table.tableName}`)
        } catch (error) {
          failed.push(`Failed to analyze table: ${table.tableName}`)
        }
      }

      // Cleanup old performance metrics
      try {
        const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const cutoffStr = cutoffDate.toISOString().split('T')[0]
        
        const keys = await redis.keys(`${CACHE_PERFORMANCE_KEY}:*`)
        const oldKeys = keys.filter(key => {
          const dateStr = key.split(':')[2]
          return dateStr < cutoffStr
        })
        
        if (oldKeys.length > 0) {
          await redis.del(...oldKeys)
          completed.push(`Cleaned up ${oldKeys.length} old performance metric keys`)
        }
      } catch (error) {
        failed.push('Failed to cleanup old performance metrics')
      }

      // Generate maintenance recommendations
      if (staleTables.length > 5) {
        recommendations.push(`${staleTables.length} tables need statistics updates`)
      }

      const highBloatTables = tableStats.filter(t => t.bloatRatio > 50)
      if (highBloatTables.length > 0) {
        recommendations.push(`${highBloatTables.length} tables have critical bloat levels`)
      }

      logger.info({
        completed: completed.length,
        failed: failed.length,
        recommendations: recommendations.length
      }, 'Automated maintenance completed')

      return { completed, failed, recommendations }
    } catch (error) {
      logger.error({ error }, 'Automated maintenance failed')
      return {
        completed,
        failed: [...failed, 'Maintenance process failed'],
        recommendations: ['Manual intervention may be required']
      }
    }
  }
}

// Export singleton instances
export const performanceMonitor = PerformanceMonitor.getInstance()
export const queryOptimizer = QueryOptimizer.getInstance()
export const healthMonitor = DatabaseHealthMonitor.getInstance()

// Utility function to create a performance-tracking Prisma client
export function createMonitoredPrismaClient(): PrismaClient {
  const client = new PrismaClient()
  
  // Intercept queries to add performance monitoring
  client.$use(async (params, next) => {
    const queryName = `${params.model || 'unknown'}.${params.action}`
    
    return performanceMonitor.trackQuery(
      queryName,
      () => next(params),
      params.args ? [params.args] : undefined
    )
  })

  return client
}