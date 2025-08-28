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
const plugins_1 = require("./plugins");
const kongAdmin_1 = require("./services/kongAdmin");
const healthCheck_1 = require("./services/healthCheck");
const metrics_1 = require("./services/metrics");
const configReload_1 = require("./services/configReload");
const logger = (0, logger_1.createServiceLogger)('gateway-service');
let kongAdmin;
let healthCheck;
let metricsService;
let configReload;
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: false,
        requestIdLogLabel: 'requestId',
        genReqId: () => crypto.randomUUID(),
        trustProxy: true,
    });
    (0, middleware_1.setupErrorHandling)();
    server.setErrorHandler(middleware_1.errorHandler);
    server.setNotFoundHandler(middleware_1.notFoundHandler);
    await (0, plugins_1.setupPlugins)(server);
    await (0, routes_1.registerRoutes)(server);
    return server;
}
async function start() {
    try {
        const server = await createServer();
        logger.info('Initializing gateway services...');
        kongAdmin = new kongAdmin_1.KongAdminService({
            adminUrl: config_1.config.kong.adminUrl || 'http://localhost:8001',
            adminToken: config_1.config.kong.adminToken,
        });
        healthCheck = new healthCheck_1.HealthCheckService({
            kongAdmin,
            services: [
                'analysis-service',
                'monitoring-service',
                'notification-service',
                'billing-service',
                'user-service'
            ],
            redisUrl: config_1.config.redis.url,
            checkInterval: 30000,
        });
        metricsService = new metrics_1.MetricsService({
            kongAdmin,
            prometheusPort: config_1.config.services.gateway.metricsPort || 9090,
        });
        configReload = new configReload_1.ConfigReloadService({
            kongAdmin,
            configPath: '/etc/kong/declarative/kong.yml',
            watchInterval: 60000,
        });
        await Promise.all([
            kongAdmin.initialize(),
            healthCheck.initialize(),
            metricsService.initialize(),
            configReload.initialize(),
        ]);
        logger.info('All gateway services initialized successfully');
        const address = await server.listen({
            port: config_1.config.services.gateway.port || 8003,
            host: '0.0.0.0',
        });
        logger.info(`Gateway health service started on ${address}`, {
            service: 'gateway-service',
            version: '1.0.0',
            port: config_1.config.services.gateway.port || 8003,
            environment: config_1.config.NODE_ENV,
            features: [
                'kong-admin-api',
                'health-monitoring',
                'metrics-collection',
                'config-hot-reload',
                'service-discovery',
                'circuit-breaker',
                'rate-limiting'
            ]
        });
        await metricsService.startMetricsServer();
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                await configReload.shutdown();
                await metricsService.shutdown();
                await healthCheck.shutdown();
                await kongAdmin.shutdown();
                await server.close();
                logger.info('Gateway service stopped');
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
        logger.error('Failed to start gateway service', { error });
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