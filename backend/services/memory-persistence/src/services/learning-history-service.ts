/**
 * Learning History Service
 * Tracks and persists AI learning history across all services
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { createServiceLogger } from '../logger';

const logger = createServiceLogger('learning-history-service');

export interface LearningEvent {
  id: string;
  serviceId: string;
  agentId: string;
  eventType: 'training' | 'feedback' | 'correction' | 'reinforcement' | 'adaptation';
  domain: string;
  metadata: {
    timestamp: Date;
    sessionId?: string;
    userId?: string;
    modelVersion?: string;
    parentEventId?: string;
    importance: number;
  };
  input: {
    data: any;
    context?: any;
    parameters?: any;
  };
  output: {
    prediction: any;
    confidence?: number;
    alternatives?: any[];
  };
  feedback?: {
    rating?: number;
    correct?: boolean;
    improved?: any;
    explanation?: string;
  };
  impact: {
    modelUpdated: boolean;
    performanceChange?: number;
    affectedModels: string[];
  };
  metrics?: {
    processingTime: number;
    tokensUsed?: number;
    cost?: number;
  };
}

export interface LearningPattern {
  id: string;
  domain: string;
  pattern: string;
  frequency: number;
  firstSeen: Date;
  lastSeen: Date;
  examples: string[]; // Event IDs
  performance: {
    successRate: number;
    averageConfidence: number;
    feedbackScore: number;
  };
  recommendations?: string[];
}

export interface LearningMetrics {
  domain: string;
  timeframe: {
    start: Date;
    end: Date;
  };
  totalEvents: number;
  eventsByType: Record<string, number>;
  learningRate: number; // Events per day
  adaptationRate: number; // % of events resulting in adaptation
  feedbackRate: number; // % of events with feedback
  performanceImprovement: number; // % improvement over timeframe
  topPatterns: LearningPattern[];
  costAnalysis: {
    totalCost: number;
    costPerEvent: number;
    costPerImprovement: number;
  };
}

export class LearningHistoryService extends EventEmitter {
  private pgPool: Pool;
  private redis: Redis;
  private initialized: boolean = false;
  private patternDetectionInterval?: NodeJS.Timeout;
  private metricsCalculationInterval?: NodeJS.Timeout;

  constructor() {
    super();

    // Initialize PostgreSQL
    this.pgPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'fineprintai',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    });

    // Initialize Redis for caching
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 3, // Dedicated DB for learning history
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Learning History Service...');

      // Test connections
      await this.pgPool.query('SELECT 1');
      await this.redis.ping();

      // Create tables
      await this.createTables();

      // Start background processes
      this.startPatternDetection();
      this.startMetricsCalculation();

      this.initialized = true;
      logger.info('Learning History Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Learning History Service', { error });
      throw error;
    }
  }

  /**
   * Record a learning event
   */
  async recordLearningEvent(event: Omit<LearningEvent, 'id'>): Promise<LearningEvent> {
    const id = `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullEvent: LearningEvent = { ...event, id };

    try {
      // Store in database
      await this.storeLearningEvent(fullEvent);

      // Update real-time metrics in Redis
      await this.updateRealtimeMetrics(fullEvent);

      // Detect immediate patterns
      await this.detectImmediatePatterns(fullEvent);

      // Emit event for real-time processing
      this.emit('learning:event_recorded', {
        id: fullEvent.id,
        eventType: fullEvent.eventType,
        domain: fullEvent.domain,
        serviceId: fullEvent.serviceId,
      });

      logger.debug('Learning event recorded', {
        id: fullEvent.id,
        type: fullEvent.eventType,
        domain: fullEvent.domain,
      });

      return fullEvent;
    } catch (error) {
      logger.error('Failed to record learning event', { error, eventId: id });
      throw error;
    }
  }

  /**
   * Get learning history for a service/agent
   */
  async getLearningHistory(
    filters: {
      serviceId?: string;
      agentId?: string;
      domain?: string;
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<LearningEvent[]> {
    try {
      let query = `
        SELECT * FROM learning_events
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.serviceId) {
        query += ` AND service_id = $${paramIndex++}`;
        params.push(filters.serviceId);
      }
      if (filters.agentId) {
        query += ` AND agent_id = $${paramIndex++}`;
        params.push(filters.agentId);
      }
      if (filters.domain) {
        query += ` AND domain = $${paramIndex++}`;
        params.push(filters.domain);
      }
      if (filters.eventType) {
        query += ` AND event_type = $${paramIndex++}`;
        params.push(filters.eventType);
      }
      if (filters.startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(filters.endDate);
      }

      query += ` ORDER BY created_at DESC`;
      
      if (filters.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
      }
      if (filters.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
      }

      const result = await this.pgPool.query(query, params);
      return result.rows.map(this.dbRowToLearningEvent);
    } catch (error) {
      logger.error('Failed to get learning history', { error, filters });
      throw error;
    }
  }

  /**
   * Get learning patterns for a domain
   */
  async getLearningPatterns(
    domain: string,
    minFrequency: number = 5
  ): Promise<LearningPattern[]> {
    try {
      const query = `
        SELECT * FROM learning_patterns
        WHERE domain = $1 AND frequency >= $2
        ORDER BY frequency DESC, performance_score DESC
        LIMIT 100
      `;

      const result = await this.pgPool.query(query, [domain, minFrequency]);
      return result.rows.map(row => ({
        id: row.id,
        domain: row.domain,
        pattern: row.pattern,
        frequency: row.frequency,
        firstSeen: new Date(row.first_seen),
        lastSeen: new Date(row.last_seen),
        examples: row.example_ids,
        performance: {
          successRate: row.success_rate,
          averageConfidence: row.avg_confidence,
          feedbackScore: row.feedback_score,
        },
        recommendations: row.recommendations,
      }));
    } catch (error) {
      logger.error('Failed to get learning patterns', { error });
      throw error;
    }
  }

  /**
   * Get learning metrics for a domain
   */
  async getLearningMetrics(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<LearningMetrics> {
    try {
      // Try cache first
      const cacheKey = `metrics:${domain}:${timeframe.start.getTime()}-${timeframe.end.getTime()}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate metrics
      const [
        totalEvents,
        eventsByType,
        learningRate,
        adaptationStats,
        feedbackStats,
        performanceStats,
        topPatterns,
        costAnalysis,
      ] = await Promise.all([
        this.getTotalEventCount(domain, timeframe),
        this.getEventTypeBreakdown(domain, timeframe),
        this.calculateLearningRate(domain, timeframe),
        this.calculateAdaptationRate(domain, timeframe),
        this.calculateFeedbackRate(domain, timeframe),
        this.calculatePerformanceImprovement(domain, timeframe),
        this.getTopPatterns(domain, timeframe),
        this.calculateCostAnalysis(domain, timeframe),
      ]);

      const metrics: LearningMetrics = {
        domain,
        timeframe,
        totalEvents,
        eventsByType,
        learningRate,
        adaptationRate: adaptationStats.rate,
        feedbackRate: feedbackStats.rate,
        performanceImprovement: performanceStats.improvement,
        topPatterns,
        costAnalysis,
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(metrics));

      return metrics;
    } catch (error) {
      logger.error('Failed to get learning metrics', { error });
      throw error;
    }
  }

  /**
   * Analyze learning trends
   */
  async analyzeLearningTrends(
    domain: string,
    periods: number = 7
  ): Promise<{
    trend: 'improving' | 'stable' | 'declining';
    details: {
      periodMetrics: LearningMetrics[];
      trendLine: number[];
      forecast: number[];
      insights: string[];
    };
  }> {
    try {
      const periodLength = 24 * 60 * 60 * 1000; // 1 day
      const now = new Date();
      const periodMetrics: LearningMetrics[] = [];

      // Get metrics for each period
      for (let i = periods - 1; i >= 0; i--) {
        const end = new Date(now.getTime() - i * periodLength);
        const start = new Date(end.getTime() - periodLength);
        
        const metrics = await this.getLearningMetrics(domain, { start, end });
        periodMetrics.push(metrics);
      }

      // Calculate trend
      const performanceValues = periodMetrics.map(m => m.performanceImprovement);
      const trend = this.calculateTrend(performanceValues);
      const forecast = this.forecastTrend(performanceValues, 3);

      // Generate insights
      const insights = this.generateTrendInsights(periodMetrics, trend);

      return {
        trend,
        details: {
          periodMetrics,
          trendLine: performanceValues,
          forecast,
          insights,
        },
      };
    } catch (error) {
      logger.error('Failed to analyze learning trends', { error });
      throw error;
    }
  }

  /**
   * Get recommendation for improving learning
   */
  async getLearningRecommendations(
    domain: string
  ): Promise<{
    recommendations: Array<{
      type: string;
      priority: 'high' | 'medium' | 'low';
      description: string;
      expectedImpact: string;
      implementation: string;
    }>;
  }> {
    try {
      const [metrics, patterns, trends] = await Promise.all([
        this.getLearningMetrics(domain, {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          end: new Date(),
        }),
        this.getLearningPatterns(domain),
        this.analyzeLearningTrends(domain),
      ]);

      const recommendations = [];

      // Low feedback rate recommendation
      if (metrics.feedbackRate < 0.3) {
        recommendations.push({
          type: 'increase_feedback',
          priority: 'high' as const,
          description: 'Feedback rate is low, limiting learning effectiveness',
          expectedImpact: '20-30% improvement in model accuracy',
          implementation: 'Add feedback prompts to UI, implement implicit feedback collection',
        });
      }

      // High error patterns
      const errorPatterns = patterns.filter(p => p.performance.successRate < 0.7);
      if (errorPatterns.length > 0) {
        recommendations.push({
          type: 'address_error_patterns',
          priority: 'high' as const,
          description: `${errorPatterns.length} patterns show poor performance`,
          expectedImpact: '15-25% reduction in errors',
          implementation: 'Focus training on these specific patterns, collect more examples',
        });
      }

      // Declining trend
      if (trends.trend === 'declining') {
        recommendations.push({
          type: 'reverse_decline',
          priority: 'high' as const,
          description: 'Learning performance is declining over time',
          expectedImpact: 'Stabilize and improve model performance',
          implementation: 'Review recent changes, increase training frequency, validate data quality',
        });
      }

      // Cost optimization
      if (metrics.costAnalysis.costPerImprovement > 10) {
        recommendations.push({
          type: 'optimize_costs',
          priority: 'medium' as const,
          description: 'Learning cost per improvement is high',
          expectedImpact: '30-40% cost reduction',
          implementation: 'Batch training operations, use more efficient models, filter low-value examples',
        });
      }

      return { recommendations };
    } catch (error) {
      logger.error('Failed to get learning recommendations', { error });
      throw error;
    }
  }

  // Private helper methods

  private async storeLearningEvent(event: LearningEvent): Promise<void> {
    const query = `
      INSERT INTO learning_events (
        id, service_id, agent_id, event_type, domain,
        metadata, input_data, output_data, feedback,
        impact, metrics, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await this.pgPool.query(query, [
      event.id,
      event.serviceId,
      event.agentId,
      event.eventType,
      event.domain,
      JSON.stringify(event.metadata),
      JSON.stringify(event.input),
      JSON.stringify(event.output),
      JSON.stringify(event.feedback || null),
      JSON.stringify(event.impact),
      JSON.stringify(event.metrics || null),
      event.metadata.timestamp,
    ]);
  }

  private async updateRealtimeMetrics(event: LearningEvent): Promise<void> {
    const key = `realtime:${event.domain}:${event.eventType}`;
    const now = Date.now();
    
    // Increment counters
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hset(key, 'lastEvent', now.toString());
    
    if (event.feedback?.rating) {
      await this.redis.hincrby(key, 'feedbackCount', 1);
      await this.redis.hincrbyfloat(key, 'totalRating', event.feedback.rating);
    }
    
    if (event.impact.modelUpdated) {
      await this.redis.hincrby(key, 'adaptations', 1);
    }
    
    // Set expiry to 24 hours
    await this.redis.expire(key, 86400);
  }

  private async detectImmediatePatterns(event: LearningEvent): Promise<void> {
    // Extract pattern signature
    const pattern = this.extractPatternSignature(event);
    if (!pattern) return;

    const patternKey = `pattern:${event.domain}:${pattern}`;
    
    // Update pattern frequency
    await this.redis.hincrby(patternKey, 'frequency', 1);
    await this.redis.hset(patternKey, 'lastSeen', Date.now().toString());
    
    // Add to examples (keep last 10)
    await this.redis.lpush(`${patternKey}:examples`, event.id);
    await this.redis.ltrim(`${patternKey}:examples`, 0, 9);
    
    // Update performance metrics
    if (event.output.confidence) {
      await this.redis.hincrbyfloat(patternKey, 'totalConfidence', event.output.confidence);
    }
    if (event.feedback?.rating) {
      await this.redis.hincrbyfloat(patternKey, 'totalRating', event.feedback.rating);
    }
  }

  private extractPatternSignature(event: LearningEvent): string | null {
    // Create a pattern signature based on input characteristics
    try {
      const inputKeys = Object.keys(event.input.data).sort();
      const contextKeys = event.input.context ? Object.keys(event.input.context).sort() : [];
      
      return `${event.eventType}:${inputKeys.join(',')}:${contextKeys.join(',')}`;
    } catch {
      return null;
    }
  }

  private dbRowToLearningEvent(row: any): LearningEvent {
    return {
      id: row.id,
      serviceId: row.service_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      domain: row.domain,
      metadata: {
        ...row.metadata,
        timestamp: new Date(row.metadata.timestamp),
      },
      input: row.input_data,
      output: row.output_data,
      feedback: row.feedback,
      impact: row.impact,
      metrics: row.metrics,
    };
  }

  private async createTables(): Promise<void> {
    // Learning events table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS learning_events (
        id VARCHAR(255) PRIMARY KEY,
        service_id VARCHAR(255) NOT NULL,
        agent_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        domain VARCHAR(100) NOT NULL,
        metadata JSONB NOT NULL,
        input_data JSONB NOT NULL,
        output_data JSONB NOT NULL,
        feedback JSONB,
        impact JSONB NOT NULL,
        metrics JSONB,
        created_at TIMESTAMP NOT NULL,
        INDEX idx_service_agent (service_id, agent_id),
        INDEX idx_domain_type (domain, event_type),
        INDEX idx_created_at (created_at),
        INDEX idx_importance ((metadata->>'importance')::int)
      )
    `);

    // Learning patterns table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS learning_patterns (
        id VARCHAR(255) PRIMARY KEY,
        domain VARCHAR(100) NOT NULL,
        pattern VARCHAR(500) NOT NULL,
        frequency INTEGER DEFAULT 0,
        first_seen TIMESTAMP NOT NULL,
        last_seen TIMESTAMP NOT NULL,
        example_ids TEXT[],
        success_rate FLOAT,
        avg_confidence FLOAT,
        feedback_score FLOAT,
        performance_score FLOAT GENERATED ALWAYS AS 
          (success_rate * 0.5 + avg_confidence * 0.3 + feedback_score * 0.2) STORED,
        recommendations TEXT[],
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(domain, pattern),
        INDEX idx_frequency (frequency),
        INDEX idx_performance (performance_score)
      )
    `);
  }

  private startPatternDetection(): void {
    // Run pattern detection every 5 minutes
    this.patternDetectionInterval = setInterval(async () => {
      try {
        await this.detectAndPersistPatterns();
      } catch (error) {
        logger.error('Pattern detection failed', { error });
      }
    }, 5 * 60 * 1000);
  }

  private startMetricsCalculation(): void {
    // Calculate metrics every 15 minutes
    this.metricsCalculationInterval = setInterval(async () => {
      try {
        await this.calculateAndCacheMetrics();
      } catch (error) {
        logger.error('Metrics calculation failed', { error });
      }
    }, 15 * 60 * 1000);
  }

  private async detectAndPersistPatterns(): Promise<void> {
    // Get patterns from Redis
    const patternKeys = await this.redis.keys('pattern:*');
    
    for (const key of patternKeys) {
      const parts = key.split(':');
      const domain = parts[1];
      const pattern = parts.slice(2).join(':');
      
      const data = await this.redis.hgetall(key);
      const frequency = parseInt(data.frequency || '0');
      const lastSeen = new Date(parseInt(data.lastSeen || '0'));
      const examples = await this.redis.lrange(`${key}:examples`, 0, -1);
      
      const totalConfidence = parseFloat(data.totalConfidence || '0');
      const totalRating = parseFloat(data.totalRating || '0');
      const feedbackCount = parseInt(data.feedbackCount || '0');
      
      const avgConfidence = frequency > 0 ? totalConfidence / frequency : 0;
      const feedbackScore = feedbackCount > 0 ? totalRating / feedbackCount : 0;
      
      // Calculate success rate from recent events
      const successRate = await this.calculatePatternSuccessRate(domain, pattern, examples);
      
      // Persist to database
      await this.pgPool.query(`
        INSERT INTO learning_patterns (
          id, domain, pattern, frequency, first_seen, last_seen,
          example_ids, success_rate, avg_confidence, feedback_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (domain, pattern) DO UPDATE SET
          frequency = EXCLUDED.frequency,
          last_seen = EXCLUDED.last_seen,
          example_ids = EXCLUDED.example_ids,
          success_rate = EXCLUDED.success_rate,
          avg_confidence = EXCLUDED.avg_confidence,
          feedback_score = EXCLUDED.feedback_score,
          updated_at = NOW()
      `, [
        `pattern_${domain}_${Buffer.from(pattern).toString('base64')}`,
        domain,
        pattern,
        frequency,
        lastSeen,
        lastSeen,
        examples,
        successRate,
        avgConfidence,
        feedbackScore,
      ]);
    }
  }

  private async calculatePatternSuccessRate(
    domain: string,
    pattern: string,
    exampleIds: string[]
  ): Promise<number> {
    if (exampleIds.length === 0) return 0;
    
    const result = await this.pgPool.query(`
      SELECT COUNT(*) FILTER (WHERE feedback->>'correct' = 'true') as correct,
             COUNT(*) as total
      FROM learning_events
      WHERE id = ANY($1)
    `, [exampleIds]);
    
    const { correct, total } = result.rows[0];
    return total > 0 ? correct / total : 0;
  }

  private async calculateAndCacheMetrics(): Promise<void> {
    // Get all active domains
    const domains = await this.pgPool.query(`
      SELECT DISTINCT domain FROM learning_events
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);
    
    for (const { domain } of domains.rows) {
      // Calculate metrics for different timeframes
      const timeframes = [
        { hours: 24, key: 'daily' },
        { hours: 168, key: 'weekly' },
        { hours: 720, key: 'monthly' },
      ];
      
      for (const { hours, key } of timeframes) {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
        
        const metrics = await this.getLearningMetrics(domain, { start, end });
        
        // Cache with appropriate expiry
        const cacheKey = `metrics:${domain}:${key}`;
        const expiry = Math.floor(hours * 0.1 * 3600); // 10% of timeframe
        await this.redis.setex(cacheKey, expiry, JSON.stringify(metrics));
      }
    }
  }

  private async getTotalEventCount(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<number> {
    const result = await this.pgPool.query(
      'SELECT COUNT(*) FROM learning_events WHERE domain = $1 AND created_at BETWEEN $2 AND $3',
      [domain, timeframe.start, timeframe.end]
    );
    return parseInt(result.rows[0].count);
  }

  private async getEventTypeBreakdown(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    const result = await this.pgPool.query(
      `SELECT event_type, COUNT(*) as count
       FROM learning_events
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY event_type`,
      [domain, timeframe.start, timeframe.end]
    );
    
    return result.rows.reduce((acc, row) => {
      acc[row.event_type] = parseInt(row.count);
      return acc;
    }, {});
  }

  private async calculateLearningRate(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<number> {
    const days = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));
    const totalEvents = await this.getTotalEventCount(domain, timeframe);
    return totalEvents / days;
  }

  private async calculateAdaptationRate(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<{ rate: number }> {
    const result = await this.pgPool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE impact->>'modelUpdated' = 'true') as adapted,
         COUNT(*) as total
       FROM learning_events
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
      [domain, timeframe.start, timeframe.end]
    );
    
    const { adapted, total } = result.rows[0];
    return { rate: total > 0 ? adapted / total : 0 };
  }

  private async calculateFeedbackRate(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<{ rate: number }> {
    const result = await this.pgPool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE feedback IS NOT NULL) as with_feedback,
         COUNT(*) as total
       FROM learning_events
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
      [domain, timeframe.start, timeframe.end]
    );
    
    const { with_feedback, total } = result.rows[0];
    return { rate: total > 0 ? with_feedback / total : 0 };
  }

  private async calculatePerformanceImprovement(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<{ improvement: number }> {
    // Compare success rates between first and last quartile
    const midpoint = new Date((timeframe.start.getTime() + timeframe.end.getTime()) / 2);
    
    const [firstHalf, secondHalf] = await Promise.all([
      this.pgPool.query(
        `SELECT AVG((output_data->>'confidence')::float) as avg_confidence
         FROM learning_events
         WHERE domain = $1 AND created_at BETWEEN $2 AND $3
         AND feedback->>'correct' = 'true'`,
        [domain, timeframe.start, midpoint]
      ),
      this.pgPool.query(
        `SELECT AVG((output_data->>'confidence')::float) as avg_confidence
         FROM learning_events
         WHERE domain = $1 AND created_at BETWEEN $2 AND $3
         AND feedback->>'correct' = 'true'`,
        [domain, midpoint, timeframe.end]
      ),
    ]);
    
    const firstConfidence = firstHalf.rows[0].avg_confidence || 0;
    const secondConfidence = secondHalf.rows[0].avg_confidence || 0;
    
    return {
      improvement: firstConfidence > 0 
        ? ((secondConfidence - firstConfidence) / firstConfidence) * 100 
        : 0
    };
  }

  private async getTopPatterns(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<LearningPattern[]> {
    const result = await this.pgPool.query(
      `SELECT * FROM learning_patterns
       WHERE domain = $1 AND last_seen BETWEEN $2 AND $3
       ORDER BY performance_score DESC
       LIMIT 10`,
      [domain, timeframe.start, timeframe.end]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      domain: row.domain,
      pattern: row.pattern,
      frequency: row.frequency,
      firstSeen: new Date(row.first_seen),
      lastSeen: new Date(row.last_seen),
      examples: row.example_ids,
      performance: {
        successRate: row.success_rate,
        averageConfidence: row.avg_confidence,
        feedbackScore: row.feedback_score,
      },
      recommendations: row.recommendations,
    }));
  }

  private async calculateCostAnalysis(
    domain: string,
    timeframe: { start: Date; end: Date }
  ): Promise<LearningMetrics['costAnalysis']> {
    const result = await this.pgPool.query(
      `SELECT 
         SUM((metrics->>'cost')::float) as total_cost,
         COUNT(*) as total_events,
         COUNT(*) FILTER (WHERE impact->>'performanceChange' > '0') as improvements
       FROM learning_events
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
      [domain, timeframe.start, timeframe.end]
    );
    
    const { total_cost, total_events, improvements } = result.rows[0];
    const totalCost = total_cost || 0;
    const eventCount = parseInt(total_events) || 1;
    const improvementCount = parseInt(improvements) || 1;
    
    return {
      totalCost,
      costPerEvent: totalCost / eventCount,
      costPerImprovement: totalCost / improvementCount,
    };
  }

  private calculateTrend(values: number[]): 'improving' | 'stable' | 'declining' {
    if (values.length < 2) return 'stable';
    
    // Calculate linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Determine trend based on slope
    if (slope > 0.05) return 'improving';
    if (slope < -0.05) return 'declining';
    return 'stable';
  }

  private forecastTrend(values: number[], periods: number): number[] {
    // Simple linear extrapolation
    const n = values.length;
    const lastValue = values[n - 1];
    const avgChange = n > 1 ? (values[n - 1] - values[0]) / (n - 1) : 0;
    
    const forecast: number[] = [];
    for (let i = 1; i <= periods; i++) {
      forecast.push(lastValue + avgChange * i);
    }
    
    return forecast;
  }

  private generateTrendInsights(
    metrics: LearningMetrics[],
    trend: 'improving' | 'stable' | 'declining'
  ): string[] {
    const insights: string[] = [];
    
    // Trend insight
    insights.push(`Learning performance is ${trend} over the analyzed period`);
    
    // Feedback rate insight
    const avgFeedbackRate = metrics.reduce((sum, m) => sum + m.feedbackRate, 0) / metrics.length;
    if (avgFeedbackRate < 0.3) {
      insights.push('Low feedback rate is limiting learning effectiveness');
    }
    
    // Adaptation rate insight
    const avgAdaptationRate = metrics.reduce((sum, m) => sum + m.adaptationRate, 0) / metrics.length;
    if (avgAdaptationRate > 0.5) {
      insights.push('High adaptation rate indicates active learning');
    }
    
    // Cost efficiency insight
    const latestCost = metrics[metrics.length - 1].costAnalysis.costPerImprovement;
    const firstCost = metrics[0].costAnalysis.costPerImprovement;
    if (latestCost < firstCost * 0.8) {
      insights.push('Cost efficiency has improved significantly');
    }
    
    return insights;
  }

  isHealthy(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    if (this.patternDetectionInterval) {
      clearInterval(this.patternDetectionInterval);
    }
    if (this.metricsCalculationInterval) {
      clearInterval(this.metricsCalculationInterval);
    }
    
    await this.pgPool.end();
    this.redis.disconnect();
    
    logger.info('Learning History Service shutdown complete');
  }
}