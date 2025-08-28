"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prometheusRegister = exports.metricsCollector = exports.MetricsCollector = exports.metrics = void 0;
exports.initializeMetrics = initializeMetrics;
const logger_1 = require("@fineprintai/shared-logger");
const prom_client_1 = __importDefault(require("prom-client"));
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('metrics');
const register = new prom_client_1.default.Registry();
exports.prometheusRegister = register;
prom_client_1.default.collectDefaultMetrics({
    register,
    prefix: 'fineprintai_monitoring_',
});
exports.metrics = {
    httpRequestsTotal: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code', 'user_id'],
        registers: [register],
    }),
    httpRequestDuration: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
        registers: [register],
    }),
    documentsMonitored: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_documents_monitored_total',
        help: 'Total number of documents being monitored',
        labelNames: ['user_id', 'team_id', 'document_type'],
        registers: [register],
    }),
    documentChangesDetected: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_document_changes_total',
        help: 'Total number of document changes detected',
        labelNames: ['user_id', 'team_id', 'change_type', 'document_type'],
        registers: [register],
    }),
    documentCrawlsTotal: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_document_crawls_total',
        help: 'Total number of document crawl attempts',
        labelNames: ['status', 'user_id'],
        registers: [register],
    }),
    documentCrawlDuration: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_document_crawl_duration_seconds',
        help: 'Duration of document crawl operations in seconds',
        labelNames: ['status', 'document_type'],
        buckets: [1, 5, 10, 30, 60, 120],
        registers: [register],
    }),
    changeAnalysisTotal: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_change_analysis_total',
        help: 'Total number of change analysis operations',
        labelNames: ['change_type', 'document_type'],
        registers: [register],
    }),
    changeAnalysisDuration: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_change_analysis_duration_seconds',
        help: 'Duration of change analysis operations in seconds',
        labelNames: ['change_type'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
        registers: [register],
    }),
    riskScoreChanges: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_risk_score_changes',
        help: 'Distribution of risk score changes',
        labelNames: ['user_id', 'document_type'],
        buckets: [-100, -50, -25, -10, 0, 10, 25, 50, 100],
        registers: [register],
    }),
    webhookDeliveries: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_webhook_deliveries_total',
        help: 'Total number of webhook delivery attempts',
        labelNames: ['status', 'webhook_id', 'event_type'],
        registers: [register],
    }),
    webhookDeliveryDuration: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_webhook_delivery_duration_seconds',
        help: 'Duration of webhook delivery attempts in seconds',
        labelNames: ['status', 'event_type'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        registers: [register],
    }),
    webhookRetries: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_webhook_retries_total',
        help: 'Total number of webhook retry attempts',
        labelNames: ['webhook_id', 'attempt'],
        registers: [register],
    }),
    alertsTriggered: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_alerts_triggered_total',
        help: 'Total number of alerts triggered',
        labelNames: ['severity', 'rule_id', 'user_id'],
        registers: [register],
    }),
    activeAlerts: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_active_alerts_total',
        help: 'Number of currently active alerts',
        labelNames: ['severity', 'user_id'],
        registers: [register],
    }),
    notificationsSent: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_notifications_sent_total',
        help: 'Total number of notifications sent',
        labelNames: ['channel_type', 'status', 'severity'],
        registers: [register],
    }),
    circuitBreakerState: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_circuit_breaker_state',
        help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
        labelNames: ['breaker_name', 'group'],
        registers: [register],
    }),
    circuitBreakerRequests: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_circuit_breaker_requests_total',
        help: 'Total requests through circuit breakers',
        labelNames: ['breaker_name', 'status'],
        registers: [register],
    }),
    rateLimitedRequests: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_rate_limited_requests_total',
        help: 'Total number of rate limited requests',
        labelNames: ['limiter_id', 'status'],
        registers: [register],
    }),
    rateLimiterQueueSize: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_rate_limiter_queue_size',
        help: 'Current queue size for rate limiters',
        labelNames: ['limiter_id'],
        registers: [register],
    }),
    databaseConnections: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_database_connections_active',
        help: 'Number of active database connections',
        labelNames: ['database_name'],
        registers: [register],
    }),
    databaseQueries: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_database_queries_total',
        help: 'Total number of database queries',
        labelNames: ['operation', 'collection', 'status'],
        registers: [register],
    }),
    databaseQueryDuration: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_database_query_duration_seconds',
        help: 'Duration of database queries in seconds',
        labelNames: ['operation', 'collection'],
        buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
        registers: [register],
    }),
    changeStreamEvents: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_change_stream_events_total',
        help: 'Total number of change stream events processed',
        labelNames: ['stream_id', 'operation_type', 'collection'],
        registers: [register],
    }),
    activeChangeStreams: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_active_change_streams',
        help: 'Number of active MongoDB change streams',
        labelNames: ['database'],
        registers: [register],
    }),
    queueJobs: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_queue_jobs_total',
        help: 'Total number of queue jobs processed',
        labelNames: ['queue_name', 'status', 'job_type'],
        registers: [register],
    }),
    activeQueueJobs: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_active_queue_jobs',
        help: 'Number of active jobs in queues',
        labelNames: ['queue_name'],
        registers: [register],
    }),
    queueJobDuration: new prom_client_1.default.Histogram({
        name: 'fineprintai_monitoring_queue_job_duration_seconds',
        help: 'Duration of queue jobs in seconds',
        labelNames: ['queue_name', 'job_type'],
        buckets: [1, 5, 10, 30, 60, 300, 600],
        registers: [register],
    }),
    memoryUsage: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_memory_usage_bytes',
        help: 'Memory usage in bytes',
        labelNames: ['type'],
        registers: [register],
    }),
    cpuUsage: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_cpu_usage_percentage',
        help: 'CPU usage percentage',
        registers: [register],
    }),
    errorsTotal: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_errors_total',
        help: 'Total number of errors',
        labelNames: ['service', 'error_type', 'severity'],
        registers: [register],
    }),
    userSessions: new prom_client_1.default.Gauge({
        name: 'fineprintai_monitoring_user_sessions_active',
        help: 'Number of active user sessions',
        registers: [register],
    }),
    documentsAnalyzed: new prom_client_1.default.Counter({
        name: 'fineprintai_monitoring_documents_analyzed_total',
        help: 'Total number of documents analyzed',
        labelNames: ['user_id', 'document_type', 'tier'],
        registers: [register],
    }),
};
class MetricsCollector {
    memoryUpdateInterval = null;
    constructor() {
        this.startSystemMetricsCollection();
    }
    recordHttpRequest(method, route, statusCode, duration, userId) {
        exports.metrics.httpRequestsTotal.inc({
            method,
            route,
            status_code: statusCode.toString(),
            user_id: userId || 'anonymous',
        });
        exports.metrics.httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration / 1000);
    }
    updateDocumentsMonitored(count, userId, teamId, documentType) {
        exports.metrics.documentsMonitored.set({
            user_id: userId,
            team_id: teamId || 'none',
            document_type: documentType || 'unknown',
        }, count);
    }
    recordDocumentChange(changeType, userId, teamId, documentType) {
        exports.metrics.documentChangesDetected.inc({
            user_id: userId,
            team_id: teamId || 'none',
            change_type: changeType,
            document_type: documentType || 'unknown',
        });
    }
    recordDocumentCrawl(status, duration, userId, documentType) {
        exports.metrics.documentCrawlsTotal.inc({
            status,
            user_id: userId,
        });
        exports.metrics.documentCrawlDuration.observe({
            status,
            document_type: documentType || 'unknown',
        }, duration / 1000);
    }
    recordChangeAnalysis(changeType, duration, documentType) {
        exports.metrics.changeAnalysisTotal.inc({
            change_type: changeType,
            document_type: documentType || 'unknown',
        });
        exports.metrics.changeAnalysisDuration.observe({ change_type: changeType }, duration / 1000);
    }
    recordRiskScoreChange(riskChange, userId, documentType) {
        exports.metrics.riskScoreChanges.observe({
            user_id: userId,
            document_type: documentType || 'unknown',
        }, riskChange);
    }
    recordWebhookDelivery(status, duration, webhookId, eventType) {
        exports.metrics.webhookDeliveries.inc({
            status,
            webhook_id: webhookId,
            event_type: eventType,
        });
        exports.metrics.webhookDeliveryDuration.observe({ status, event_type: eventType }, duration / 1000);
    }
    recordWebhookRetry(webhookId, attempt) {
        exports.metrics.webhookRetries.inc({
            webhook_id: webhookId,
            attempt: attempt.toString(),
        });
    }
    recordAlertTriggered(severity, ruleId, userId) {
        exports.metrics.alertsTriggered.inc({
            severity,
            rule_id: ruleId,
            user_id: userId,
        });
    }
    updateActiveAlerts(count, severity, userId) {
        exports.metrics.activeAlerts.set({ severity, user_id: userId }, count);
    }
    recordNotificationSent(channelType, status, severity) {
        exports.metrics.notificationsSent.inc({
            channel_type: channelType,
            status,
            severity,
        });
    }
    updateCircuitBreakerState(breakerName, state, group) {
        const stateValue = { closed: 0, 'half-open': 1, open: 2 }[state];
        exports.metrics.circuitBreakerState.set({ breaker_name: breakerName, group: group || 'default' }, stateValue);
    }
    recordCircuitBreakerRequest(breakerName, status) {
        exports.metrics.circuitBreakerRequests.inc({
            breaker_name: breakerName,
            status,
        });
    }
    recordRateLimitedRequest(limiterId, status) {
        exports.metrics.rateLimitedRequests.inc({
            limiter_id: limiterId,
            status,
        });
    }
    updateRateLimiterQueueSize(limiterId, size) {
        exports.metrics.rateLimiterQueueSize.set({ limiter_id: limiterId }, size);
    }
    updateDatabaseConnections(count, databaseName) {
        exports.metrics.databaseConnections.set({ database_name: databaseName }, count);
    }
    recordDatabaseQuery(operation, collection, status, duration) {
        exports.metrics.databaseQueries.inc({
            operation,
            collection,
            status,
        });
        exports.metrics.databaseQueryDuration.observe({ operation, collection }, duration / 1000);
    }
    recordChangeStreamEvent(streamId, operationType, collection) {
        exports.metrics.changeStreamEvents.inc({
            stream_id: streamId,
            operation_type: operationType,
            collection,
        });
    }
    updateActiveChangeStreams(count, database) {
        exports.metrics.activeChangeStreams.set({ database }, count);
    }
    recordQueueJob(queueName, status, jobType, duration) {
        exports.metrics.queueJobs.inc({
            queue_name: queueName,
            status,
            job_type: jobType,
        });
        exports.metrics.queueJobDuration.observe({ queue_name: queueName, job_type: jobType }, duration / 1000);
    }
    updateActiveQueueJobs(queueName, count) {
        exports.metrics.activeQueueJobs.set({ queue_name: queueName }, count);
    }
    recordError(service, errorType, severity) {
        exports.metrics.errorsTotal.inc({
            service,
            error_type: errorType,
            severity,
        });
    }
    updateUserSessions(count) {
        exports.metrics.userSessions.set(count);
    }
    recordDocumentAnalyzed(userId, documentType, tier) {
        exports.metrics.documentsAnalyzed.inc({
            user_id: userId,
            document_type: documentType,
            tier,
        });
    }
    startSystemMetricsCollection() {
        this.memoryUpdateInterval = setInterval(() => {
            const memoryUsage = process.memoryUsage();
            exports.metrics.memoryUsage.set({ type: 'heap_used' }, memoryUsage.heapUsed);
            exports.metrics.memoryUsage.set({ type: 'heap_total' }, memoryUsage.heapTotal);
            exports.metrics.memoryUsage.set({ type: 'rss' }, memoryUsage.rss);
            exports.metrics.memoryUsage.set({ type: 'external' }, memoryUsage.external);
            const usage = process.cpuUsage();
            const totalUsage = (usage.user + usage.system) / 1000000;
            exports.metrics.cpuUsage.set(totalUsage);
        }, 30000);
    }
    stopSystemMetricsCollection() {
        if (this.memoryUpdateInterval) {
            clearInterval(this.memoryUpdateInterval);
            this.memoryUpdateInterval = null;
        }
    }
    shutdown() {
        this.stopSystemMetricsCollection();
    }
}
exports.MetricsCollector = MetricsCollector;
exports.metricsCollector = new MetricsCollector();
function initializeMetrics() {
    logger.info('Initializing Prometheus metrics', {
        port: config_1.config.monitoring.prometheus.port,
        path: config_1.config.monitoring.prometheus.path,
    });
}
//# sourceMappingURL=metrics.js.map