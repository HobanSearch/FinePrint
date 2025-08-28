"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const middleware_1 = require("@fineprintai/shared-middleware");
const routes_1 = require("./routes");
const workers_1 = require("./workers");
const plugins_1 = require("./plugins");
const metrics_1 = require("./monitoring/metrics");
const tracing_1 = require("./monitoring/tracing");
const changeDetection_1 = require("./services/changeDetection");
const tosMonitoring_1 = require("./services/tosMonitoring");
const webhookService_1 = require("./services/webhookService");
const alertingService_1 = require("./services/alertingService");
const mongoChangeStream_1 = require("./services/mongoChangeStream");
const circuitBreaker_1 = require("./services/circuitBreaker");
const rateLimiting_1 = require("./services/rateLimiting");
const documentCrawler_1 = require("./services/documentCrawler");
const scheduler_1 = require("./services/scheduler");
const logger = (0, logger_1.createServiceLogger)('monitoring-service');
let isShuttingDown = false;
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: false,
        requestIdLogLabel: 'requestId',
        genReqId: () => crypto.randomUUID(),
        trustProxy: true,
        disableRequestLogging: false,
    });
    (0, middleware_1.setupErrorHandling)();
    server.setErrorHandler(middleware_1.errorHandler);
    server.setNotFoundHandler(middleware_1.notFoundHandler);
    server.addHook('onClose', async () => {
        logger.info('Fastify server is closing');
        isShuttingDown = true;
    });
    await (0, plugins_1.setupPlugins)(server);
    await (0, routes_1.registerRoutes)(server);
    return server;
}
async function initializeServices() {
    logger.info('Initializing monitoring services...');
    await Promise.all([
        changeDetection_1.changeDetectionEngine.initialize(),
        documentCrawler_1.documentCrawlerService.initialize(),
        circuitBreaker_1.circuitBreakerService.initialize(),
        rateLimiting_1.rateLimitingService.initialize(),
    ]);
    await Promise.all([
        tosMonitoring_1.tosMonitoringService.initialize(),
        webhookService_1.webhookService.initialize(),
        alertingService_1.alertingService.initialize(),
        mongoChangeStream_1.mongoChangeStreamService.initialize(),
        scheduler_1.schedulerService.initialize(),
    ]);
    logger.info('All monitoring services initialized successfully');
}
async function start() {
    try {
        (0, tracing_1.initializeTracing)();
        (0, metrics_1.initializeMetrics)();
        const server = await createServer();
        await initializeServices();
        await (0, workers_1.setupWorkers)();
        const address = await server.listen({
            port: config_1.config.services.monitoring.port,
            host: '0.0.0.0',
        });
        logger.info(`Monitoring service started on ${address}`, {
            service: config_1.config.services.monitoring.name,
            version: config_1.config.services.monitoring.version,
            port: config_1.config.services.monitoring.port,
            environment: config_1.config.NODE_ENV,
            features: [
                'document-change-detection',
                'tos-monitoring',
                'webhook-integrations',
                'real-time-alerting',
                'mongodb-change-streams',
                'prometheus-metrics',
                'opentelemetry-tracing',
                'circuit-breaker-patterns',
                'rate-limiting',
                'scheduled-monitoring'
            ]
        });
        server.get('/health', async (request, reply) => {
            if (isShuttingDown) {
                return reply.code(503).send({ status: 'shutting down' });
            }
            const healthChecks = await Promise.allSettled([
                changeDetection_1.changeDetectionEngine.healthCheck(),
                tosMonitoring_1.tosMonitoringService.healthCheck(),
                documentCrawler_1.documentCrawlerService.healthCheck(),
                mongoChangeStream_1.mongoChangeStreamService.healthCheck(),
            ]);
            const failed = healthChecks.filter(check => check.status === 'rejected');
            if (failed.length > 0) {
                return reply.code(503).send({
                    status: 'unhealthy',
                    checks: healthChecks.map((check, index) => ({
                        service: ['changeDetection', 'tosMonitoring', 'documentCrawler', 'mongoChangeStream'][index],
                        status: check.status,
                        error: check.status === 'rejected' ? check.reason?.message : undefined
                    }))
                });
            }
            return reply.send({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: config_1.config.services.monitoring.version
            });
        });
        server.get('/ready', async (request, reply) => {
            if (isShuttingDown) {
                return reply.code(503).send({ status: 'shutting down' });
            }
            return reply.send({ status: 'ready' });
        });
        const shutdown = async (signal) => {
            if (isShuttingDown) {
                logger.warn('Shutdown already in progress');
                return;
            }
            logger.info(`Received ${signal}, shutting down gracefully`);
            isShuttingDown = true;
            try {
                await server.close();
                await Promise.all([
                    scheduler_1.schedulerService.shutdown(),
                    mongoChangeStream_1.mongoChangeStreamService.shutdown(),
                    alertingService_1.alertingService.shutdown(),
                    webhookService_1.webhookService.shutdown(),
                    tosMonitoring_1.tosMonitoringService.shutdown(),
                ]);
                await Promise.all([
                    rateLimiting_1.rateLimitingService.shutdown(),
                    circuitBreaker_1.circuitBreakerService.shutdown(),
                    documentCrawler_1.documentCrawlerService.shutdown(),
                    changeDetection_1.changeDetectionEngine.shutdown(),
                ]);
                logger.info('Monitoring service stopped');
                process.exit(0);
            }
            catch (error) {
                logger.error('Error during shutdown', { error });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        logger.error('Failed to start monitoring service', { error });
        process.exit(1);
    }
}
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    process.exit(1);
});
start();
//# sourceMappingURL=index.js.map