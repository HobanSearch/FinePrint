"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const healthRoutes = async (server) => {
    server.get('/', {
        schema: {
            tags: ['Health'],
            summary: 'Basic health check',
            description: 'Returns basic service health status',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        service: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            service: 'websocket-service',
        };
    });
    server.get('/detailed', {
        schema: {
            tags: ['Health'],
            summary: 'Detailed health check',
            description: 'Returns detailed health status including all service dependencies',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        healthy: { type: 'boolean' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        services: { type: 'object' },
                        memory: { type: 'object' },
                        connections: { type: 'object' },
                    },
                },
                503: {
                    type: 'object',
                    properties: {
                        healthy: { type: 'boolean' },
                        error: { type: 'string' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const health = await (0, index_1.getHealthStatus)();
        if (!health.healthy) {
            reply.status(503);
        }
        return health;
    });
    server.get('/ready', {
        schema: {
            tags: ['Health'],
            summary: 'Readiness probe',
            description: 'Kubernetes readiness probe endpoint',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
                503: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        reason: { type: 'string' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const health = await (0, index_1.getHealthStatus)();
        if (health.healthy) {
            return {
                ready: true,
                timestamp: new Date().toISOString(),
            };
        }
        else {
            reply.status(503);
            return {
                ready: false,
                reason: health.error || 'Service unhealthy',
                timestamp: new Date().toISOString(),
            };
        }
    });
    server.get('/live', {
        schema: {
            tags: ['Health'],
            summary: 'Liveness probe',
            description: 'Kubernetes liveness probe endpoint',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        alive: { type: 'boolean' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return {
            alive: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        };
    });
};
exports.default = healthRoutes;
//# sourceMappingURL=health.js.map