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
async function setupPlugins(server) {
    await server.register(cors_1.default, {
        origin: (origin, callback) => {
            const hostname = new URL(origin || '').hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                callback(null, true);
                return;
            }
            if (hostname === 'fineprintai.com' || hostname.endsWith('.fineprintai.com')) {
                callback(null, true);
                return;
            }
            callback(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Authorization',
            'Content-Type',
            'X-API-Key',
            'X-Request-ID',
            'X-Forwarded-For'
        ],
    });
    await server.register(helmet_1.default, {
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
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,
    });
    await server.register(rate_limit_1.default, {
        global: false,
        max: 100,
        timeWindow: '1 minute',
        errorResponseBuilder: (request, context) => ({
            code: 429,
            error: 'Too Many Requests',
            message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
            date: Date.now(),
            expiresIn: Math.round(context.ttl / 1000),
        }),
    });
    await server.register(swagger_1.default, {
        swagger: {
            info: {
                title: 'Fine Print AI Gateway Service',
                description: 'Health monitoring and administration for Kong API Gateway',
                version: '1.0.0',
            },
            host: 'localhost:8003',
            schemes: ['http', 'https'],
            consumes: ['application/json'],
            produces: ['application/json'],
            tags: [
                { name: 'Health', description: 'Health check endpoints' },
                { name: 'Admin', description: 'Kong administration endpoints' },
                { name: 'Metrics', description: 'Monitoring and metrics endpoints' },
                { name: 'Config', description: 'Configuration management endpoints' },
            ],
            securityDefinitions: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    name: 'X-API-Key',
                    in: 'header',
                },
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
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
//# sourceMappingURL=plugins.js.map