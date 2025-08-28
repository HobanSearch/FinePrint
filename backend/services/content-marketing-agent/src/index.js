"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
exports.start = start;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const routes_1 = __importDefault(require("./routes"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const types_1 = require("./types");
const fastify = (0, fastify_1.default)({
    logger: false,
    trustProxy: true
});
async function buildApp() {
    try {
        await fastify.register(cors_1.default, {
            origin: config_1.serverConfig.cors.origin,
            credentials: config_1.serverConfig.cors.credentials
        });
        await fastify.register(helmet_1.default, {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"]
                }
            }
        });
        await fastify.register(rate_limit_1.default, {
            max: config_1.serverConfig.rateLimit.max,
            timeWindow: config_1.serverConfig.rateLimit.timeWindow,
            errorResponseBuilder: (request, context) => ({
                error: 'Rate limit exceeded',
                message: `Too many requests. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
                statusCode: 429
            })
        });
        await fastify.register(swagger_1.default, {
            swagger: {
                info: {
                    title: 'Fine Print AI - Content Marketing Agent API',
                    description: 'Autonomous content marketing system for Fine Print AI',
                    version: '1.0.0'
                },
                host: `localhost:${config_1.serverConfig.port}`,
                schemes: ['http', 'https'],
                consumes: ['application/json'],
                produces: ['application/json'],
                tags: [
                    { name: 'Health', description: 'Health check endpoints' },
                    { name: 'Content', description: 'Content creation and management' },
                    { name: 'Campaigns', description: 'Marketing campaign management' },
                    { name: 'Analytics', description: 'Performance analytics and insights' },
                    { name: 'Leads', description: 'Lead generation and management' },
                    { name: 'SEO', description: 'SEO optimization and keyword research' },
                    { name: 'Distribution', description: 'Content distribution and publishing' }
                ]
            }
        });
        await fastify.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'list',
                deepLinking: false
            }
        });
        fastify.setErrorHandler((error, request, reply) => {
            logger_1.logger.error('Request error', {
                error: error.message,
                stack: error.stack,
                url: request.url,
                method: request.method,
                params: request.params,
                query: request.query
            });
            if (error instanceof types_1.ContentMarketingError) {
                reply.status(error.statusCode).send({
                    success: false,
                    error: error.message,
                    code: error.code
                });
            }
            else if (error.validation) {
                reply.status(400).send({
                    success: false,
                    error: 'Validation error',
                    details: error.validation
                });
            }
            else {
                reply.status(500).send({
                    success: false,
                    error: 'Internal server error'
                });
            }
        });
        await fastify.register(routes_1.default, { prefix: '/api/v1' });
        fastify.setNotFoundHandler((request, reply) => {
            reply.status(404).send({
                success: false,
                error: 'Endpoint not found',
                path: request.url
            });
        });
        return fastify;
    }
    catch (error) {
        logger_1.logger.error('Failed to build app', { error });
        throw error;
    }
}
async function start() {
    try {
        const app = await buildApp();
        const address = await app.listen({
            port: config_1.serverConfig.port,
            host: config_1.serverConfig.host
        });
        logger_1.logger.info('Content Marketing Agent started successfully', {
            address,
            environment: config_1.serverConfig.environment,
            features: [
                'AI Content Creation',
                'Multi-Channel Distribution',
                'SEO Optimization',
                'Campaign Management',
                'Lead Generation',
                'Performance Analytics'
            ]
        });
        const gracefulShutdown = async (signal) => {
            logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
            try {
                await app.close();
                logger_1.logger.info('Server closed successfully');
                process.exit(0);
            }
            catch (error) {
                logger_1.logger.error('Error during shutdown', { error });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('uncaughtException', (error) => {
            logger_1.logger.error('Uncaught exception', { error });
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.logger.error('Unhandled rejection', { reason, promise });
            process.exit(1);
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start server', { error });
        process.exit(1);
    }
}
if (require.main === module) {
    start();
}
exports.default = fastify;
//# sourceMappingURL=index.js.map