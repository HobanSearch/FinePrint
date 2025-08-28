/**
 * Fine Print AI - Analytics Data Collectors
 * 
 * Data collection system for gathering analytics from various sources:
 * - Application events
 * - System metrics
 * - User behavior
 * - API usage
 * - Error tracking
 * - Performance monitoring
 */

import { PrismaClient } from '@prisma/client';
import { config } from '@/config';
import { analyticsLogger } from '@/utils/logger';
import { productAnalyticsService } from '@/services/product-analytics';

interface DataCollector {
  name: string;
  enabled: boolean;
  interval: number;
  collect: () => Promise<void>;
}

class AnalyticsCollectorService {
  private collectors: Map<string, DataCollector> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private prisma: PrismaClient;
  private isInitialized = false;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    try {
      // Setup data collectors
      this.setupCollectors();
      
      // Start collection intervals
      this.startCollectors();
      
      this.isInitialized = true;
      analyticsLogger.event('analytics_collectors_initialized', {
        collectorCount: this.collectors.size
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'initialize_collectors' });
      throw error;
    }
  }

  private setupCollectors(): void {
    // System metrics collector
    this.collectors.set('system_metrics', {
      name: 'System Metrics',
      enabled: config.performance.enableMetrics,
      interval: config.performance.metricsInterval,
      collect: this.collectSystemMetrics.bind(this)
    });

    // User activity collector
    this.collectors.set('user_activity', {
      name: 'User Activity',
      enabled: true,
      interval: 300000, // 5 minutes
      collect: this.collectUserActivity.bind(this)
    });

    // API usage collector
    this.collectors.set('api_usage', {
      name: 'API Usage',
      enabled: true,
      interval: 300000, // 5 minutes
      collect: this.collectAPIUsage.bind(this)
    });

    // Document analysis metrics collector
    this.collectors.set('document_metrics', {
      name: 'Document Analysis Metrics',
      enabled: true,
      interval: 600000, // 10 minutes
      collect: this.collectDocumentMetrics.bind(this)
    });

    // AI model performance collector
    this.collectors.set('ai_performance', {
      name: 'AI Model Performance',
      enabled: config.aiAnalytics.enableModelPerformanceTracking,
      interval: config.aiAnalytics.modelMetricsInterval,
      collect: this.collectAIPerformance.bind(this)
    });

    // Error tracking collector
    this.collectors.set('error_tracking', {
      name: 'Error Tracking',
      enabled: true,
      interval: 300000, // 5 minutes
      collect: this.collectErrorMetrics.bind(this)
    });

    // Business KPI collector
    this.collectors.set('business_kpis', {
      name: 'Business KPIs',
      enabled: true,
      interval: 3600000, // 1 hour
      collect: this.collectBusinessKPIs.bind(this)
    });
  }

  private startCollectors(): void {
    this.collectors.forEach((collector, name) => {
      if (collector.enabled) {
        const interval = setInterval(async () => {
          try {
            await collector.collect();
            analyticsLogger.event('collector_executed', {
              collectorName: name,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            analyticsLogger.error(error as Error, {
              context: 'collector_execution',
              collectorName: name
            });
          }
        }, collector.interval);

        this.intervals.set(name, interval);
        
        // Run immediately on startup
        collector.collect().catch(error => {
          analyticsLogger.error(error as Error, {
            context: 'collector_initial_run',
            collectorName: name
          });
        });
      }
    });
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const metrics = {
        // Memory usage
        memory_used: process.memoryUsage().heapUsed,
        memory_total: process.memoryUsage().heapTotal,
        memory_external: process.memoryUsage().external,
        
        // Process metrics
        uptime: process.uptime(),
        cpu_usage: process.cpuUsage(),
        
        // Event loop lag (simplified)
        event_loop_lag: await this.measureEventLoopLag(),
        
        // Timestamp
        timestamp: new Date()
      };

      // Store metrics
      await this.storeMetrics('system', metrics);
      
      // Track performance issues
      if (metrics.memory_used > config.performance.maxMemoryUsage * 0.8) {
        await productAnalyticsService.trackEvent(
          'system',
          'High Memory Usage',
          {
            memory_used: metrics.memory_used,
            memory_total: metrics.memory_total,
            threshold_percentage: 80
          }
        );
      }
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_system_metrics' });
    }
  }

  /**
   * Collect user activity metrics
   */
  private async collectUserActivity(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Query user activity
      const userActivity = await this.prisma.$queryRaw`
        SELECT 
          COUNT(DISTINCT id) as total_users,
          COUNT(DISTINCT CASE WHEN last_login_at >= ${oneHourAgo} THEN id END) as active_users_1h,
          COUNT(DISTINCT CASE WHEN last_login_at >= ${oneDayAgo} THEN id END) as active_users_24h,
          COUNT(DISTINCT CASE WHEN created_at >= ${oneDayAgo} THEN id END) as new_users_24h,
          subscription_tier
        FROM users 
        WHERE status = 'active'
        GROUP BY subscription_tier
      ` as any[];

      // Aggregate and store metrics
      const aggregatedMetrics = {
        total_users: userActivity.reduce((sum, row) => sum + Number(row.total_users), 0),
        active_users_1h: userActivity.reduce((sum, row) => sum + Number(row.active_users_1h), 0),
        active_users_24h: userActivity.reduce((sum, row) => sum + Number(row.active_users_24h), 0),
        new_users_24h: userActivity.reduce((sum, row) => sum + Number(row.new_users_24h), 0),
        by_tier: userActivity.reduce((acc, row) => {
          acc[row.subscription_tier] = {
            total: Number(row.total_users),
            active_1h: Number(row.active_users_1h),
            active_24h: Number(row.active_users_24h),
            new_24h: Number(row.new_users_24h)
          };
          return acc;
        }, {} as Record<string, any>),
        timestamp: now
      };

      await this.storeMetrics('user_activity', aggregatedMetrics);
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_user_activity' });
    }
  }

  /**
   * Collect API usage metrics
   */
  private async collectAPIUsage(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Query API usage from the last hour
      const apiUsage = await this.prisma.$queryRaw`
        SELECT 
          endpoint,
          method,
          COUNT(*) as request_count,
          AVG(response_time_ms) as avg_response_time,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
          COUNT(CASE WHEN status_code = 200 THEN 1 END) as success_count
        FROM api_usage 
        WHERE created_at >= ${oneHourAgo}
        GROUP BY endpoint, method
        ORDER BY request_count DESC
      ` as any[];

      const metrics = {
        total_requests: apiUsage.reduce((sum, row) => sum + Number(row.request_count), 0),
        total_errors: apiUsage.reduce((sum, row) => sum + Number(row.error_count), 0),
        avg_response_time: apiUsage.reduce((sum, row) => sum + Number(row.avg_response_time), 0) / apiUsage.length,
        top_endpoints: apiUsage.slice(0, 10).map(row => ({
          endpoint: row.endpoint,
          method: row.method,
          requests: Number(row.request_count),
          avg_response_time: Number(row.avg_response_time),
          error_rate: Number(row.error_count) / Number(row.request_count)
        })),
        timestamp: now
      };

      await this.storeMetrics('api_usage', metrics);

      // Track high error rates
      if (metrics.total_requests > 0) {
        const errorRate = metrics.total_errors / metrics.total_requests;
        if (errorRate > 0.05) { // 5% error rate threshold
          await productAnalyticsService.trackEvent(
            'system',
            'High API Error Rate',
            {
              error_rate: errorRate,
              total_requests: metrics.total_requests,
              total_errors: metrics.total_errors,
              threshold: 0.05
            }
          );
        }
      }
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_api_usage' });
    }
  }

  /**
   * Collect document analysis metrics
   */
  private async collectDocumentMetrics(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Query document analysis metrics
      const docMetrics = await this.prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_analyses,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_analyses,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_analyses,
          AVG(CASE WHEN overall_risk_score IS NOT NULL THEN overall_risk_score END) as avg_risk_score,
          AVG(CASE WHEN processing_time_ms IS NOT NULL THEN processing_time_ms END) as avg_processing_time,
          model_used,
          COUNT(CASE WHEN created_at >= ${oneHourAgo} THEN 1 END) as recent_analyses
        FROM document_analyses
        WHERE created_at >= ${oneHourAgo}
        GROUP BY model_used
      ` as any[];

      const aggregatedMetrics = {
        total_analyses: docMetrics.reduce((sum, row) => sum + Number(row.total_analyses), 0),
        completed_analyses: docMetrics.reduce((sum, row) => sum + Number(row.completed_analyses), 0),
        failed_analyses: docMetrics.reduce((sum, row) => sum + Number(row.failed_analyses), 0),
        avg_risk_score: docMetrics.reduce((sum, row) => sum + (Number(row.avg_risk_score) || 0), 0) / docMetrics.length,
        avg_processing_time: docMetrics.reduce((sum, row) => sum + (Number(row.avg_processing_time) || 0), 0) / docMetrics.length,
        by_model: docMetrics.map(row => ({
          model: row.model_used,
          analyses: Number(row.total_analyses),
          success_rate: Number(row.completed_analyses) / Number(row.total_analyses),
          avg_processing_time: Number(row.avg_processing_time)
        })),
        timestamp: now
      };

      await this.storeMetrics('document_analysis', aggregatedMetrics);

      // Track analysis failures
      if (aggregatedMetrics.total_analyses > 0) {
        const failureRate = aggregatedMetrics.failed_analyses / aggregatedMetrics.total_analyses;
        if (failureRate > 0.1) { // 10% failure rate threshold
          await productAnalyticsService.trackEvent(
            'system',
            'High Analysis Failure Rate',
            {
              failure_rate: failureRate,
              total_analyses: aggregatedMetrics.total_analyses,
              failed_analyses: aggregatedMetrics.failed_analyses,
              threshold: 0.1
            }
          );
        }
      }
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_document_metrics' });
    }
  }

  /**
   * Collect AI model performance metrics
   */
  private async collectAIPerformance(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // This would typically integrate with your AI monitoring system
      // For now, we'll collect basic metrics from document analyses
      const aiMetrics = await this.prisma.$queryRaw`
        SELECT 
          model_used,
          model_version,
          COUNT(*) as request_count,
          AVG(processing_time_ms) as avg_latency,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY processing_time_ms) as p50_latency,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_latency,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as error_count,
          AVG(CASE WHEN overall_risk_score IS NOT NULL THEN overall_risk_score END) as avg_confidence
        FROM document_analyses
        WHERE created_at >= ${oneHourAgo}
          AND model_used IS NOT NULL
        GROUP BY model_used, model_version
      ` as any[];

      const metrics = {
        models: aiMetrics.map(row => ({
          model_name: row.model_used,
          model_version: row.model_version,
          request_count: Number(row.request_count),
          avg_latency: Number(row.avg_latency),
          p50_latency: Number(row.p50_latency),
          p95_latency: Number(row.p95_latency),
          error_rate: Number(row.error_count) / Number(row.request_count),
          avg_confidence: Number(row.avg_confidence)
        })),
        timestamp: now
      };

      await this.storeMetrics('ai_performance', metrics);

      // Track model performance issues
      metrics.models.forEach(async (model) => {
        if (model.error_rate > 0.05) { // 5% error rate threshold
          await productAnalyticsService.trackEvent(
            'system',
            'AI Model High Error Rate',
            {
              model_name: model.model_name,
              model_version: model.model_version,
              error_rate: model.error_rate,
              threshold: 0.05
            }
          );
        }

        if (model.avg_latency > 10000) { // 10 second threshold
          await productAnalyticsService.trackEvent(
            'system',
            'AI Model High Latency',
            {
              model_name: model.model_name,
              model_version: model.model_version,
              avg_latency: model.avg_latency,
              threshold: 10000
            }
          );
        }
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_ai_performance' });
    }
  }

  /**
   * Collect error metrics
   */
  private async collectErrorMetrics(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Query error logs from audit table
      const errorMetrics = await this.prisma.$queryRaw`
        SELECT 
          new_values->>'error_type' as error_type,
          new_values->>'service' as service,
          COUNT(*) as error_count
        FROM audit_logs
        WHERE action = 'error_logged'
          AND created_at >= ${oneHourAgo}
        GROUP BY new_values->>'error_type', new_values->>'service'
        ORDER BY error_count DESC
      ` as any[];

      const metrics = {
        total_errors: errorMetrics.reduce((sum, row) => sum + Number(row.error_count), 0),
        by_type: errorMetrics.reduce((acc, row) => {
          const errorType = row.error_type || 'unknown';
          acc[errorType] = (acc[errorType] || 0) + Number(row.error_count);
          return acc;
        }, {} as Record<string, number>),
        by_service: errorMetrics.reduce((acc, row) => {
          const service = row.service || 'unknown';
          acc[service] = (acc[service] || 0) + Number(row.error_count);
          return acc;
        }, {} as Record<string, number>),
        timestamp: now
      };

      await this.storeMetrics('error_tracking', metrics);
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_error_metrics' });
    }
  }

  /**
   * Collect business KPIs
   */
  private async collectBusinessKPIs(): Promise<void> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // User metrics
      const userKPIs = await this.prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN created_at >= ${oneDayAgo} THEN 1 END) as new_users_24h,
          COUNT(CASE WHEN created_at >= ${oneWeekAgo} THEN 1 END) as new_users_7d,
          COUNT(CASE WHEN last_login_at >= ${oneDayAgo} THEN 1 END) as active_users_24h,
          COUNT(CASE WHEN subscription_tier != 'free' THEN 1 END) as paying_users
        FROM users
        WHERE status = 'active'
      ` as any[];

      // Document metrics
      const docKPIs = await this.prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_documents,
          COUNT(CASE WHEN created_at >= ${oneDayAgo} THEN 1 END) as new_documents_24h,
          COUNT(CASE WHEN monitoring_enabled = true THEN 1 END) as monitored_documents,
          AVG(CASE WHEN da.overall_risk_score IS NOT NULL THEN da.overall_risk_score END) as avg_risk_score
        FROM documents d
        LEFT JOIN document_analyses da ON d.id = da.document_id
      ` as any[];

      const metrics = {
        users: {
          total: Number(userKPIs[0]?.total_users || 0),
          new_24h: Number(userKPIs[0]?.new_users_24h || 0),
          new_7d: Number(userKPIs[0]?.new_users_7d || 0),
          active_24h: Number(userKPIs[0]?.active_users_24h || 0),
          paying: Number(userKPIs[0]?.paying_users || 0)
        },
        documents: {
          total: Number(docKPIs[0]?.total_documents || 0),
          new_24h: Number(docKPIs[0]?.new_documents_24h || 0),
          monitored: Number(docKPIs[0]?.monitored_documents || 0),
          avg_risk_score: Number(docKPIs[0]?.avg_risk_score || 0)
        },
        conversion_rate: userKPIs[0] ? Number(userKPIs[0].paying_users) / Number(userKPIs[0].total_users) : 0,
        timestamp: now
      };

      await this.storeMetrics('business_kpis', metrics);
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'collect_business_kpis' });
    }
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(category: string, metrics: any): Promise<void> {
    try {
      await this.prisma.systemMetrics.create({
        data: {
          metricName: category,
          metricValue: 1, // Placeholder - would calculate appropriate value
          tags: metrics,
          timestamp: new Date()
        }
      });
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'store_metrics',
        category
      });
    }
  }

  /**
   * Measure event loop lag
   */
  private async measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
        resolve(lag);
      });
    });
  }

  /**
   * Get collector status
   */
  getCollectorStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    this.collectors.forEach((collector, name) => {
      status[name] = {
        name: collector.name,
        enabled: collector.enabled,
        interval: collector.interval,
        isRunning: this.intervals.has(name)
      };
    });
    
    return status;
  }

  /**
   * Stop a specific collector
   */
  stopCollector(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
      analyticsLogger.event('collector_stopped', { collectorName: name });
    }
  }

  /**
   * Start a specific collector
   */
  startCollector(name: string): void {
    const collector = this.collectors.get(name);
    if (collector && collector.enabled && !this.intervals.has(name)) {
      const interval = setInterval(async () => {
        try {
          await collector.collect();
        } catch (error) {
          analyticsLogger.error(error as Error, {
            context: 'collector_execution',
            collectorName: name
          });
        }
      }, collector.interval);

      this.intervals.set(name, interval);
      analyticsLogger.event('collector_started', { collectorName: name });
    }
  }

  /**
   * Shutdown all collectors
   */
  async shutdown(): Promise<void> {
    try {
      this.intervals.forEach((interval, name) => {
        clearInterval(interval);
        analyticsLogger.event('collector_stopped', { collectorName: name });
      });
      
      this.intervals.clear();
      await this.prisma.$disconnect();
      
      analyticsLogger.event('analytics_collectors_shutdown', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'shutdown_collectors' });
    }
  }
}

// Create singleton instance
const analyticsCollectorService = new AnalyticsCollectorService();

/**
 * Initialize analytics collectors
 */
export async function initializeCollectors(): Promise<void> {
  await analyticsCollectorService.initialize();
}

/**
 * Get collector status
 */
export function getCollectorStatus(): Record<string, any> {
  return analyticsCollectorService.getCollectorStatus();
}

/**
 * Stop specific collector
 */
export function stopCollector(name: string): void {
  analyticsCollectorService.stopCollector(name);
}

/**
 * Start specific collector
 */
export function startCollector(name: string): void {
  analyticsCollectorService.startCollector(name);
}

/**
 * Shutdown all collectors
 */
export async function shutdownCollectors(): Promise<void> {
  await analyticsCollectorService.shutdown();
}