"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
const tosMonitoring_1 = require("../services/tosMonitoring");
const changeDetection_1 = require("../services/changeDetection");
const documentCrawler_1 = require("../services/documentCrawler");
const webhookService_1 = require("../services/webhookService");
const alertingService_1 = require("../services/alertingService");
const mongoChangeStream_1 = require("../services/mongoChangeStream");
const circuitBreaker_1 = require("../services/circuitBreaker");
const rateLimiting_1 = require("../services/rateLimiting");
const scheduler_1 = require("../services/scheduler");
async function healthRoutes(server) {
    server.get('/', async (request, reply) => {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
        };
    });
    server.get('/detailed', async (request, reply) => {
        const services = [
            { name: 'tosMonitoring', service: tosMonitoring_1.tosMonitoringService },
            { name: 'changeDetection', service: changeDetection_1.changeDetectionEngine },
            { name: 'documentCrawler', service: documentCrawler_1.documentCrawlerService },
            { name: 'webhook', service: webhookService_1.webhookService },
            { name: 'alerting', service: alertingService_1.alertingService },
            { name: 'mongoChangeStream', service: mongoChangeStream_1.mongoChangeStreamService },
            { name: 'scheduler', service: scheduler_1.schedulerService },
        ];
        const healthChecks = await Promise.allSettled(services.map(async ({ name, service }) => {
            try {
                await service.healthCheck();
                return { name, status: 'healthy' };
            }
            catch (error) {
                return {
                    name,
                    status: 'unhealthy',
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        }));
        const results = healthChecks.map((result, index) => ({
            service: services[index].name,
            ...(result.status === 'fulfilled' ? result.value : { status: 'error', error: result.reason }),
        }));
        const overallHealthy = results.every(result => result.status === 'healthy');
        if (!overallHealthy) {
            reply.code(503);
        }
        return {
            status: overallHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            services: results,
            circuitBreakers: circuitBreaker_1.circuitBreakerService.getHealthStatus(),
            rateLimiters: rateLimiting_1.rateLimitingService.getHealthStatus(),
        };
    });
    server.get('/ready', async (request, reply) => {
        try {
            const criticalServices = [tosMonitoring_1.tosMonitoringService, changeDetection_1.changeDetectionEngine];
            await Promise.all(criticalServices.map(service => service.healthCheck()));
            return {
                status: 'ready',
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            reply.code(503);
            return {
                status: 'not ready',
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    server.get('/live', async (request, reply) => {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        };
    });
}
//# sourceMappingURL=health.js.map