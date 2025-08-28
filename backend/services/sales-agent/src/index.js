"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
const routes_1 = require("./routes");
const plugins_1 = require("./plugins");
const services_1 = require("./services");
const server = (0, fastify_1.default)({
    logger: logger_1.logger,
    requestTimeout: 30000,
    bodyLimit: 10485760,
});
async function start() {
    try {
        await server.register(helmet_1.default, {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                },
            },
        });
        await server.register(cors_1.default, {
            origin: config_1.config.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        });
        await server.register(rate_limit_1.default, {
            max: 1000,
            timeWindow: '15 minutes',
            errorResponseBuilder: (req, context) => {
                return {
                    code: 429,
                    error: 'Too Many Requests',
                    message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
                    date: Date.now(),
                    expiresIn: Math.round(context.ttl / 1000),
                };
            },
        });
        await server.register(swagger_1.default, {
            swagger: {
                info: {
                    title: 'Fine Print AI - Sales Agent API',
                    description: 'Autonomous Sales Agent for CRM, Lead Management, and Revenue Forecasting',
                    version: '1.0.0',
                },
                host: `localhost:${config_1.config.port}`,
                schemes: ['http', 'https'],
                consumes: ['application/json'],
                produces: ['application/json'],
                tags: [
                    { name: 'leads', description: 'Lead management endpoints' },
                    { name: 'opportunities', description: 'Sales opportunity endpoints' },
                    { name: 'forecasting', description: 'Revenue forecasting endpoints' },
                    { name: 'automation', description: 'Sales automation endpoints' },
                    { name: 'analytics', description: 'Sales analytics endpoints' },
                    { name: 'health', description: 'Health check endpoints' },
                ],
            },
        });
        await server.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'full',
                deepLinking: false,
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
        });
        await server.register(plugins_1.salesAgentPlugin);
        await (0, services_1.initializeServices)();
        await (0, routes_1.registerRoutes)(server);
        server.get('/health', async (request, reply) => {
            return {
                status: 'healthy',
                service: 'sales-agent',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.env.npm_package_version || '1.0.0',
            };
        });
        const address = await server.listen({
            port: config_1.config.port,
            host: config_1.config.host,
        });
        logger_1.logger.info(`Sales Agent service started on ${address}`);
        process.on('SIGTERM', async () => {
            logger_1.logger.info('Received SIGTERM, shutting down gracefully...');
            await server.close();
            process.exit(0);
        });
        process.on('SIGINT', async () => {
            logger_1.logger.info('Received SIGINT, shutting down gracefully...');
            await server.close();
            process.exit(0);
        });
    }
    catch (error) {
        logger_1.logger.error(error, 'Error starting Sales Agent service');
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map