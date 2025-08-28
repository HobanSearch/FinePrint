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
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('websocket-plugins');
async function setupPlugins(server) {
    await server.register(cors_1.default, {
        origin: config_1.config.cors.origins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });
    await server.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    });
    await server.register(rate_limit_1.default, {
        max: config_1.config.rateLimiting.websocket.max,
        timeWindow: config_1.config.rateLimiting.websocket.window,
        skipOnError: true,
        keyGenerator: (request) => {
            return request.headers['x-forwarded-for'] ||
                request.headers['x-real-ip'] ||
                request.ip;
        },
        errorResponseBuilder: (request, context) => {
            return {
                code: 429,
                error: 'Too Many Requests',
                message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
                expiresIn: Math.round(context.ttl / 1000),
            };
        },
    });
    await server.register(swagger_1.default, {
        swagger: {
            info: {
                title: 'Fine Print AI WebSocket Service',
                description: 'Real-time WebSocket service with Socket.io and Redis clustering',
                version: '1.0.0',
            },
            host: `localhost:${config_1.config.services.websocket.port}`,
            schemes: ['http', 'https'],
            consumes: ['application/json'],
            produces: ['application/json'],
            tags: [
                { name: 'Health', description: 'Service health endpoints' },
                { name: 'Metrics', description: 'Service metrics and monitoring' },
                { name: 'Admin', description: 'Administrative endpoints' },
                { name: 'WebSocket', description: 'WebSocket connection management' },
            ],
            securityDefinitions: {
                Bearer: {
                    type: 'apiKey',
                    name: 'Authorization',
                    in: 'header',
                    description: 'JWT token for authentication (format: Bearer <token>)',
                },
            },
        },
        transform: ({ schema, url }) => {
            if (schema.security === undefined && !url.includes('/health')) {
                schema.security = [{ Bearer: [] }];
            }
            return { schema, url };
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
        transformSpecification: (swaggerObject) => {
            return swaggerObject;
        },
        transformSpecificationClone: true,
    });
    server.setErrorHandler(async (error, request, reply) => {
        const statusCode = error.statusCode || 500;
        logger.error('HTTP error', {
            error: error.message,
            statusCode,
            method: request.method,
            url: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            stack: error.stack,
        });
        const errorResponse = {
            error: true,
            code: statusCode,
            message: error.message,
            timestamp: new Date().toISOString(),
            requestId: request.id,
        };
        if (config_1.config.NODE_ENV === 'production' && statusCode === 500) {
            errorResponse.message = 'Internal server error';
        }
        reply.status(statusCode).send(errorResponse);
    });
    server.addHook('onRequest', async (request) => {
        logger.debug('Incoming request', {
            method: request.method,
            url: request.url,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            requestId: request.id,
        });
    });
    server.addHook('onResponse', async (request, reply) => {
        const responseTime = reply.elapsedTime;
        logger.info('Request completed', {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime: `${responseTime}ms`,
            requestId: request.id,
        });
    });
    logger.info('All plugins registered successfully');
}
//# sourceMappingURL=plugins.js.map