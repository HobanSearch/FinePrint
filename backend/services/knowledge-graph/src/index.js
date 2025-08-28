"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const security_1 = require("@fineprintai/shared-security");
const knowledge_graph_service_1 = require("@/services/knowledge-graph-service");
const curriculum_learning_service_1 = require("@/services/curriculum-learning-service");
const graph_analytics_service_1 = require("@/services/graph-analytics-service");
const routes_1 = require("@/routes");
const plugins_1 = require("@/plugins");
const schema_1 = require("@/graphql/schema");
const logger = (0, logger_1.createServiceLogger)('knowledge-graph-service');
async function startServer() {
    const server = (0, fastify_1.default)({
        logger: {
            level: config_1.config.app.logLevel,
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname',
                },
            },
        },
        trustProxy: true,
        disableRequestLogging: config_1.config.app.environment === 'production',
        requestIdHeader: 'x-request-id',
        requestIdLogLabel: 'requestId',
    });
    try {
        await (0, plugins_1.registerPlugins)(server);
        await server.register(security_1.securityMiddleware);
        const knowledgeGraphService = new knowledge_graph_service_1.KnowledgeGraphService();
        const curriculumLearningService = new curriculum_learning_service_1.CurriculumLearningService(knowledgeGraphService);
        const graphAnalyticsService = new graph_analytics_service_1.GraphAnalyticsService(knowledgeGraphService);
        server.decorate('knowledgeGraph', knowledgeGraphService);
        server.decorate('curriculumLearning', curriculumLearningService);
        server.decorate('graphAnalytics', graphAnalyticsService);
        await knowledgeGraphService.initialize();
        await curriculumLearningService.initialize();
        await graphAnalyticsService.initialize();
        await server.register(schema_1.GraphQLSchema);
        await (0, routes_1.registerRoutes)(server);
        server.setErrorHandler(async (error, request, reply) => {
            logger.error('Unhandled error', {
                error: error.message,
                stack: error.stack,
                requestId: request.id,
                method: request.method,
                url: request.url,
            });
            const statusCode = error.statusCode || 500;
            const message = statusCode === 500 ? 'Internal Server Error' : error.message;
            return reply.status(statusCode).send({
                error: {
                    message,
                    statusCode,
                    timestamp: new Date().toISOString(),
                    requestId: request.id,
                },
            });
        });
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully`);
            try {
                await knowledgeGraphService.shutdown();
                await curriculumLearningService.shutdown();
                await graphAnalyticsService.shutdown();
                await server.close();
                logger.info('Server shutdown completed');
                process.exit(0);
            }
            catch (error) {
                logger.error('Error during shutdown', { error });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        const port = config_1.config.knowledgeGraph?.port || 3007;
        const host = config_1.config.app.environment === 'production' ? '0.0.0.0' : '127.0.0.1';
        await server.listen({ port, host });
        logger.info('Knowledge Graph Service started successfully', {
            port,
            host,
            environment: config_1.config.app.environment,
            neo4jConnected: await knowledgeGraphService.healthCheck(),
            curriculumEngine: curriculumLearningService.isInitialized(),
        });
    }
    catch (error) {
        logger.error('Failed to start Knowledge Graph Service', { error });
        process.exit(1);
    }
}
process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught Exception', { error });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Unhandled Rejection', { reason, promise });
    process.exit(1);
});
startServer().catch((error) => {
    logger.fatal('Failed to start service', { error });
    process.exit(1);
});
//# sourceMappingURL=index.js.map