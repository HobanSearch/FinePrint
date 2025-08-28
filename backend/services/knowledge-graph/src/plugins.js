"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlugins = registerPlugins;
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const config_1 = require("@fineprintai/shared-config");
async function registerPlugins(server) {
    await server.register(cors_1.default, {
        origin: config_1.config.app.environment === 'production'
            ? ['https://fineprintai.com', 'https://app.fineprintai.com']
            : true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    });
    await server.register(helmet_1.default, {
        contentSecurityPolicy: config_1.config.app.environment === 'production' ? undefined : false,
    });
    await server.register(rate_limit_1.default, {
        max: 100,
        timeWindow: '1 minute',
        errorResponseBuilder: (request, context) => ({
            code: 429,
            error: 'Rate limit exceeded',
            message: `Too many requests, retry after ${Math.round(context.ttl / 1000)} seconds`,
            retryAfter: Math.round(context.ttl / 1000),
        }),
    });
    await server.register(swagger_1.default, {
        openapi: {
            openapi: '3.0.0',
            info: {
                title: 'Fine Print AI - Knowledge Graph Service',
                description: 'Advanced knowledge graph management with Neo4j, curriculum learning, and semantic reasoning',
                version: '1.0.0',
                contact: {
                    name: 'Fine Print AI Team',
                    url: 'https://fineprintai.com',
                    email: 'api@fineprintai.com',
                },
            },
            servers: [
                {
                    url: config_1.config.app.environment === 'production'
                        ? 'https://api.fineprintai.com/knowledge-graph'
                        : 'http://localhost:3007',
                    description: config_1.config.app.environment === 'production' ? 'Production' : 'Development',
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            security: [{ bearerAuth: [] }],
            tags: [
                {
                    name: 'Knowledge Graph',
                    description: 'Core knowledge graph operations',
                },
                {
                    name: 'Curriculum Learning',
                    description: 'Adaptive curriculum and learning management',
                },
                {
                    name: 'Semantic Search',
                    description: 'Intelligent search and reasoning',
                },
                {
                    name: 'Analytics',
                    description: 'Graph analytics and insights',
                },
                {
                    name: 'Knowledge Extraction',
                    description: 'Automated knowledge extraction from documents',
                },
                {
                    name: 'Graph Inference',
                    description: 'Graph-enhanced AI inference',
                },
            ],
        },
    });
    await server.register(swagger_ui_1.default, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false,
            defaultModelRendering: 'example',
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
    });
    server.addHook('onRequest', async (request) => {
        request.log.info('Incoming request', {
            method: request.method,
            url: request.url,
            userAgent: request.headers['user-agent'],
            requestId: request.id,
        });
    });
    server.addHook('onSend', async (request, reply, payload) => {
        const responseTime = Date.now() - request.startTime;
        reply.header('X-Response-Time', `${responseTime}ms`);
        request.log.info('Request completed', {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime,
            requestId: request.id,
        });
        return payload;
    });
    server.addHook('onRequest', async (request) => {
        request.startTime = Date.now();
    });
}
//# sourceMappingURL=plugins.js.map