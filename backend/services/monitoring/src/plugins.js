"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPlugins = setupPlugins;
const config_1 = require("@fineprintai/shared-config");
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
async function setupPlugins(server) {
    await server.register(helmet_1.default, config_1.config.security.helmet);
    await server.register(cors_1.default, config_1.config.security.cors);
    await server.register(rate_limit_1.default, {
        global: true,
        ...config_1.config.rateLimiting.global,
        redis: config_1.config.redis.url,
        keyGenerator: (request) => {
            const apiKey = request.headers['x-api-key'];
            const userId = request.headers['x-user-id'];
            return apiKey || userId || request.ip;
        },
        errorResponseBuilder: (request, context) => ({
            error: 'Rate limit exceeded',
            message: `Too many requests. Rate limit: ${context.max} requests per ${context.ttl}ms`,
            retryAfter: Math.ceil(context.ttl / 1000),
        }),
    });
    await server.register(websocket_1.default);
    await server.register(multipart_1.default, {
        limits: {
            fieldNameSize: 100,
            fieldSize: 100,
            fields: 10,
            fileSize: 10 * 1024 * 1024,
            files: 5,
            headerPairs: 2000,
        },
    });
    if (config_1.config.NODE_ENV !== 'production') {
        await server.register(swagger_1.default, {
            openapi: {
                openapi: '3.0.0',
                info: {
                    title: 'Fine Print AI Monitoring Service',
                    description: 'Document monitoring and change detection service',
                    version: config_1.config.services.monitoring.version,
                    contact: {
                        name: 'Fine Print AI Team',
                        email: 'support@fineprintai.com',
                    },
                },
                servers: [
                    {
                        url: `http://localhost:${config_1.config.services.monitoring.port}`,
                        description: 'Development server',
                    },
                ],
                components: {
                    securitySchemes: {
                        apiKey: {
                            type: 'apiKey',
                            name: 'x-api-key',
                            in: 'header',
                        },
                        bearerAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT',
                        },
                    },
                },
                security: [
                    { apiKey: [] },
                    { bearerAuth: [] },
                ],
            },
        });
        await server.register(swagger_ui_1.default, {
            routePrefix: '/docs',
            uiConfig: {
                docExpansion: 'full',
                deepLinking: false,
            },
            uiHooks: {
                onRequest: function (request, reply, next) {
                    next();
                },
                preHandler: function (request, reply, next) {
                    next();
                },
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
            transformSpecification: (swaggerObject, request, reply) => {
                return swaggerObject;
            },
            transformSpecificationClone: true,
        });
    }
    server.addHook('onRequest', async (request, reply) => {
        request.startTime = Date.now();
    });
    server.addHook('onResponse', async (request, reply) => {
        const responseTime = Date.now() - (request.startTime || Date.now());
        server.log.info({
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime,
            userAgent: request.headers['user-agent'],
            ip: request.ip,
            requestId: request.id,
        }, 'Request completed');
    });
    server.addHook('onError', async (request, reply, error) => {
        server.log.error({
            method: request.method,
            url: request.url,
            error: error.message,
            stack: error.stack,
            requestId: request.id,
        }, 'Request error');
    });
}
//# sourceMappingURL=plugins.js.map