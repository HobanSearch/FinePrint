"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const env_1 = __importDefault(require("@fastify/env"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const redis_1 = __importDefault(require("@fastify/redis"));
const autoload_1 = __importDefault(require("@fastify/autoload"));
const path_1 = require("path");
const shared_middleware_1 = require("@fineprintai/shared-middleware");
const shared_security_1 = require("@fineprintai/shared-security");
const workers_1 = require("@/workers");
const collectors_1 = require("@/collectors");
const logger_1 = require("@/utils/logger");
const envSchema = {
    type: 'object',
    required: [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'REDIS_URL',
        'MIXPANEL_TOKEN',
        'AMPLITUDE_API_KEY'
    ],
    properties: {
        NODE_ENV: { type: 'string' },
        PORT: { type: 'number', default: 3007 },
        DATABASE_URL: { type: 'string' },
        REDIS_URL: { type: 'string' },
        MIXPANEL_TOKEN: { type: 'string' },
        AMPLITUDE_API_KEY: { type: 'string' },
        SNOWFLAKE_ACCOUNT: { type: 'string' },
        SNOWFLAKE_USERNAME: { type: 'string' },
        SNOWFLAKE_PASSWORD: { type: 'string' },
        CLICKHOUSE_HOST: { type: 'string' },
        CLICKHOUSE_USERNAME: { type: 'string' },
        CLICKHOUSE_PASSWORD: { type: 'string' },
        ELASTICSEARCH_URL: { type: 'string' }
    }
};
const fastify = (0, fastify_1.default)({
    logger: logger_1.logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    generateRequestId: () => crypto.randomUUID(),
    bodyLimit: 10485760,
    keepAliveTimeout: 30000,
    connectionTimeout: 10000
});
async function buildApp() {
    try {
        await fastify.register(env_1.default, {
            schema: envSchema,
            confKey: 'config'
        });
        await fastify.register(helmet_1.default, {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            }
        });
        await fastify.register(cors_1.default, {
            origin: (origin, callback) => {
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:5173',
                    'https://*.fineprintai.com'
                ];
                if (!origin || allowedOrigins.some(allowed => allowed.includes('*') ?
                    origin.endsWith(allowed.replace('*.', '')) :
                    origin === allowed)) {
                    callback(null, true);
                }
                else {
                    callback(new Error('Not allowed by CORS'), false);
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        });
        await fastify.register(redis_1.default, {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            retryDelayOnFailover: 100,
            enableReadyCheck: true,
            lazyConnect: true
        });
        await fastify.register(swagger_1.default, {
            swagger: {
                info: {
                    title: 'Fine Print AI Analytics API',
                    description: 'Comprehensive analytics and business intelligence API',
                    version: '1.0.0',
                    contact: {
                        name: 'Fine Print AI Team',
                        email: 'analytics@fineprintai.com'
                    }
                },
                host: process.env.API_HOST || 'localhost:3007',
                schemes: ['https', 'http'],
                consumes: ['application/json'],
                produces: ['application/json'],
                securityDefinitions: {
                    Bearer: {
                        type: 'apiKey',
                        name: 'Authorization',
                        in: 'header',
                        description: 'Enter: Bearer {token}'
                    }
                },
                security: [{ Bearer: [] }],
                tags: [
                    { name: 'Product Analytics', description: 'Product usage analytics' },
                    { name: 'Business Intelligence', description: 'BI and reporting' },
                    { name: 'AI Performance', description: 'AI/ML model performance' },
                    { name: 'User Behavior', description: 'User behavior analytics' },
                    { name: 'Revenue Analytics', description: 'Revenue and cohort analysis' },
                    { name: 'A/B Testing', description: 'Feature experiments' },
                    { name: 'Performance', description: 'System performance monitoring' },
                    { name: 'Dashboards', description: 'Real-time dashboards' },
                    { name: 'Reports', description: 'Automated reporting' },
                    { name: 'Predictions', description: 'Predictive analytics' },
                    { name: 'Data Governance', description: 'Data quality and governance' },
                    { name: 'Exports', description: 'Data export capabilities' }
                ]
            }
        });
        await fastify.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'list',
                deepLinking: false
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
            transformSpecification: (swaggerObject) => {
                return swaggerObject;
            },
            transformSpecificationClone: true
        });
        await fastify.register(shared_middleware_1.authMiddleware);
        await fastify.register(shared_security_1.securityMiddleware);
        await fastify.register(autoload_1.default, {
            dir: (0, path_1.join)(__dirname, 'routes'),
            options: {
                prefix: '/api/v1'
            }
        });
        fastify.get('/health', {
            schema: {
                description: 'Health check endpoint',
                tags: ['Health'],
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            status: { type: 'string' },
                            timestamp: { type: 'string' },
                            uptime: { type: 'number' },
                            version: { type: 'string' },
                            services: {
                                type: 'object',
                                properties: {
                                    database: { type: 'string' },
                                    redis: { type: 'string' },
                                    mixpanel: { type: 'string' },
                                    amplitude: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            }
        }, async (request, reply) => {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
                services: {
                    database: 'healthy',
                    redis: fastify.redis.status,
                    mixpanel: 'healthy',
                    amplitude: 'healthy'
                }
            };
            return reply.code(200).send(health);
        });
        const gracefulShutdown = async (signal) => {
            fastify.log.info(`Received ${signal}, starting graceful shutdown`);
            try {
                await fastify.close();
                fastify.log.info('Analytics service shut down successfully');
                process.exit(0);
            }
            catch (error) {
                fastify.log.error('Error during shutdown:', error);
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        return fastify;
    }
    catch (error) {
        fastify.log.error('Error building app:', error);
        throw error;
    }
}
async function start() {
    try {
        const app = await buildApp();
        await (0, workers_1.setupAnalyticsWorkers)();
        await (0, collectors_1.initializeCollectors)();
        const address = await app.listen({
            port: Number(process.env.PORT) || 3007,
            host: '0.0.0.0'
        });
        app.log.info(`Analytics service started at ${address}`);
        app.log.info(`API documentation available at ${address}/docs`);
    }
    catch (error) {
        console.error('Failed to start analytics service:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    start();
}
//# sourceMappingURL=index.js.map