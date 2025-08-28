"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("@fineprintai/shared-middleware");
const index_1 = require("../index");
const metricsRoutes = async (server) => {
    server.addHook('preHandler', middleware_1.authMiddleware);
    server.get('/prometheus', {
        schema: {
            tags: ['Metrics'],
            summary: 'Get Prometheus-format metrics',
            description: 'Returns metrics in Prometheus exposition format',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'string',
                    description: 'Prometheus metrics',
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.metricsService) {
            reply.status(503);
            return { error: 'Metrics service not available' };
        }
        const metrics = index_1.metricsService.getPrometheusMetrics();
        reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        return metrics;
    });
    server.get('/snapshot', {
        schema: {
            tags: ['Metrics'],
            summary: 'Get JSON metrics snapshot',
            description: 'Returns current metrics snapshot in JSON format',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        timestamp: { type: 'string' },
                        counters: { type: 'array' },
                        gauges: { type: 'array' },
                        histograms: { type: 'array' },
                        uptime: { type: 'number' },
                        memory: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.metricsService) {
            reply.status(503);
            return { error: 'Metrics service not available' };
        }
        return index_1.metricsService.getMetricsSnapshot();
    });
    server.get('/counter/:name', {
        schema: {
            tags: ['Metrics'],
            summary: 'Get specific counter value',
            description: 'Returns the current value of a specific counter',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
                required: ['name'],
            },
            querystring: {
                type: 'object',
                properties: {
                    labels: { type: 'string', description: 'JSON string of labels' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        value: { type: 'number' },
                        labels: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.metricsService) {
            reply.status(503);
            return { error: 'Metrics service not available' };
        }
        try {
            const { name } = request.params;
            const labels = request.query.labels ? JSON.parse(request.query.labels) : {};
            const value = index_1.metricsService.getCounter(name, labels);
            return { name, value, labels };
        }
        catch (error) {
            reply.status(400);
            return { error: 'Invalid labels format' };
        }
    });
    server.get('/gauge/:name', {
        schema: {
            tags: ['Metrics'],
            summary: 'Get specific gauge value',
            description: 'Returns the current value of a specific gauge',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
                required: ['name'],
            },
            querystring: {
                type: 'object',
                properties: {
                    labels: { type: 'string', description: 'JSON string of labels' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        value: { type: 'number' },
                        labels: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.metricsService) {
            reply.status(503);
            return { error: 'Metrics service not available' };
        }
        try {
            const { name } = request.params;
            const labels = request.query.labels ? JSON.parse(request.query.labels) : {};
            const value = index_1.metricsService.getGauge(name, labels);
            return { name, value, labels };
        }
        catch (error) {
            reply.status(400);
            return { error: 'Invalid labels format' };
        }
    });
    server.get('/histogram/:name', {
        schema: {
            tags: ['Metrics'],
            summary: 'Get histogram statistics',
            description: 'Returns statistics for a specific histogram',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
                required: ['name'],
            },
            querystring: {
                type: 'object',
                properties: {
                    labels: { type: 'string', description: 'JSON string of labels' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        labels: { type: 'object' },
                        stats: {
                            type: 'object',
                            properties: {
                                count: { type: 'number' },
                                sum: { type: 'number' },
                                avg: { type: 'number' },
                                min: { type: 'number' },
                                max: { type: 'number' },
                                p50: { type: 'number' },
                                p95: { type: 'number' },
                                p99: { type: 'number' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.metricsService) {
            reply.status(503);
            return { error: 'Metrics service not available' };
        }
        try {
            const { name } = request.params;
            const labels = request.query.labels ? JSON.parse(request.query.labels) : {};
            const stats = index_1.metricsService.getHistogramStats(name, labels);
            return { name, labels, stats };
        }
        catch (error) {
            reply.status(400);
            return { error: 'Invalid labels format' };
        }
    });
    server.post('/counter/:name/reset', {
        schema: {
            tags: ['Metrics'],
            summary: 'Reset specific counter',
            description: 'Resets a specific counter to zero',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                },
                required: ['name'],
            },
            body: {
                type: 'object',
                properties: {
                    labels: { type: 'object' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        name: { type: 'string' },
                        labels: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.metricsService) {
            reply.status(503);
            return { error: 'Metrics service not available' };
        }
        const { name } = request.params;
        const labels = request.body.labels || {};
        index_1.metricsService.resetCounter(name, labels);
        return { success: true, name, labels };
    });
};
exports.default = metricsRoutes;
//# sourceMappingURL=metrics.js.map