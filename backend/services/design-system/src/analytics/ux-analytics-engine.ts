/**
 * UX Analytics Engine - Advanced user behavior analysis and optimization
 * Provides heatmaps, conversion funnels, user journey mapping, and performance tracking
 */

import { z } from 'zod'
import { DatabaseClient } from '../utils/database.js'
import { RedisClient } from '../utils/redis.js'
import { logger } from '../utils/logger.js'
import type {
  UserEvent,
  HeatmapData,
  ConversionFunnel,
  UserJourney,
  PerformanceMetrics,
  UXInsight,
  UserSession,
  ComponentUsageStats,
  AccessibilityMetrics,
} from '../types/ux-analytics.js'

// Validation schemas
const UserEventSchema = z.object({
  sessionId: z.string(),
  userId: z.string().optional(),
  timestamp: z.date(),
  type: z.enum(['click', 'scroll', 'hover', 'focus', 'keypress', 'resize', 'navigation']),
  element: z.object({
    tag: z.string(),
    id: z.string().optional(),
    className: z.string().optional(),
    text: z.string().optional(),
    xpath: z.string(),
  }),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
})

const PerformanceMetricsSchema = z.object({
  sessionId: z.string(),
  timestamp: z.date(),
  metrics: z.object({
    // Core Web Vitals
    lcp: z.number().optional(), // Largest Contentful Paint
    fid: z.number().optional(), // First Input Delay
    cls: z.number().optional(), // Cumulative Layout Shift
    
    // Additional metrics
    fcp: z.number().optional(), // First Contentful Paint
    ttfb: z.number().optional(), // Time to First Byte
    loadTime: z.number().optional(),
    domReady: z.number().optional(),
    
    // Component-specific metrics
    componentRenderTime: z.number().optional(),
    componentCount: z.number().optional(),
    reRenderCount: z.number().optional(),
  }),
  url: z.string(),
  userAgent: z.string().optional(),
})

export class UXAnalyticsEngine {
  private isInitialized = false
  private eventBuffer: UserEvent[] = []
  private bufferFlushInterval: NodeJS.Timeout | null = null
  private readonly BUFFER_SIZE = 100
  private readonly FLUSH_INTERVAL = 5000 // 5 seconds

  constructor(
    private database: DatabaseClient,
    private redis: RedisClient
  ) {}

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing UX Analytics Engine')
      
      // Setup real-time event processing
      this.setupEventBuffer()
      
      // Initialize analytics tables
      await this.ensureAnalyticsTables()
      
      // Setup data retention policies
      await this.setupDataRetention()
      
      this.isInitialized = true
      logger.info('UX Analytics Engine initialized successfully')
    } catch (error) {
      logger.error(error, 'Failed to initialize UX Analytics Engine')
      throw error
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return this.isInitialized && 
             await this.database.healthCheck() && 
             await this.redis.healthCheck()
    } catch {
      return false
    }
  }

  // ===== EVENT TRACKING =====

  async trackEvent(event: Omit<UserEvent, 'id'>): Promise<void> {
    const validatedEvent = UserEventSchema.parse(event)
    
    const eventWithId: UserEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...validatedEvent,
    }

    // Add to buffer for batch processing
    this.eventBuffer.push(eventWithId)
    
    // Store in Redis for real-time processing
    await this.redis.lpush('ux:events:realtime', JSON.stringify(eventWithId))
    await this.redis.expire('ux:events:realtime', 3600) // 1 hour TTL

    // Flush buffer if full
    if (this.eventBuffer.length >= this.BUFFER_SIZE) {
      await this.flushEventBuffer()
    }
  }

  async trackPerformanceMetrics(metrics: Omit<PerformanceMetrics, 'id'>): Promise<void> {
    const validatedMetrics = PerformanceMetricsSchema.parse(metrics)
    
    const metricsWithId: PerformanceMetrics = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...validatedMetrics,
    }

    // Store in database
    await this.database.query(
      `INSERT INTO ux_performance_metrics 
       (id, session_id, timestamp, metrics, url, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        metricsWithId.id,
        metricsWithId.sessionId,
        metricsWithId.timestamp,
        JSON.stringify(metricsWithId.metrics),
        metricsWithId.url,
        metricsWithId.userAgent,
      ]
    )

    // Update real-time performance dashboard
    await this.updatePerformanceDashboard(metricsWithId)

    logger.debug({ sessionId: metricsWithId.sessionId }, 'Performance metrics tracked')
  }

  // ===== HEATMAP GENERATION =====

  async generateHeatmap(
    url: string, 
    timeRange: { start: Date; end: Date },
    options?: {
      eventTypes?: string[]
      viewport?: { width: number; height: number }
      segment?: string
    }
  ): Promise<HeatmapData> {
    logger.info({ url, timeRange }, 'Generating heatmap')

    const eventTypes = options?.eventTypes || ['click', 'hover']
    const viewport = options?.viewport

    let query = `
      SELECT 
        coordinates_x, 
        coordinates_y, 
        COUNT(*) as intensity,
        event_type
      FROM ux_events 
      WHERE url = $1 
        AND timestamp BETWEEN $2 AND $3
        AND event_type = ANY($4)
        AND coordinates_x IS NOT NULL 
        AND coordinates_y IS NOT NULL
    `
    
    const params: any[] = [url, timeRange.start, timeRange.end, eventTypes]

    if (viewport) {
      query += ` AND viewport_width = $${params.length + 1} AND viewport_height = $${params.length + 2}`
      params.push(viewport.width, viewport.height)
    }

    query += ` GROUP BY coordinates_x, coordinates_y, event_type`

    const result = await this.database.query(query, params)

    const heatmapPoints = result.rows.map(row => ({
      x: row.coordinates_x,
      y: row.coordinates_y,
      intensity: parseInt(row.intensity),
      type: row.event_type,
    }))

    const heatmapData: HeatmapData = {
      id: `heatmap_${Date.now()}`,
      url,
      timeRange,
      viewport: viewport || { width: 1920, height: 1080 }, // Default viewport
      points: heatmapPoints,
      totalEvents: heatmapPoints.reduce((sum, point) => sum + point.intensity, 0),
      generatedAt: new Date(),
      metadata: {
        eventTypes,
        segment: options?.segment,
      },
    }

    // Cache heatmap for faster retrieval
    await this.redis.setex(
      `heatmap:${url}:${timeRange.start.getTime()}-${timeRange.end.getTime()}`,
      3600, // 1 hour cache
      JSON.stringify(heatmapData)
    )

    return heatmapData
  }

  async generateScrollHeatmap(
    url: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{ depth: number; percentage: number }[]> {
    const result = await this.database.query(
      `SELECT 
         FLOOR(scroll_y / 100) * 100 as scroll_depth,
         COUNT(*) as users
       FROM ux_events 
       WHERE url = $1 
         AND timestamp BETWEEN $2 AND $3
         AND event_type = 'scroll'
         AND scroll_y IS NOT NULL
       GROUP BY FLOOR(scroll_y / 100)
       ORDER BY scroll_depth`,
      [url, timeRange.start, timeRange.end]
    )

    const totalUsers = result.rows.reduce((sum, row) => sum + parseInt(row.users), 0)

    return result.rows.map(row => ({
      depth: parseInt(row.scroll_depth),
      percentage: (parseInt(row.users) / totalUsers) * 100,
    }))
  }

  // ===== CONVERSION FUNNEL ANALYSIS =====

  async analyzeConversionFunnel(
    funnelSteps: string[],
    timeRange: { start: Date; end: Date },
    segment?: string
  ): Promise<ConversionFunnel> {
    logger.info({ funnelSteps, timeRange }, 'Analyzing conversion funnel')

    const funnelData: ConversionFunnel = {
      id: `funnel_${Date.now()}`,
      steps: [],
      timeRange,
      segment,
      generatedAt: new Date(),
    }

    for (let i = 0; i < funnelSteps.length; i++) {
      const step = funnelSteps[i]
      
      // Count users who reached this step
      const stepQuery = `
        SELECT COUNT(DISTINCT session_id) as users
        FROM ux_events 
        WHERE element_xpath LIKE $1
          AND timestamp BETWEEN $2 AND $3
      `
      
      const stepResult = await this.database.query(stepQuery, [
        `%${step}%`,
        timeRange.start,
        timeRange.end,
      ])

      const stepUsers = parseInt(stepResult.rows[0]?.users || '0')

      // Calculate conversion rate from previous step
      const conversionRate = i === 0 
        ? 100 
        : funnelData.steps.length > 0 
          ? (stepUsers / funnelData.steps[i - 1].users) * 100 
          : 0

      // Calculate drop-off rate
      const dropOffRate = i === 0 ? 0 : 100 - conversionRate

      funnelData.steps.push({
        name: step,
        users: stepUsers,
        conversionRate,
        dropOffRate,
        position: i,
      })
    }

    // Calculate overall conversion rate
    const totalUsers = funnelData.steps[0]?.users || 0
    const completedUsers = funnelData.steps[funnelData.steps.length - 1]?.users || 0
    funnelData.overallConversionRate = totalUsers > 0 ? (completedUsers / totalUsers) * 100 : 0

    return funnelData
  }

  // ===== USER JOURNEY MAPPING =====

  async mapUserJourney(
    sessionId: string,
    includePerformance = false
  ): Promise<UserJourney> {
    const eventsResult = await this.database.query(
      `SELECT * FROM ux_events 
       WHERE session_id = $1 
       ORDER BY timestamp ASC`,
      [sessionId]
    )

    const events = eventsResult.rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      timestamp: row.timestamp,
      type: row.event_type,
      element: JSON.parse(row.element),
      viewport: JSON.parse(row.viewport),
      coordinates: row.coordinates_x ? { x: row.coordinates_x, y: row.coordinates_y } : undefined,
      metadata: JSON.parse(row.metadata || '{}'),
    }))

    let performanceMetrics: PerformanceMetrics[] = []
    if (includePerformance) {
      const perfResult = await this.database.query(
        `SELECT * FROM ux_performance_metrics 
         WHERE session_id = $1 
         ORDER BY timestamp ASC`,
        [sessionId]
      )

      performanceMetrics = perfResult.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        metrics: JSON.parse(row.metrics),
        url: row.url,
        userAgent: row.user_agent,
      }))
    }

    // Analyze journey patterns
    const pages = [...new Set(events.map(e => e.metadata?.url).filter(Boolean))]
    const duration = events.length > 0 
      ? events[events.length - 1].timestamp.getTime() - events[0].timestamp.getTime()
      : 0

    const journey: UserJourney = {
      id: `journey_${sessionId}`,
      sessionId,
      userId: events[0]?.userId,
      events,
      performanceMetrics,
      pages,
      duration,
      startTime: events[0]?.timestamp || new Date(),
      endTime: events[events.length - 1]?.timestamp || new Date(),
      metadata: {
        eventCount: events.length,
        uniquePages: pages.length,
        averageEventInterval: events.length > 1 ? duration / (events.length - 1) : 0,
      },
    }

    return journey
  }

  // ===== COMPONENT USAGE ANALYTICS =====

  async analyzeComponentUsage(
    componentName: string,
    timeRange: { start: Date; end: Date }
  ): Promise<ComponentUsageStats> {
    const result = await this.database.query(
      `SELECT 
         COUNT(*) as total_interactions,
         COUNT(DISTINCT session_id) as unique_sessions,
         AVG(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as click_rate,
         AVG(CASE WHEN event_type = 'hover' THEN 1 ELSE 0 END) as hover_rate,
         event_type,
         COUNT(*) as event_count
       FROM ux_events 
       WHERE (element->>'className' LIKE $1 OR element->>'id' = $1)
         AND timestamp BETWEEN $2 AND $3
       GROUP BY event_type`,
      [`%${componentName}%`, timeRange.start, timeRange.end]
    )

    const totalInteractions = result.rows.reduce((sum, row) => sum + parseInt(row.event_count), 0)
    const uniqueSessions = new Set(result.rows.map(row => row.session_id)).size

    const eventBreakdown = result.rows.reduce((acc, row) => {
      acc[row.event_type] = parseInt(row.event_count)
      return acc
    }, {} as Record<string, number>)

    return {
      componentName,
      timeRange,
      totalInteractions,
      uniqueSessions,
      eventBreakdown,
      clickThroughRate: (eventBreakdown.click || 0) / totalInteractions * 100,
      engagementRate: totalInteractions / uniqueSessions,
      generatedAt: new Date(),
    }
  }

  // ===== ACCESSIBILITY ANALYTICS =====

  async analyzeAccessibilityMetrics(
    timeRange: { start: Date; end: Date }
  ): Promise<AccessibilityMetrics> {
    // Analyze keyboard navigation usage
    const keyboardResult = await this.database.query(
      `SELECT COUNT(*) as keyboard_events
       FROM ux_events 
       WHERE event_type = 'keypress'
         AND timestamp BETWEEN $1 AND $2`,
      [timeRange.start, timeRange.end]
    )

    // Analyze focus events
    const focusResult = await this.database.query(
      `SELECT COUNT(*) as focus_events
       FROM ux_events 
       WHERE event_type = 'focus'
         AND timestamp BETWEEN $1 AND $2`,
      [timeRange.start, timeRange.end]
    )

    // Analyze screen reader usage (based on user agent)
    const screenReaderResult = await this.database.query(
      `SELECT COUNT(DISTINCT session_id) as screen_reader_sessions
       FROM ux_events 
       WHERE metadata->>'userAgent' LIKE '%JAWS%' 
          OR metadata->>'userAgent' LIKE '%NVDA%'
          OR metadata->>'userAgent' LIKE '%VoiceOver%'
         AND timestamp BETWEEN $1 AND $2`,
      [timeRange.start, timeRange.end]
    )

    const totalSessions = await this.database.query(
      `SELECT COUNT(DISTINCT session_id) as total_sessions
       FROM ux_events 
       WHERE timestamp BETWEEN $1 AND $2`,
      [timeRange.start, timeRange.end]
    )

    const keyboardEvents = parseInt(keyboardResult.rows[0]?.keyboard_events || '0')
    const focusEvents = parseInt(focusResult.rows[0]?.focus_events || '0')
    const screenReaderSessions = parseInt(screenReaderResult.rows[0]?.screen_reader_sessions || '0')
    const totalSessionCount = parseInt(totalSessions.rows[0]?.total_sessions || '0')

    return {
      timeRange,
      keyboardNavigationUsage: keyboardEvents,
      focusEvents,
      screenReaderUsage: screenReaderSessions,
      accessibilityUsageRate: totalSessionCount > 0 
        ? (screenReaderSessions / totalSessionCount) * 100 
        : 0,
      keyboardToMouseRatio: focusEvents > 0 
        ? keyboardEvents / focusEvents 
        : 0,
      generatedAt: new Date(),
    }
  }

  // ===== INSIGHTS GENERATION =====

  async generateUXInsights(
    timeRange: { start: Date; end: Date }
  ): Promise<UXInsight[]> {
    const insights: UXInsight[] = []

    // Analyze bounce rate
    const bounceRate = await this.analyzeBounceRate(timeRange)
    if (bounceRate > 70) {
      insights.push({
        id: `insight_bounce_${Date.now()}`,
        type: 'performance',
        severity: 'high',
        title: 'High Bounce Rate Detected',
        description: `Bounce rate is ${bounceRate.toFixed(1)}%, which is above the recommended threshold of 70%.`,
        recommendation: 'Consider improving page load times, content relevance, or user experience.',
        impact: 'high',
        confidence: 0.85,
        generatedAt: new Date(),
        metadata: { bounceRate },
      })
    }

    // Analyze error patterns
    const errorInsights = await this.analyzeErrorPatterns(timeRange)
    insights.push(...errorInsights)

    // Analyze accessibility issues
    const accessibilityInsights = await this.analyzeAccessibilityIssues(timeRange)
    insights.push(...accessibilityInsights)

    // Analyze performance bottlenecks
    const performanceInsights = await this.analyzePerformanceBottlenecks(timeRange)
    insights.push(...performanceInsights)

    return insights
  }

  // ===== PRIVATE METHODS =====

  private setupEventBuffer(): void {
    this.bufferFlushInterval = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushEventBuffer()
      }
    }, this.FLUSH_INTERVAL)
  }

  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return

    const events = [...this.eventBuffer]
    this.eventBuffer = []

    try {
      // Batch insert events
      const values = events.map((event, index) => {
        const baseIndex = index * 11
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
      }).join(', ')

      const params = events.flatMap(event => [
        event.id,
        event.sessionId,
        event.userId,
        event.timestamp,
        event.type,
        JSON.stringify(event.element),
        JSON.stringify(event.viewport),
        event.coordinates?.x,
        event.coordinates?.y,
        JSON.stringify(event.metadata || {}),
        event.metadata?.url || null,
      ])

      await this.database.query(
        `INSERT INTO ux_events 
         (id, session_id, user_id, timestamp, event_type, element, viewport, coordinates_x, coordinates_y, metadata, url)
         VALUES ${values}`,
        params
      )

      logger.debug({ eventCount: events.length }, 'Flushed event buffer')
    } catch (error) {
      logger.error(error, 'Failed to flush event buffer')
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events)
    }
  }

  private async ensureAnalyticsTables(): Promise<void> {
    // Create tables if they don't exist
    await this.database.query(`
      CREATE TABLE IF NOT EXISTS ux_events (
        id VARCHAR(255) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        timestamp TIMESTAMP NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        element JSONB NOT NULL,
        viewport JSONB NOT NULL,
        coordinates_x INTEGER,
        coordinates_y INTEGER,
        metadata JSONB DEFAULT '{}',
        url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.database.query(`
      CREATE TABLE IF NOT EXISTS ux_performance_metrics (
        id VARCHAR(255) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        metrics JSONB NOT NULL,
        url TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for better query performance
    await this.database.query(`
      CREATE INDEX IF NOT EXISTS idx_ux_events_session_timestamp 
      ON ux_events(session_id, timestamp)
    `)

    await this.database.query(`
      CREATE INDEX IF NOT EXISTS idx_ux_events_url_timestamp 
      ON ux_events(url, timestamp)
    `)

    await this.database.query(`
      CREATE INDEX IF NOT EXISTS idx_ux_events_type_timestamp 
      ON ux_events(event_type, timestamp)
    `)
  }

  private async setupDataRetention(): Promise<void> {
    // Setup automatic data cleanup (90 days retention)
    await this.database.query(`
      DELETE FROM ux_events 
      WHERE created_at < NOW() - INTERVAL '90 days'
    `)

    await this.database.query(`
      DELETE FROM ux_performance_metrics 
      WHERE created_at < NOW() - INTERVAL '90 days'
    `)
  }

  private async updatePerformanceDashboard(metrics: PerformanceMetrics): Promise<void> {
    // Update real-time performance metrics in Redis
    const key = `perf:realtime:${metrics.url}`
    await this.redis.lpush(key, JSON.stringify(metrics))
    await this.redis.ltrim(key, 0, 99) // Keep last 100 entries
    await this.redis.expire(key, 3600) // 1 hour TTL
  }

  private async analyzeBounceRate(timeRange: { start: Date; end: Date }): Promise<number> {
    const result = await this.database.query(
      `SELECT 
         COUNT(DISTINCT session_id) as total_sessions,
         COUNT(DISTINCT CASE 
           WHEN event_count = 1 THEN session_id 
           ELSE NULL 
         END) as bounce_sessions
       FROM (
         SELECT session_id, COUNT(*) as event_count
         FROM ux_events 
         WHERE timestamp BETWEEN $1 AND $2
         GROUP BY session_id
       ) session_stats`,
      [timeRange.start, timeRange.end]
    )

    const totalSessions = parseInt(result.rows[0]?.total_sessions || '0')
    const bounceSessions = parseInt(result.rows[0]?.bounce_sessions || '0')

    return totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0
  }

  private async analyzeErrorPatterns(timeRange: { start: Date; end: Date }): Promise<UXInsight[]> {
    // This would analyze JavaScript errors, failed interactions, etc.
    // For now, returning empty array - full implementation would analyze error logs
    return []
  }

  private async analyzeAccessibilityIssues(timeRange: { start: Date; end: Date }): Promise<UXInsight[]> {
    const insights: UXInsight[] = []

    // Check for low keyboard navigation usage
    const keyboardUsage = await this.database.query(
      `SELECT COUNT(*) as keyboard_events
       FROM ux_events 
       WHERE event_type = 'keypress' 
         AND timestamp BETWEEN $1 AND $2`,
      [timeRange.start, timeRange.end]
    )

    const totalEvents = await this.database.query(
      `SELECT COUNT(*) as total_events
       FROM ux_events 
       WHERE timestamp BETWEEN $1 AND $2`,
      [timeRange.start, timeRange.end]
    )

    const keyboardEvents = parseInt(keyboardUsage.rows[0]?.keyboard_events || '0')
    const totalEventCount = parseInt(totalEvents.rows[0]?.total_events || '0')

    if (totalEventCount > 0 && (keyboardEvents / totalEventCount) < 0.05) {
      insights.push({
        id: `insight_keyboard_${Date.now()}`,
        type: 'accessibility',
        severity: 'medium',
        title: 'Low Keyboard Navigation Usage',
        description: 'Less than 5% of interactions use keyboard navigation.',
        recommendation: 'Improve keyboard navigation support and visibility of keyboard shortcuts.',
        impact: 'medium',
        confidence: 0.7,
        generatedAt: new Date(),
        metadata: {
          keyboardUsagePercentage: (keyboardEvents / totalEventCount) * 100,
        },
      })
    }

    return insights
  }

  private async analyzePerformanceBottlenecks(timeRange: { start: Date; end: Date }): Promise<UXInsight[]> {
    const insights: UXInsight[] = []

    // Analyze Core Web Vitals
    const cwvResult = await this.database.query(
      `SELECT 
         AVG((metrics->>'lcp')::float) as avg_lcp,
         AVG((metrics->>'fid')::float) as avg_fid,
         AVG((metrics->>'cls')::float) as avg_cls
       FROM ux_performance_metrics 
       WHERE timestamp BETWEEN $1 AND $2
         AND metrics->>'lcp' IS NOT NULL`,
      [timeRange.start, timeRange.end]
    )

    const avgLCP = parseFloat(cwvResult.rows[0]?.avg_lcp || '0')
    const avgFID = parseFloat(cwvResult.rows[0]?.avg_fid || '0')
    const avgCLS = parseFloat(cwvResult.rows[0]?.avg_cls || '0')

    // LCP should be < 2.5s
    if (avgLCP > 2500) {
      insights.push({
        id: `insight_lcp_${Date.now()}`,
        type: 'performance',
        severity: 'high',
        title: 'Poor Largest Contentful Paint',
        description: `Average LCP is ${(avgLCP / 1000).toFixed(2)}s, which exceeds the recommended 2.5s.`,
        recommendation: 'Optimize images, reduce server response times, and minimize render-blocking resources.',
        impact: 'high',
        confidence: 0.9,
        generatedAt: new Date(),
        metadata: { avgLCP },
      })
    }

    // FID should be < 100ms
    if (avgFID > 100) {
      insights.push({
        id: `insight_fid_${Date.now()}`,
        type: 'performance',
        severity: 'medium',
        title: 'High First Input Delay',
        description: `Average FID is ${avgFID.toFixed(2)}ms, which exceeds the recommended 100ms.`,
        recommendation: 'Reduce JavaScript execution time and break up long tasks.',
        impact: 'medium',
        confidence: 0.8,
        generatedAt: new Date(),
        metadata: { avgFID },
      })
    }

    // CLS should be < 0.1
    if (avgCLS > 0.1) {
      insights.push({
        id: `insight_cls_${Date.now()}`,
        type: 'performance',
        severity: 'medium',
        title: 'High Cumulative Layout Shift',
        description: `Average CLS is ${avgCLS.toFixed(3)}, which exceeds the recommended 0.1.`,
        recommendation: 'Set size attributes on images and ads, avoid inserting content above existing content.',
        impact: 'medium',
        confidence: 0.85,
        generatedAt: new Date(),
        metadata: { avgCLS },
      })
    }

    return insights
  }

  async cleanup(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval)
    }
    
    // Flush any remaining events
    await this.flushEventBuffer()
  }
}