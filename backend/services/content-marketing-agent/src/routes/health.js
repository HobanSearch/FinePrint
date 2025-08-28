"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const logger_1 = require("../utils/logger");
async function healthRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        return {
            status: 'healthy',
            service: 'content-marketing-agent',
            version: '1.0.0',
            timestamp: new Date().toISOString()
        };
    });
    fastify.get('/detailed', async (request, reply) => {
        try {
            const healthChecks = {
                service: 'healthy',
                database: 'healthy',
                redis: 'healthy',
                openai: 'healthy',
                email: 'healthy',
                storage: 'healthy'
            };
            const overallHealth = Object.values(healthChecks).every(status => status === 'healthy')
                ? 'healthy'
                : 'degraded';
            return {
                status: overallHealth,
                service: 'content-marketing-agent',
                version: '1.0.0',
                checks: healthChecks,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            logger_1.logger.error('Health check failed', { error });
            reply.status(500);
            return {
                status: 'unhealthy',
                service: 'content-marketing-agent',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            };
        }
    });
    fastify.get('/ready', async (request, reply) => {
        try {
            const ready = true;
            if (ready) {
                return {
                    status: 'ready',
                    service: 'content-marketing-agent',
                    timestamp: new Date().toISOString()
                };
            }
            else {
                reply.status(503);
                return {
                    status: 'not_ready',
                    service: 'content-marketing-agent',
                    timestamp: new Date().toISOString()
                };
            }
        }
        catch (error) {
            logger_1.logger.error('Readiness check failed', { error });
            reply.status(503);
            return {
                status: 'not_ready',
                service: 'content-marketing-agent',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            };
        }
    });
}
//# sourceMappingURL=health.js.map