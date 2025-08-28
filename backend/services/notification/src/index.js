"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const middleware_1 = require("@fineprintai/shared-middleware");
const queue_1 = require("@fineprintai/queue");
const cache_1 = require("@fineprintai/shared-cache");
const routes_1 = require("./routes");
const workers_1 = require("./workers");
const plugins_1 = require("./plugins");
const notificationService_1 = require("./services/notificationService");
const emailService_1 = require("./services/emailService");
const webhookService_1 = require("./services/webhookService");
const preferenceService_1 = require("./services/preferenceService");
const templateService_1 = require("./services/templateService");
const deliveryTracker_1 = require("./services/deliveryTracker");
const abTestService_1 = require("./services/abTestService");
const websocketService_1 = require("./services/websocketService");
const logger = (0, logger_1.createServiceLogger)('notification-service');
let wsService;
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: false,
        requestIdLogLabel: 'requestId',
        genReqId: () => crypto.randomUUID(),
        bodyLimit: 10 * 1024 * 1024,
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
        logger.info('Initializing notification services...');
        await Promise.all([
            notificationService_1.notificationService.initialize(),
            emailService_1.emailService.initialize(),
            webhookService_1.webhookService.initialize(),
            preferenceService_1.preferenceService.initialize(),
            templateService_1.templateService.initialize(),
            deliveryTracker_1.deliveryTracker.initialize(),
            abTestService_1.abTestService.initialize()
        ]);
        logger.info('All notification services initialized successfully');
        await (0, workers_1.setupWorkers)();
        const address = await server.listen({
            port: config_1.config.services.notification.port,
            host: '0.0.0.0',
        });
        logger.info('Initializing WebSocket service...');
        wsService = (0, websocketService_1.createWebSocketService)(server.server);
        logger.info('WebSocket service initialized successfully');
        logger.info(`Notification service started on ${address}`, {
            service: config_1.config.services.notification.name,
            version: config_1.config.services.notification.version,
            port: config_1.config.services.notification.port,
            environment: config_1.config.NODE_ENV,
            features: [
                'multi-channel-notifications',
                'sendgrid-ses-integration',
                'user-preferences',
                'gdpr-compliance',
                'notification-batching',
                'priority-queues',
                'ab-testing',
                'delivery-tracking',
                'retry-mechanisms',
                'websocket-real-time'
            ]
        });
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                if (wsService) {
                    await wsService.shutdown();
                }
                await Promise.all([
                    notificationService_1.notificationService.shutdown(),
                    emailService_1.emailService.shutdown(),
                    webhookService_1.webhookService.shutdown(),
                    deliveryTracker_1.deliveryTracker.shutdown(),
                    abTestService_1.abTestService.shutdown()
                ]);
                await server.close();
                await queue_1.queueManager.closeAll();
                await cache_1.notificationCache.disconnect();
                logger.info('Notification service stopped');
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
        logger.error('Failed to start notification service', { error });
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