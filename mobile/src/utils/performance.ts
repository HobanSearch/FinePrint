/**
 * Performance Monitor
 * Tracks app performance metrics and provides insights
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PerformanceStats {
  name: string;
  count: number;
  average: number;
  min: number;
  max: number;
  total: number;
  lastRecorded: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 500;
  private storageKey = 'fine_print_performance';
  private timers: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  /**
   * End timing an operation and record the metric
   */
  endTimer(name: string, metadata?: Record<string, any>): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      logger.warn(`Timer ${name} was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(name);
    this.recordMetric(name, duration, metadata);
    
    return duration;
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.metrics.push(metric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log significant performance issues
    if (this.isSignificantMetric(name, value)) {
      logger.warn(`Performance concern: ${name} took ${value}ms`, metadata);
    }

    // Persist metrics periodically
    if (this.metrics.length % 50 === 0) {
      this.persistMetrics().catch(error => {
        logger.error('Failed to persist performance metrics:', error);
      });
    }
  }

  /**
   * Get performance statistics for a metric
   */
  getStats(name: string): PerformanceStats | null {
    const metricData = this.metrics.filter(m => m.name === name);
    if (metricData.length === 0) {
      return null;
    }

    const values = metricData.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      name,
      count: metricData.length,
      average: sum / metricData.length,
      min: Math.min(...values),
      max: Math.max(...values),
      total: sum,
      lastRecorded: metricData[metricData.length - 1].timestamp,
    };
  }

  /**
   * Get all available metrics
   */
  getAllStats(): PerformanceStats[] {
    const metricNames = [...new Set(this.metrics.map(m => m.name))];
    return metricNames
      .map(name => this.getStats(name))
      .filter((stat): stat is PerformanceStats => stat !== null);
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(minutes: number = 5): PerformanceMetric[] {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    return this.metrics.filter(m => new Date(m.timestamp) > cutoffTime);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.persistMetrics().catch(error => {
      logger.error('Failed to clear persisted metrics:', error);
    });
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    summary: {
      totalMetrics: number;
      timeRange: {
        start: string;
        end: string;
      };
    };
    stats: PerformanceStats[];
    issues: Array<{
      metric: string;
      issue: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  } {
    const stats = this.getAllStats();
    const issues = this.identifyPerformanceIssues(stats);

    return {
      summary: {
        totalMetrics: this.metrics.length,
        timeRange: {
          start: this.metrics[0]?.timestamp || '',
          end: this.metrics[this.metrics.length - 1]?.timestamp || '',
        },
      },
      stats,
      issues,
    };
  }

  /**
   * Measure React component render time
   */
  measureRender<T extends (...args: any[]) => any>(
    componentName: string,
    renderFunction: T
  ): T {
    return ((...args: any[]) => {
      this.startTimer(`render_${componentName}`);
      const result = renderFunction(...args);
      this.endTimer(`render_${componentName}`, { component: componentName });
      return result;
    }) as T;
  }

  /**
   * Measure async operation
   */
  async measureAsync<T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.startTimer(operationName);
    try {
      const result = await operation();
      this.endTimer(operationName, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.endTimer(operationName, { ...metadata, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Track memory usage
   */
  trackMemoryUsage(context: string): void {
    if (global.performance && global.performance.memory) {
      const memory = global.performance.memory;
      this.recordMetric('memory_used', memory.usedJSHeapSize, {
        context,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      });
    }
  }

  /**
   * Initialize performance monitoring
   */
  async initialize(): Promise<void> {
    try {
      await this.loadPersistedMetrics();
      logger.info('Performance monitor initialized');
    } catch (error) {
      logger.error('Failed to initialize performance monitor:', error);
    }
  }

  /**
   * Load persisted metrics
   */
  private async loadPersistedMetrics(): Promise<void> {
    try {
      const metricsString = await AsyncStorage.getItem(this.storageKey);
      if (metricsString) {
        this.metrics = JSON.parse(metricsString);
      }
    } catch (error) {
      logger.error('Failed to load persisted metrics:', error);
    }
  }

  /**
   * Persist metrics to storage
   */
  private async persistMetrics(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(this.metrics));
    } catch (error) {
      logger.error('Failed to persist metrics:', error);
    }
  }

  /**
   * Check if a metric value is significant (potentially problematic)
   */
  private isSignificantMetric(name: string, value: number): boolean {
    const thresholds: Record<string, number> = {
      // OCR processing should be under 5 seconds
      ocr_processing_time: 5000,
      // Camera operations should be under 2 seconds
      camera_capture: 2000,
      // Document processing should be under 3 seconds
      document_processing: 3000,
      // API calls should be under 10 seconds
      api_call: 10000,
      // App startup should be under 2 seconds
      app_startup: 2000,
      // Component renders should be under 16ms (60fps)
      render_: 16,
    };

    for (const [key, threshold] of Object.entries(thresholds)) {
      if (name.startsWith(key) && value > threshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Identify performance issues from stats
   */
  private identifyPerformanceIssues(
    stats: PerformanceStats[]
  ): Array<{
    metric: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }> {
    const issues: Array<{
      metric: string;
      issue: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    stats.forEach(stat => {
      // Check for slow operations
      if (stat.average > 3000) {
        issues.push({
          metric: stat.name,
          issue: `Average execution time is ${stat.average.toFixed(0)}ms`,
          severity: stat.average > 5000 ? 'high' : 'medium',
        });
      }

      // Check for high variance
      const variance = stat.max - stat.min;
      if (variance > stat.average * 2) {
        issues.push({
          metric: stat.name,
          issue: `High variance detected (${variance.toFixed(0)}ms range)`,
          severity: 'low',
        });
      }

      // Check for render performance issues
      if (stat.name.startsWith('render_') && stat.average > 16) {
        issues.push({
          metric: stat.name,
          issue: `Component render time exceeds 16ms target (${stat.average.toFixed(1)}ms)`,
          severity: stat.average > 32 ? 'high' : 'medium',
        });
      }
    });

    return issues;
  }
}

export const performanceMonitor = new PerformanceMonitor();