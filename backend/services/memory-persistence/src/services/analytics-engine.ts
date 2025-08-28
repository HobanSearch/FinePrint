/**
 * Analytics Engine for Business Intelligence
 * Provides real-time and historical analytics for AI learning and memory systems
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { createServiceLogger } from '../logger';
import { MemoryPersistenceEngine, MemoryEntry } from './memory-persistence-engine';
import { LearningHistoryService, LearningEvent, LearningMetrics } from './learning-history-service';

const logger = createServiceLogger('analytics-engine');

export interface AnalyticsQuery {
  type: 'realtime' | 'historical' | 'predictive';
  domain: string;
  metrics: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  groupBy?: 'hour' | 'day' | 'week' | 'month';
  filters?: Record<string, any>;
}

export interface BusinessMetrics {
  domain: string;
  timeframe: {
    start: Date;
    end: Date;
  };
  aiPerformance: {
    accuracy: number;
    confidence: number;
    responseTime: number;
    errorRate: number;
    learningRate: number;
  };
  businessImpact: {
    documentsAnalyzed: number;
    risksIdentified: number;
    averageRiskScore: number;
    processingTime: number;
    costSavings: number;
  };
  userEngagement: {
    activeUsers: number;
    sessionsPerUser: number;
    feedbackRate: number;
    satisfactionScore: number;
  };
  memoryUtilization: {
    totalMemories: number;
    activeMemories: number;
    memoryAccessRate: number;
    averageRetrievalTime: number;
  };
}

export interface InsightReport {
  id: string;
  domain: string;
  type: 'anomaly' | 'trend' | 'opportunity' | 'risk';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  metrics: Record<string, any>;
  recommendations: string[];
  createdAt: Date;
}

export interface DashboardData {
  realtime: {
    activeAgents: number;
    requestsPerSecond: number;
    averageLatency: number;
    errorRate: number;
  };
  today: BusinessMetrics;
  trends: {
    metric: string;
    values: Array<{ timestamp: Date; value: number }>;
  }[];
  insights: InsightReport[];
  topPerformers: {
    agents: Array<{ id: string; performance: number }>;
    domains: Array<{ domain: string; score: number }>;
  };
}

export class AnalyticsEngine extends EventEmitter {
  private pgPool: Pool;
  private redis: Redis;
  private memoryEngine: MemoryPersistenceEngine;
  private learningHistory: LearningHistoryService;
  private initialized: boolean = false;
  private realtimeMetrics: Map<string, any> = new Map();
  private insightGenerationInterval?: NodeJS.Timeout;
  private metricsAggregationInterval?: NodeJS.Timeout;

  constructor(
    memoryEngine: MemoryPersistenceEngine,
    learningHistory: LearningHistoryService
  ) {
    super();
    this.memoryEngine = memoryEngine;
    this.learningHistory = learningHistory;

    // Initialize PostgreSQL
    this.pgPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'fineprintai',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
    });

    // Initialize Redis
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 4, // Dedicated DB for analytics
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Analytics Engine...');

      // Test connections
      await this.pgPool.query('SELECT 1');
      await this.redis.ping();

      // Create analytics tables
      await this.createAnalyticsTables();

      // Start background processes
      this.startRealtimeMetricsCollection();
      this.startInsightGeneration();
      this.startMetricsAggregation();

      // Set up event listeners
      this.setupEventListeners();

      this.initialized = true;
      logger.info('Analytics Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Analytics Engine', { error });
      throw error;
    }
  }

  /**
   * Execute an analytics query
   */
  async query(query: AnalyticsQuery): Promise<any> {
    try {
      switch (query.type) {
        case 'realtime':
          return await this.queryRealtimeMetrics(query);
        case 'historical':
          return await this.queryHistoricalMetrics(query);
        case 'predictive':
          return await this.queryPredictiveMetrics(query);
        default:
          throw new Error(`Unknown query type: ${query.type}`);
      }
    } catch (error) {
      logger.error('Analytics query failed', { error, query });
      throw error;
    }
  }

  /**
   * Get business metrics for a domain
   */
  async getBusinessMetrics(
    domain: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<BusinessMetrics> {
    const range = timeRange || {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };

    try {
      const [
        aiPerformance,
        businessImpact,
        userEngagement,
        memoryUtilization,
      ] = await Promise.all([
        this.calculateAIPerformance(domain, range),
        this.calculateBusinessImpact(domain, range),
        this.calculateUserEngagement(domain, range),
        this.calculateMemoryUtilization(domain, range),
      ]);

      return {
        domain,
        timeframe: range,
        aiPerformance,
        businessImpact,
        userEngagement,
        memoryUtilization,
      };
    } catch (error) {
      logger.error('Failed to get business metrics', { error });
      throw error;
    }
  }

  /**
   * Get dashboard data for UI
   */
  async getDashboardData(domain?: string): Promise<DashboardData> {
    try {
      const [realtime, today, trends, insights, topPerformers] = await Promise.all([
        this.getRealtimeMetrics(domain),
        this.getBusinessMetrics(domain || 'all', {
          start: new Date(new Date().setHours(0, 0, 0, 0)),
          end: new Date(),
        }),
        this.getTrendData(domain),
        this.getLatestInsights(domain),
        this.getTopPerformers(),
      ]);

      return {
        realtime,
        today,
        trends,
        insights,
        topPerformers,
      };
    } catch (error) {
      logger.error('Failed to get dashboard data', { error });
      throw error;
    }
  }

  /**
   * Generate custom report
   */
  async generateReport(
    reportType: 'performance' | 'learning' | 'business' | 'executive',
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, any>> {
    try {
      switch (reportType) {
        case 'performance':
          return await this.generatePerformanceReport(domain, timeRange);
        case 'learning':
          return await this.generateLearningReport(domain, timeRange);
        case 'business':
          return await this.generateBusinessReport(domain, timeRange);
        case 'executive':
          return await this.generateExecutiveReport(domain, timeRange);
        default:
          throw new Error(`Unknown report type: ${reportType}`);
      }
    } catch (error) {
      logger.error('Failed to generate report', { error });
      throw error;
    }
  }

  /**
   * Track custom business event
   */
  async trackEvent(
    eventName: string,
    domain: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const event = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: eventName,
        domain,
        data,
        timestamp: new Date(),
      };

      // Store in database
      await this.storeAnalyticsEvent(event);

      // Update realtime metrics
      await this.updateRealtimeMetrics(eventName, domain, data);

      // Emit for real-time dashboards
      this.emit('analytics:event', event);

      logger.debug('Analytics event tracked', {
        eventName,
        domain,
        eventId: event.id,
      });
    } catch (error) {
      logger.error('Failed to track analytics event', { error });
      throw error;
    }
  }

  // Private helper methods

  private async queryRealtimeMetrics(query: AnalyticsQuery): Promise<any> {
    const key = `realtime:${query.domain}:*`;
    const keys = await this.redis.keys(key);
    
    const results: Record<string, any> = {};
    
    for (const metricKey of keys) {
      const metricName = metricKey.split(':').pop();
      if (query.metrics.length === 0 || query.metrics.includes(metricName!)) {
        const value = await this.redis.get(metricKey);
        results[metricName!] = value ? JSON.parse(value) : null;
      }
    }
    
    return results;
  }

  private async queryHistoricalMetrics(query: AnalyticsQuery): Promise<any> {
    let sql = `
      SELECT 
        metric_name,
        metric_value,
        timestamp
      FROM analytics_metrics
      WHERE domain = $1
    `;
    const params: any[] = [query.domain];
    let paramIndex = 2;

    if (query.timeRange) {
      sql += ` AND timestamp BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(query.timeRange.start, query.timeRange.end);
    }

    if (query.metrics.length > 0) {
      sql += ` AND metric_name = ANY($${paramIndex++})`;
      params.push(query.metrics);
    }

    if (query.groupBy) {
      sql = `
        SELECT 
          metric_name,
          ${query.aggregation || 'avg'}(metric_value) as value,
          date_trunc('${query.groupBy}', timestamp) as period
        FROM analytics_metrics
        WHERE domain = $1
        ${query.timeRange ? `AND timestamp BETWEEN $2 AND $3` : ''}
        ${query.metrics.length > 0 ? `AND metric_name = ANY($${paramIndex - 1})` : ''}
        GROUP BY metric_name, period
        ORDER BY period DESC
      `;
    }

    const result = await this.pgPool.query(sql, params);
    
    return query.groupBy 
      ? this.formatGroupedResults(result.rows)
      : this.formatTimeSeriesResults(result.rows);
  }

  private async queryPredictiveMetrics(query: AnalyticsQuery): Promise<any> {
    // Get historical data
    const historicalData = await this.queryHistoricalMetrics({
      ...query,
      timeRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
        end: new Date(),
      },
    });

    // Simple linear regression for prediction
    const predictions: Record<string, any> = {};
    
    for (const metric of query.metrics) {
      const values = historicalData[metric] || [];
      if (values.length > 0) {
        predictions[metric] = this.predictMetric(values);
      }
    }

    return predictions;
  }

  private async calculateAIPerformance(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<BusinessMetrics['aiPerformance']> {
    const metrics = await this.learningHistory.getLearningMetrics(domain, timeRange);
    
    // Get accuracy from recent evaluations
    const accuracyResult = await this.pgPool.query(
      `SELECT AVG(accuracy) as avg_accuracy
       FROM model_evaluations
       WHERE domain = $1 AND evaluated_at BETWEEN $2 AND $3`,
      [domain, timeRange.start, timeRange.end]
    );

    // Get average confidence from learning events
    const confidenceResult = await this.pgPool.query(
      `SELECT AVG((output_data->>'confidence')::float) as avg_confidence
       FROM learning_events
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
      [domain, timeRange.start, timeRange.end]
    );

    // Get response time metrics
    const latencyResult = await this.pgPool.query(
      `SELECT AVG((metrics->>'processingTime')::float) as avg_latency
       FROM learning_events
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
      [domain, timeRange.start, timeRange.end]
    );

    return {
      accuracy: accuracyResult.rows[0]?.avg_accuracy || 0,
      confidence: confidenceResult.rows[0]?.avg_confidence || 0,
      responseTime: latencyResult.rows[0]?.avg_latency || 0,
      errorRate: 1 - metrics.feedbackRate,
      learningRate: metrics.learningRate,
    };
  }

  private async calculateBusinessImpact(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<BusinessMetrics['businessImpact']> {
    // Domain-specific business impact calculations
    if (domain === 'legal_analysis') {
      const result = await this.pgPool.query(
        `SELECT 
          COUNT(*) as documents,
          COUNT(*) FILTER (WHERE risk_score > 0.7) as high_risks,
          AVG(risk_score) as avg_risk,
          AVG(processing_time) as avg_time,
          SUM(CASE WHEN prevented_issue THEN estimated_cost ELSE 0 END) as savings
         FROM document_analyses
         WHERE analyzed_at BETWEEN $1 AND $2`,
        [timeRange.start, timeRange.end]
      );

      const row = result.rows[0];
      return {
        documentsAnalyzed: parseInt(row.documents),
        risksIdentified: parseInt(row.high_risks),
        averageRiskScore: parseFloat(row.avg_risk) || 0,
        processingTime: parseFloat(row.avg_time) || 0,
        costSavings: parseFloat(row.savings) || 0,
      };
    }

    // Default metrics for other domains
    return {
      documentsAnalyzed: 0,
      risksIdentified: 0,
      averageRiskScore: 0,
      processingTime: 0,
      costSavings: 0,
    };
  }

  private async calculateUserEngagement(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<BusinessMetrics['userEngagement']> {
    const [users, sessions, feedback, satisfaction] = await Promise.all([
      this.pgPool.query(
        `SELECT COUNT(DISTINCT user_id) as active_users
         FROM user_sessions
         WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
        [domain, timeRange.start, timeRange.end]
      ),
      this.pgPool.query(
        `SELECT 
          COUNT(*) as total_sessions,
          COUNT(DISTINCT user_id) as unique_users
         FROM user_sessions
         WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
        [domain, timeRange.start, timeRange.end]
      ),
      this.pgPool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE feedback IS NOT NULL) as with_feedback,
          COUNT(*) as total
         FROM learning_events
         WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
        [domain, timeRange.start, timeRange.end]
      ),
      this.pgPool.query(
        `SELECT AVG((feedback->>'rating')::float) as avg_rating
         FROM learning_events
         WHERE domain = $1 AND created_at BETWEEN $2 AND $3
         AND feedback->>'rating' IS NOT NULL`,
        [domain, timeRange.start, timeRange.end]
      ),
    ]);

    const uniqueUsers = parseInt(sessions.rows[0]?.unique_users) || 1;
    const totalSessions = parseInt(sessions.rows[0]?.total_sessions) || 0;

    return {
      activeUsers: parseInt(users.rows[0]?.active_users) || 0,
      sessionsPerUser: uniqueUsers > 0 ? totalSessions / uniqueUsers : 0,
      feedbackRate: feedback.rows[0]?.total > 0 
        ? parseInt(feedback.rows[0].with_feedback) / parseInt(feedback.rows[0].total)
        : 0,
      satisfactionScore: (parseFloat(satisfaction.rows[0]?.avg_rating) || 0) / 5 * 100,
    };
  }

  private async calculateMemoryUtilization(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<BusinessMetrics['memoryUtilization']> {
    const aggregation = await this.memoryEngine.getMemoryAggregations(
      'all',
      domain,
      timeRange
    );

    // Get retrieval time metrics
    const retrievalResult = await this.pgPool.query(
      `SELECT AVG(retrieval_time) as avg_retrieval
       FROM memory_access_logs
       WHERE domain = $1 AND accessed_at BETWEEN $2 AND $3`,
      [domain, timeRange.start, timeRange.end]
    );

    return {
      totalMemories: aggregation.totalMemories,
      activeMemories: aggregation.accessPatterns.mostAccessed.length,
      memoryAccessRate: aggregation.accessPatterns.averageAccessesPerMemory,
      averageRetrievalTime: parseFloat(retrievalResult.rows[0]?.avg_retrieval) || 0,
    };
  }

  private async getRealtimeMetrics(domain?: string): Promise<DashboardData['realtime']> {
    const prefix = domain ? `realtime:${domain}:` : 'realtime:all:';
    
    const [agents, rps, latency, errors] = await Promise.all([
      this.redis.get(`${prefix}active_agents`),
      this.redis.get(`${prefix}requests_per_second`),
      this.redis.get(`${prefix}average_latency`),
      this.redis.get(`${prefix}error_rate`),
    ]);

    return {
      activeAgents: parseInt(agents || '0'),
      requestsPerSecond: parseFloat(rps || '0'),
      averageLatency: parseFloat(latency || '0'),
      errorRate: parseFloat(errors || '0'),
    };
  }

  private async getTrendData(domain?: string): Promise<DashboardData['trends']> {
    const metrics = ['accuracy', 'latency', 'throughput', 'learning_rate'];
    const trends = [];

    for (const metric of metrics) {
      const result = await this.pgPool.query(
        `SELECT timestamp, metric_value as value
         FROM analytics_metrics
         WHERE metric_name = $1
         ${domain ? 'AND domain = $2' : ''}
         AND timestamp > NOW() - INTERVAL '7 days'
         ORDER BY timestamp DESC
         LIMIT 168`, // 24 * 7 hourly points
        domain ? [metric, domain] : [metric]
      );

      trends.push({
        metric,
        values: result.rows.map(row => ({
          timestamp: new Date(row.timestamp),
          value: parseFloat(row.value),
        })),
      });
    }

    return trends;
  }

  private async getLatestInsights(domain?: string): Promise<InsightReport[]> {
    const query = domain
      ? 'SELECT * FROM analytics_insights WHERE domain = $1 ORDER BY created_at DESC LIMIT 10'
      : 'SELECT * FROM analytics_insights ORDER BY created_at DESC LIMIT 10';
    
    const result = await this.pgPool.query(query, domain ? [domain] : []);
    
    return result.rows.map(row => ({
      id: row.id,
      domain: row.domain,
      type: row.insight_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      metrics: row.metrics,
      recommendations: row.recommendations,
      createdAt: new Date(row.created_at),
    }));
  }

  private async getTopPerformers(): Promise<DashboardData['topPerformers']> {
    const [agents, domains] = await Promise.all([
      this.pgPool.query(
        `SELECT agent_id as id, AVG(performance_score) as performance
         FROM agent_metrics
         WHERE timestamp > NOW() - INTERVAL '24 hours'
         GROUP BY agent_id
         ORDER BY performance DESC
         LIMIT 5`
      ),
      this.pgPool.query(
        `SELECT domain, AVG(composite_score) as score
         FROM domain_metrics
         WHERE timestamp > NOW() - INTERVAL '24 hours'
         GROUP BY domain
         ORDER BY score DESC
         LIMIT 5`
      ),
    ]);

    return {
      agents: agents.rows.map(row => ({
        id: row.id,
        performance: parseFloat(row.performance),
      })),
      domains: domains.rows.map(row => ({
        domain: row.domain,
        score: parseFloat(row.score),
      })),
    };
  }

  private async generatePerformanceReport(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, any>> {
    const [metrics, trends, comparisons] = await Promise.all([
      this.getBusinessMetrics(domain, timeRange),
      this.learningHistory.analyzeLearningTrends(domain),
      this.comparePerformancePeriods(domain, timeRange),
    ]);

    return {
      summary: {
        domain,
        period: timeRange,
        overallScore: this.calculateOverallScore(metrics),
      },
      metrics,
      trends,
      comparisons,
      recommendations: await this.generatePerformanceRecommendations(metrics, trends),
    };
  }

  private async generateLearningReport(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, any>> {
    const [learningMetrics, patterns, recommendations] = await Promise.all([
      this.learningHistory.getLearningMetrics(domain, timeRange),
      this.learningHistory.getLearningPatterns(domain),
      this.learningHistory.getLearningRecommendations(domain),
    ]);

    return {
      summary: {
        totalLearningEvents: learningMetrics.totalEvents,
        learningRate: learningMetrics.learningRate,
        adaptationRate: learningMetrics.adaptationRate,
        performanceImprovement: learningMetrics.performanceImprovement,
      },
      metrics: learningMetrics,
      topPatterns: patterns.slice(0, 10),
      recommendations: recommendations.recommendations,
      costAnalysis: learningMetrics.costAnalysis,
    };
  }

  private async generateBusinessReport(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, any>> {
    const metrics = await this.getBusinessMetrics(domain, timeRange);
    const insights = await this.generateBusinessInsights(domain, metrics);
    const roi = await this.calculateROI(domain, timeRange);

    return {
      executiveSummary: this.generateExecutiveSummary(metrics, insights),
      metrics,
      insights,
      roi,
      competitiveAnalysis: await this.getCompetitiveAnalysis(domain),
      recommendations: this.generateBusinessRecommendations(insights, roi),
    };
  }

  private async generateExecutiveReport(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, any>> {
    const [performance, learning, business] = await Promise.all([
      this.generatePerformanceReport(domain, timeRange),
      this.generateLearningReport(domain, timeRange),
      this.generateBusinessReport(domain, timeRange),
    ]);

    return {
      executiveSummary: {
        keyMetrics: this.extractKeyMetrics(performance, learning, business),
        achievements: this.identifyAchievements(performance, learning, business),
        challenges: this.identifyChallenges(performance, learning, business),
        opportunities: this.identifyOpportunities(performance, learning, business),
      },
      performance: performance.summary,
      learning: learning.summary,
      business: business.executiveSummary,
      strategicRecommendations: this.generateStrategicRecommendations(
        performance,
        learning,
        business
      ),
    };
  }

  private formatGroupedResults(rows: any[]): Record<string, any> {
    const grouped: Record<string, any> = {};
    
    for (const row of rows) {
      if (!grouped[row.metric_name]) {
        grouped[row.metric_name] = [];
      }
      grouped[row.metric_name].push({
        period: row.period,
        value: parseFloat(row.value),
      });
    }
    
    return grouped;
  }

  private formatTimeSeriesResults(rows: any[]): Record<string, any> {
    const series: Record<string, any> = {};
    
    for (const row of rows) {
      if (!series[row.metric_name]) {
        series[row.metric_name] = [];
      }
      series[row.metric_name].push({
        timestamp: row.timestamp,
        value: parseFloat(row.metric_value),
      });
    }
    
    return series;
  }

  private predictMetric(values: Array<{ timestamp: Date; value: number }>): any {
    // Simple linear regression
    const n = values.length;
    const x = values.map((_, i) => i);
    const y = values.map(v => v.value);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict next 7 values
    const predictions = [];
    for (let i = 0; i < 7; i++) {
      const futureX = n + i;
      const futureValue = slope * futureX + intercept;
      const futureDate = new Date(values[n - 1].timestamp.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
      
      predictions.push({
        timestamp: futureDate,
        value: Math.max(0, futureValue), // Ensure non-negative
        confidence: 0.7 - (i * 0.05), // Decreasing confidence
      });
    }
    
    return {
      historical: values,
      predictions,
      trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
    };
  }

  private async storeAnalyticsEvent(event: any): Promise<void> {
    await this.pgPool.query(
      `INSERT INTO analytics_events (id, name, domain, data, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.id, event.name, event.domain, JSON.stringify(event.data), event.timestamp]
    );
  }

  private async updateRealtimeMetrics(
    eventName: string,
    domain: string,
    data: Record<string, any>
  ): Promise<void> {
    const ttl = 300; // 5 minutes
    
    // Update request counter
    await this.redis.incr(`realtime:${domain}:requests`);
    await this.redis.expire(`realtime:${domain}:requests`, ttl);
    
    // Update specific metrics based on event
    if (data.latency) {
      const key = `realtime:${domain}:latency`;
      const current = await this.redis.get(key);
      const newValue = current
        ? (parseFloat(current) * 0.9 + data.latency * 0.1)
        : data.latency;
      await this.redis.setex(key, ttl, newValue.toString());
    }
    
    if (data.error) {
      await this.redis.incr(`realtime:${domain}:errors`);
      await this.redis.expire(`realtime:${domain}:errors`, ttl);
    }
  }

  private startRealtimeMetricsCollection(): void {
    // Collect realtime metrics every second
    setInterval(async () => {
      try {
        await this.collectRealtimeMetrics();
      } catch (error) {
        logger.error('Realtime metrics collection failed', { error });
      }
    }, 1000);
  }

  private startInsightGeneration(): void {
    // Generate insights every hour
    this.insightGenerationInterval = setInterval(async () => {
      try {
        await this.generateInsights();
      } catch (error) {
        logger.error('Insight generation failed', { error });
      }
    }, 60 * 60 * 1000);
  }

  private startMetricsAggregation(): void {
    // Aggregate metrics every 5 minutes
    this.metricsAggregationInterval = setInterval(async () => {
      try {
        await this.aggregateMetrics();
      } catch (error) {
        logger.error('Metrics aggregation failed', { error });
      }
    }, 5 * 60 * 1000);
  }

  private async collectRealtimeMetrics(): Promise<void> {
    // Calculate requests per second
    const domains = await this.redis.keys('realtime:*:requests');
    
    for (const key of domains) {
      const domain = key.split(':')[1];
      const requests = parseInt(await this.redis.get(key) || '0');
      const rps = requests / 60; // Assuming 60 second window
      
      await this.redis.setex(`realtime:${domain}:requests_per_second`, 300, rps.toString());
    }
  }

  private async generateInsights(): Promise<void> {
    const domains = ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'];
    
    for (const domain of domains) {
      const metrics = await this.getBusinessMetrics(domain, {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
      });
      
      // Check for anomalies
      await this.detectAnomalies(domain, metrics);
      
      // Identify trends
      await this.identifyTrends(domain, metrics);
      
      // Find opportunities
      await this.findOpportunities(domain, metrics);
    }
  }

  private async detectAnomalies(domain: string, metrics: BusinessMetrics): Promise<void> {
    // Check for performance anomalies
    if (metrics.aiPerformance.errorRate > 0.1) {
      await this.createInsight({
        domain,
        type: 'anomaly',
        severity: 'high',
        title: 'High Error Rate Detected',
        description: `Error rate of ${(metrics.aiPerformance.errorRate * 100).toFixed(1)}% exceeds threshold`,
        metrics: { errorRate: metrics.aiPerformance.errorRate },
        recommendations: [
          'Review recent model changes',
          'Check input data quality',
          'Consider rolling back to previous model version',
        ],
      });
    }
    
    // Check for latency spikes
    if (metrics.aiPerformance.responseTime > 500) {
      await this.createInsight({
        domain,
        type: 'anomaly',
        severity: 'medium',
        title: 'Response Time Degradation',
        description: `Average response time of ${metrics.aiPerformance.responseTime}ms exceeds target`,
        metrics: { responseTime: metrics.aiPerformance.responseTime },
        recommendations: [
          'Scale up compute resources',
          'Optimize model inference',
          'Review caching strategies',
        ],
      });
    }
  }

  private async identifyTrends(domain: string, metrics: BusinessMetrics): Promise<void> {
    // Learning rate trend
    if (metrics.aiPerformance.learningRate > 10) {
      await this.createInsight({
        domain,
        type: 'trend',
        severity: 'low',
        title: 'Accelerated Learning Detected',
        description: `Learning rate of ${metrics.aiPerformance.learningRate.toFixed(1)} events/day shows active improvement`,
        metrics: { learningRate: metrics.aiPerformance.learningRate },
        recommendations: [
          'Continue current training strategy',
          'Consider capturing more edge cases',
          'Prepare for model version update',
        ],
      });
    }
  }

  private async findOpportunities(domain: string, metrics: BusinessMetrics): Promise<void> {
    // Low feedback rate opportunity
    if (metrics.userEngagement.feedbackRate < 0.2) {
      await this.createInsight({
        domain,
        type: 'opportunity',
        severity: 'medium',
        title: 'Feedback Collection Opportunity',
        description: `Only ${(metrics.userEngagement.feedbackRate * 100).toFixed(1)}% of interactions receive feedback`,
        metrics: { feedbackRate: metrics.userEngagement.feedbackRate },
        recommendations: [
          'Implement feedback prompts in UI',
          'Add gamification for feedback',
          'Simplify feedback collection process',
        ],
      });
    }
  }

  private async createInsight(insight: Omit<InsightReport, 'id' | 'createdAt'>): Promise<void> {
    const id = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.pgPool.query(
      `INSERT INTO analytics_insights 
       (id, domain, insight_type, severity, title, description, metrics, recommendations, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        id,
        insight.domain,
        insight.type,
        insight.severity,
        insight.title,
        insight.description,
        JSON.stringify(insight.metrics),
        insight.recommendations,
      ]
    );
    
    this.emit('analytics:insight_created', { ...insight, id, createdAt: new Date() });
  }

  private async aggregateMetrics(): Promise<void> {
    // Aggregate realtime metrics into historical data
    const domains = await this.redis.keys('realtime:*:*');
    const timestamp = new Date();
    
    for (const key of domains) {
      const parts = key.split(':');
      const domain = parts[1];
      const metricName = parts[2];
      const value = await this.redis.get(key);
      
      if (value) {
        await this.pgPool.query(
          `INSERT INTO analytics_metrics (domain, metric_name, metric_value, timestamp)
           VALUES ($1, $2, $3, $4)`,
          [domain, metricName, parseFloat(value), timestamp]
        );
      }
    }
  }

  private calculateOverallScore(metrics: BusinessMetrics): number {
    const weights = {
      accuracy: 0.3,
      confidence: 0.2,
      latency: 0.2,
      userSatisfaction: 0.3,
    };
    
    const normalizedLatency = Math.max(0, 1 - metrics.aiPerformance.responseTime / 1000);
    
    return (
      metrics.aiPerformance.accuracy * weights.accuracy +
      metrics.aiPerformance.confidence * weights.confidence +
      normalizedLatency * weights.latency +
      (metrics.userEngagement.satisfactionScore / 100) * weights.userSatisfaction
    );
  }

  private async comparePerformancePeriods(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    const periodLength = timeRange.end.getTime() - timeRange.start.getTime();
    const previousPeriod = {
      start: new Date(timeRange.start.getTime() - periodLength),
      end: timeRange.start,
    };
    
    const [current, previous] = await Promise.all([
      this.getBusinessMetrics(domain, timeRange),
      this.getBusinessMetrics(domain, previousPeriod),
    ]);
    
    return {
      current,
      previous,
      changes: {
        accuracy: ((current.aiPerformance.accuracy - previous.aiPerformance.accuracy) / previous.aiPerformance.accuracy) * 100,
        latency: ((current.aiPerformance.responseTime - previous.aiPerformance.responseTime) / previous.aiPerformance.responseTime) * 100,
        userSatisfaction: ((current.userEngagement.satisfactionScore - previous.userEngagement.satisfactionScore) / previous.userEngagement.satisfactionScore) * 100,
      },
    };
  }

  private async generatePerformanceRecommendations(
    metrics: BusinessMetrics,
    trends: any
  ): Promise<string[]> {
    const recommendations = [];
    
    if (metrics.aiPerformance.accuracy < 0.85) {
      recommendations.push('Increase training data diversity to improve accuracy');
    }
    
    if (metrics.aiPerformance.responseTime > 200) {
      recommendations.push('Optimize model architecture for faster inference');
    }
    
    if (trends.trend === 'declining') {
      recommendations.push('Investigate root causes of performance decline');
    }
    
    return recommendations;
  }

  private async generateBusinessInsights(
    domain: string,
    metrics: BusinessMetrics
  ): Promise<any[]> {
    const insights = [];
    
    // ROI insights
    if (metrics.businessImpact.costSavings > 10000) {
      insights.push({
        type: 'financial',
        message: `Generated $${metrics.businessImpact.costSavings.toFixed(0)} in cost savings`,
        impact: 'high',
      });
    }
    
    // Efficiency insights
    const documentsPerHour = metrics.businessImpact.documentsAnalyzed / 24;
    if (documentsPerHour > 100) {
      insights.push({
        type: 'efficiency',
        message: `Processing ${documentsPerHour.toFixed(0)} documents per hour`,
        impact: 'medium',
      });
    }
    
    return insights;
  }

  private async calculateROI(
    domain: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    const costs = await this.pgPool.query(
      `SELECT SUM(cost) as total_cost
       FROM operational_costs
       WHERE domain = $1 AND incurred_at BETWEEN $2 AND $3`,
      [domain, timeRange.start, timeRange.end]
    );
    
    const benefits = await this.pgPool.query(
      `SELECT SUM(value) as total_value
       FROM business_value
       WHERE domain = $1 AND created_at BETWEEN $2 AND $3`,
      [domain, timeRange.start, timeRange.end]
    );
    
    const totalCost = parseFloat(costs.rows[0]?.total_cost) || 0;
    const totalValue = parseFloat(benefits.rows[0]?.total_value) || 0;
    
    return {
      costs: totalCost,
      benefits: totalValue,
      roi: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      paybackPeriod: totalValue > 0 ? totalCost / (totalValue / 30) : Infinity, // Days
    };
  }

  private generateExecutiveSummary(metrics: BusinessMetrics, insights: any[]): string {
    const keyPoints = [
      `AI accuracy: ${(metrics.aiPerformance.accuracy * 100).toFixed(1)}%`,
      `User satisfaction: ${metrics.userEngagement.satisfactionScore.toFixed(1)}%`,
      `Cost savings: $${metrics.businessImpact.costSavings.toFixed(0)}`,
    ];
    
    return `Performance Summary: ${keyPoints.join(', ')}. ${insights.length} key insights identified.`;
  }

  private async getCompetitiveAnalysis(domain: string): Promise<any> {
    // Placeholder for competitive benchmarking
    return {
      industryAverage: {
        accuracy: 0.82,
        responseTime: 250,
        userSatisfaction: 75,
      },
      ourPerformance: {
        accuracy: 0.91,
        responseTime: 150,
        userSatisfaction: 87,
      },
      competitiveAdvantage: 'Above industry average in all key metrics',
    };
  }

  private generateBusinessRecommendations(insights: any[], roi: any): string[] {
    const recommendations = [];
    
    if (roi.roi > 100) {
      recommendations.push('Consider expanding AI capabilities to additional domains');
    }
    
    if (roi.paybackPeriod < 30) {
      recommendations.push('Fast ROI achieved - increase investment in AI infrastructure');
    }
    
    insights.forEach(insight => {
      if (insight.impact === 'high') {
        recommendations.push(`Leverage ${insight.type} advantage for market differentiation`);
      }
    });
    
    return recommendations;
  }

  private extractKeyMetrics(...reports: any[]): Record<string, any> {
    return {
      overallAccuracy: reports[0].metrics.aiPerformance.accuracy,
      learningRate: reports[1].summary.learningRate,
      roi: reports[2].roi.roi,
      userSatisfaction: reports[0].metrics.userEngagement.satisfactionScore,
    };
  }

  private identifyAchievements(...reports: any[]): string[] {
    const achievements = [];
    
    if (reports[0].metrics.aiPerformance.accuracy > 0.9) {
      achievements.push('Achieved 90%+ AI accuracy');
    }
    
    if (reports[1].summary.performanceImprovement > 10) {
      achievements.push('10%+ performance improvement through learning');
    }
    
    if (reports[2].roi.roi > 200) {
      achievements.push('200%+ return on investment');
    }
    
    return achievements;
  }

  private identifyChallenges(...reports: any[]): string[] {
    const challenges = [];
    
    if (reports[0].metrics.aiPerformance.errorRate > 0.05) {
      challenges.push('Error rate exceeds 5% threshold');
    }
    
    if (reports[1].summary.feedbackRate < 0.3) {
      challenges.push('Low user feedback participation');
    }
    
    return challenges;
  }

  private identifyOpportunities(...reports: any[]): string[] {
    const opportunities = [];
    
    if (reports[0].metrics.memoryUtilization.memoryAccessRate < 2) {
      opportunities.push('Underutilized memory system - potential for better personalization');
    }
    
    if (reports[1].summary.adaptationRate > 0.5) {
      opportunities.push('High adaptation rate - ready for more aggressive learning');
    }
    
    return opportunities;
  }

  private generateStrategicRecommendations(...reports: any[]): string[] {
    const recommendations = [];
    
    // Performance-based recommendations
    if (reports[0].comparisons.changes.accuracy > 5) {
      recommendations.push('Accelerate model deployment cycle to capture performance gains');
    }
    
    // Learning-based recommendations
    if (reports[1].recommendations.recommendations.length > 0) {
      recommendations.push(...reports[1].recommendations.recommendations.slice(0, 2));
    }
    
    // Business-based recommendations
    recommendations.push(...reports[2].recommendations.slice(0, 2));
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  private setupEventListeners(): void {
    // Listen for memory events
    this.memoryEngine.on('memory:stored', (data) => {
      this.trackEvent('memory_stored', data.domain, {
        memoryType: data.type,
        serviceId: data.serviceId,
      });
    });

    // Listen for learning events
    this.learningHistory.on('learning:event_recorded', (data) => {
      this.trackEvent('learning_event', data.domain, {
        eventType: data.eventType,
        serviceId: data.serviceId,
      });
    });
  }

  private async createAnalyticsTables(): Promise<void> {
    // Analytics metrics table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS analytics_metrics (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(100) NOT NULL,
        metric_name VARCHAR(255) NOT NULL,
        metric_value FLOAT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        INDEX idx_domain_metric (domain, metric_name),
        INDEX idx_timestamp (timestamp)
      )
    `);

    // Analytics events table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        INDEX idx_domain_name (domain, name),
        INDEX idx_timestamp (timestamp)
      )
    `);

    // Analytics insights table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS analytics_insights (
        id VARCHAR(255) PRIMARY KEY,
        domain VARCHAR(100) NOT NULL,
        insight_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        metrics JSONB,
        recommendations TEXT[],
        created_at TIMESTAMP NOT NULL,
        resolved_at TIMESTAMP,
        INDEX idx_domain_type (domain, insight_type),
        INDEX idx_created_at (created_at)
      )
    `);

    // Model evaluations table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS model_evaluations (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(100) NOT NULL,
        model_version VARCHAR(255) NOT NULL,
        accuracy FLOAT,
        precision FLOAT,
        recall FLOAT,
        f1_score FLOAT,
        evaluated_at TIMESTAMP NOT NULL,
        INDEX idx_domain_version (domain, model_version)
      )
    `);

    // Document analyses table (for legal_analysis domain)
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS document_analyses (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) NOT NULL,
        risk_score FLOAT,
        processing_time FLOAT,
        prevented_issue BOOLEAN DEFAULT FALSE,
        estimated_cost FLOAT,
        analyzed_at TIMESTAMP NOT NULL,
        INDEX idx_analyzed_at (analyzed_at)
      )
    `);

    // User sessions table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        domain VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        INDEX idx_user_domain (user_id, domain),
        INDEX idx_created_at (created_at)
      )
    `);

    // Memory access logs
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS memory_access_logs (
        id SERIAL PRIMARY KEY,
        memory_id VARCHAR(255) NOT NULL,
        domain VARCHAR(100) NOT NULL,
        retrieval_time FLOAT,
        accessed_at TIMESTAMP NOT NULL,
        INDEX idx_domain (domain),
        INDEX idx_accessed_at (accessed_at)
      )
    `);

    // Agent metrics
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS agent_metrics (
        agent_id VARCHAR(255) NOT NULL,
        performance_score FLOAT,
        requests_handled INTEGER,
        errors INTEGER,
        timestamp TIMESTAMP NOT NULL,
        INDEX idx_agent_timestamp (agent_id, timestamp)
      )
    `);

    // Domain metrics
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS domain_metrics (
        domain VARCHAR(100) NOT NULL,
        composite_score FLOAT,
        timestamp TIMESTAMP NOT NULL,
        INDEX idx_domain_timestamp (domain, timestamp)
      )
    `);

    // Operational costs
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS operational_costs (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(100) NOT NULL,
        cost_type VARCHAR(100),
        cost FLOAT,
        incurred_at TIMESTAMP NOT NULL,
        INDEX idx_domain_date (domain, incurred_at)
      )
    `);

    // Business value
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS business_value (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(100) NOT NULL,
        value_type VARCHAR(100),
        value FLOAT,
        created_at TIMESTAMP NOT NULL,
        INDEX idx_domain_date (domain, created_at)
      )
    `);
  }

  isHealthy(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    if (this.insightGenerationInterval) {
      clearInterval(this.insightGenerationInterval);
    }
    if (this.metricsAggregationInterval) {
      clearInterval(this.metricsAggregationInterval);
    }
    
    await this.pgPool.end();
    this.redis.disconnect();
    
    logger.info('Analytics Engine shutdown complete');
  }
}