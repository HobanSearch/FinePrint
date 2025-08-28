/**
 * Real-time Performance Monitoring System
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import { Redis } from 'ioredis';
import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { ModelConfig, ModelStatus, RequestContext, JobStatus } from '../types';

export interface PerformanceMetrics {
  timestamp: Date;
  requestId: string;
  modelId: string;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  tokensUsed?: number;
  cost?: number;
  queueTime?: number;
  processingTime?: number;
  cacheHit?: boolean;
  userTier?: string;
}

export interface ModelPerformance {
  modelId: string;
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  successRate: number;
  errorRate: number;
  throughput: number;
  concurrency: number;
  queueLength: number;
  totalRequests: number;
  totalCost: number;
  lastHour: HourlyPerformance;
}

export interface HourlyPerformance {
  requests: number;
  errors: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  cost: number;
}

export interface SystemPerformance {
  timestamp: Date;
  models: Map<string, ModelPerformance>;
  overall: {
    totalRequests: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    successRate: number;
    throughput: number;
    activeConcurrency: number;
    queueDepth: number;
    cacheHitRate: number;
    totalCost: number;
  };
  bottlenecks: Bottleneck[];
  alerts: PerformanceAlert[];
}

export interface Bottleneck {
  type: 'model' | 'queue' | 'network' | 'cache' | 'database';
  resource: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  recommendation: string;
  metrics: Record<string, any>;
}

export interface PerformanceAlert {
  id: string;
  type: AlertType;
  severity: 'warning' | 'error' | 'critical';
  resource: string;
  message: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  resolved: boolean;
}

export enum AlertType {
  HIGH_LATENCY = 'HIGH_LATENCY',
  HIGH_ERROR_RATE = 'HIGH_ERROR_RATE',
  LOW_THROUGHPUT = 'LOW_THROUGHPUT',
  QUEUE_BUILDUP = 'QUEUE_BUILDUP',
  MODEL_DEGRADED = 'MODEL_DEGRADED',
  COST_SPIKE = 'COST_SPIKE',
  CACHE_MISS_RATE = 'CACHE_MISS_RATE'
}

export interface PerformanceThresholds {
  maxResponseTime: number;
  maxP95ResponseTime: number;
  maxErrorRate: number;
  minThroughput: number;
  maxQueueDepth: number;
  maxCostPerHour: number;
  minCacheHitRate: number;
}

export class PerformanceMonitor extends EventEmitter {
  private redis: Redis;
  private logger: pino.Logger;
  private metrics: PerformanceMetrics[] = [];
  private modelPerformance: Map<string, ModelPerformance> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private thresholds: PerformanceThresholds;
  
  // Prometheus metrics
  private requestCounter: Counter;
  private requestDuration: Histogram;
  private errorCounter: Counter;
  private queueGauge: Gauge;
  private concurrencyGauge: Gauge;
  private costCounter: Counter;
  private cacheHitCounter: Counter;
  private cacheMissCounter: Counter;
  private modelLatency: Summary;
  
  private monitoringInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  constructor(redis: Redis, thresholds?: Partial<PerformanceThresholds>) {
    super();
    this.redis = redis;
    this.logger = pino({ name: 'performance-monitor' });
    
    this.thresholds = {
      maxResponseTime: 100000, // 100s
      maxP95ResponseTime: 50000, // 50s
      maxErrorRate: 0.05, // 5%
      minThroughput: 1, // 1 req/sec
      maxQueueDepth: 1000,
      maxCostPerHour: 100, // $100
      minCacheHitRate: 0.3, // 30%
      ...thresholds
    };
    
    this.initializePrometheusMetrics();
    this.startMonitoring();
  }

  private initializePrometheusMetrics(): void {
    // Request counter
    this.requestCounter = new Counter({
      name: 'model_requests_total',
      help: 'Total number of model requests',
      labelNames: ['model', 'status', 'cache_hit', 'user_tier']
    });
    
    // Request duration histogram
    this.requestDuration = new Histogram({
      name: 'model_request_duration_seconds',
      help: 'Model request duration in seconds',
      labelNames: ['model', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]
    });
    
    // Error counter
    this.errorCounter = new Counter({
      name: 'model_errors_total',
      help: 'Total number of model errors',
      labelNames: ['model', 'error_type']
    });
    
    // Queue depth gauge
    this.queueGauge = new Gauge({
      name: 'model_queue_depth',
      help: 'Current queue depth per model',
      labelNames: ['model']
    });
    
    // Concurrency gauge
    this.concurrencyGauge = new Gauge({
      name: 'model_concurrency',
      help: 'Current concurrent requests per model',
      labelNames: ['model']
    });
    
    // Cost counter
    this.costCounter = new Counter({
      name: 'model_cost_total',
      help: 'Total cost of model requests',
      labelNames: ['model', 'user_tier']
    });
    
    // Cache hit counter
    this.cacheHitCounter = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['tier']
    });
    
    // Cache miss counter
    this.cacheMissCounter = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['tier']
    });
    
    // Model latency summary
    this.modelLatency = new Summary({
      name: 'model_latency_summary',
      help: 'Model latency summary',
      labelNames: ['model'],
      percentiles: [0.5, 0.9, 0.95, 0.99]
    });
    
    // Register all metrics
    register.registerMetric(this.requestCounter);
    register.registerMetric(this.requestDuration);
    register.registerMetric(this.errorCounter);
    register.registerMetric(this.queueGauge);
    register.registerMetric(this.concurrencyGauge);
    register.registerMetric(this.costCounter);
    register.registerMetric(this.cacheHitCounter);
    register.registerMetric(this.cacheMissCounter);
    register.registerMetric(this.modelLatency);
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetrics): void {
    // Store in memory
    this.metrics.push(metric);
    
    // Update Prometheus metrics
    this.requestCounter.inc({
      model: metric.modelId,
      status: metric.success ? 'success' : 'failure',
      cache_hit: metric.cacheHit ? 'true' : 'false',
      user_tier: metric.userTier || 'unknown'
    });
    
    if (metric.duration) {
      this.requestDuration.observe(
        { model: metric.modelId, operation: metric.operation },
        metric.duration / 1000 // Convert to seconds
      );
      
      this.modelLatency.observe(
        { model: metric.modelId },
        metric.duration / 1000
      );
    }
    
    if (!metric.success && metric.error) {
      this.errorCounter.inc({
        model: metric.modelId,
        error_type: this.categorizeError(metric.error)
      });
    }
    
    if (metric.cost) {
      this.costCounter.inc(
        { model: metric.modelId, user_tier: metric.userTier || 'unknown' },
        metric.cost
      );
    }
    
    if (metric.cacheHit !== undefined) {
      if (metric.cacheHit) {
        this.cacheHitCounter.inc({ tier: 'memory' });
      } else {
        this.cacheMissCounter.inc({ tier: 'memory' });
      }
    }
    
    // Update model performance
    this.updateModelPerformance(metric);
    
    // Store in Redis for persistence
    this.storeMetricInRedis(metric);
    
    // Check for alerts
    this.checkAlerts(metric);
    
    // Emit event for real-time monitoring
    this.emit('metric', metric);
  }

  /**
   * Get current system performance
   */
  async getSystemPerformance(): Promise<SystemPerformance> {
    const now = new Date();
    const recentMetrics = this.getRecentMetrics(300000); // Last 5 minutes
    
    // Calculate overall metrics
    const totalRequests = recentMetrics.length;
    const successfulRequests = recentMetrics.filter(m => m.success).length;
    const responseTimes = recentMetrics.map(m => m.duration).filter(d => d !== undefined);
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    
    const overall = {
      totalRequests,
      avgResponseTime: this.calculateAverage(responseTimes),
      p95ResponseTime: this.calculatePercentile(responseTimes, 95),
      successRate: totalRequests > 0 ? successfulRequests / totalRequests : 0,
      throughput: totalRequests / 300, // requests per second
      activeConcurrency: await this.getActiveConcurrency(),
      queueDepth: await this.getTotalQueueDepth(),
      cacheHitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
      totalCost: recentMetrics.reduce((sum, m) => sum + (m.cost || 0), 0)
    };
    
    // Detect bottlenecks
    const bottlenecks = await this.detectBottlenecks(recentMetrics);
    
    // Get active alerts
    const activeAlerts = Array.from(this.alerts.values())
      .filter(alert => !alert.resolved);
    
    return {
      timestamp: now,
      models: this.modelPerformance,
      overall,
      bottlenecks,
      alerts: activeAlerts
    };
  }

  /**
   * Get performance report for a specific model
   */
  getModelPerformanceReport(modelId: string): ModelPerformance | undefined {
    return this.modelPerformance.get(modelId);
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(
    modelId?: string,
    timeRange: number = 3600000 // 1 hour
  ): Promise<{
    timestamps: Date[];
    responseTime: number[];
    throughput: number[];
    errorRate: number[];
    cost: number[];
  }> {
    const metrics = modelId 
      ? this.metrics.filter(m => m.modelId === modelId)
      : this.metrics;
    
    const endTime = Date.now();
    const startTime = endTime - timeRange;
    const bucketSize = timeRange / 60; // 60 data points
    
    const trends = {
      timestamps: [] as Date[],
      responseTime: [] as number[],
      throughput: [] as number[],
      errorRate: [] as number[],
      cost: [] as number[]
    };
    
    for (let i = 0; i < 60; i++) {
      const bucketStart = startTime + (i * bucketSize);
      const bucketEnd = bucketStart + bucketSize;
      const bucketMetrics = metrics.filter(m => {
        const time = m.timestamp.getTime();
        return time >= bucketStart && time < bucketEnd;
      });
      
      trends.timestamps.push(new Date(bucketStart));
      
      const responseTimes = bucketMetrics
        .map(m => m.duration)
        .filter(d => d !== undefined);
      
      trends.responseTime.push(
        responseTimes.length > 0 ? this.calculateAverage(responseTimes) : 0
      );
      
      trends.throughput.push(
        bucketMetrics.length / (bucketSize / 1000) // requests per second
      );
      
      const errors = bucketMetrics.filter(m => !m.success).length;
      trends.errorRate.push(
        bucketMetrics.length > 0 ? errors / bucketMetrics.length : 0
      );
      
      trends.cost.push(
        bucketMetrics.reduce((sum, m) => sum + (m.cost || 0), 0)
      );
    }
    
    return trends;
  }

  /**
   * Detect performance bottlenecks
   */
  private async detectBottlenecks(metrics: PerformanceMetrics[]): Promise<Bottleneck[]> {
    const bottlenecks: Bottleneck[] = [];
    
    // Group metrics by model
    const modelMetrics = new Map<string, PerformanceMetrics[]>();
    for (const metric of metrics) {
      const existing = modelMetrics.get(metric.modelId) || [];
      existing.push(metric);
      modelMetrics.set(metric.modelId, existing);
    }
    
    // Check each model for bottlenecks
    for (const [modelId, modelSpecificMetrics] of modelMetrics) {
      const responseTimes = modelSpecificMetrics
        .map(m => m.duration)
        .filter(d => d !== undefined);
      
      const avgResponseTime = this.calculateAverage(responseTimes);
      const p95ResponseTime = this.calculatePercentile(responseTimes, 95);
      const errorRate = modelSpecificMetrics.filter(m => !m.success).length / modelSpecificMetrics.length;
      
      // High latency bottleneck
      if (p95ResponseTime > this.thresholds.maxP95ResponseTime) {
        bottlenecks.push({
          type: 'model',
          resource: modelId,
          severity: p95ResponseTime > this.thresholds.maxResponseTime ? 'critical' : 'high',
          impact: `Model ${modelId} has high latency (P95: ${Math.round(p95ResponseTime)}ms)`,
          recommendation: 'Consider scaling up the model, optimizing prompts, or implementing caching',
          metrics: {
            avgResponseTime,
            p95ResponseTime,
            requests: modelSpecificMetrics.length
          }
        });
      }
      
      // High error rate bottleneck
      if (errorRate > this.thresholds.maxErrorRate) {
        bottlenecks.push({
          type: 'model',
          resource: modelId,
          severity: errorRate > 0.1 ? 'critical' : 'high',
          impact: `Model ${modelId} has high error rate (${(errorRate * 100).toFixed(1)}%)`,
          recommendation: 'Check model health, review error logs, and consider failover',
          metrics: {
            errorRate,
            errors: modelSpecificMetrics.filter(m => !m.success).length,
            total: modelSpecificMetrics.length
          }
        });
      }
    }
    
    // Check queue bottlenecks
    const queueDepth = await this.getTotalQueueDepth();
    if (queueDepth > this.thresholds.maxQueueDepth) {
      bottlenecks.push({
        type: 'queue',
        resource: 'processing-queue',
        severity: queueDepth > this.thresholds.maxQueueDepth * 2 ? 'critical' : 'high',
        impact: `Queue buildup detected (${queueDepth} items)`,
        recommendation: 'Scale up processing capacity or optimize request handling',
        metrics: {
          queueDepth,
          threshold: this.thresholds.maxQueueDepth
        }
      });
    }
    
    // Check cache performance
    const cacheHitRate = metrics.filter(m => m.cacheHit).length / metrics.length;
    if (cacheHitRate < this.thresholds.minCacheHitRate) {
      bottlenecks.push({
        type: 'cache',
        resource: 'cache-system',
        severity: cacheHitRate < 0.1 ? 'high' : 'medium',
        impact: `Low cache hit rate (${(cacheHitRate * 100).toFixed(1)}%)`,
        recommendation: 'Review cache warming strategies and TTL settings',
        metrics: {
          cacheHitRate,
          threshold: this.thresholds.minCacheHitRate
        }
      });
    }
    
    return bottlenecks;
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(metric: PerformanceMetrics): void {
    const modelPerf = this.modelPerformance.get(metric.modelId);
    if (!modelPerf) return;
    
    // Check latency alert
    if (metric.duration && metric.duration > this.thresholds.maxResponseTime) {
      this.createOrUpdateAlert({
        id: `latency-${metric.modelId}`,
        type: AlertType.HIGH_LATENCY,
        severity: metric.duration > this.thresholds.maxResponseTime * 2 ? 'critical' : 'warning',
        resource: metric.modelId,
        message: `High latency detected for model ${metric.modelId}`,
        threshold: this.thresholds.maxResponseTime,
        currentValue: metric.duration,
        timestamp: new Date(),
        resolved: false
      });
    }
    
    // Check error rate alert
    if (modelPerf.errorRate > this.thresholds.maxErrorRate) {
      this.createOrUpdateAlert({
        id: `error-rate-${metric.modelId}`,
        type: AlertType.HIGH_ERROR_RATE,
        severity: modelPerf.errorRate > 0.1 ? 'critical' : 'error',
        resource: metric.modelId,
        message: `High error rate for model ${metric.modelId}`,
        threshold: this.thresholds.maxErrorRate,
        currentValue: modelPerf.errorRate,
        timestamp: new Date(),
        resolved: false
      });
    }
    
    // Check cost spike
    if (modelPerf.lastHour.cost > this.thresholds.maxCostPerHour) {
      this.createOrUpdateAlert({
        id: `cost-spike-${metric.modelId}`,
        type: AlertType.COST_SPIKE,
        severity: 'warning',
        resource: metric.modelId,
        message: `Cost spike detected for model ${metric.modelId}`,
        threshold: this.thresholds.maxCostPerHour,
        currentValue: modelPerf.lastHour.cost,
        timestamp: new Date(),
        resolved: false
      });
    }
  }

  /**
   * Create or update an alert
   */
  private createOrUpdateAlert(alert: PerformanceAlert): void {
    const existing = this.alerts.get(alert.id);
    
    if (!existing || existing.resolved) {
      this.alerts.set(alert.id, alert);
      this.emit('alert', alert);
      this.logger.warn({ alert }, 'Performance alert triggered');
    } else {
      // Update existing alert
      existing.currentValue = alert.currentValue;
      existing.timestamp = alert.timestamp;
    }
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert-resolved', alert);
      this.logger.info({ alertId }, 'Alert resolved');
    }
  }

  /**
   * Update model performance statistics
   */
  private updateModelPerformance(metric: PerformanceMetrics): void {
    const perf = this.modelPerformance.get(metric.modelId) || {
      modelId: metric.modelId,
      avgResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      successRate: 0,
      errorRate: 0,
      throughput: 0,
      concurrency: 0,
      queueLength: 0,
      totalRequests: 0,
      totalCost: 0,
      lastHour: {
        requests: 0,
        errors: 0,
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Number.MAX_VALUE,
        cost: 0
      }
    };
    
    // Update totals
    perf.totalRequests++;
    perf.totalCost += metric.cost || 0;
    
    // Update response time stats
    if (metric.duration) {
      const alpha = 0.1; // Exponential moving average factor
      perf.avgResponseTime = perf.avgResponseTime * (1 - alpha) + metric.duration * alpha;
      
      // Update last hour stats
      perf.lastHour.requests++;
      perf.lastHour.avgResponseTime = 
        (perf.lastHour.avgResponseTime * (perf.lastHour.requests - 1) + metric.duration) / 
        perf.lastHour.requests;
      perf.lastHour.maxResponseTime = Math.max(perf.lastHour.maxResponseTime, metric.duration);
      perf.lastHour.minResponseTime = Math.min(perf.lastHour.minResponseTime, metric.duration);
    }
    
    // Update success/error rates
    if (!metric.success) {
      perf.lastHour.errors++;
    }
    perf.successRate = (perf.totalRequests - perf.lastHour.errors) / perf.totalRequests;
    perf.errorRate = perf.lastHour.errors / perf.totalRequests;
    
    // Update cost
    perf.lastHour.cost += metric.cost || 0;
    
    // Calculate percentiles from recent metrics
    const recentMetrics = this.metrics
      .filter(m => m.modelId === metric.modelId)
      .slice(-1000)
      .map(m => m.duration)
      .filter(d => d !== undefined)
      .sort((a, b) => a - b);
    
    if (recentMetrics.length > 0) {
      perf.p50ResponseTime = this.calculatePercentile(recentMetrics, 50);
      perf.p95ResponseTime = this.calculatePercentile(recentMetrics, 95);
      perf.p99ResponseTime = this.calculatePercentile(recentMetrics, 99);
    }
    
    // Calculate throughput (requests per second over last minute)
    const lastMinuteMetrics = this.getRecentMetrics(60000)
      .filter(m => m.modelId === metric.modelId);
    perf.throughput = lastMinuteMetrics.length / 60;
    
    this.modelPerformance.set(metric.modelId, perf);
    
    // Update Prometheus gauges
    this.queueGauge.set({ model: metric.modelId }, perf.queueLength);
    this.concurrencyGauge.set({ model: metric.modelId }, perf.concurrency);
  }

  /**
   * Store metric in Redis for persistence
   */
  private async storeMetricInRedis(metric: PerformanceMetrics): Promise<void> {
    try {
      const key = `metrics:${metric.modelId}:${metric.timestamp.getTime()}`;
      await this.redis.setex(
        key,
        3600, // 1 hour TTL
        JSON.stringify(metric)
      );
      
      // Also update aggregated stats in Redis
      const statsKey = `stats:${metric.modelId}:${Math.floor(Date.now() / 3600000)}`;
      await this.redis.hincrby(statsKey, 'requests', 1);
      if (!metric.success) {
        await this.redis.hincrby(statsKey, 'errors', 1);
      }
      if (metric.cost) {
        await this.redis.hincrbyfloat(statsKey, 'cost', metric.cost);
      }
      await this.redis.expire(statsKey, 86400); // 24 hour TTL
    } catch (error) {
      this.logger.error({ error }, 'Failed to store metric in Redis');
    }
  }

  /**
   * Get recent metrics
   */
  private getRecentMetrics(timeRange: number): PerformanceMetrics[] {
    const cutoff = Date.now() - timeRange;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Calculate average
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Categorize error for metrics
   */
  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('rate')) return 'rate_limit';
    if (error.includes('auth')) return 'auth';
    if (error.includes('network')) return 'network';
    if (error.includes('validation')) return 'validation';
    return 'unknown';
  }

  /**
   * Get active concurrency
   */
  private async getActiveConcurrency(): Promise<number> {
    let total = 0;
    for (const perf of this.modelPerformance.values()) {
      total += perf.concurrency;
    }
    return total;
  }

  /**
   * Get total queue depth
   */
  private async getTotalQueueDepth(): Promise<number> {
    let total = 0;
    for (const perf of this.modelPerformance.values()) {
      total += perf.queueLength;
    }
    return total;
  }

  /**
   * Start monitoring tasks
   */
  private startMonitoring(): void {
    // Update stats every 10 seconds
    this.monitoringInterval = setInterval(() => {
      this.updateStats();
    }, 10000);
    
    // Cleanup old metrics every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
    
    // Reset hourly stats every hour
    setInterval(() => {
      this.resetHourlyStats();
    }, 3600000);
  }

  /**
   * Update statistics
   */
  private async updateStats(): Promise<void> {
    // Check for resolved alerts
    for (const [alertId, alert] of this.alerts) {
      if (!alert.resolved) {
        // Re-evaluate alert condition
        const modelPerf = this.modelPerformance.get(alert.resource);
        if (modelPerf) {
          let shouldResolve = false;
          
          switch (alert.type) {
            case AlertType.HIGH_LATENCY:
              shouldResolve = modelPerf.p95ResponseTime < this.thresholds.maxP95ResponseTime;
              break;
            case AlertType.HIGH_ERROR_RATE:
              shouldResolve = modelPerf.errorRate < this.thresholds.maxErrorRate;
              break;
            case AlertType.COST_SPIKE:
              shouldResolve = modelPerf.lastHour.cost < this.thresholds.maxCostPerHour;
              break;
          }
          
          if (shouldResolve) {
            this.resolveAlert(alertId);
          }
        }
      }
    }
    
    // Emit system performance update
    const systemPerf = await this.getSystemPerformance();
    this.emit('system-performance', systemPerf);
  }

  /**
   * Cleanup old metrics
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - 3600000; // Keep 1 hour of metrics
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
    
    // Cleanup resolved alerts older than 1 hour
    const alertCutoff = Date.now() - 3600000;
    for (const [alertId, alert] of this.alerts) {
      if (alert.resolved && alert.timestamp.getTime() < alertCutoff) {
        this.alerts.delete(alertId);
      }
    }
  }

  /**
   * Reset hourly statistics
   */
  private resetHourlyStats(): void {
    for (const perf of this.modelPerformance.values()) {
      perf.lastHour = {
        requests: 0,
        errors: 0,
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: Number.MAX_VALUE,
        cost: 0
      };
    }
  }

  /**
   * Destroy monitor and cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.removeAllListeners();
    this.logger.info('Performance monitor destroyed');
  }
}