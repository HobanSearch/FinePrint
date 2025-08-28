import { createServiceLogger } from '@fineprintai/shared-logger';
import { cache } from '@fineprintai/shared-cache';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('metrics-service');

export interface MetricValue {
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface Counter {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface Gauge {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export interface Histogram {
  name: string;
  buckets: Record<string, number>;
  count: number;
  sum: number;
  labels: Record<string, string>;
}

export interface MetricsSnapshot {
  timestamp: Date;
  counters: Counter[];
  gauges: Gauge[];
  histograms: Histogram[];
  uptime: number;
  memory: NodeJS.MemoryUsage;
}

export class MetricsService {
  private counters = new Map<string, number>();
  private counterLabels = new Map<string, Record<string, string>>();
  private gauges = new Map<string, number>();
  private gaugeLabels = new Map<string, Record<string, string>>();
  private histograms = new Map<string, number[]>();
  private histogramLabels = new Map<string, Record<string, string>>();
  private initialized = false;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {}

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load persisted metrics
      await this.loadPersistedMetrics();

      // Start metrics collection
      this.startMetricsCollection();

      // Setup cleanup job
      this.startCleanupJob();

      this.initialized = true;
      logger.info('Metrics service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize metrics service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Stop metrics collection
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      }

      // Persist current metrics
      await this.persistMetrics();

      // Clear all metrics
      this.counters.clear();
      this.counterLabels.clear();
      this.gauges.clear();
      this.gaugeLabels.clear();
      this.histograms.clear();
      this.histogramLabels.clear();

      this.initialized = false;
      logger.info('Metrics service shut down successfully');
    } catch (error) {
      logger.error('Error during metrics service shutdown', { error });
    }
  }

  // Counter methods
  public incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    try {
      const key = this.generateMetricKey(name, labels);
      const current = this.counters.get(key) || 0;
      this.counters.set(key, current + value);
      this.counterLabels.set(key, labels);

      // Also update in cache for persistence
      this.updateCachedMetric('counter', key, current + value, labels);
    } catch (error) {
      logger.error('Error incrementing counter', { error, name, labels, value });
    }
  }

  public getCounter(name: string, labels: Record<string, string> = {}): number {
    const key = this.generateMetricKey(name, labels);
    return this.counters.get(key) || 0;
  }

  public resetCounter(name: string, labels: Record<string, string> = {}): void {
    const key = this.generateMetricKey(name, labels);
    this.counters.set(key, 0);
    this.updateCachedMetric('counter', key, 0, labels);
  }

  // Gauge methods
  public recordGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    try {
      const key = this.generateMetricKey(name, labels);
      this.gauges.set(key, value);
      this.gaugeLabels.set(key, labels);

      // Update in cache
      this.updateCachedMetric('gauge', key, value, labels);
    } catch (error) {
      logger.error('Error recording gauge', { error, name, value, labels });
    }
  }

  public getGauge(name: string, labels: Record<string, string> = {}): number {
    const key = this.generateMetricKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  public incrementGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.generateMetricKey(name, labels);
    const current = this.gauges.get(key) || 0;
    this.recordGauge(name, current + value, labels);
  }

  public decrementGauge(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const key = this.generateMetricKey(name, labels);
    const current = this.gauges.get(key) || 0;
    this.recordGauge(name, current - value, labels);
  }

  // Histogram methods
  public recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    try {
      const key = this.generateMetricKey(name, labels);
      const values = this.histograms.get(key) || [];
      values.push(value);
      
      // Keep only last 1000 values to prevent memory issues
      if (values.length > 1000) {
        values.shift();
      }
      
      this.histograms.set(key, values);
      this.histogramLabels.set(key, labels);
    } catch (error) {
      logger.error('Error recording histogram', { error, name, value, labels });
    }
  }

  public getHistogramStats(name: string, labels: Record<string, string> = {}): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const key = this.generateMetricKey(name, labels);
    const values = this.histograms.get(key) || [];
    
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    
    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  // WebSocket specific metrics
  public recordConnectionEvent(event: 'connect' | 'disconnect', userId?: string, teamId?: string): void {
    const labels: Record<string, string> = { event };
    if (teamId) labels.teamId = teamId;

    this.incrementCounter('websocket_connection_events_total', labels);

    if (event === 'connect') {
      this.incrementGauge('websocket_active_connections');
      if (userId) {
        this.recordGauge(`websocket_user_connections_${userId}`, 1);
      }
    } else {
      this.decrementGauge('websocket_active_connections');
      if (userId) {
        this.recordGauge(`websocket_user_connections_${userId}`, 0);
      }
    }
  }

  public recordMessageEvent(
    type: 'sent' | 'received' | 'queued' | 'failed',
    messageType: string,
    userId?: string,
    teamId?: string
  ): void {
    const labels: Record<string, string> = { type, messageType };
    if (teamId) labels.teamId = teamId;

    this.incrementCounter('websocket_messages_total', labels);

    // Record timing for message processing
    if (type === 'sent' || type === 'failed') {
      const processingTime = Date.now(); // This would be actual timing in real implementation
      this.recordHistogram('websocket_message_processing_duration_ms', processingTime, { messageType });
    }
  }

  public recordAuthEvent(event: 'success' | 'failure', reason?: string): void {
    const labels: Record<string, string> = { event };
    if (reason) labels.reason = reason;

    this.incrementCounter('websocket_auth_events_total', labels);
  }

  public recordRateLimitEvent(rule: string, action: 'allowed' | 'blocked'): void {
    this.incrementCounter('websocket_rate_limit_events_total', { rule, action });
  }

  public recordQueueStats(queueName: string, stats: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }): void {
    const labels = { queue: queueName };
    
    this.recordGauge('websocket_queue_waiting_jobs', stats.waiting, labels);
    this.recordGauge('websocket_queue_active_jobs', stats.active, labels);
    this.recordGauge('websocket_queue_completed_jobs', stats.completed, labels);
    this.recordGauge('websocket_queue_failed_jobs', stats.failed, labels);
  }

  // System metrics
  public recordSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.recordGauge('websocket_memory_heap_used_bytes', memUsage.heapUsed);
    this.recordGauge('websocket_memory_heap_total_bytes', memUsage.heapTotal);
    this.recordGauge('websocket_memory_external_bytes', memUsage.external);
    this.recordGauge('websocket_memory_rss_bytes', memUsage.rss);
    this.recordGauge('websocket_uptime_seconds', process.uptime());

    // CPU usage (simplified - would use more sophisticated monitoring in production)
    const cpuUsage = process.cpuUsage();
    this.recordGauge('websocket_cpu_user_microseconds', cpuUsage.user);
    this.recordGauge('websocket_cpu_system_microseconds', cpuUsage.system);
  }

  public getMetricsSnapshot(): MetricsSnapshot {
    const counters: Counter[] = [];
    const gauges: Gauge[] = [];
    const histograms: Histogram[] = [];

    // Collect counters
    for (const [key, value] of this.counters) {
      const labels = this.counterLabels.get(key) || {};
      const name = this.extractMetricName(key);
      counters.push({ name, value, labels });
    }

    // Collect gauges
    for (const [key, value] of this.gauges) {
      const labels = this.gaugeLabels.get(key) || {};
      const name = this.extractMetricName(key);
      gauges.push({ name, value, labels });
    }

    // Collect histograms
    for (const [key, values] of this.histograms) {
      const labels = this.histogramLabels.get(key) || {};
      const name = this.extractMetricName(key);
      const stats = this.getHistogramStats(name, labels);
      
      histograms.push({
        name,
        buckets: {
          '0.1': values.filter(v => v <= 100).length,
          '0.5': values.filter(v => v <= 500).length,
          '1': values.filter(v => v <= 1000).length,
          '5': values.filter(v => v <= 5000).length,
          '10': values.filter(v => v <= 10000).length,
          '+Inf': values.length,
        },
        count: stats.count,
        sum: stats.sum,
        labels,
      });
    }

    return {
      timestamp: new Date(),
      counters,
      gauges,
      histograms,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  public getPrometheusMetrics(): string {
    const snapshot = this.getMetricsSnapshot();
    let output = '';

    // Counters
    for (const counter of snapshot.counters) {
      output += `# HELP ${counter.name} Counter metric\n`;
      output += `# TYPE ${counter.name} counter\n`;
      const labelsStr = this.formatLabels(counter.labels);
      output += `${counter.name}${labelsStr} ${counter.value}\n`;
    }

    // Gauges
    for (const gauge of snapshot.gauges) {
      output += `# HELP ${gauge.name} Gauge metric\n`;
      output += `# TYPE ${gauge.name} gauge\n`;
      const labelsStr = this.formatLabels(gauge.labels);
      output += `${gauge.name}${labelsStr} ${gauge.value}\n`;
    }

    // Histograms
    for (const histogram of snapshot.histograms) {
      output += `# HELP ${histogram.name} Histogram metric\n`;
      output += `# TYPE ${histogram.name} histogram\n`;
      const labelsStr = this.formatLabels(histogram.labels);
      
      // Buckets
      for (const [bucket, count] of Object.entries(histogram.buckets)) {
        const bucketLabels = { ...histogram.labels, le: bucket };
        const bucketLabelsStr = this.formatLabels(bucketLabels);
        output += `${histogram.name}_bucket${bucketLabelsStr} ${count}\n`;
      }
      
      // Count and sum
      output += `${histogram.name}_count${labelsStr} ${histogram.count}\n`;
      output += `${histogram.name}_sum${labelsStr} ${histogram.sum}\n`;
    }

    return output;
  }

  public async getHealthStatus(): Promise<{ healthy: boolean; details?: any }> {
    try {
      return {
        healthy: this.initialized,
        details: {
          initialized: this.initialized,
          countersCount: this.counters.size,
          gaugesCount: this.gauges.size,
          histogramsCount: this.histograms.size,
        },
      };
    } catch (error) {
      logger.error('Error getting metrics health status', { error });
      return { healthy: false };
    }
  }

  // Private methods

  private generateMetricKey(name: string, labels: Record<string, string>): string {
    const labelKeys = Object.keys(labels).sort();
    const labelString = labelKeys.map(key => `${key}=${labels[key]}`).join(',');
    return labelString ? `${name}{${labelString}}` : name;
  }

  private extractMetricName(key: string): string {
    const braceIndex = key.indexOf('{');
    return braceIndex > -1 ? key.substring(0, braceIndex) : key;
  }

  private formatLabels(labels: Record<string, string>): string {
    const keys = Object.keys(labels);
    if (keys.length === 0) return '';
    
    const pairs = keys.map(key => `${key}="${labels[key]}"`);
    return `{${pairs.join(',')}}`;
  }

  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = (sortedArray.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  private async updateCachedMetric(
    type: 'counter' | 'gauge' | 'histogram',
    key: string,
    value: number | number[],
    labels: Record<string, string>
  ): Promise<void> {
    try {
      const cacheKey = `metrics:${type}:${key}`;
      await cache.set(cacheKey, { value, labels, timestamp: new Date() }, 3600); // 1 hour TTL
    } catch (error) {
      logger.error('Error updating cached metric', { error, type, key });
    }
  }

  private async loadPersistedMetrics(): Promise<void> {
    try {
      // Load counters
      const counterKeys = await cache.keys('metrics:counter:*');
      for (const cacheKey of counterKeys) {
        const data = await cache.get(cacheKey);
        if (data) {
          const key = cacheKey.replace('metrics:counter:', '');
          this.counters.set(key, data.value);
          this.counterLabels.set(key, data.labels);
        }
      }

      // Load gauges
      const gaugeKeys = await cache.keys('metrics:gauge:*');
      for (const cacheKey of gaugeKeys) {
        const data = await cache.get(cacheKey);
        if (data) {
          const key = cacheKey.replace('metrics:gauge:', '');
          this.gauges.set(key, data.value);
          this.gaugeLabels.set(key, data.labels);
        }
      }

      logger.debug('Persisted metrics loaded', {
        counters: this.counters.size,
        gauges: this.gauges.size,
      });
    } catch (error) {
      logger.error('Error loading persisted metrics', { error });
    }
  }

  private async persistMetrics(): Promise<void> {
    try {
      // This is handled by updateCachedMetric calls, but we could batch persist here
      logger.debug('Metrics persisted to cache');
    } catch (error) {
      logger.error('Error persisting metrics', { error });
    }
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.recordSystemMetrics();
    }, 30000);

    logger.info('Metrics collection started');
  }

  private startCleanupJob(): void {
    // Clean up old metric data every hour
    setInterval(async () => {
      try {
        await this.cleanupOldMetrics();
      } catch (error) {
        logger.error('Error in metrics cleanup job', { error });
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private async cleanupOldMetrics(): Promise<void> {
    try {
      // Remove old cached metrics
      const keys = await cache.keys('metrics:*');
      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await cache.ttl(key);
        if (ttl <= 0) {
          await cache.del(key);
          cleanedCount++;
        }
      }

      // Trim histogram data
      for (const [key, values] of this.histograms) {
        if (values.length > 1000) {
          this.histograms.set(key, values.slice(-1000));
        }
      }

      if (cleanedCount > 0) {
        logger.info('Metrics cleanup completed', { cleanedKeys: cleanedCount });
      }
    } catch (error) {
      logger.error('Error during metrics cleanup', { error });
    }
  }
}