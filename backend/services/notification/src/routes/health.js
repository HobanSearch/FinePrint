"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const notificationService_1 = require("../services/notificationService");
const emailService_1 = require("../services/emailService");
const webhookService_1 = require("../services/webhookService");
const preferenceService_1 = require("../services/preferenceService");
const templateService_1 = require("../services/templateService");
const deliveryTracker_1 = require("../services/deliveryTracker");
const abTestService_1 = require("../services/abTestService");
const logger = (0, logger_1.createServiceLogger)('health-routes');
async function healthRoutes(fastify) {
    fastify.get('/', {
        schema: {
            description: 'Basic health check',
            tags: ['health'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        version: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        reply.send({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
        });
    });
    fastify.get('/detailed', {
        schema: {
            description: 'Detailed health check with service status',
            tags: ['health'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        services: {
                            type: 'object',
                            additionalProperties: {
                                type: 'object',
                                properties: {
                                    status: { type: 'string' },
                                    responseTime: { type: 'number' },
                                    error: { type: 'string' },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const services = {
            notificationService: await checkService('notification', () => notificationService_1.notificationService.getNotificationStats()),
            emailService: await checkService('email', () => emailService_1.emailService.getEmailTemplates({ limit: 1 })),
            webhookService: await checkService('webhook', () => webhookService_1.webhookService.getUserWebhookEndpoints('health-check')),
            preferenceService: await checkService('preference', () => preferenceService_1.preferenceService.getUserPreferences('health-check')),
            templateService: await checkService('template', () => templateService_1.templateService.listTemplates({ limit: 1 })),
            deliveryTracker: await checkService('delivery', () => deliveryTracker_1.deliveryTracker.getDeliveryStats()),
            abTestService: await checkService('abtest', () => abTestService_1.abTestService.listABTests({ limit: 1 })),
        };
        const allHealthy = Object.values(services).every(service => service.status === 'healthy');
        reply.send({
            status: allHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            services,
        });
    });
    fastify.get('/ready', {
        schema: {
            description: 'Readiness check for Kubernetes',
            tags: ['health'],
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
                        timestamp: { type: 'string' },
                        reason: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            await Promise.all([
                notificationService_1.notificationService.getNotificationStats('health-check'),
                emailService_1.emailService.getEmailTemplates({ limit: 1 }),
                preferenceService_1.preferenceService.getUserPreferences('health-check'),
            ]);
            reply.send({
                ready: true,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            logger.error('Readiness check failed', { error: error.message });
            reply.status(503).send({
                ready: false,
                timestamp: new Date().toISOString(),
                reason: error.message,
            });
        }
    });
    fastify.get('/live', {
        schema: {
            description: 'Liveness check for Kubernetes',
            tags: ['health'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        alive: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
                503: {
                    type: 'object',
                    properties: {
                        alive: { type: 'boolean' },
                        timestamp: { type: 'string' },
                        reason: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const memUsage = process.memoryUsage();
            const maxMemory = 1024 * 1024 * 1024;
            if (memUsage.heapUsed > maxMemory) {
                throw new Error('Memory usage too high');
            }
            reply.send({
                alive: true,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            logger.error('Liveness check failed', { error: error.message });
            reply.status(503).send({
                alive: false,
                timestamp: new Date().toISOString(),
                reason: error.message,
            });
        }
    });
    fastify.get('/metrics', {
        schema: {
            description: 'Metrics in Prometheus format',
            tags: ['health'],
            response: {
                200: {
                    type: 'string',
                },
            },
        },
    }, async (request, reply) => {
        try {
            const stats = await notificationService_1.notificationService.getNotificationStats();
            const deliveryStats = await deliveryTracker_1.deliveryTracker.getDeliveryStats();
            const memUsage = process.memoryUsage();
            const metrics = [
                `# HELP notification_total Total number of notifications`,
                `# TYPE notification_total counter`,
                `notification_total{status="pending"} ${stats.pending || 0}`,
                `notification_total{status="sent"} ${stats.sent || 0}`,
                `notification_total{status="failed"} ${stats.failed || 0}`,
                `# HELP delivery_rate Notification delivery rate`,
                `# TYPE delivery_rate gauge`,
                `delivery_rate ${deliveryStats.deliveryRate}`,
                `# HELP open_rate Notification open rate`,
                `# TYPE open_rate gauge`,
                `open_rate ${deliveryStats.openRate}`,
                `# HELP click_rate Notification click rate`,
                `# TYPE click_rate gauge`,
                `click_rate ${deliveryStats.clickRate}`,
                `# HELP process_memory_bytes Process memory usage in bytes`,
                `# TYPE process_memory_bytes gauge`,
                `process_memory_bytes{type="rss"} ${memUsage.rss}`,
                `process_memory_bytes{type="heapTotal"} ${memUsage.heapTotal}`,
                `process_memory_bytes{type="heapUsed"} ${memUsage.heapUsed}`,
                `# HELP process_uptime_seconds Process uptime in seconds`,
                `# TYPE process_uptime_seconds counter`,
                `process_uptime_seconds ${process.uptime()}`,
            ].join('\n');
            reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            reply.send(metrics + '\n');
        }
        catch (error) {
            logger.error('Failed to generate metrics', { error: error.message });
            reply.status(500).send('# Error generating metrics\n');
        }
    });
}
async function checkService(serviceName, healthCheck) {
    const startTime = Date.now();
    try {
        await healthCheck();
        return {
            status: 'healthy',
            responseTime: Date.now() - startTime,
        };
    }
    catch (error) {
        logger.warn(`Health check failed for ${serviceName}`, { error: error.message });
        return {
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            error: error.message,
        };
    }
}
//# sourceMappingURL=health.js.map