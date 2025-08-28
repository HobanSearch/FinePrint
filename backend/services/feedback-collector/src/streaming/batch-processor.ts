/**
 * Batch processing for feedback events
 */

import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { Queue, Worker, Job } from 'bullmq';
import { Client as ClickHouseClient } from 'clickhouse';
import {
  ImplicitFeedbackEvent,
  ExplicitFeedbackEvent,
  BatchJob
} from '../types';

export class BatchProcessor {
  private redis: Redis;
  private logger: Logger;
  private clickhouse: ClickHouseClient;
  private batchQueue: Queue;
  private batchWorker: Worker;
  private batchSize: number = 1000;
  private batchInterval: number = 60000; // 1 minute
  private currentBatch: Map<string, any[]>;
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(
    redis: Redis,
    logger: Logger,
    clickhouseConfig?: any
  ) {
    this.redis = redis;
    this.logger = logger.child({ component: 'BatchProcessor' });
    this.currentBatch = new Map();
    
    // Initialize ClickHouse client for analytics storage
    this.clickhouse = new ClickHouseClient({
      url: clickhouseConfig?.url || 'http://localhost:8123',
      port: clickhouseConfig?.port || 8123,
      database: clickhouseConfig?.database || 'feedback',
      basicAuth: clickhouseConfig?.auth || null
    });
    
    // Initialize batch processing queue
    this.batchQueue = new Queue('batch-processing', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    });
    
    // Initialize worker
    this.batchWorker = new Worker(
      'batch-processing',
      async (job: Job) => this.executeBatchJob(job),
      {
        connection: redis,
        concurrency: 5,
        limiter: {
          max: 10,
          duration: 60000 // 10 batches per minute
        }
      }
    );
    
    this.setupWorkerHandlers();
  }

  /**
   * Initialize batch processor
   */
  async initialize(): Promise<void> {
    try {
      // Create ClickHouse tables if not exists
      await this.createClickHouseTables();
      
      // Start batch timer
      this.startBatchTimer();
      
      // Load any pending batches
      await this.loadPendingBatches();
      
      this.logger.info('Batch processor initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize batch processor');
      throw error;
    }
  }

  /**
   * Add event to batch
   */
  async addToBatch(type: 'implicit' | 'explicit', event: any): Promise<void> {
    const batchKey = `${type}:${this.getCurrentBatchId()}`;
    
    if (!this.currentBatch.has(batchKey)) {
      this.currentBatch.set(batchKey, []);
    }
    
    const batch = this.currentBatch.get(batchKey)!;
    batch.push(event);
    
    // Check if batch is full
    if (batch.length >= this.batchSize) {
      await this.flushBatch(batchKey);
    }
  }

  /**
   * Process batch of events
   */
  async processBatch(batchId: string, events: any[]): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const result: BatchProcessingResult = {
      batchId,
      processed: 0,
      failed: 0,
      errors: [],
      duration: 0
    };
    
    try {
      // Validate events
      const { valid, invalid } = await this.validateBatch(events);
      result.failed = invalid.length;
      
      if (invalid.length > 0) {
        result.errors = invalid.map(i => i.error);
        this.logger.warn({ batchId, invalidCount: invalid.length }, 'Invalid events in batch');
      }
      
      // Process valid events
      if (valid.length > 0) {
        // Enrich events
        const enriched = await this.enrichBatch(valid);
        
        // Store in ClickHouse
        await this.storeInClickHouse(batchId, enriched);
        
        // Update aggregations
        await this.updateBatchAggregations(enriched);
        
        // Generate insights
        const insights = await this.generateBatchInsights(enriched);
        
        // Store insights
        await this.storeBatchInsights(batchId, insights);
        
        result.processed = valid.length;
      }
      
      result.duration = Date.now() - startTime;
      
      // Store batch result
      await this.storeBatchResult(batchId, result);
      
      this.logger.info({ batchId, result }, 'Batch processed successfully');
      
      return result;
    } catch (error) {
      this.logger.error({ error, batchId }, 'Failed to process batch');
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      result.duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Execute batch job
   */
  private async executeBatchJob(job: Job): Promise<void> {
    const { batchId, type, events } = job.data;
    
    const batchJob: BatchJob = {
      jobId: job.id!,
      type: 'aggregation',
      status: 'processing',
      startTime: new Date(),
      progress: 0,
      results: {}
    };
    
    try {
      // Update job status
      await this.updateJobStatus(batchJob);
      
      // Process based on type
      switch (type) {
        case 'implicit':
          await this.processImplicitBatch(batchId, events);
          break;
        case 'explicit':
          await this.processExplicitBatch(batchId, events);
          break;
        case 'aggregation':
          await this.processAggregationBatch(batchId, events);
          break;
        case 'export':
          await this.processExportBatch(batchId, events);
          break;
        case 'cleanup':
          await this.processCleanupBatch(batchId);
          break;
        default:
          throw new Error(`Unknown batch type: ${type}`);
      }
      
      batchJob.status = 'completed';
      batchJob.endTime = new Date();
      batchJob.progress = 100;
      
      await this.updateJobStatus(batchJob);
    } catch (error) {
      batchJob.status = 'failed';
      batchJob.endTime = new Date();
      batchJob.error = error instanceof Error ? error.message : 'Unknown error';
      
      await this.updateJobStatus(batchJob);
      throw error;
    }
  }

  /**
   * Process implicit feedback batch
   */
  private async processImplicitBatch(batchId: string, events: ImplicitFeedbackEvent[]): Promise<void> {
    // Group by model type for efficient processing
    const grouped = this.groupByModelType(events);
    
    for (const [modelType, modelEvents] of grouped) {
      // Calculate batch statistics
      const stats = this.calculateImplicitStats(modelEvents);
      
      // Store statistics
      await this.storeModelStats(modelType, stats);
      
      // Detect patterns
      const patterns = await this.detectImplicitPatterns(modelEvents);
      
      // Store patterns
      await this.storePatterns(modelType, patterns);
      
      // Update user profiles
      await this.updateUserProfiles(modelEvents);
    }
  }

  /**
   * Process explicit feedback batch
   */
  private async processExplicitBatch(batchId: string, events: ExplicitFeedbackEvent[]): Promise<void> {
    // Group by model type
    const grouped = this.groupByModelType(events);
    
    for (const [modelType, modelEvents] of grouped) {
      // Perform sentiment analysis
      const sentimentAnalysis = await this.analyzeBatchSentiment(modelEvents);
      
      // Store sentiment results
      await this.storeSentimentAnalysis(modelType, sentimentAnalysis);
      
      // Extract themes
      const themes = await this.extractThemes(modelEvents);
      
      // Store themes
      await this.storeThemes(modelType, themes);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(modelEvents);
      
      // Store recommendations
      await this.storeRecommendations(modelType, recommendations);
    }
  }

  /**
   * Process aggregation batch
   */
  private async processAggregationBatch(batchId: string, data: any): Promise<void> {
    // Perform complex aggregations
    const aggregations = await this.performAggregations(data);
    
    // Store aggregated results
    await this.storeAggregations(batchId, aggregations);
    
    // Update dashboards
    await this.updateDashboards(aggregations);
  }

  /**
   * Process export batch
   */
  private async processExportBatch(batchId: string, data: any): Promise<void> {
    const { format, destination, filters } = data;
    
    // Query data based on filters
    const exportData = await this.queryExportData(filters);
    
    // Format data
    const formatted = await this.formatExportData(exportData, format);
    
    // Export to destination
    await this.exportData(formatted, destination);
  }

  /**
   * Process cleanup batch
   */
  private async processCleanupBatch(batchId: string): Promise<void> {
    // Clean old data based on retention policies
    const deleted = await this.cleanOldData();
    
    // Vacuum database
    await this.vacuumDatabase();
    
    this.logger.info({ batchId, deleted }, 'Cleanup batch completed');
  }

  /**
   * Helper methods
   */
  private async createClickHouseTables(): Promise<void> {
    // Create implicit events table
    await this.clickhouse.query(`
      CREATE TABLE IF NOT EXISTS implicit_events (
        event_id UUID,
        timestamp DateTime,
        user_id String,
        session_id String,
        event_type String,
        model_type String,
        model_version String,
        page String,
        scroll_depth Float32,
        time_on_page UInt32,
        conversion_value Float64,
        engagement_score Float32,
        date Date MATERIALIZED toDate(timestamp),
        hour UInt8 MATERIALIZED toHour(timestamp)
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (model_type, timestamp, event_id)
    `).toPromise();
    
    // Create explicit events table
    await this.clickhouse.query(`
      CREATE TABLE IF NOT EXISTS explicit_events (
        feedback_id UUID,
        timestamp DateTime,
        user_id String,
        session_id String,
        feedback_type String,
        model_type String,
        model_version String,
        rating UInt8,
        sentiment Float32,
        comment String,
        issue_type String,
        date Date MATERIALIZED toDate(timestamp)
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (model_type, timestamp, feedback_id)
    `).toPromise();
    
    // Create aggregations table
    await this.clickhouse.query(`
      CREATE TABLE IF NOT EXISTS aggregations (
        model_type String,
        window_start DateTime,
        window_end DateTime,
        total_events UInt64,
        unique_users UInt32,
        avg_engagement Float32,
        conversion_rate Float32,
        avg_rating Float32,
        sentiment_score Float32,
        revenue Float64
      ) ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(window_start)
      ORDER BY (model_type, window_start)
    `).toPromise();
  }

  private async storeInClickHouse(batchId: string, events: any[]): Promise<void> {
    // Prepare data for insertion
    const implicitData = events
      .filter(e => e.type === 'implicit')
      .map(e => this.prepareImplicitForClickHouse(e));
    
    const explicitData = events
      .filter(e => e.type === 'explicit')
      .map(e => this.prepareExplicitForClickHouse(e));
    
    // Bulk insert
    if (implicitData.length > 0) {
      await this.clickhouse.insert('implicit_events', implicitData).toPromise();
    }
    
    if (explicitData.length > 0) {
      await this.clickhouse.insert('explicit_events', explicitData).toPromise();
    }
  }

  private prepareImplicitForClickHouse(event: any): any {
    return {
      event_id: event.eventId,
      timestamp: event.timestamp,
      user_id: event.userId || '',
      session_id: event.sessionId,
      event_type: event.eventType,
      model_type: event.modelType,
      model_version: event.modelVersion,
      page: event.metadata?.page || '',
      scroll_depth: event.metadata?.scrollDepth || 0,
      time_on_page: event.metadata?.timeOnPage || 0,
      conversion_value: event.businessMetrics?.conversionValue || 0,
      engagement_score: event.businessMetrics?.engagementScore || 0
    };
  }

  private prepareExplicitForClickHouse(event: any): any {
    return {
      feedback_id: event.feedbackId,
      timestamp: event.timestamp,
      user_id: event.userId || '',
      session_id: event.sessionId,
      feedback_type: event.feedbackType,
      model_type: event.modelType,
      model_version: event.modelVersion,
      rating: event.rating || 0,
      sentiment: event.sentiment || 0,
      comment: event.comment || '',
      issue_type: event.issueType || ''
    };
  }

  private async validateBatch(events: any[]): Promise<{ valid: any[]; invalid: any[] }> {
    const valid: any[] = [];
    const invalid: any[] = [];
    
    for (const event of events) {
      try {
        // Basic validation
        if (!event.timestamp || !event.modelType) {
          throw new Error('Missing required fields');
        }
        valid.push(event);
      } catch (error) {
        invalid.push({
          event,
          error: error instanceof Error ? error.message : 'Validation failed'
        });
      }
    }
    
    return { valid, invalid };
  }

  private async enrichBatch(events: any[]): Promise<any[]> {
    return events.map(event => ({
      ...event,
      enriched: true,
      batchProcessedAt: new Date()
    }));
  }

  private async updateBatchAggregations(events: any[]): Promise<void> {
    // Update various aggregations
    const modelTypes = new Set(events.map(e => e.modelType));
    
    for (const modelType of modelTypes) {
      const modelEvents = events.filter(e => e.modelType === modelType);
      await this.updateModelAggregations(modelType, modelEvents);
    }
  }

  private async generateBatchInsights(events: any[]): Promise<any> {
    return {
      totalEvents: events.length,
      uniqueUsers: new Set(events.map(e => e.userId || e.sessionId)).size,
      modelDistribution: this.getModelDistribution(events),
      timeDistribution: this.getTimeDistribution(events)
    };
  }

  private groupByModelType(events: any[]): Map<string, any[]> {
    const grouped = new Map<string, any[]>();
    
    for (const event of events) {
      const modelType = event.modelType;
      if (!grouped.has(modelType)) {
        grouped.set(modelType, []);
      }
      grouped.get(modelType)!.push(event);
    }
    
    return grouped;
  }

  private calculateImplicitStats(events: ImplicitFeedbackEvent[]): any {
    return {
      totalEvents: events.length,
      uniqueSessions: new Set(events.map(e => e.sessionId)).size,
      eventTypes: this.countEventTypes(events),
      avgEngagementTime: this.calculateAvgEngagementTime(events),
      conversionRate: this.calculateConversionRate(events)
    };
  }

  private async detectImplicitPatterns(events: ImplicitFeedbackEvent[]): Promise<any[]> {
    const patterns: any[] = [];
    
    // Detect common user paths
    const paths = this.extractUserPaths(events);
    patterns.push(...this.findCommonPaths(paths));
    
    // Detect engagement patterns
    const engagementPatterns = this.detectEngagementPatterns(events);
    patterns.push(...engagementPatterns);
    
    return patterns;
  }

  private async analyzeBatchSentiment(events: ExplicitFeedbackEvent[]): Promise<any> {
    const sentiments = events
      .filter(e => e.sentiment !== undefined)
      .map(e => e.sentiment!);
    
    return {
      average: sentiments.reduce((a, b) => a + b, 0) / sentiments.length,
      positive: sentiments.filter(s => s > 0.2).length,
      negative: sentiments.filter(s => s < -0.2).length,
      neutral: sentiments.filter(s => s >= -0.2 && s <= 0.2).length
    };
  }

  private async extractThemes(events: ExplicitFeedbackEvent[]): Promise<string[]> {
    // Simple theme extraction - would use NLP in production
    const comments = events
      .filter(e => e.comment)
      .map(e => e.comment!);
    
    const wordFreq = new Map<string, number>();
    for (const comment of comments) {
      const words = comment.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 4) { // Filter short words
          wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
      }
    }
    
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private async generateRecommendations(events: ExplicitFeedbackEvent[]): Promise<any[]> {
    const recommendations: any[] = [];
    
    // Check for common issues
    const issueTypes = events
      .filter(e => e.issueType)
      .map(e => e.issueType!);
    
    const issueCounts = new Map<string, number>();
    for (const issue of issueTypes) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
    }
    
    for (const [issue, count] of issueCounts) {
      if (count > 5) {
        recommendations.push({
          type: 'issue_resolution',
          priority: 'high',
          issue,
          count,
          recommendation: `Address recurring ${issue} issues reported by ${count} users`
        });
      }
    }
    
    return recommendations;
  }

  private async updateUserProfiles(events: ImplicitFeedbackEvent[]): Promise<void> {
    const userEvents = new Map<string, ImplicitFeedbackEvent[]>();
    
    for (const event of events) {
      const userId = event.userId || event.sessionId;
      if (!userEvents.has(userId)) {
        userEvents.set(userId, []);
      }
      userEvents.get(userId)!.push(event);
    }
    
    for (const [userId, userEventList] of userEvents) {
      await this.updateUserProfile(userId, userEventList);
    }
  }

  private async updateUserProfile(userId: string, events: ImplicitFeedbackEvent[]): Promise<void> {
    const profile = {
      lastActive: new Date(),
      totalEvents: events.length,
      engagementScore: this.calculateUserEngagement(events),
      preferredModel: this.getPreferredModel(events)
    };
    
    await this.redis.hset(`user:profile:${userId}`, profile as any);
  }

  private calculateUserEngagement(events: ImplicitFeedbackEvent[]): number {
    // Simple engagement calculation
    const weights = {
      click: 1,
      conversion: 10,
      download: 5,
      copy: 3,
      scroll: 0.5
    };
    
    let score = 0;
    for (const event of events) {
      score += weights[event.eventType as keyof typeof weights] || 0;
    }
    
    return Math.min(100, score);
  }

  private getPreferredModel(events: ImplicitFeedbackEvent[]): string {
    const modelCounts = new Map<string, number>();
    
    for (const event of events) {
      modelCounts.set(event.modelType, (modelCounts.get(event.modelType) || 0) + 1);
    }
    
    let maxCount = 0;
    let preferredModel = '';
    
    for (const [model, count] of modelCounts) {
      if (count > maxCount) {
        maxCount = count;
        preferredModel = model;
      }
    }
    
    return preferredModel;
  }

  private countEventTypes(events: ImplicitFeedbackEvent[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }
    
    return counts;
  }

  private calculateAvgEngagementTime(events: ImplicitFeedbackEvent[]): number {
    const times = events
      .filter(e => e.metadata.timeOnPage)
      .map(e => e.metadata.timeOnPage);
    
    if (times.length === 0) return 0;
    
    return times.reduce((a, b) => a + b, 0) / times.length;
  }

  private calculateConversionRate(events: ImplicitFeedbackEvent[]): number {
    const conversions = events.filter(e => e.eventType === 'conversion').length;
    return events.length > 0 ? conversions / events.length : 0;
  }

  private extractUserPaths(events: ImplicitFeedbackEvent[]): string[][] {
    const sessionPaths = new Map<string, string[]>();
    
    for (const event of events) {
      if (!sessionPaths.has(event.sessionId)) {
        sessionPaths.set(event.sessionId, []);
      }
      if (event.metadata.page) {
        sessionPaths.get(event.sessionId)!.push(event.metadata.page);
      }
    }
    
    return Array.from(sessionPaths.values());
  }

  private findCommonPaths(paths: string[][]): any[] {
    // Find common sequences in user paths
    const pathCounts = new Map<string, number>();
    
    for (const path of paths) {
      const pathStr = path.join(' -> ');
      pathCounts.set(pathStr, (pathCounts.get(pathStr) || 0) + 1);
    }
    
    return Array.from(pathCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([path, count]) => ({
        type: 'user_path',
        path,
        count
      }));
  }

  private detectEngagementPatterns(events: ImplicitFeedbackEvent[]): any[] {
    const patterns: any[] = [];
    
    // Detect high engagement elements
    const elementEngagement = new Map<string, number>();
    
    for (const event of events) {
      if (event.eventType === 'click' || event.eventType === 'conversion') {
        elementEngagement.set(
          event.elementId,
          (elementEngagement.get(event.elementId) || 0) + 1
        );
      }
    }
    
    for (const [element, count] of elementEngagement) {
      if (count > 10) {
        patterns.push({
          type: 'high_engagement',
          element,
          interactions: count
        });
      }
    }
    
    return patterns;
  }

  private getModelDistribution(events: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const event of events) {
      distribution[event.modelType] = (distribution[event.modelType] || 0) + 1;
    }
    
    return distribution;
  }

  private getTimeDistribution(events: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      distribution[hour] = (distribution[hour] || 0) + 1;
    }
    
    return distribution;
  }

  private async performAggregations(data: any): Promise<any> {
    // Perform complex aggregations
    return {
      hourly: await this.aggregateHourly(data),
      daily: await this.aggregateDaily(data),
      weekly: await this.aggregateWeekly(data)
    };
  }

  private async aggregateHourly(data: any): Promise<any> {
    // Hourly aggregation logic
    return {};
  }

  private async aggregateDaily(data: any): Promise<any> {
    // Daily aggregation logic
    return {};
  }

  private async aggregateWeekly(data: any): Promise<any> {
    // Weekly aggregation logic
    return {};
  }

  private async queryExportData(filters: any): Promise<any[]> {
    // Query data based on filters
    return [];
  }

  private async formatExportData(data: any[], format: string): Promise<any> {
    // Format data for export
    switch (format) {
      case 'csv':
        return this.formatAsCSV(data);
      case 'json':
        return JSON.stringify(data, null, 2);
      default:
        return data;
    }
  }

  private formatAsCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csv = [headers.join(',')];
    
    for (const row of data) {
      csv.push(headers.map(h => row[h]).join(','));
    }
    
    return csv.join('\n');
  }

  private async exportData(data: any, destination: string): Promise<void> {
    // Export data to destination
    this.logger.info({ destination }, 'Data exported');
  }

  private async cleanOldData(): Promise<number> {
    // Clean data older than retention period
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90); // 90 days retention
    
    // Delete from ClickHouse
    const result = await this.clickhouse.query(`
      ALTER TABLE implicit_events DELETE WHERE timestamp < '${cutoff.toISOString()}'
    `).toPromise();
    
    return result.rows_before_limit_at_least || 0;
  }

  private async vacuumDatabase(): Promise<void> {
    // Optimize ClickHouse tables
    await this.clickhouse.query('OPTIMIZE TABLE implicit_events').toPromise();
    await this.clickhouse.query('OPTIMIZE TABLE explicit_events').toPromise();
    await this.clickhouse.query('OPTIMIZE TABLE aggregations').toPromise();
  }

  private async storeModelStats(modelType: string, stats: any): Promise<void> {
    await this.redis.hset(`stats:${modelType}`, stats);
  }

  private async storePatterns(modelType: string, patterns: any[]): Promise<void> {
    await this.redis.set(
      `patterns:${modelType}`,
      JSON.stringify(patterns),
      'EX',
      86400
    );
  }

  private async storeSentimentAnalysis(modelType: string, analysis: any): Promise<void> {
    await this.redis.hset(`sentiment:${modelType}`, analysis);
  }

  private async storeThemes(modelType: string, themes: string[]): Promise<void> {
    await this.redis.del(`themes:${modelType}`);
    if (themes.length > 0) {
      await this.redis.rpush(`themes:${modelType}`, ...themes);
    }
  }

  private async storeRecommendations(modelType: string, recommendations: any[]): Promise<void> {
    await this.redis.set(
      `recommendations:${modelType}`,
      JSON.stringify(recommendations),
      'EX',
      86400
    );
  }

  private async storeAggregations(batchId: string, aggregations: any): Promise<void> {
    await this.redis.hset(`aggregations:${batchId}`, aggregations);
  }

  private async updateDashboards(aggregations: any): Promise<void> {
    // Update dashboard metrics
    await this.redis.publish('dashboard:update', JSON.stringify(aggregations));
  }

  private async updateModelAggregations(modelType: string, events: any[]): Promise<void> {
    const key = `aggregations:${modelType}`;
    await this.redis.hincrby(key, 'total_events', events.length);
    await this.redis.expire(key, 86400);
  }

  private async storeBatchInsights(batchId: string, insights: any): Promise<void> {
    await this.redis.setex(
      `insights:${batchId}`,
      86400,
      JSON.stringify(insights)
    );
  }

  private async storeBatchResult(batchId: string, result: BatchProcessingResult): Promise<void> {
    await this.redis.setex(
      `batch:result:${batchId}`,
      86400,
      JSON.stringify(result)
    );
  }

  private async updateJobStatus(job: BatchJob): Promise<void> {
    await this.redis.hset(`job:${job.jobId}`, job as any);
  }

  private getCurrentBatchId(): string {
    return Math.floor(Date.now() / this.batchInterval).toString();
  }

  private startBatchTimer(): void {
    this.batchTimer = setInterval(async () => {
      await this.flushAllBatches();
    }, this.batchInterval);
  }

  private async flushBatch(batchKey: string): Promise<void> {
    const batch = this.currentBatch.get(batchKey);
    if (!batch || batch.length === 0) return;
    
    const [type] = batchKey.split(':');
    const batchId = `batch_${Date.now()}`;
    
    // Add to processing queue
    await this.batchQueue.add(type, {
      batchId,
      type,
      events: batch
    });
    
    // Clear batch
    this.currentBatch.delete(batchKey);
  }

  private async flushAllBatches(): Promise<void> {
    for (const batchKey of this.currentBatch.keys()) {
      await this.flushBatch(batchKey);
    }
  }

  private async loadPendingBatches(): Promise<void> {
    // Load any pending batches from Redis
    const pendingKeys = await this.redis.keys('pending:batch:*');
    
    for (const key of pendingKeys) {
      const batchData = await this.redis.get(key);
      if (batchData) {
        const { type, events } = JSON.parse(batchData);
        await this.batchQueue.add(type, {
          batchId: key.replace('pending:batch:', ''),
          type,
          events
        });
        await this.redis.del(key);
      }
    }
  }

  private setupWorkerHandlers(): void {
    this.batchWorker.on('completed', (job: Job) => {
      this.logger.debug({ jobId: job.id, name: job.name }, 'Batch job completed');
    });

    this.batchWorker.on('failed', (job: Job | undefined, error: Error) => {
      this.logger.error({ jobId: job?.id, error }, 'Batch job failed');
    });
  }

  /**
   * Shutdown batch processor
   */
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    await this.flushAllBatches();
    await this.batchQueue.close();
    await this.batchWorker.close();
    
    this.logger.info('Batch processor shut down');
  }
}

// Helper interfaces
interface BatchProcessingResult {
  batchId: string;
  processed: number;
  failed: number;
  errors: string[];
  duration: number;
}