"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = metricsRoutes;
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const logger = logger_1.Logger.getInstance();
async function metricsRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        try {
            if (!config_1.config.service.monitoring.enabled) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'METRICS_DISABLED',
                        message: 'Metrics collection is disabled',
                        timestamp: new Date(),
                    },
                });
            }
            const metrics = generatePrometheusMetrics();
            return reply
                .header('Content-Type', 'text/plain; charset=utf-8')
                .send(metrics);
        }
        catch (error) {
            logger.error('Failed to generate metrics', { error: error.message });
            return reply.status(500).send('# Error generating metrics');
        }
    });
    fastify.get('/json', async (request, reply) => {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
                service: {
                    name: 'fullstack-agent',
                    version: '1.0.0',
                    uptime: process.uptime(),
                },
                system: {
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    platform: process.platform,
                    nodeVersion: process.version,
                },
                business: {
                    codeGenerated: 0,
                    decisionsEvaluated: 0,
                    qualityChecks: 0,
                    templatesUsed: 0,
                },
                performance: {
                    avgResponseTime: 0,
                    requestsPerMinute: 0,
                    errorRate: 0,
                    p95ResponseTime: 0,
                },
                integrations: {
                    dspy: {
                        status: 'healthy',
                        requestsSent: 0,
                        errorsEncountered: 0,
                        averageResponseTime: 0,
                    },
                    lora: {
                        status: 'healthy',
                        requestsSent: 0,
                        errorsEncountered: 0,
                        averageResponseTime: 0,
                    },
                    knowledgeGraph: {
                        status: 'healthy',
                        requestsSent: 0,
                        errorsEncountered: 0,
                        averageResponseTime: 0,
                    },
                },
            };
            return reply.send({
                success: true,
                data: metrics,
            });
        }
        catch (error) {
            logger.error('Failed to generate JSON metrics', { error: error.message });
            return reply.status(500).send({
                success: false,
                error: {
                    code: 'METRICS_GENERATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            });
        }
    });
    fastify.get('/stats', async (request, reply) => {
        try {
            const stats = {
                requests: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    rate: 0,
                },
                codeGeneration: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    averageTime: 0,
                    averageQualityScore: 0,
                },
                architectureDecisions: {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    averageConfidence: 0,
                },
                qualityChecks: {
                    total: 0,
                    passed: 0,
                    failed: 0,
                    averageScore: 0,
                },
                templates: {
                    total: 0,
                    used: 0,
                    created: 0,
                    averageRating: 0,
                },
                errors: {
                    total: 0,
                    rate: 0,
                    lastError: null,
                },
            };
            return reply.send({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger.error('Failed to generate stats', { error: error.message });
            return reply.status(500).send({
                success: false,
                error: {
                    code: 'STATS_GENERATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            });
        }
    });
    fastify.get('/performance', async (request, reply) => {
        try {
            const performance = {
                timestamp: new Date().toISOString(),
                system: {
                    uptime: process.uptime(),
                    memory: {
                        ...process.memoryUsage(),
                        memoryUsagePercent: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
                    },
                    cpu: process.cpuUsage(),
                    loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
                },
                application: {
                    activeConnections: 0,
                    queueLength: 0,
                    cacheHitRate: 0,
                    averageResponseTime: 0,
                    p95ResponseTime: 0,
                    p99ResponseTime: 0,
                },
                ai: {
                    averageInferenceTime: 0,
                    queuedRequests: 0,
                    modelMemoryUsage: 0,
                },
            };
            return reply.send({
                success: true,
                data: performance,
            });
        }
        catch (error) {
            logger.error('Failed to generate performance metrics', { error: error.message });
            return reply.status(500).send({
                success: false,
                error: {
                    code: 'PERFORMANCE_METRICS_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            });
        }
    });
}
function generatePrometheusMetrics() {
    const timestamp = Date.now();
    const metrics = [
        '# HELP fullstack_agent_info Service information',
        '# TYPE fullstack_agent_info gauge',
        `fullstack_agent_info{version="1.0.0",environment="${process.env.NODE_ENV || 'development'}"} 1`,
        '',
        '# HELP fullstack_agent_uptime Service uptime in seconds',
        '# TYPE fullstack_agent_uptime counter',
        `fullstack_agent_uptime ${process.uptime()}`,
        '',
        '# HELP fullstack_agent_memory_usage Memory usage in bytes',
        '# TYPE fullstack_agent_memory_usage gauge',
        `fullstack_agent_memory_usage{type="rss"} ${process.memoryUsage().rss}`,
        `fullstack_agent_memory_usage{type="heap_total"} ${process.memoryUsage().heapTotal}`,
        `fullstack_agent_memory_usage{type="heap_used"} ${process.memoryUsage().heapUsed}`,
        `fullstack_agent_memory_usage{type="external"} ${process.memoryUsage().external}`,
        '',
        '# HELP fullstack_agent_cpu_usage CPU usage in microseconds',
        '# TYPE fullstack_agent_cpu_usage counter',
        `fullstack_agent_cpu_usage{type="user"} ${process.cpuUsage().user}`,
        `fullstack_agent_cpu_usage{type="system"} ${process.cpuUsage().system}`,
        '',
        '# HELP fullstack_agent_requests_total Total number of requests',
        '# TYPE fullstack_agent_requests_total counter',
        'fullstack_agent_requests_total{status="success"} 0',
        'fullstack_agent_requests_total{status="error"} 0',
        '',
        '# HELP fullstack_agent_code_generated_total Total number of code generations',
        '# TYPE fullstack_agent_code_generated_total counter',
        'fullstack_agent_code_generated_total 0',
        '',
        '# HELP fullstack_agent_decisions_evaluated_total Total number of architecture decisions evaluated',
        '# TYPE fullstack_agent_decisions_evaluated_total counter',
        'fullstack_agent_decisions_evaluated_total 0',
        '',
        '# HELP fullstack_agent_quality_checks_total Total number of quality checks performed',
        '# TYPE fullstack_agent_quality_checks_total counter',
        'fullstack_agent_quality_checks_total 0',
        '',
        '# HELP fullstack_agent_integration_requests_total Total number of integration requests',
        '# TYPE fullstack_agent_integration_requests_total counter',
        'fullstack_agent_integration_requests_total{integration="dspy",status="success"} 0',
        'fullstack_agent_integration_requests_total{integration="dspy",status="error"} 0',
        'fullstack_agent_integration_requests_total{integration="lora",status="success"} 0',
        'fullstack_agent_integration_requests_total{integration="lora",status="error"} 0',
        'fullstack_agent_integration_requests_total{integration="knowledge_graph",status="success"} 0',
        'fullstack_agent_integration_requests_total{integration="knowledge_graph",status="error"} 0',
        '',
        '# HELP fullstack_agent_response_time_seconds Response time in seconds',
        '# TYPE fullstack_agent_response_time_seconds histogram',
        'fullstack_agent_response_time_seconds_bucket{le="0.1"} 0',
        'fullstack_agent_response_time_seconds_bucket{le="0.5"} 0',
        'fullstack_agent_response_time_seconds_bucket{le="1.0"} 0',
        'fullstack_agent_response_time_seconds_bucket{le="5.0"} 0',
        'fullstack_agent_response_time_seconds_bucket{le="10.0"} 0',
        'fullstack_agent_response_time_seconds_bucket{le="+Inf"} 0',
        'fullstack_agent_response_time_seconds_sum 0',
        'fullstack_agent_response_time_seconds_count 0',
        '',
        '# HELP fullstack_agent_quality_score Quality score distribution',
        '# TYPE fullstack_agent_quality_score histogram',
        'fullstack_agent_quality_score_bucket{le="50"} 0',
        'fullstack_agent_quality_score_bucket{le="70"} 0',
        'fullstack_agent_quality_score_bucket{le="80"} 0',
        'fullstack_agent_quality_score_bucket{le="90"} 0',
        'fullstack_agent_quality_score_bucket{le="95"} 0',
        'fullstack_agent_quality_score_bucket{le="+Inf"} 0',
        'fullstack_agent_quality_score_sum 0',
        'fullstack_agent_quality_score_count 0',
        '',
    ];
    return metrics.join('\n');
}
//# sourceMappingURL=metrics.js.map