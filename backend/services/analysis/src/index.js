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
const analysisEngine_1 = require("./services/analysisEngine");
const changeMonitor_1 = require("./services/changeMonitor");
const websocketService_1 = require("./services/websocketService");
const logger = (0, logger_1.createServiceLogger)('unified-analysis-service');
let wsService;
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: false,
        requestIdLogLabel: 'requestId',
        genReqId: () => crypto.randomUUID(),
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
        logger.info('Initializing unified analysis services...');
        await Promise.all([
            analysisEngine_1.unifiedAnalysisEngine.initialize(),
            changeMonitor_1.changeMonitoringService.initialize()
        ]);
        logger.info('All unified services initialized successfully');
        await (0, workers_1.setupWorkers)();
        const address = await server.listen({
            port: config_1.config.services.analysis.port,
            host: '0.0.0.0',
        });
        logger.info('Initializing WebSocket service...');
        wsService = (0, websocketService_1.createWebSocketService)(server.server);
        logger.info('WebSocket service initialized successfully');
        logger.info(`Unified Analysis service started on ${address}`, {
            service: config_1.config.services.analysis.name,
            version: config_1.config.services.analysis.version,
            port: config_1.config.services.analysis.port,
            environment: config_1.config.NODE_ENV,
            features: [
                'unified-analysis-engine',
                'document-pipeline',
                'dashboard-service',
                'report-generator',
                'change-monitoring',
                'export-service',
                'websocket-real-time'
            ]
        });
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                if (wsService) {
                    await wsService.shutdown();
                }
                await server.close();
                await queue_1.queueManager.closeAll();
                await cache_1.analysisCache.disconnect();
                logger.info('Unified Analysis service stopped');
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
        logger.error('Failed to start analysis service', { error });
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