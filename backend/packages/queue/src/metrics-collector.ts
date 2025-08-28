import { Queue, QueueEvents } from 'bullmq';
import { register, Gauge, Counter, Histogram, Summary } from 'prom-client';
import { createServiceLogger } from '@fineprintai/logger';
import { QueueMetrics, SubscriptionTier } from '@fineprintai/shared-types';
import EventEmitter from 'eventemitter3';

const logger = createServiceLogger('metrics-collector');

export interface MetricsConfig {
  collectInterval: number; // milliseconds
  retentionDays: number;
  enablePrometheus: boolean;
  enableCustomMetrics: boolean;
}

export interface DetailedMetrics extends QueueMetrics {
  jobsPerSecond: number;
  avgWaitTime: number;
  p95ProcessingTime: number;
  p99ProcessingTime: number;
  memoryUsage: number;
  cpuUsage: number;
  errorsByType: Record<string, number>;
  tierDistribution: Record<SubscriptionTier, number>;
  workerUtilization: number;
}

/**
 * Comprehensive metrics collection and monitoring for queue operations
 */
export class MetricsCollector extends EventEmitter {
  private config: MetricsConfig;
  private queues: Map<string, Queue> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private metricsCache: Map<string, DetailedMetrics> = new Map();
  private timeSeriesData: Map<string, Array<{ timestamp: Date; metrics: DetailedMetrics }>> = new Map();
  private collectInterval: NodeJS.Timeout | null = null;

  // Prometheus metrics
  private readonly prometheusMetrics = {
    jobsTotal: new Counter({
      name: 'fineprint_queue_jobs_total',
      help: 'Total number of jobs processed',
      labelNames: ['queue', 'status', 'subscription_tier', 'job_name'],
    }),

    jobDuration: new Histogram({
      name: 'fineprint_queue_job_duration_seconds',
      help: 'Job processing duration in seconds',
      labelNames: ['queue', 'job_name', 'subscription_tier'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    }),

    queueDepth: new Gauge({
      name: 'fineprint_queue_depth',
      help: 'Current queue depth by status',
      labelNames: ['queue', 'status'],
    }),

    activeWorkers: new Gauge({
      name: 'fineprint_queue_active_workers',
      help: 'Number of active workers',
      labelNames: ['queue'],
    }),

    jobWaitTime: new Histogram({
      name: 'fineprint_queue_job_wait_time_seconds',
      help: 'Time jobs spend waiting in queue',
      labelNames: ['queue', 'subscription_tier'],
      buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
    }),

    errorRate: new Gauge({
      name: 'fineprint_queue_error_rate',
      help: 'Error rate percentage',
      labelNames: ['queue'],
    }),

    throughput: new Gauge({
      name: 'fineprint_queue_throughput_jobs_per_minute',
      help: 'Queue throughput in jobs per minute',
      labelNames: ['queue'],
    }),

    memoryUsage: new Gauge({
      name: 'fineprint_queue_memory_usage_bytes',
      help: 'Memory usage of queue system',
      labelNames: ['queue'],
    }),

    workerUtilization: new Gauge({
      name: 'fineprint_queue_worker_utilization',
      help: 'Worker utilization percentage',
      labelNames: ['queue'],
    }),
  };

  constructor(config: Partial<MetricsConfig> = {}) {
    super();
    
    this.config = {
      collectInterval: config.collectInterval || 30000, // 30 seconds
      retentionDays: config.retentionDays || 7,
      enablePrometheus: config.enablePrometheus ?? true,
      enableCustomMetrics: config.enableCustomMetrics ?? true,
    };

    if (this.config.enablePrometheus) {
      this.registerPrometheusMetrics();
    }

    this.startCollection();
    this.startCleanup();

    logger.info('Metrics Collector initialized', { config: this.config });
  }

  /**
   * Register a queue for metrics collection
   */
  public registerQueue(queueName: string, queue: Queue, queueEvents: QueueEvents): void {
    this.queues.set(queueName, queue);
    this.queueEvents.set(queueName, queueEvents);

    // Set up event listeners for real-time metrics
    this.setupQueueEventListeners(queueName, queueEvents);

    logger.info(`Queue '${queueName}' registered for metrics collection`);
  }

  /**
   * Get current metrics for a queue
   */
  public async getQueueMetrics(queueName: string): Promise<DetailedMetrics | null> {
    const cached = this.metricsCache.get(queueName);
    
    // Return cached if recent (within half the collection interval)
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.config.collectInterval / 2) {
      return cached;
    }

    return await this.collectQueueMetrics(queueName);
  }

  /**
   * Get historical metrics for a queue
   */
  public getHistoricalMetrics(
    queueName: string,
    since?: Date,
    until?: Date
  ): Array<{ timestamp: Date; metrics: DetailedMetrics }> {
    const data = this.timeSeriesData.get(queueName) || [];
    
    return data.filter(entry => {
      if (since && entry.timestamp < since) return false;
      if (until && entry.timestamp > until) return false;
      return true;
    });
  }

  /**
   * Get aggregated metrics across all queues
   */
  public async getAggregatedMetrics(): Promise<{
    totalJobs: number;
    totalThroughput: number;
    avgErrorRate: number;
    totalActiveWorkers: number;
    queueCount: number;
    healthyQueues: number;
  }> {
    const allMetrics = await Promise.all(
      Array.from(this.queues.keys()).map(queueName => this.getQueueMetrics(queueName))
    );

    const validMetrics = allMetrics.filter(m => m !== null) as DetailedMetrics[];

    return {
      totalJobs: validMetrics.reduce((sum, m) => sum + m.totalJobs, 0),
      totalThroughput: validMetrics.reduce((sum, m) => sum + m.throughput, 0),
      avgErrorRate: validMetrics.length > 0 
        ? validMetrics.reduce((sum, m) => sum + m.errorRate, 0) / validMetrics.length 
        : 0,
      totalActiveWorkers: validMetrics.reduce((sum, m) => sum + m.activeJobs, 0),
      queueCount: validMetrics.length,
      healthyQueues: validMetrics.filter(m => m.errorRate < 5).length, // Less than 5% error rate
    };
  }

  /**
   * Get performance insights and recommendations
   */
  public async getPerformanceInsights(queueName: string): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    insights: string[];
    recommendations: string[];
    score: number; // 0-100
  }> {
    const metrics = await this.getQueueMetrics(queueName);
    if (!metrics) {
      return {
        status: 'critical',
        insights: ['Queue not found or no metrics available'],
        recommendations: ['Check queue configuration and ensure it\'s properly registered'],
        score: 0,
      };
    }

    const insights: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Analyze error rate
    if (metrics.errorRate > 10) {
      insights.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
      recommendations.push('Investigate failed jobs and improve error handling');
      score -= 30;
    } else if (metrics.errorRate > 5) {
      insights.push(`Moderate error rate: ${metrics.errorRate.toFixed(1)}%`);
      recommendations.push('Monitor error patterns and consider improving retry strategies');
      score -= 15;
    }

    // Analyze throughput
    if (metrics.throughput < 1) {
      insights.push('Very low throughput: less than 1 job per minute');
      recommendations.push('Consider increasing worker concurrency or optimizing job processing');
      score -= 20;
    }

    // Analyze queue depth
    if (metrics.waitingJobs > 1000) {
      insights.push(`High queue backlog: ${metrics.waitingJobs} waiting jobs`);
      recommendations.push('Scale up workers or optimize job processing time');
      score -= 25;
    } else if (metrics.waitingJobs > 100) {
      insights.push(`Moderate queue backlog: ${metrics.waitingJobs} waiting jobs`);
      recommendations.push('Monitor queue depth and consider scaling if trend continues');
      score -= 10;
    }

    // Analyze processing time
    if (metrics.avgProcessingTime > 60000) { // > 1 minute
      insights.push(`Slow processing: average ${(metrics.avgProcessingTime / 1000).toFixed(1)}s per job`);
      recommendations.push('Profile job processing to identify bottlenecks');
      score -= 15;
    }

    // Analyze worker utilization
    if (metrics.workerUtilization > 90) {
      insights.push('High worker utilization: workers may be overloaded');
      recommendations.push('Consider adding more workers or optimizing job processing');
      score -= 10;
    } else if (metrics.workerUtilization < 20) {
      insights.push('Low worker utilization: workers may be underutilized');
      recommendations.push('Consider reducing worker count to optimize resource usage');
      score -= 5;
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 60) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    if (insights.length === 0) {
      insights.push('Queue is performing well');
    }

    return { status, insights, recommendations, score: Math.max(0, score) };
  }

  /**
   * Export metrics data
   */
  public exportMetrics(
    queueName?: string,
    format: 'json' | 'csv' | 'prometheus' = 'json',
    since?: Date,
    until?: Date
  ): string {
    if (format === 'prometheus') {
      return register.metrics();
    }

    const data = queueName
      ? this.getHistoricalMetrics(queueName, since, until)
      : Array.from(this.timeSeriesData.entries()).flatMap(([name, data]) =>
          data.map(entry => ({ queueName: name, ...entry }))
        );

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // CSV format
      if (data.length === 0) return '';

      const sample = data[0];
      const headers = Object.keys(sample).join(',');
      const rows = data.map(entry =>
        Object.values(entry)
          .map(value => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      );

      return [headers, ...rows].join('\n');
    }
  }

  // Private methods

  private async collectQueueMetrics(queueName: string): Promise<DetailedMetrics | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
        queue.getPaused(),
      ]);

      // Calculate advanced metrics
      const throughput = await this.calculateThroughput(queueName, completed);
      const avgProcessingTime = await this.calculateAvgProcessingTime(completed);
      const errorRate = this.calculateErrorRate(completed, failed);
      const { p95, p99 } = this.calculatePercentiles(completed);
      const avgWaitTime = await this.calculateAvgWaitTime(completed);
      const tierDistribution = this.calculateTierDistribution(completed);
      const workerUtilization = this.calculateWorkerUtilization(active.length, queueName);

      const metrics: DetailedMetrics = {
        queueName,
        totalJobs: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length,
        completedJobs: completed.length,
        failedJobs: failed.length,
        waitingJobs: waiting.length,
        activeJobs: active.length,
        delayedJobs: delayed.length,
        pausedJobs: paused.length,
        throughput,
        avgProcessingTime,
        errorRate,
        lastUpdated: new Date(),
        // Extended metrics
        jobsPerSecond: throughput / 60,
        avgWaitTime,
        p95ProcessingTime: p95,
        p99ProcessingTime: p99,
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to milliseconds
        errorsByType: await this.getErrorsByType(failed),
        tierDistribution,
        workerUtilization,
      };

      // Update Prometheus metrics
      if (this.config.enablePrometheus) {
        this.updatePrometheusMetrics(metrics);
      }

      // Cache metrics
      this.metricsCache.set(queueName, metrics);

      // Store in time series
      this.storeTimeSeriesData(queueName, metrics);

      this.emit('metrics:collected', { queueName, metrics });

      return metrics;
    } catch (error) {
      logger.error(`Failed to collect metrics for queue ${queueName}`, { error });
      return null;
    }
  }

  private async calculateThroughput(queueName: string, completedJobs: any[]): Promise<number> {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const recentJobs = completedJobs.filter(job => 
      job.finishedOn && job.finishedOn > oneHourAgo
    );
    return recentJobs.length; // jobs per hour, will be converted to per minute in calling code
  }

  private async calculateAvgProcessingTime(completedJobs: any[]): Promise<number> {
    if (completedJobs.length === 0) return 0;

    const processingTimes = completedJobs
      .filter(job => job.processedOn && job.finishedOn)
      .map(job => job.finishedOn - job.processedOn);

    return processingTimes.length > 0
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      : 0;
  }

  private calculateErrorRate(completedJobs: any[], failedJobs: any[]): number {
    const total = completedJobs.length + failedJobs.length;
    return total > 0 ? (failedJobs.length / total) * 100 : 0;
  }

  private calculatePercentiles(completedJobs: any[]): { p95: number; p99: number } {
    const processingTimes = completedJobs
      .filter(job => job.processedOn && job.finishedOn)
      .map(job => job.finishedOn - job.processedOn)
      .sort((a, b) => a - b);

    if (processingTimes.length === 0) {
      return { p95: 0, p99: 0 };
    }

    const p95Index = Math.floor(processingTimes.length * 0.95);
    const p99Index = Math.floor(processingTimes.length * 0.99);

    return {
      p95: processingTimes[p95Index] || 0,
      p99: processingTimes[p99Index] || 0,
    };
  }

  private async calculateAvgWaitTime(completedJobs: any[]): Promise<number> {
    const waitTimes = completedJobs
      .filter(job => job.timestamp && job.processedOn)
      .map(job => job.processedOn - job.timestamp);

    return waitTimes.length > 0
      ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
      : 0;
  }

  private calculateTierDistribution(completedJobs: any[]): Record<SubscriptionTier, number> {
    const distribution: Record<SubscriptionTier, number> = {
      [SubscriptionTier.FREE]: 0,
      [SubscriptionTier.STARTER]: 0,
      [SubscriptionTier.PROFESSIONAL]: 0,
      [SubscriptionTier.TEAM]: 0,
      [SubscriptionTier.ENTERPRISE]: 0,
    };

    completedJobs.forEach(job => {
      const tier = job.data?.subscriptionTier || SubscriptionTier.FREE;
      if (tier in distribution) {
        distribution[tier]++;
      }
    });

    return distribution;
  }

  private calculateWorkerUtilization(activeJobs: number, queueName: string): number {
    // This is a simplified calculation - in practice you'd track actual worker capacity
    const estimatedCapacity = Math.max(activeJobs, 1) * 1.2; // Assume 20% headroom
    return Math.min((activeJobs / estimatedCapacity) * 100, 100);
  }

  private async getErrorsByType(failedJobs: any[]): Promise<Record<string, number>> {
    const errorTypes: Record<string, number> = {};

    failedJobs.forEach(job => {
      if (job.failedReason) {
        const errorType = job.failedReason.split(':')[0] || 'Unknown';
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      }
    });

    return errorTypes;
  }

  private updatePrometheusMetrics(metrics: DetailedMetrics): void {
    const { queueName } = metrics;

    // Update gauges
    this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'waiting' }, metrics.waitingJobs);
    this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'active' }, metrics.activeJobs);
    this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'failed' }, metrics.failedJobs);
    this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'delayed' }, metrics.delayedJobs);

    this.prometheusMetrics.errorRate.set({ queue: queueName }, metrics.errorRate);
    this.prometheusMetrics.throughput.set({ queue: queueName }, metrics.throughput / 60); // Convert to per minute
    this.prometheusMetrics.memoryUsage.set({ queue: queueName }, metrics.memoryUsage);
    this.prometheusMetrics.workerUtilization.set({ queue: queueName }, metrics.workerUtilization);
  }

  private setupQueueEventListeners(queueName: string, queueEvents: QueueEvents): void {
    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      // Real-time metrics updates could be implemented here
      this.emit('job:completed', { queueName, jobId, returnvalue });
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      // Update error counters in real-time
      this.emit('job:failed', { queueName, jobId, failedReason });
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      this.emit('job:progress', { queueName, jobId, progress: data });
    });
  }

  private storeTimeSeriesData(queueName: string, metrics: DetailedMetrics): void {
    if (!this.timeSeriesData.has(queueName)) {
      this.timeSeriesData.set(queueName, []);
    }

    const data = this.timeSeriesData.get(queueName)!;
    data.push({ timestamp: new Date(), metrics });

    // Keep only data within retention period
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
    
    const filteredData = data.filter(entry => entry.timestamp > cutoff);
    this.timeSeriesData.set(queueName, filteredData);
  }

  private startCollection(): void {
    this.collectInterval = setInterval(async () => {
      for (const queueName of this.queues.keys()) {
        try {
          await this.collectQueueMetrics(queueName);
        } catch (error) {
          logger.error(`Metrics collection failed for queue ${queueName}`, { error });
        }
      }
    }, this.config.collectInterval);

    logger.info('Metrics collection started', { interval: this.config.collectInterval });
  }

  private startCleanup(): void {
    // Clean up old data every hour
    setInterval(() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

      for (const [queueName, data] of this.timeSeriesData) {
        const filteredData = data.filter(entry => entry.timestamp > cutoff);
        this.timeSeriesData.set(queueName, filteredData);
      }

      logger.debug('Metrics cleanup completed');
    }, 60 * 60 * 1000); // 1 hour
  }

  private registerPrometheusMetrics(): void {
    // Register all metrics with the Prometheus registry
    Object.values(this.prometheusMetrics).forEach(metric => {
      register.registerMetric(metric);
    });

    logger.info('Prometheus metrics registered');
  }

  public async close(): Promise<void> {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }

    // Clear all event listeners
    for (const queueEvents of this.queueEvents.values()) {
      queueEvents.removeAllListeners();
    }

    logger.info('Metrics Collector closed');
  }
}

export default MetricsCollector;