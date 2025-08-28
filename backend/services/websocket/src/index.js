"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsService = exports.messageQueueService = exports.wsService = void 0;
exports.getHealthStatus = getHealthStatus;
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const middleware_1 = require("@fineprintai/shared-middleware");
const plugins_1 = require("./plugins");
const routes_1 = require("./routes");
const websocketService_1 = require("./services/websocketService");
const messageQueueService_1 = require("./services/messageQueueService");
const metricsService_1 = require("./services/metricsService");
const logger = (0, logger_1.createServiceLogger)('websocket-service');
let wsService;
let messageQueueService;
let metricsService;
let httpServer;
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: false,
        requestIdLogLabel: 'requestId',
        genReqId: () => crypto.randomUUID(),
        keepAliveTimeout: 30000,
        bodyLimit: 1048576,
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
        httpServer = server.server;
        logger.info('Initializing WebSocket services...');
        exports.metricsService = metricsService = new metricsService_1.MetricsService();
        await metricsService.initialize();
        exports.messageQueueService = messageQueueService = new messageQueueService_1.MessageQueueService();
        await messageQueueService.initialize();
        exports.wsService = wsService = new websocketService_1.WebSocketService(httpServer, messageQueueService, metricsService);
        await wsService.initialize();
        logger.info('All WebSocket services initialized successfully');
        const address = await server.listen({
            port: config_1.config.services.websocket.port,
            host: '0.0.0.0',
        });
        logger.info(`WebSocket service started on ${address}`, {
            service: config_1.config.services.websocket.name,
            version: config_1.config.services.websocket.version,
            port: config_1.config.services.websocket.port,
            environment: config_1.config.NODE_ENV,
            features: [
                'socket.io-v4',
                'redis-clustering',
                'jwt-authentication',
                'rate-limiting',
                'message-queuing',
                'offline-support',
                'horizontal-scaling',
                'monitoring-metrics'
            ]
        });
        setupHealthChecks();
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                if (wsService) {
                    await wsService.shutdown();
                }
                if (messageQueueService) {
                    await messageQueueService.shutdown();
                }
                if (metricsService) {
                    await metricsService.shutdown();
                }
                await server.close();
                logger.info('WebSocket service stopped');
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
        logger.error('Failed to start WebSocket service', { error });
        process.exit(1);
    }
}
function setupHealthChecks() {
    setInterval(async () => {
        try {
            const health = await getHealthStatus();
            if (!health.healthy) {
                logger.warn('Health check failed', { health });
            }
        }
        catch (error) {
            logger.error('Health check error', { error });
        }
    }, 30000);
}
async function getHealthStatus() {
    try {
        const wsHealth = wsService ? await wsService.getHealthStatus() : { healthy: false };
        const queueHealth = messageQueueService ? await messageQueueService.getHealthStatus() : { healthy: false };
        const metricsHealth = metricsService ? await metricsService.getHealthStatus() : { healthy: false };
        const healthy = wsHealth.healthy && queueHealth.healthy && metricsHealth.healthy;
        return {
            healthy,
            timestamp: new Date().toISOString(),
            services: {
                websocket: wsHealth,
                messageQueue: queueHealth,
                metrics: metricsHealth,
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connections: wsService ? wsService.getConnectionStats() : { total: 0, unique: 0 },
        };
    }
    catch (error) {
        logger.error('Error getting health status', { error });
        return {
            healthy: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        };
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