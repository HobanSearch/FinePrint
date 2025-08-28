import { createServiceLogger } from '@fineprintai/shared-logger';
import promClient from 'prom-client';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('metrics');

// Metrics Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'fineprintai_monitoring_',
});

// Custom Metrics
export const metrics = {
  // HTTP Request Metrics
  httpRequestsTotal: new promClient.Counter({
    name: 'fineprintai_monitoring_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'user_id'],
    registers: [register],
  }),

  httpRequestDuration: new promClient.Histogram({
    name: 'fineprintai_monitoring_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  // Document Monitoring Metrics
  documentsMonitored: new promClient.Gauge({
    name: 'fineprintai_monitoring_documents_monitored_total',
    help: 'Total number of documents being monitored',
    labelNames: ['user_id', 'team_id', 'document_type'],
    registers: [register],
  }),

  documentChangesDetected: new promClient.Counter({
    name: 'fineprintai_monitoring_document_changes_total',
    help: 'Total number of document changes detected',
    labelNames: ['user_id', 'team_id', 'change_type', 'document_type'],
    registers: [register],
  }),

  documentCrawlsTotal: new promClient.Counter({
    name: 'fineprintai_monitoring_document_crawls_total',
    help: 'Total number of document crawl attempts',
    labelNames: ['status', 'user_id'],
    registers: [register],
  }),

  documentCrawlDuration: new promClient.Histogram({
    name: 'fineprintai_monitoring_document_crawl_duration_seconds',
    help: 'Duration of document crawl operations in seconds',
    labelNames: ['status', 'document_type'],
    buckets: [1, 5, 10, 30, 60, 120],
    registers: [register],
  }),

  // Change Detection Metrics
  changeAnalysisTotal: new promClient.Counter({
    name: 'fineprintai_monitoring_change_analysis_total',
    help: 'Total number of change analysis operations',
    labelNames: ['change_type', 'document_type'],
    registers: [register],
  }),

  changeAnalysisDuration: new promClient.Histogram({
    name: 'fineprintai_monitoring_change_analysis_duration_seconds',
    help: 'Duration of change analysis operations in seconds',
    labelNames: ['change_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  riskScoreChanges: new promClient.Histogram({
    name: 'fineprintai_monitoring_risk_score_changes',
    help: 'Distribution of risk score changes',
    labelNames: ['user_id', 'document_type'],
    buckets: [-100, -50, -25, -10, 0, 10, 25, 50, 100],
    registers: [register],
  }),

  // Webhook Metrics
  webhookDeliveries: new promClient.Counter({
    name: 'fineprintai_monitoring_webhook_deliveries_total',
    help: 'Total number of webhook delivery attempts',
    labelNames: ['status', 'webhook_id', 'event_type'],
    registers: [register],
  }),

  webhookDeliveryDuration: new promClient.Histogram({
    name: 'fineprintai_monitoring_webhook_delivery_duration_seconds',
    help: 'Duration of webhook delivery attempts in seconds',
    labelNames: ['status', 'event_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [register],
  }),

  webhookRetries: new promClient.Counter({
    name: 'fineprintai_monitoring_webhook_retries_total',
    help: 'Total number of webhook retry attempts',
    labelNames: ['webhook_id', 'attempt'],
    registers: [register],
  }),

  // Alert Metrics
  alertsTriggered: new promClient.Counter({
    name: 'fineprintai_monitoring_alerts_triggered_total',
    help: 'Total number of alerts triggered',
    labelNames: ['severity', 'rule_id', 'user_id'],
    registers: [register],
  }),

  activeAlerts: new promClient.Gauge({
    name: 'fineprintai_monitoring_active_alerts_total',
    help: 'Number of currently active alerts',
    labelNames: ['severity', 'user_id'],
    registers: [register],
  }),

  notificationsSent: new promClient.Counter({
    name: 'fineprintai_monitoring_notifications_sent_total',
    help: 'Total number of notifications sent',
    labelNames: ['channel_type', 'status', 'severity'],
    registers: [register],
  }),

  // Circuit Breaker Metrics
  circuitBreakerState: new promClient.Gauge({
    name: 'fineprintai_monitoring_circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
    labelNames: ['breaker_name', 'group'],
    registers: [register],
  }),

  circuitBreakerRequests: new promClient.Counter({
    name: 'fineprintai_monitoring_circuit_breaker_requests_total',
    help: 'Total requests through circuit breakers',
    labelNames: ['breaker_name', 'status'],
    registers: [register],
  }),

  // Rate Limiting Metrics
  rateLimitedRequests: new promClient.Counter({
    name: 'fineprintai_monitoring_rate_limited_requests_total',
    help: 'Total number of rate limited requests',
    labelNames: ['limiter_id', 'status'],
    registers: [register],
  }),

  rateLimiterQueueSize: new promClient.Gauge({
    name: 'fineprintai_monitoring_rate_limiter_queue_size',
    help: 'Current queue size for rate limiters',
    labelNames: ['limiter_id'],
    registers: [register],
  }),

  // Database Metrics
  databaseConnections: new promClient.Gauge({
    name: 'fineprintai_monitoring_database_connections_active',
    help: 'Number of active database connections',
    labelNames: ['database_name'],
    registers: [register],
  }),

  databaseQueries: new promClient.Counter({
    name: 'fineprintai_monitoring_database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'collection', 'status'],
    registers: [register],
  }),

  databaseQueryDuration: new promClient.Histogram({
    name: 'fineprintai_monitoring_database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'collection'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  // MongoDB Change Streams Metrics
  changeStreamEvents: new promClient.Counter({
    name: 'fineprintai_monitoring_change_stream_events_total',
    help: 'Total number of change stream events processed',
    labelNames: ['stream_id', 'operation_type', 'collection'],
    registers: [register],
  }),

  activeChangeStreams: new promClient.Gauge({
    name: 'fineprintai_monitoring_active_change_streams',
    help: 'Number of active MongoDB change streams',
    labelNames: ['database'],
    registers: [register],
  }),

  // Queue Metrics
  queueJobs: new promClient.Counter({
    name: 'fineprintai_monitoring_queue_jobs_total',
    help: 'Total number of queue jobs processed',
    labelNames: ['queue_name', 'status', 'job_type'],
    registers: [register],
  }),

  activeQueueJobs: new promClient.Gauge({
    name: 'fineprintai_monitoring_active_queue_jobs',
    help: 'Number of active jobs in queues',
    labelNames: ['queue_name'],
    registers: [register],
  }),

  queueJobDuration: new promClient.Histogram({
    name: 'fineprintai_monitoring_queue_job_duration_seconds',
    help: 'Duration of queue jobs in seconds',
    labelNames: ['queue_name', 'job_type'],
    buckets: [1, 5, 10, 30, 60, 300, 600],
    registers: [register],
  }),

  // System Resource Metrics
  memoryUsage: new promClient.Gauge({
    name: 'fineprintai_monitoring_memory_usage_bytes',
    help: 'Memory usage in bytes',
    labelNames: ['type'], // heap_used, heap_total, rss, external
    registers: [register],
  }),

  cpuUsage: new promClient.Gauge({
    name: 'fineprintai_monitoring_cpu_usage_percentage',
    help: 'CPU usage percentage',
    registers: [register],
  }),

  // Error Metrics
  errorsTotal: new promClient.Counter({
    name: 'fineprintai_monitoring_errors_total',
    help: 'Total number of errors',
    labelNames: ['service', 'error_type', 'severity'],
    registers: [register],
  }),

  // Business Metrics
  userSessions: new promClient.Gauge({
    name: 'fineprintai_monitoring_user_sessions_active',
    help: 'Number of active user sessions',
    registers: [register],
  }),

  documentsAnalyzed: new promClient.Counter({
    name: 'fineprintai_monitoring_documents_analyzed_total',
    help: 'Total number of documents analyzed',
    labelNames: ['user_id', 'document_type', 'tier'],
    registers: [register],
  }),
};

// Metric update functions
export class MetricsCollector {
  private memoryUpdateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startSystemMetricsCollection();
  }

  // HTTP Metrics
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    userId?: string
  ): void {
    metrics.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
      user_id: userId || 'anonymous',
    });

    metrics.httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration / 1000 // Convert to seconds
    );
  }

  // Document Monitoring Metrics
  updateDocumentsMonitored(count: number, userId: string, teamId?: string, documentType?: string): void {
    metrics.documentsMonitored.set(
      {
        user_id: userId,
        team_id: teamId || 'none',
        document_type: documentType || 'unknown',
      },
      count
    );
  }

  recordDocumentChange(
    changeType: string,
    userId: string,
    teamId?: string,
    documentType?: string
  ): void {
    metrics.documentChangesDetected.inc({
      user_id: userId,
      team_id: teamId || 'none',
      change_type: changeType,
      document_type: documentType || 'unknown',
    });
  }

  recordDocumentCrawl(status: 'success' | 'failure', duration: number, userId: string, documentType?: string): void {
    metrics.documentCrawlsTotal.inc({
      status,
      user_id: userId,
    });

    metrics.documentCrawlDuration.observe(
      {
        status,
        document_type: documentType || 'unknown',
      },
      duration / 1000
    );
  }

  // Change Detection Metrics
  recordChangeAnalysis(changeType: string, duration: number, documentType?: string): void {
    metrics.changeAnalysisTotal.inc({
      change_type: changeType,
      document_type: documentType || 'unknown',
    });

    metrics.changeAnalysisDuration.observe(
      { change_type: changeType },
      duration / 1000
    );
  }

  recordRiskScoreChange(riskChange: number, userId: string, documentType?: string): void {
    metrics.riskScoreChanges.observe(
      {
        user_id: userId,
        document_type: documentType || 'unknown',
      },
      riskChange
    );
  }

  // Webhook Metrics
  recordWebhookDelivery(
    status: 'success' | 'failure',
    duration: number,
    webhookId: string,
    eventType: string
  ): void {
    metrics.webhookDeliveries.inc({
      status,
      webhook_id: webhookId,
      event_type: eventType,
    });

    metrics.webhookDeliveryDuration.observe(
      { status, event_type: eventType },
      duration / 1000
    );
  }

  recordWebhookRetry(webhookId: string, attempt: number): void {
    metrics.webhookRetries.inc({
      webhook_id: webhookId,
      attempt: attempt.toString(),
    });
  }

  // Alert Metrics
  recordAlertTriggered(severity: string, ruleId: string, userId: string): void {
    metrics.alertsTriggered.inc({
      severity,
      rule_id: ruleId,
      user_id: userId,
    });
  }

  updateActiveAlerts(count: number, severity: string, userId: string): void {
    metrics.activeAlerts.set({ severity, user_id: userId }, count);
  }

  recordNotificationSent(channelType: string, status: 'success' | 'failure', severity: string): void {
    metrics.notificationsSent.inc({
      channel_type: channelType,
      status,
      severity,
    });
  }

  // Circuit Breaker Metrics
  updateCircuitBreakerState(breakerName: string, state: 'closed' | 'half-open' | 'open', group?: string): void {
    const stateValue = { closed: 0, 'half-open': 1, open: 2 }[state];
    metrics.circuitBreakerState.set(
      { breaker_name: breakerName, group: group || 'default' },
      stateValue
    );
  }

  recordCircuitBreakerRequest(breakerName: string, status: 'success' | 'failure' | 'rejected'): void {
    metrics.circuitBreakerRequests.inc({
      breaker_name: breakerName,
      status,
    });
  }

  // Rate Limiting Metrics
  recordRateLimitedRequest(limiterId: string, status: 'allowed' | 'rejected'): void {
    metrics.rateLimitedRequests.inc({
      limiter_id: limiterId,
      status,
    });
  }

  updateRateLimiterQueueSize(limiterId: string, size: number): void {
    metrics.rateLimiterQueueSize.set({ limiter_id: limiterId }, size);
  }

  // Database Metrics
  updateDatabaseConnections(count: number, databaseName: string): void {
    metrics.databaseConnections.set({ database_name: databaseName }, count);
  }

  recordDatabaseQuery(operation: string, collection: string, status: 'success' | 'failure', duration: number): void {
    metrics.databaseQueries.inc({
      operation,
      collection,
      status,
    });

    metrics.databaseQueryDuration.observe(
      { operation, collection },
      duration / 1000
    );
  }

  // MongoDB Change Stream Metrics
  recordChangeStreamEvent(streamId: string, operationType: string, collection: string): void {
    metrics.changeStreamEvents.inc({
      stream_id: streamId,
      operation_type: operationType,
      collection,
    });
  }

  updateActiveChangeStreams(count: number, database: string): void {
    metrics.activeChangeStreams.set({ database }, count);
  }

  // Queue Metrics
  recordQueueJob(queueName: string, status: 'completed' | 'failed', jobType: string, duration: number): void {
    metrics.queueJobs.inc({
      queue_name: queueName,
      status,
      job_type: jobType,
    });

    metrics.queueJobDuration.observe(
      { queue_name: queueName, job_type: jobType },
      duration / 1000
    );
  }

  updateActiveQueueJobs(queueName: string, count: number): void {
    metrics.activeQueueJobs.set({ queue_name: queueName }, count);
  }

  // Error Metrics
  recordError(service: string, errorType: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    metrics.errorsTotal.inc({
      service,
      error_type: errorType,
      severity,
    });
  }

  // Business Metrics
  updateUserSessions(count: number): void {
    metrics.userSessions.set(count);
  }

  recordDocumentAnalyzed(userId: string, documentType: string, tier: string): void {
    metrics.documentsAnalyzed.inc({
      user_id: userId,
      document_type: documentType,
      tier,
    });
  }

  // System Metrics Collection
  private startSystemMetricsCollection(): void {
    // Update memory metrics every 30 seconds
    this.memoryUpdateInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      
      metrics.memoryUsage.set({ type: 'heap_used' }, memoryUsage.heapUsed);
      metrics.memoryUsage.set({ type: 'heap_total' }, memoryUsage.heapTotal);
      metrics.memoryUsage.set({ type: 'rss' }, memoryUsage.rss);
      metrics.memoryUsage.set({ type: 'external' }, memoryUsage.external);

      // CPU usage (simplified)
      const usage = process.cpuUsage();
      const totalUsage = (usage.user + usage.system) / 1000000; // Convert to seconds
      metrics.cpuUsage.set(totalUsage);
    }, 30000);
  }

  private stopSystemMetricsCollection(): void {
    if (this.memoryUpdateInterval) {
      clearInterval(this.memoryUpdateInterval);
      this.memoryUpdateInterval = null;
    }
  }

  shutdown(): void {
    this.stopSystemMetricsCollection();
  }
}

export const metricsCollector = new MetricsCollector();

// Initialize metrics
export function initializeMetrics(): void {
  logger.info('Initializing Prometheus metrics', {
    port: config.monitoring.prometheus.port,
    path: config.monitoring.prometheus.path,
  });

  // Set up metrics endpoint (this would typically be done in the main server)
  // server.get('/metrics', async (request, reply) => {
  //   reply.header('Content-Type', register.contentType);
  //   return register.metrics();
  // });
}

// Export the register for use in the main server
export { register as prometheusRegister };