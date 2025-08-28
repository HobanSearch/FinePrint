// Metrics Collector - Real-time metrics collection and aggregation

import { PrismaClient, MetricEvent } from '@prisma/client';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { Queue, Worker } from 'bullmq';
import { MetricEvent as MetricEventType, ModelPerformanceMetrics } from '../types';

export class MetricsCollector {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;
  private metricsQueue: Queue;
  private batchSize = 100;
  private flushInterval = 5000; // 5 seconds
  private metricsBatch: MetricEventType[] = [];

  constructor(prisma: PrismaClient, redis: Redis, logger: Logger) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;

    // Initialize metrics queue
    this.metricsQueue = new Queue('metrics-processing', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    // Start batch processing
    this.startBatchProcessor();
    
    // Start flush interval
    setInterval(() => this.flushBatch(), this.flushInterval);
  }

  /**
   * Track a metric event
   */
  async trackMetric(event: MetricEventType): Promise<void> {
    try {
      // Validate event
      this.validateMetricEvent(event);

      // Add to batch
      this.metricsBatch.push(event);

      // Update real-time counters
      await this.updateRealtimeMetrics(event);

      // Flush if batch is full
      if (this.metricsBatch.length >= this.batchSize) {
        await this.flushBatch();
      }

    } catch (error) {
      this.logger.error({ error, event }, 'Failed to track metric');
      throw error;
    }
  }

  /**
   * Track model performance metrics
   */
  async trackModelPerformance(
    experimentId: string,
    variantId: string,
    userId: string,
    metrics: ModelPerformanceMetrics
  ): Promise<void> {
    // Track latency
    await this.trackMetric({
      experimentId,
      variantId,
      userId,
      metricName: 'model_latency',
      value: metrics.latency,
      timestamp: new Date(),
      modelMetrics: metrics
    });

    // Track cost
    if (metrics.cost !== undefined) {
      await this.trackMetric({
        experimentId,
        variantId,
        userId,
        metricName: 'model_cost',
        value: metrics.cost,
        timestamp: new Date(),
        modelMetrics: metrics
      });
    }

    // Track accuracy
    if (metrics.accuracy !== undefined) {
      await this.trackMetric({
        experimentId,
        variantId,
        userId,
        metricName: 'model_accuracy',
        value: metrics.accuracy,
        timestamp: new Date(),
        modelMetrics: metrics
      });
    }

    // Update model performance aggregates
    await this.updateModelPerformanceAggregates(experimentId, variantId, metrics);
  }

  /**
   * Track conversion event
   */
  async trackConversion(
    experimentId: string,
    userId: string,
    value: number = 1,
    properties?: Record<string, any>
  ): Promise<void> {
    // Get user's variant assignment
    const assignment = await this.prisma.userAssignment.findUnique({
      where: {
        userId_experimentId: {
          userId,
          experimentId
        }
      }
    });

    if (!assignment) {
      this.logger.warn({ experimentId, userId }, 'No assignment found for conversion');
      return;
    }

    await this.trackMetric({
      experimentId,
      variantId: assignment.variantId,
      userId,
      metricName: 'conversion',
      value,
      timestamp: new Date(),
      properties
    });
  }

  /**
   * Track revenue event
   */
  async trackRevenue(
    experimentId: string,
    userId: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<void> {
    const assignment = await this.prisma.userAssignment.findUnique({
      where: {
        userId_experimentId: {
          userId,
          experimentId
        }
      }
    });

    if (!assignment) {
      return;
    }

    await this.trackMetric({
      experimentId,
      variantId: assignment.variantId,
      userId,
      metricName: 'revenue',
      value: amount,
      timestamp: new Date(),
      properties: { currency }
    });
  }

  /**
   * Get real-time metrics for an experiment
   */
  async getRealtimeMetrics(experimentId: string): Promise<any> {
    const key = `metrics:realtime:${experimentId}`;
    const data = await this.redis.hgetall(key);

    const metrics: any = {
      experimentId,
      variants: {}
    };

    // Parse variant metrics
    for (const [field, value] of Object.entries(data)) {
      const [variantId, metricName] = field.split(':');
      if (!metrics.variants[variantId]) {
        metrics.variants[variantId] = {};
      }
      metrics.variants[variantId][metricName] = JSON.parse(value);
    }

    return metrics;
  }

  /**
   * Get aggregated metrics for analysis
   */
  async getAggregatedMetrics(
    experimentId: string,
    metricName: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const where: any = {
      experimentId,
      metricName
    };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const metrics = await this.prisma.metricEvent.groupBy({
      by: ['variantId'],
      where,
      _count: true,
      _sum: {
        metricValue: true
      },
      _avg: {
        metricValue: true
      },
      _min: {
        metricValue: true
      },
      _max: {
        metricValue: true
      }
    });

    return metrics.map(m => ({
      variantId: m.variantId,
      count: m._count,
      sum: m._sum.metricValue,
      average: m._avg.metricValue,
      min: m._min.metricValue,
      max: m._max.metricValue
    }));
  }

  /**
   * Get time series metrics
   */
  async getTimeSeriesMetrics(
    experimentId: string,
    metricName: string,
    granularity: 'hour' | 'day' | 'week' = 'day',
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const key = `metrics:timeseries:${experimentId}:${metricName}:${granularity}`;
    
    // Try to get from cache
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query from database
    const metrics = await this.prisma.$queryRaw`
      SELECT 
        variant_id,
        DATE_TRUNC(${granularity}, timestamp) as time_bucket,
        COUNT(*) as count,
        AVG(metric_value) as average,
        SUM(metric_value) as sum
      FROM metric_event
      WHERE experiment_id = ${experimentId}
        AND metric_name = ${metricName}
        ${startDate ? `AND timestamp >= ${startDate}` : ''}
        ${endDate ? `AND timestamp <= ${endDate}` : ''}
      GROUP BY variant_id, time_bucket
      ORDER BY time_bucket ASC
    `;

    // Cache for 5 minutes
    await this.redis.set(key, JSON.stringify(metrics), 'EX', 300);

    return metrics;
  }

  /**
   * Calculate funnel metrics
   */
  async calculateFunnelMetrics(
    experimentId: string,
    funnelSteps: string[]
  ): Promise<any> {
    const results: any = {
      experimentId,
      variants: {}
    };

    // Get all variants
    const variants = await this.prisma.variant.findMany({
      where: { experimentId }
    });

    for (const variant of variants) {
      const funnelData = {
        variantId: variant.id,
        variantName: variant.name,
        steps: [] as any[]
      };

      let previousStepUsers = new Set<string>();

      for (let i = 0; i < funnelSteps.length; i++) {
        const step = funnelSteps[i];
        
        // Get users who completed this step
        const stepEvents = await this.prisma.metricEvent.findMany({
          where: {
            experimentId,
            variantId: variant.id,
            metricName: step
          },
          select: {
            userId: true
          },
          distinct: ['userId']
        });

        const stepUsers = new Set(stepEvents.map(e => e.userId).filter(Boolean));
        
        // Calculate conversion from previous step
        const conversionRate = i === 0 ? 1 : 
          previousStepUsers.size > 0 ? 
            stepUsers.size / previousStepUsers.size : 0;

        funnelData.steps.push({
          step,
          users: stepUsers.size,
          conversionRate,
          dropoffRate: 1 - conversionRate
        });

        previousStepUsers = stepUsers;
      }

      results.variants[variant.name] = funnelData;
    }

    return results;
  }

  // Private helper methods

  private validateMetricEvent(event: MetricEventType): void {
    if (!event.experimentId) {
      throw new Error('Experiment ID is required');
    }
    if (!event.metricName) {
      throw new Error('Metric name is required');
    }
    if (typeof event.value !== 'number') {
      throw new Error('Metric value must be a number');
    }
  }

  private async updateRealtimeMetrics(event: MetricEventType): Promise<void> {
    if (!event.variantId) return;

    const key = `metrics:realtime:${event.experimentId}`;
    const field = `${event.variantId}:${event.metricName}`;
    
    // Get current value
    const current = await this.redis.hget(key, field);
    const data = current ? JSON.parse(current) : { count: 0, sum: 0 };
    
    // Update
    data.count++;
    data.sum += event.value;
    data.average = data.sum / data.count;
    data.lastUpdated = new Date();
    
    // Store
    await this.redis.hset(key, field, JSON.stringify(data));
    await this.redis.expire(key, 3600); // 1 hour TTL
  }

  private async updateModelPerformanceAggregates(
    experimentId: string,
    variantId: string,
    metrics: ModelPerformanceMetrics
  ): Promise<void> {
    const key = `model:performance:${experimentId}:${variantId}`;
    
    // Update moving averages
    const pipeline = this.redis.pipeline();
    
    if (metrics.latency !== undefined) {
      pipeline.lpush(`${key}:latency`, metrics.latency);
      pipeline.ltrim(`${key}:latency`, 0, 999); // Keep last 1000
    }
    
    if (metrics.cost !== undefined) {
      pipeline.lpush(`${key}:cost`, metrics.cost);
      pipeline.ltrim(`${key}:cost`, 0, 999);
    }
    
    if (metrics.accuracy !== undefined) {
      pipeline.lpush(`${key}:accuracy`, metrics.accuracy);
      pipeline.ltrim(`${key}:accuracy`, 0, 999);
    }
    
    await pipeline.exec();
  }

  private async flushBatch(): Promise<void> {
    if (this.metricsBatch.length === 0) return;

    const batch = [...this.metricsBatch];
    this.metricsBatch = [];

    try {
      // Add to processing queue
      await this.metricsQueue.add('batch', { events: batch });
      
      this.logger.debug({ count: batch.length }, 'Flushed metrics batch');
    } catch (error) {
      this.logger.error({ error }, 'Failed to flush metrics batch');
      // Re-add to batch for retry
      this.metricsBatch.unshift(...batch);
    }
  }

  private startBatchProcessor(): void {
    const worker = new Worker(
      'metrics-processing',
      async (job) => {
        const { events } = job.data;
        
        // Batch insert to database
        const dbEvents = events.map((event: MetricEventType) => ({
          experimentId: event.experimentId,
          variantId: event.variantId || null,
          userId: event.userId || null,
          metricName: event.metricName,
          metricValue: event.value,
          metricType: this.inferMetricType(event.metricName),
          properties: event.properties || null,
          sessionId: event.sessionId || null,
          deviceType: event.deviceType || null,
          modelLatency: event.modelMetrics?.latency || null,
          modelCost: event.modelMetrics?.cost || null,
          modelAccuracy: event.modelMetrics?.accuracy || null,
          timestamp: event.timestamp
        }));

        await this.prisma.metricEvent.createMany({
          data: dbEvents,
          skipDuplicates: true
        });

        this.logger.info({ count: events.length }, 'Processed metrics batch');
      },
      {
        connection: this.redis,
        concurrency: 5
      }
    );

    worker.on('error', (error) => {
      this.logger.error({ error }, 'Metrics worker error');
    });
  }

  private inferMetricType(metricName: string): string {
    if (metricName.includes('conversion')) return 'CONVERSION';
    if (metricName.includes('revenue')) return 'REVENUE';
    if (metricName.includes('duration') || metricName.includes('time')) return 'DURATION';
    if (metricName.includes('count')) return 'COUNT';
    return 'CONTINUOUS';
  }
}