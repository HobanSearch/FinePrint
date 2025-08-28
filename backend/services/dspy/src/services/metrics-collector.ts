import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { z } from 'zod';

const logger = createServiceLogger('metrics-collector');

// Metrics Schema
export const DSPyMetricEntry = z.object({
  timestamp: z.string(),
  module_name: z.string(),
  module_version: z.string(),
  operation: z.enum(['predict', 'compile', 'optimize']),
  input_size: z.number(),
  output_size: z.number(),
  latency_ms: z.number(),
  success: z.boolean(),
  error_type: z.string().optional(),
  accuracy_score: z.number().min(0).max(1).optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  token_usage: z.number().optional(),
  model_used: z.string().optional(),
  optimization_type: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type DSPyMetricEntryType = z.infer<typeof DSPyMetricEntry>;

// Aggregated Metrics
export interface MetricsSummary {
  total_operations: number;
  success_rate: number;
  average_latency_ms: number;
  average_accuracy: number;
  average_confidence: number;
  total_token_usage: number;
  operations_by_type: Record<string, number>;
  modules_by_usage: Record<string, number>;
  error_distribution: Record<string, number>;
  performance_trends: {
    hourly: MetricDataPoint[];
    daily: MetricDataPoint[];
    weekly: MetricDataPoint[];
  };
}

export interface MetricDataPoint {
  timestamp: string;
  operations: number;
  success_rate: number;
  average_latency: number;
  average_accuracy: number;
}

// Performance Alerts
export interface PerformanceAlert {
  id: string;
  type: 'latency_spike' | 'accuracy_drop' | 'error_rate_high' | 'token_usage_high';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  threshold: number;
  current_value: number;
  module_name?: string;
  timestamp: string;
  resolved: boolean;
}

export class MetricsCollector {
  private cache: CacheService;
  private metrics: DSPyMetricEntryType[] = [];
  private alerts: PerformanceAlert[] = [];
  private thresholds = {
    latency_ms: 5000, // 5 seconds
    error_rate: 0.1, // 10%
    accuracy_drop: 0.2, // 20% drop
    token_usage_per_request: 10000,
  };

  constructor() {
    this.cache = new CacheService();
    this.initializeMetricsCollection();
  }

  private async initializeMetricsCollection(): Promise<void> {
    try {
      // Load existing metrics from cache
      await this.loadMetricsFromCache();
      
      // Set up periodic cleanup and aggregation
      setInterval(() => this.performHousekeeping(), 60000); // Every minute
      setInterval(() => this.checkPerformanceAlerts(), 30000); // Every 30 seconds
      
      logger.info('Metrics collector initialized', {
        existingMetrics: this.metrics.length,
        thresholds: this.thresholds,
      });
    } catch (error) {
      logger.error('Failed to initialize metrics collector', { error });
    }
  }

  async recordMetric(metric: Omit<DSPyMetricEntryType, 'timestamp'>): Promise<void> {
    try {
      // Add timestamp and validate
      const timestampedMetric: DSPyMetricEntryType = {
        ...metric,
        timestamp: new Date().toISOString(),
      };

      const validatedMetric = DSPyMetricEntry.parse(timestampedMetric);
      
      // Store in memory
      this.metrics.push(validatedMetric);
      
      // Ensure we don't store too many metrics in memory (keep last 10,000)
      if (this.metrics.length > 10000) {
        this.metrics = this.metrics.slice(-10000);
      }

      // Cache the metric
      await this.cacheMetric(validatedMetric);
      
      // Update real-time aggregations
      await this.updateRealTimeMetrics(validatedMetric);

      logger.debug('DSPy metric recorded', {
        module: validatedMetric.module_name,
        operation: validatedMetric.operation,
        latency: validatedMetric.latency_ms,
        success: validatedMetric.success,
      });

    } catch (error) {
      logger.error('Failed to record DSPy metric', { error, metric });
    }
  }

  private async cacheMetric(metric: DSPyMetricEntryType): Promise<void> {
    const cacheKey = `dspy_metric:${Date.now()}:${Math.random().toString(36).substr(2, 5)}`;
    await this.cache.set(cacheKey, JSON.stringify(metric), 86400); // 24 hours
  }

  private async loadMetricsFromCache(): Promise<void> {
    try {
      // In a real implementation, we would load from Redis or persistent storage
      // For now, we'll start with empty metrics
      logger.debug('Metrics loaded from cache', { count: this.metrics.length });
    } catch (error) {
      logger.warn('Failed to load metrics from cache', { error });
    }
  }

  private async updateRealTimeMetrics(metric: DSPyMetricEntryType): Promise<void> {
    const hour = new Date().toISOString().substr(0, 13); // YYYY-MM-DDTHH
    const cacheKey = `dspy_realtime:${hour}`;
    
    try {
      // Get existing hourly metrics
      const existing = await this.cache.get(cacheKey);
      let hourlyData = existing ? JSON.parse(existing) : {
        operations: 0,
        successes: 0,
        total_latency: 0,
        total_accuracy: 0,
        accuracy_count: 0,
      };

      // Update with new metric
      hourlyData.operations += 1;
      if (metric.success) hourlyData.successes += 1;
      hourlyData.total_latency += metric.latency_ms;
      
      if (metric.accuracy_score !== undefined) {
        hourlyData.total_accuracy += metric.accuracy_score;
        hourlyData.accuracy_count += 1;
      }

      // Cache updated data
      await this.cache.set(cacheKey, JSON.stringify(hourlyData), 3600); // 1 hour
    } catch (error) {
      logger.warn('Failed to update real-time metrics', { error });
    }
  }

  async getMetricsSummary(timeRange?: {
    start: string;
    end: string;
  }): Promise<MetricsSummary> {
    try {
      let metricsToAnalyze = this.metrics;

      // Filter by time range if provided
      if (timeRange) {
        const startTime = new Date(timeRange.start);
        const endTime = new Date(timeRange.end);
        
        metricsToAnalyze = this.metrics.filter(m => {
          const metricTime = new Date(m.timestamp);
          return metricTime >= startTime && metricTime <= endTime;
        });
      }

      if (metricsToAnalyze.length === 0) {
        return this.getEmptyMetricsSummary();
      }

      // Calculate aggregations
      const totalOperations = metricsToAnalyze.length;
      const successfulOperations = metricsToAnalyze.filter(m => m.success).length;
      const successRate = successfulOperations / totalOperations;

      // Average latency
      const totalLatency = metricsToAnalyze.reduce((sum, m) => sum + m.latency_ms, 0);
      const averageLatency = totalLatency / totalOperations;

      // Average accuracy (only from operations that have accuracy scores)
      const accuracyMetrics = metricsToAnalyze.filter(m => m.accuracy_score !== undefined);
      const averageAccuracy = accuracyMetrics.length > 0
        ? accuracyMetrics.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / accuracyMetrics.length
        : 0;

      // Average confidence
      const confidenceMetrics = metricsToAnalyze.filter(m => m.confidence_score !== undefined);
      const averageConfidence = confidenceMetrics.length > 0
        ? confidenceMetrics.reduce((sum, m) => sum + (m.confidence_score || 0), 0) / confidenceMetrics.length
        : 0;

      // Total token usage
      const totalTokenUsage = metricsToAnalyze.reduce((sum, m) => sum + (m.token_usage || 0), 0);

      // Operations by type
      const operationsByType: Record<string, number> = {};
      metricsToAnalyze.forEach(m => {
        operationsByType[m.operation] = (operationsByType[m.operation] || 0) + 1;
      });

      // Modules by usage
      const modulesByUsage: Record<string, number> = {};
      metricsToAnalyze.forEach(m => {
        modulesByUsage[m.module_name] = (modulesByUsage[m.module_name] || 0) + 1;
      });

      // Error distribution
      const errorDistribution: Record<string, number> = {};
      metricsToAnalyze.filter(m => !m.success && m.error_type).forEach(m => {
        const errorType = m.error_type || 'unknown';
        errorDistribution[errorType] = (errorDistribution[errorType] || 0) + 1;
      });

      // Performance trends
      const performanceTrends = await this.calculatePerformanceTrends(metricsToAnalyze);

      return {
        total_operations: totalOperations,
        success_rate: successRate,
        average_latency_ms: averageLatency,
        average_accuracy: averageAccuracy,
        average_confidence: averageConfidence,
        total_token_usage: totalTokenUsage,
        operations_by_type: operationsByType,
        modules_by_usage: modulesByUsage,
        error_distribution: errorDistribution,
        performance_trends: performanceTrends,
      };

    } catch (error) {
      logger.error('Failed to generate metrics summary', { error });
      return this.getEmptyMetricsSummary();
    }
  }

  private getEmptyMetricsSummary(): MetricsSummary {
    return {
      total_operations: 0,
      success_rate: 0,
      average_latency_ms: 0,
      average_accuracy: 0,
      average_confidence: 0,
      total_token_usage: 0,
      operations_by_type: {},
      modules_by_usage: {},
      error_distribution: {},
      performance_trends: {
        hourly: [],
        daily: [],
        weekly: [],
      },
    };
  }

  private async calculatePerformanceTrends(metrics: DSPyMetricEntryType[]): Promise<{
    hourly: MetricDataPoint[];
    daily: MetricDataPoint[];
    weekly: MetricDataPoint[];
  }> {
    // Group metrics by time periods
    const hourlyGroups = this.groupMetricsByHour(metrics);
    const dailyGroups = this.groupMetricsByDay(metrics);
    const weeklyGroups = this.groupMetricsByWeek(metrics);

    return {
      hourly: this.calculateDataPoints(hourlyGroups),
      daily: this.calculateDataPoints(dailyGroups),
      weekly: this.calculateDataPoints(weeklyGroups),
    };
  }

  private groupMetricsByHour(metrics: DSPyMetricEntryType[]): Map<string, DSPyMetricEntryType[]> {
    const groups = new Map<string, DSPyMetricEntryType[]>();
    
    metrics.forEach(metric => {
      const hour = metric.timestamp.substr(0, 13); // YYYY-MM-DDTHH
      if (!groups.has(hour)) {
        groups.set(hour, []);
      }
      groups.get(hour)!.push(metric);
    });

    return groups;
  }

  private groupMetricsByDay(metrics: DSPyMetricEntryType[]): Map<string, DSPyMetricEntryType[]> {
    const groups = new Map<string, DSPyMetricEntryType[]>();
    
    metrics.forEach(metric => {
      const day = metric.timestamp.substr(0, 10); // YYYY-MM-DD
      if (!groups.has(day)) {
        groups.set(day, []);
      }
      groups.get(day)!.push(metric);
    });

    return groups;
  }

  private groupMetricsByWeek(metrics: DSPyMetricEntryType[]): Map<string, DSPyMetricEntryType[]> {
    const groups = new Map<string, DSPyMetricEntryType[]>();
    
    metrics.forEach(metric => {
      const date = new Date(metric.timestamp);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().substr(0, 10);
      
      if (!groups.has(weekKey)) {
        groups.set(weekKey, []);
      }
      groups.get(weekKey)!.push(metric);
    });

    return groups;
  }

  private calculateDataPoints(groups: Map<string, DSPyMetricEntryType[]>): MetricDataPoint[] {
    const dataPoints: MetricDataPoint[] = [];

    groups.forEach((metrics, timestamp) => {
      const operations = metrics.length;
      const successes = metrics.filter(m => m.success).length;
      const successRate = operations > 0 ? successes / operations : 0;
      
      const totalLatency = metrics.reduce((sum, m) => sum + m.latency_ms, 0);
      const averageLatency = operations > 0 ? totalLatency / operations : 0;
      
      const accuracyMetrics = metrics.filter(m => m.accuracy_score !== undefined);
      const averageAccuracy = accuracyMetrics.length > 0
        ? accuracyMetrics.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / accuracyMetrics.length
        : 0;

      dataPoints.push({
        timestamp,
        operations,
        success_rate: successRate,
        average_latency: averageLatency,
        average_accuracy: averageAccuracy,
      });
    });

    return dataPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private async checkPerformanceAlerts(): Promise<void> {
    try {
      const recentMetrics = this.getRecentMetrics(300000); // Last 5 minutes
      
      if (recentMetrics.length === 0) return;

      // Check latency alerts
      await this.checkLatencyAlerts(recentMetrics);
      
      // Check error rate alerts
      await this.checkErrorRateAlerts(recentMetrics);
      
      // Check accuracy alerts
      await this.checkAccuracyAlerts(recentMetrics);
      
      // Check token usage alerts
      await this.checkTokenUsageAlerts(recentMetrics);

    } catch (error) {
      logger.error('Failed to check performance alerts', { error });
    }
  }

  private getRecentMetrics(durationMs: number): DSPyMetricEntryType[] {
    const cutoffTime = new Date(Date.now() - durationMs);
    return this.metrics.filter(m => new Date(m.timestamp) >= cutoffTime);
  }

  private async checkLatencyAlerts(metrics: DSPyMetricEntryType[]): Promise<void> {
    const averageLatency = metrics.reduce((sum, m) => sum + m.latency_ms, 0) / metrics.length;
    
    if (averageLatency > this.thresholds.latency_ms) {
      await this.createAlert({
        type: 'latency_spike',
        severity: averageLatency > this.thresholds.latency_ms * 2 ? 'high' : 'medium',
        message: `Average latency is ${averageLatency.toFixed(0)}ms, above threshold of ${this.thresholds.latency_ms}ms`,
        threshold: this.thresholds.latency_ms,
        current_value: averageLatency,
      });
    }
  }

  private async checkErrorRateAlerts(metrics: DSPyMetricEntryType[]): Promise<void> {
    const errorRate = 1 - (metrics.filter(m => m.success).length / metrics.length);
    
    if (errorRate > this.thresholds.error_rate) {
      await this.createAlert({
        type: 'error_rate_high',
        severity: errorRate > this.thresholds.error_rate * 2 ? 'critical' : 'high',
        message: `Error rate is ${(errorRate * 100).toFixed(1)}%, above threshold of ${(this.thresholds.error_rate * 100).toFixed(1)}%`,
        threshold: this.thresholds.error_rate,
        current_value: errorRate,
      });
    }
  }

  private async checkAccuracyAlerts(metrics: DSPyMetricEntryType[]): Promise<void> {
    const accuracyMetrics = metrics.filter(m => m.accuracy_score !== undefined);
    if (accuracyMetrics.length === 0) return;

    const currentAccuracy = accuracyMetrics.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / accuracyMetrics.length;
    
    // Compare with historical accuracy (simplified - in reality, we'd use a rolling baseline)
    const historicalAccuracy = 0.85; // Assumed baseline
    const accuracyDrop = (historicalAccuracy - currentAccuracy) / historicalAccuracy;
    
    if (accuracyDrop > this.thresholds.accuracy_drop) {
      await this.createAlert({
        type: 'accuracy_drop',
        severity: accuracyDrop > this.thresholds.accuracy_drop * 2 ? 'critical' : 'high',
        message: `Accuracy dropped by ${(accuracyDrop * 100).toFixed(1)}%, current: ${(currentAccuracy * 100).toFixed(1)}%`,
        threshold: this.thresholds.accuracy_drop,
        current_value: accuracyDrop,
      });
    }
  }

  private async checkTokenUsageAlerts(metrics: DSPyMetricEntryType[]): Promise<void> {
    const tokenMetrics = metrics.filter(m => m.token_usage !== undefined);
    if (tokenMetrics.length === 0) return;

    const averageTokenUsage = tokenMetrics.reduce((sum, m) => sum + (m.token_usage || 0), 0) / tokenMetrics.length;
    
    if (averageTokenUsage > this.thresholds.token_usage_per_request) {
      await this.createAlert({
        type: 'token_usage_high',
        severity: averageTokenUsage > this.thresholds.token_usage_per_request * 2 ? 'high' : 'medium',
        message: `Average token usage is ${averageTokenUsage.toFixed(0)} tokens per request, above threshold of ${this.thresholds.token_usage_per_request}`,
        threshold: this.thresholds.token_usage_per_request,
        current_value: averageTokenUsage,
      });
    }
  }

  private async createAlert(alertData: Omit<PerformanceAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alert: PerformanceAlert = {
      ...alertData,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      resolved: false,
    };

    // Check if similar alert already exists and is not resolved
    const existingAlert = this.alerts.find(a => 
      a.type === alert.type && 
      a.module_name === alert.module_name && 
      !a.resolved &&
      (Date.now() - new Date(a.timestamp).getTime()) < 600000 // Within 10 minutes
    );

    if (!existingAlert) {
      this.alerts.push(alert);
      
      // Keep only recent alerts (last 1000)
      if (this.alerts.length > 1000) {
        this.alerts = this.alerts.slice(-1000);
      }

      logger.warn('DSPy performance alert created', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      });

      // Cache alert for external monitoring systems
      await this.cache.set(`dspy_alert:${alert.id}`, JSON.stringify(alert), 86400);
    }
  }

  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  getAllAlerts(limit: number = 100): PerformanceAlert[] {
    return this.alerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    
    // Update cache
    await this.cache.set(`dspy_alert:${alertId}`, JSON.stringify(alert), 86400);
    
    logger.info('DSPy alert resolved', { alertId, type: alert.type });
    return true;
  }

  private async performHousekeeping(): Promise<void> {
    try {
      // Clean up old metrics (keep only last 24 hours in memory)
      const cutoffTime = new Date(Date.now() - 86400000); // 24 hours ago
      const initialCount = this.metrics.length;
      this.metrics = this.metrics.filter(m => new Date(m.timestamp) >= cutoffTime);
      
      if (this.metrics.length < initialCount) {
        logger.debug('Cleaned up old metrics', {
          removed: initialCount - this.metrics.length,
          remaining: this.metrics.length,
        });
      }

      // Clean up old resolved alerts (keep only last 7 days)
      const alertCutoffTime = new Date(Date.now() - 604800000); // 7 days ago
      const initialAlertCount = this.alerts.length;
      this.alerts = this.alerts.filter(a => 
        !a.resolved || new Date(a.timestamp) >= alertCutoffTime
      );

      if (this.alerts.length < initialAlertCount) {
        logger.debug('Cleaned up old alerts', {
          removed: initialAlertCount - this.alerts.length,
          remaining: this.alerts.length,
        });
      }

    } catch (error) {
      logger.error('Housekeeping failed', { error });
    }
  }

  updateThresholds(newThresholds: Partial<typeof MetricsCollector.prototype.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Performance thresholds updated', { thresholds: this.thresholds });
  }

  getThresholds(): typeof MetricsCollector.prototype.thresholds {
    return { ...this.thresholds };
  }
}