"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsRoutes = void 0;
const zod_1 = require("zod");
const metricsRoutes = async (fastify) => {
    const { metricsCollector } = fastify;
    const GetMetricsQuery = zod_1.z.object({
        time_range: zod_1.z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
        module_name: zod_1.z.string().optional(),
        operation: zod_1.z.enum(['predict', 'compile', 'optimize']).optional(),
        include_trends: zod_1.z.boolean().optional().default(true),
    });
    const AlertsQuery = zod_1.z.object({
        status: zod_1.z.enum(['active', 'resolved', 'all']).optional().default('active'),
        type: zod_1.z.enum(['latency_spike', 'accuracy_drop', 'error_rate_high', 'token_usage_high']).optional(),
        severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']).optional(),
        limit: zod_1.z.number().min(1).max(500).optional().default(100),
    });
    const UpdateThresholdsRequest = zod_1.z.object({
        latency_ms: zod_1.z.number().min(100).max(60000).optional(),
        error_rate: zod_1.z.number().min(0).max(1).optional(),
        accuracy_drop: zod_1.z.number().min(0).max(1).optional(),
        token_usage_per_request: zod_1.z.number().min(100).max(100000).optional(),
    });
    fastify.get('/summary', {
        schema: {
            querystring: GetMetricsQuery,
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const query = GetMetricsQuery.parse(request.query);
            const now = new Date();
            const timeRangeMs = {
                '1h': 3600000,
                '6h': 21600000,
                '24h': 86400000,
                '7d': 604800000,
                '30d': 2592000000,
            };
            const startTime = new Date(now.getTime() - timeRangeMs[query.time_range]);
            const summary = await metricsCollector.getMetricsSummary({
                start: startTime.toISOString(),
                end: now.toISOString(),
            });
            let filteredSummary = summary;
            if (query.module_name) {
                const moduleUsage = summary.modules_by_usage[query.module_name] || 0;
                filteredSummary = {
                    ...summary,
                    total_operations: moduleUsage,
                    modules_by_usage: { [query.module_name]: moduleUsage },
                };
            }
            if (query.operation) {
                const operationCount = summary.operations_by_type[query.operation] || 0;
                filteredSummary = {
                    ...filteredSummary,
                    total_operations: operationCount,
                    operations_by_type: { [query.operation]: operationCount },
                };
            }
            reply.send({
                time_range: query.time_range,
                start_time: startTime.toISOString(),
                end_time: now.toISOString(),
                filters: {
                    module_name: query.module_name,
                    operation: query.operation,
                },
                metrics: filteredSummary,
                generated_at: new Date().toISOString(),
            });
        }
        catch (error) {
            fastify.log.error('Failed to get metrics summary', { error: error.message });
            reply.code(500).send({
                error: 'MetricsSummaryError',
                message: 'Failed to retrieve metrics summary',
            });
        }
    });
    fastify.get('/trends', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    granularity: {
                        type: 'string',
                        enum: ['hourly', 'daily', 'weekly'],
                        default: 'hourly'
                    },
                    metric: {
                        type: 'string',
                        enum: ['operations', 'success_rate', 'latency', 'accuracy'],
                        default: 'operations'
                    },
                    module_name: { type: 'string' },
                    days: { type: 'number', minimum: 1, maximum: 90, default: 7 },
                },
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const { granularity, metric, module_name, days } = request.query;
            const endTime = new Date();
            const startTime = new Date(endTime.getTime() - (days || 7) * 24 * 60 * 60 * 1000);
            const summary = await metricsCollector.getMetricsSummary({
                start: startTime.toISOString(),
                end: endTime.toISOString(),
            });
            const trends = summary.performance_trends[granularity || 'hourly'];
            const trendData = trends.map(point => ({
                timestamp: point.timestamp,
                value: getMetricValue(point, metric || 'operations'),
                operations: point.operations,
                success_rate: point.success_rate,
                average_latency: point.average_latency,
                average_accuracy: point.average_accuracy,
            }));
            reply.send({
                granularity: granularity || 'hourly',
                metric: metric || 'operations',
                module_filter: module_name,
                time_range: {
                    start: startTime.toISOString(),
                    end: endTime.toISOString(),
                    days: days || 7,
                },
                data_points: trendData.length,
                trends: trendData,
            });
        }
        catch (error) {
            fastify.log.error('Failed to get performance trends', { error: error.message });
            reply.code(500).send({
                error: 'TrendsError',
                message: 'Failed to retrieve performance trends',
            });
        }
    });
    function getMetricValue(point, metric) {
        switch (metric) {
            case 'operations':
                return point.operations;
            case 'success_rate':
                return point.success_rate;
            case 'latency':
                return point.average_latency;
            case 'accuracy':
                return point.average_accuracy;
            default:
                return point.operations;
        }
    }
    fastify.get('/alerts', {
        schema: {
            querystring: AlertsQuery,
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const query = AlertsQuery.parse(request.query);
            let alerts = query.status === 'active'
                ? metricsCollector.getActiveAlerts()
                : metricsCollector.getAllAlerts(query.limit);
            if (query.type) {
                alerts = alerts.filter(alert => alert.type === query.type);
            }
            if (query.severity) {
                alerts = alerts.filter(alert => alert.severity === query.severity);
            }
            if (query.status === 'resolved') {
                alerts = alerts.filter(alert => alert.resolved);
            }
            else if (query.status === 'active') {
                alerts = alerts.filter(alert => !alert.resolved);
            }
            const limitedAlerts = alerts.slice(0, query.limit);
            reply.send({
                filters: {
                    status: query.status,
                    type: query.type,
                    severity: query.severity,
                },
                alerts: limitedAlerts,
                total_alerts: alerts.length,
                returned: limitedAlerts.length,
                summary: {
                    active_alerts: alerts.filter(a => !a.resolved).length,
                    resolved_alerts: alerts.filter(a => a.resolved).length,
                    by_severity: getAlertsBySeverity(alerts),
                    by_type: getAlertsByType(alerts),
                },
            });
        }
        catch (error) {
            fastify.log.error('Failed to get alerts', { error: error.message });
            reply.code(500).send({
                error: 'AlertsError',
                message: 'Failed to retrieve performance alerts',
            });
        }
    });
    function getAlertsBySeverity(alerts) {
        const summary = {};
        alerts.forEach(alert => {
            summary[alert.severity] = (summary[alert.severity] || 0) + 1;
        });
        return summary;
    }
    function getAlertsByType(alerts) {
        const summary = {};
        alerts.forEach(alert => {
            summary[alert.type] = (summary[alert.type] || 0) + 1;
        });
        return summary;
    }
    fastify.post('/alerts/:alertId/resolve', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    alertId: { type: 'string' },
                },
                required: ['alertId'],
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const { alertId } = request.params;
            const resolved = await metricsCollector.resolveAlert(alertId);
            if (!resolved) {
                reply.code(404).send({
                    error: 'AlertNotFound',
                    message: `Alert '${alertId}' not found`,
                });
                return;
            }
            reply.send({
                message: `Alert '${alertId}' has been resolved`,
                resolved_at: new Date().toISOString(),
            });
        }
        catch (error) {
            fastify.log.error('Failed to resolve alert', { error: error.message });
            reply.code(500).send({
                error: 'AlertResolutionError',
                message: 'Failed to resolve alert',
            });
        }
    });
    fastify.get('/thresholds', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const thresholds = metricsCollector.getThresholds();
            reply.send({
                thresholds,
                description: {
                    latency_ms: 'Maximum acceptable average latency in milliseconds',
                    error_rate: 'Maximum acceptable error rate (0.0 to 1.0)',
                    accuracy_drop: 'Maximum acceptable accuracy drop percentage (0.0 to 1.0)',
                    token_usage_per_request: 'Maximum acceptable tokens per request',
                },
                last_updated: new Date().toISOString(),
            });
        }
        catch (error) {
            fastify.log.error('Failed to get thresholds', { error: error.message });
            reply.code(500).send({
                error: 'ThresholdsError',
                message: 'Failed to retrieve performance thresholds',
            });
        }
    });
    fastify.put('/thresholds', {
        schema: {
            body: UpdateThresholdsRequest,
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const updates = UpdateThresholdsRequest.parse(request.body);
            metricsCollector.updateThresholds(updates);
            const newThresholds = metricsCollector.getThresholds();
            reply.send({
                message: 'Performance thresholds updated successfully',
                updated_thresholds: newThresholds,
                updated_at: new Date().toISOString(),
            });
        }
        catch (error) {
            fastify.log.error('Failed to update thresholds', { error: error.message });
            const statusCode = error.statusCode || 500;
            reply.code(statusCode).send({
                error: error.name || 'ThresholdUpdateError',
                message: statusCode === 500 ? 'Failed to update thresholds' : error.message,
            });
        }
    });
    fastify.get('/modules/:moduleName', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    moduleName: { type: 'string' },
                },
                required: ['moduleName'],
            },
            querystring: {
                type: 'object',
                properties: {
                    time_range: {
                        type: 'string',
                        enum: ['1h', '6h', '24h', '7d', '30d'],
                        default: '24h'
                    },
                },
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const { moduleName } = request.params;
            const { time_range } = request.query;
            const now = new Date();
            const timeRangeMs = {
                '1h': 3600000,
                '6h': 21600000,
                '24h': 86400000,
                '7d': 604800000,
                '30d': 2592000000,
            };
            const startTime = new Date(now.getTime() - timeRangeMs[time_range || '24h']);
            const summary = await metricsCollector.getMetricsSummary({
                start: startTime.toISOString(),
                end: now.toISOString(),
            });
            const moduleUsage = summary.modules_by_usage[moduleName] || 0;
            const modulePercentage = summary.total_operations > 0
                ? (moduleUsage / summary.total_operations) * 100
                : 0;
            reply.send({
                module_name: moduleName,
                time_range: time_range || '24h',
                period: {
                    start: startTime.toISOString(),
                    end: now.toISOString(),
                },
                metrics: {
                    total_operations: moduleUsage,
                    percentage_of_total: modulePercentage,
                    estimated_success_rate: summary.success_rate,
                    estimated_average_latency_ms: summary.average_latency_ms,
                    estimated_average_accuracy: summary.average_accuracy,
                },
                comparison: {
                    global_average_latency: summary.average_latency_ms,
                    global_success_rate: summary.success_rate,
                    global_average_accuracy: summary.average_accuracy,
                },
                generated_at: new Date().toISOString(),
            });
        }
        catch (error) {
            fastify.log.error('Failed to get module metrics', { error: error.message });
            reply.code(500).send({
                error: 'ModuleMetricsError',
                message: 'Failed to retrieve module-specific metrics',
            });
        }
    });
    fastify.get('/export', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
                    time_range: {
                        type: 'string',
                        enum: ['1h', '6h', '24h', '7d', '30d'],
                        default: '24h'
                    },
                    include_raw_data: { type: 'boolean', default: false },
                },
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            const { format, time_range, include_raw_data } = request.query;
            const now = new Date();
            const timeRangeMs = {
                '1h': 3600000,
                '6h': 21600000,
                '24h': 86400000,
                '7d': 604800000,
                '30d': 2592000000,
            };
            const startTime = new Date(now.getTime() - timeRangeMs[time_range || '24h']);
            const summary = await metricsCollector.getMetricsSummary({
                start: startTime.toISOString(),
                end: now.toISOString(),
            });
            const exportData = {
                export_metadata: {
                    generated_at: new Date().toISOString(),
                    time_range: time_range || '24h',
                    period: {
                        start: startTime.toISOString(),
                        end: now.toISOString(),
                    },
                    format: format || 'json',
                    include_raw_data: include_raw_data || false,
                },
                summary,
            };
            if (format === 'csv') {
                const csvContent = convertMetricsToCSV(exportData);
                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', `attachment; filename="dspy_metrics_${time_range}_${Date.now()}.csv"`);
                reply.send(csvContent);
            }
            else {
                reply.header('Content-Type', 'application/json');
                reply.header('Content-Disposition', `attachment; filename="dspy_metrics_${time_range}_${Date.now()}.json"`);
                reply.send(exportData);
            }
        }
        catch (error) {
            fastify.log.error('Failed to export metrics', { error: error.message });
            reply.code(500).send({
                error: 'MetricsExportError',
                message: 'Failed to export metrics data',
            });
        }
    });
    function convertMetricsToCSV(data) {
        const summary = data.summary;
        let csv = 'Metric,Value\n';
        csv += `Total Operations,${summary.total_operations}\n`;
        csv += `Success Rate,${summary.success_rate}\n`;
        csv += `Average Latency (ms),${summary.average_latency_ms}\n`;
        csv += `Average Accuracy,${summary.average_accuracy}\n`;
        csv += `Average Confidence,${summary.average_confidence}\n`;
        csv += `Total Token Usage,${summary.total_token_usage}\n`;
        csv += '\nOperation Type,Count\n';
        Object.entries(summary.operations_by_type).forEach(([type, count]) => {
            csv += `${type},${count}\n`;
        });
        csv += '\nModule,Usage Count\n';
        Object.entries(summary.modules_by_usage).forEach(([module, count]) => {
            csv += `${module},${count}\n`;
        });
        return csv;
    }
    fastify.get('/stream', {
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        try {
            reply.header('Content-Type', 'text/event-stream');
            reply.header('Cache-Control', 'no-cache');
            reply.header('Connection', 'keep-alive');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.raw.write('data: {"type":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n');
            const interval = setInterval(async () => {
                try {
                    const now = new Date();
                    const oneHourAgo = new Date(now.getTime() - 3600000);
                    const summary = await metricsCollector.getMetricsSummary({
                        start: oneHourAgo.toISOString(),
                        end: now.toISOString(),
                    });
                    const activeAlerts = metricsCollector.getActiveAlerts();
                    const streamData = {
                        type: 'metrics_update',
                        timestamp: now.toISOString(),
                        metrics: {
                            total_operations: summary.total_operations,
                            success_rate: summary.success_rate,
                            average_latency_ms: summary.average_latency_ms,
                            average_accuracy: summary.average_accuracy,
                            active_alerts_count: activeAlerts.length,
                        },
                        alerts: activeAlerts.slice(0, 5),
                    };
                    reply.raw.write(`data: ${JSON.stringify(streamData)}\n\n`);
                }
                catch (error) {
                    fastify.log.error('Error in metrics stream', { error: error.message });
                }
            }, 10000);
            request.raw.on('close', () => {
                clearInterval(interval);
            });
        }
        catch (error) {
            fastify.log.error('Failed to start metrics stream', { error: error.message });
            reply.code(500).send({
                error: 'StreamError',
                message: 'Failed to start real-time metrics stream',
            });
        }
    });
};
exports.metricsRoutes = metricsRoutes;
//# sourceMappingURL=metrics.js.map