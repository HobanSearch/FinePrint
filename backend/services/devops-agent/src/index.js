"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const routes_1 = require("@/routes");
const plugins_1 = require("@/plugins");
const services_1 = require("@/services");
const error_handler_1 = require("@/utils/error-handler");
const workers_1 = require("@/workers");
const environment_validator_1 = require("@/utils/environment-validator");
const fastify = (0, fastify_1.default)({
    logger: false,
    trustProxy: true,
    maxParamLength: 1000,
    ignoreTrailingSlash: true,
});
const gracefulShutdown = async (signal) => {
    logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
        await fastify.close();
        logger_1.logger.info('Server closed successfully');
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Error during shutdown:', error);
        process.exit(1);
    }
};
const start = async () => {
    try {
        await (0, environment_validator_1.validateEnvironment)();
        (0, error_handler_1.setupErrorHandling)(fastify);
        await (0, plugins_1.registerPlugins)(fastify);
        await (0, services_1.initializeServices)();
        await (0, routes_1.registerRoutes)(fastify);
        await (0, workers_1.startBackgroundJobs)();
        await fastify.listen({
            port: config_1.config.server.port,
            host: config_1.config.server.host,
        });
        logger_1.logger.info(`🚀 DevOps Agent service started successfully`);
        logger_1.logger.info(`📊 Server listening on ${config_1.config.server.host}:${config_1.config.server.port}`);
        logger_1.logger.info(`📖 API Documentation: http://${config_1.config.server.host}:${config_1.config.server.port}/docs`);
        logger_1.logger.info(`🏥 Health Check: http://${config_1.config.server.host}:${config_1.config.server.port}/health`);
        fastify.get('/health', async () => ({
            status: 'healthy',
            service: 'devops-agent',
            version: process.env.npm_package_version || '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: config_1.config.app.environment,
            nodeVersion: process.version,
        }));
    }
    catch (error) {
        logger_1.logger.error('Failed to start DevOps Agent service:', error);
        process.exit(1);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
start();
//# sourceMappingURL=index.js.map