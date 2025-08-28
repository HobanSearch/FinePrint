"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPlugins = setupPlugins;
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const middleware_1 = require("@fineprintai/shared-middleware");
const logger = (0, logger_1.createServiceLogger)('notification-plugins');
async function setupPlugins(server) {
    await server.register(cors_1.default, {
        origin: config_1.config.cors.origins,
        credentials: true,
    });
    await server.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'wss:', 'https:'],
                fontSrc: ["'self'", 'https:', 'data:'],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
    });
    await server.register(rate_limit_1.default, {
        max: config_1.config.rateLimit.notification.max,
        timeWindow: config_1.config.rateLimit.notification.timeWindow,
        skipSuccessfulRequests: false,
        skipOnError: false,
        keyGenerator: (request) => {
            const userId = request.user?.id;
            const ip = request.ip;
            return userId || ip;
        },
        errorResponseBuilder: (request, context) => ({
            code: 'RATE_LIMIT_EXCEEDED',
            error: 'Rate limit exceeded',
            message: `Too many requests. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
            retryAfter: Math.round(context.ttl / 1000),
        }),
    });
    await server.register(websocket_1.default, {
        options: {
            maxPayload: 1024 * 1024,
            verifyClient: (info, callback) => {
                callback(true);
            },
        },
    });
    await server.register(multipart_1.default, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 5,
        },
    });
    if (config_1.config.NODE_ENV !== 'production') {
        await server.register(swagger_1.default, {
            swagger: {
                info: {
                    title: 'Fine Print AI Notification Service',
                    description: 'Multi-channel notification service with SendGrid/SES integration, user preferences, and real-time delivery tracking',
                    version: '1.0.0',
                },
                host: `localhost:${config_1.config.services.notification.port}`,
                schemes: ['http', 'https'],
                consumes: ['application/json', 'multipart/form-data'],
                produces: ['application/json'],
                tags: [
                    { name: 'notifications', description: 'Notification management' },
                    { name: 'preferences', description: 'User notification preferences' },
                    { name: 'templates', description: 'Email and notification templates' },
                    { name: 'delivery', description: 'Delivery tracking and analytics' },
                    { name: 'ab-testing', description: 'A/B testing for notifications' },
                    { name: 'webhooks', description: 'Webhook integrations' },
                    { name: 'health', description: 'Service health and monitoring' },
                ],
                securityDefinitions: {
                    Bearer: {
                        type: 'apiKey',
                        name: 'Authorization',
                        in: 'header',
                        description: 'JWT token. Format: Bearer {token}',
                    },
                },
                security: [{ Bearer: [] }],
            },
            transform: ({ schema, url }) => {
                if (!schema.definitions) {
                    schema.definitions = {};
                }
                schema.definitions.Error = {
                    type: 'object',
                    properties: {
                        code: { type: 'string' },
                        message: { type: 'string' },
                        details: { type: 'object' },
                    },
                    required: ['code', 'message'],
                };
                schema.definitions.SuccessResponse = {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                        message: { type: 'string' },
                    },
                    required: ['success'],
                };
                return { schema, url };
            },
        });
        await server.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'list',
                deepLinking: false,
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
        });
    }
    server.addHook('preHandler', async (request, reply) => {
        const publicPaths = ['/health', '/metrics', '/docs'];
        const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
        if (!isPublicPath) {
            await (0, middleware_1.authMiddleware)(request, reply);
        }
    });
    server.addHook('onRequest', async (request) => {
        logger.info('Incoming request', {
            method: request.method,
            url: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            userId: request.user?.id,
        });
    });
    server.addHook('onResponse', async (request, reply) => {
        const responseTime = reply.getResponseTime();
        logger.info('Request completed', {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime: Math.round(responseTime),
            userId: request.user?.id,
        });
    });
    server.addHook('onError', async (request, reply, error) => {
        logger.error('Request error', {
            method: request.method,
            url: request.url,
            error: error.message,
            stack: error.stack,
            userId: request.user?.id,
        });
    });
    logger.info('All plugins registered successfully');
}
//# sourceMappingURL=plugins.js.map