import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { registerRoutes } from './routes/index.js';
import { registerPlugins } from './plugins.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { RedisClient } from './utils/redis.js';
import { DatabaseClient } from './utils/database.js';
import { DesignSystemEngine } from './engines/design-system-engine.js';
import { ComponentGenerator } from './generators/component-generator.js';
import { UXAnalyticsEngine } from './analytics/ux-analytics-engine.js';
import { AccessibilityAssistant } from './accessibility/accessibility-assistant.js';
import { FigmaIntegration } from './integrations/figma-integration.js';
import { ABTestingFramework } from './analytics/ab-testing-framework.js';
const fastify = Fastify({
    logger: {
        level: config.logLevel,
    },
});
await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
});
await fastify.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
        },
    },
});
await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    redis: new RedisClient().client,
});
await fastify.register(websocket);
await fastify.register(swagger, {
    openapi: {
        openapi: '3.0.0',
        info: {
            title: 'Fine Print AI - Design System API',
            description: 'Autonomous Design System and Component Generation Platform',
            version: '1.0.0',
        },
        servers: [
            {
                url: `http://localhost:${config.port}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    name: 'X-API-Key',
                    in: 'header',
                },
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                },
            },
        },
    },
    hideUntagged: true,
});
await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
});
const redisClient = new RedisClient();
const databaseClient = new DatabaseClient();
const designSystemEngine = new DesignSystemEngine(databaseClient, redisClient);
const componentGenerator = new ComponentGenerator(designSystemEngine);
const uxAnalyticsEngine = new UXAnalyticsEngine(databaseClient, redisClient);
const accessibilityAssistant = new AccessibilityAssistant();
const figmaIntegration = new FigmaIntegration(designSystemEngine);
const abTestingFramework = new ABTestingFramework(uxAnalyticsEngine, databaseClient);
fastify.decorate('designSystemEngine', designSystemEngine);
fastify.decorate('componentGenerator', componentGenerator);
fastify.decorate('uxAnalyticsEngine', uxAnalyticsEngine);
fastify.decorate('accessibilityAssistant', accessibilityAssistant);
fastify.decorate('figmaIntegration', figmaIntegration);
fastify.decorate('abTestingFramework', abTestingFramework);
fastify.decorate('redis', redisClient);
fastify.decorate('database', databaseClient);
await registerPlugins(fastify);
await registerRoutes(fastify);
fastify.get('/health', {
    schema: {
        tags: ['Health'],
        description: 'Health check endpoint',
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    timestamp: { type: 'string' },
                    version: { type: 'string' },
                    services: {
                        type: 'object',
                        properties: {
                            database: { type: 'string' },
                            redis: { type: 'string' },
                            designSystem: { type: 'string' },
                            figma: { type: 'string' },
                        },
                    },
                },
            },
        },
    },
}, async (request, reply) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
            database: await databaseClient.healthCheck() ? 'healthy' : 'unhealthy',
            redis: await redisClient.healthCheck() ? 'healthy' : 'unhealthy',
            designSystem: await designSystemEngine.healthCheck() ? 'healthy' : 'unhealthy',
            figma: await figmaIntegration.healthCheck() ? 'healthy' : 'unhealthy',
        },
    };
    const isHealthy = Object.values(health.services).every(status => status === 'healthy');
    reply.code(isHealthy ? 200 : 503).send(health);
});
fastify.setErrorHandler(async (error, request, reply) => {
    logger.error({
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
    }, 'Request error');
    reply.code(error.statusCode || 500).send({
        error: 'Internal Server Error',
        message: error.message,
        statusCode: error.statusCode || 500,
    });
});
fastify.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
    });
});
const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    try {
        await fastify.close();
        await redisClient.disconnect();
        await databaseClient.disconnect();
        logger.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger.error(error, 'Error during graceful shutdown');
        process.exit(1);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
const start = async () => {
    try {
        await redisClient.connect();
        await databaseClient.connect();
        await designSystemEngine.initialize();
        await figmaIntegration.initialize();
        await fastify.listen({
            port: config.port,
            host: config.host,
        });
        logger.info(`Design System service started on ${config.host}:${config.port}`);
        logger.info(`API documentation available at http://${config.host}:${config.port}/docs`);
    }
    catch (error) {
        logger.error(error, 'Failed to start server');
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map