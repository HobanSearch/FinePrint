"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const services_1 = require("@/services");
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const logger = (0, logger_1.createContextLogger)('HealthRoutes');
async function healthRoutes(fastify, opts) {
    fastify.get('/', {
        schema: {
            tags: ['Health'],
            summary: 'Basic health check',
            description: 'Get basic service health status',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        service: { type: 'string' },
                        version: { type: 'string' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        environment: { type: 'string' },
                        nodeVersion: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return reply.send({
            status: 'healthy',
            service: 'devops-agent',
            version: config_1.config.app.version,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: config_1.config.app.environment,
            nodeVersion: process.version,
        });
    });
    fastify.get('/detailed', {
        schema: {
            tags: ['Health'],
            summary: 'Detailed health check',
            description: 'Get detailed health status of all services and components',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        service: { type: 'string' },
                        version: { type: 'string' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        environment: { type: 'string' },
                        services: { type: 'object' },
                        memory: { type: 'object' },
                        system: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const servicesHealth = await (0, services_1.checkServicesHealth)();
            const memoryUsage = process.memoryUsage();
            const overallHealth = Object.values(servicesHealth).every(Boolean) ? 'healthy' : 'degraded';
            return reply.send({
                status: overallHealth,
                service: 'devops-agent',
                version: config_1.config.app.version,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: config_1.config.app.environment,
                services: servicesHealth,
                memory: {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    external: Math.round(memoryUsage.external / 1024 / 1024),
                },
                system: {
                    platform: process.platform,
                    arch: process.arch,
                    nodeVersion: process.version,
                    pid: process.pid,
                },
            });
        }
        catch (error) {
            logger.error('Detailed health check failed:', error);
            return reply.status(503).send({
                status: 'unhealthy',
                service: 'devops-agent',
                version: config_1.config.app.version,
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
    fastify.get('/ready', {
        schema: {
            tags: ['Health'],
            summary: 'Readiness probe',
            description: 'Check if service is ready to accept requests',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                503: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        message: { type: 'string' },
                        details: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const servicesHealth = await (0, services_1.checkServicesHealth)();
            const criticalServices = ['redis', 'iacEngine', 'pipelineEngine', 'kubernetesEngine'];
            const criticalServicesHealthy = criticalServices.every(service => servicesHealth[service] === true);
            if (criticalServicesHealthy) {
                return reply.send({
                    ready: true,
                    message: 'Service is ready to accept requests',
                });
            }
            else {
                return reply.status(503).send({
                    ready: false,
                    message: 'Service is not ready - critical services unavailable',
                    details: servicesHealth,
                });
            }
        }
        catch (error) {
            logger.error('Readiness check failed:', error);
            return reply.status(503).send({
                ready: false,
                message: 'Service readiness check failed',
                error: error.message,
            });
        }
    });
    fastify.get('/live', {
        schema: {
            tags: ['Health'],
            summary: 'Liveness probe',
            description: 'Check if service is alive and functioning',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        alive: { type: 'boolean' },
                        message: { type: 'string' },
                        uptime: { type: 'number' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return reply.send({
            alive: true,
            message: 'Service is alive and functioning',
            uptime: process.uptime(),
        });
    });
    fastify.get('/metrics', {
        schema: {
            tags: ['Health'],
            summary: 'Performance metrics',
            description: 'Get performance and resource utilization metrics',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        memory: { type: 'object' },
                        cpu: { type: 'object' },
                        requests: { type: 'object' },
                        errors: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        return reply.send({
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                rss: memoryUsage.rss,
                heapTotal: memoryUsage.heapTotal,
                heapUsed: memoryUsage.heapUsed,
                external: memoryUsage.external,
                arrayBuffers: memoryUsage.arrayBuffers,
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system,
            },
            requests: {
                total: 0,
                active: 0,
                errors: 0,
            },
            errors: {
                total: 0,
                rate: 0,
            },
        });
    });
    fastify.get('/resources', {
        schema: {
            tags: ['Health'],
            summary: 'Resource status',
            description: 'Get status of external resources and dependencies',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        timestamp: { type: 'string' },
                        databases: { type: 'object' },
                        caches: { type: 'object' },
                        external_apis: { type: 'object' },
                        cloud_providers: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const servicesHealth = await (0, services_1.checkServicesHealth)();
            return reply.send({
                timestamp: new Date().toISOString(),
                databases: {
                    postgresql: 'unknown',
                },
                caches: {
                    redis: servicesHealth.redis ? 'healthy' : 'unhealthy',
                },
                external_apis: {
                    kubernetes: servicesHealth.kubernetesEngine ? 'healthy' : 'unhealthy',
                    prometheus: 'unknown',
                    grafana: 'unknown',
                },
                cloud_providers: {
                    aws: 'unknown',
                    gcp: 'unknown',
                    azure: 'unknown',
                },
            });
        }
        catch (error) {
            logger.error('Resource status check failed:', error);
            return reply.status(500).send({
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
    logger.info('Health check routes registered successfully');
}
//# sourceMappingURL=health.js.map