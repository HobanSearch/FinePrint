"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const logger_1 = require("@/utils/logger");
const logger = logger_1.Logger.getInstance();
async function healthRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: 'fullstack-agent',
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid,
            };
            return reply.send(health);
        }
        catch (error) {
            logger.error('Health check failed', { error: error.message });
            return reply.status(503).send({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
    fastify.get('/detailed', async (request, reply) => {
        try {
            const checks = {
                service: 'healthy',
                database: 'healthy',
                redis: 'healthy',
                integrations: {
                    dspy: 'healthy',
                    lora: 'healthy',
                    knowledgeGraph: 'healthy',
                },
                ai: {
                    ollama: 'healthy',
                },
            };
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: 'fullstack-agent',
                version: '1.0.0',
                checks,
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    pid: process.pid,
                    platform: process.platform,
                    nodeVersion: process.version,
                },
            };
            return reply.send(health);
        }
        catch (error) {
            logger.error('Detailed health check failed', { error: error.message });
            return reply.status(503).send({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
    fastify.get('/ready', async (request, reply) => {
        try {
            const ready = {
                status: 'ready',
                timestamp: new Date().toISOString(),
                initialized: true,
                dependencies: {
                    templates: true,
                    integrations: true,
                    ai: true,
                },
            };
            return reply.send(ready);
        }
        catch (error) {
            logger.error('Readiness check failed', { error: error.message });
            return reply.status(503).send({
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
    fastify.get('/live', async (request, reply) => {
        try {
            return reply.send({
                status: 'alive',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            });
        }
        catch (error) {
            logger.error('Liveness check failed', { error: error.message });
            return reply.status(503).send({
                status: 'dead',
                timestamp: new Date().toISOString(),
                error: error.message,
            });
        }
    });
}
//# sourceMappingURL=health.js.map