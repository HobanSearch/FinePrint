"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPlugins = setupPlugins;
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
async function setupPlugins(fastify) {
    await fastify.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    });
    await fastify.register(cors_1.default, {
        origin: (origin, callback) => {
            const allowedOrigins = [
                'http://localhost:3000',
                'http://localhost:3001',
                'https://fineprint.ai',
                'https://app.fineprint.ai',
            ];
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    });
    await fastify.register(rate_limit_1.default, {
        max: 1000,
        timeWindow: '1 minute',
        keyGenerator: (request) => {
            return request.headers['x-api-key'] || request.ip;
        },
        errorResponseBuilder: (request, context) => {
            return {
                code: 429,
                error: 'Rate limit exceeded',
                message: `Too many requests, please try again later. Limit: ${context.max} requests per ${context.timeWindow}`,
                retryAfter: context.ttl,
            };
        },
    });
    await fastify.register(websocket_1.default, {
        options: {
            maxPayload: 1048576,
            verifyClient: (info) => {
                return true;
            },
        },
    });
    await fastify.register(swagger_1.default, {
        swagger: {
            info: {
                title: 'Fine Print AI - AI/ML Engineering Service',
                description: 'Comprehensive AI/ML lifecycle management and optimization platform',
                version: '1.0.0',
                contact: {
                    name: 'Fine Print AI Team',
                    email: 'support@fineprint.ai',
                },
                license: {
                    name: 'MIT',
                    url: 'https://opensource.org/licenses/MIT',
                },
            },
            host: 'localhost:3006',
            schemes: ['http', 'https'],
            consumes: ['application/json'],
            produces: ['application/json'],
            tags: [
                { name: 'Health', description: 'Health check endpoints' },
                { name: 'Training', description: 'Model training lifecycle management' },
                { name: 'Optimization', description: 'Hyperparameter optimization' },
                { name: 'Registry', description: 'Model registry and versioning' },
                { name: 'Monitoring', description: 'Performance monitoring and alerting' },
                { name: 'AutoML', description: 'Automated machine learning pipelines' },
                { name: 'Experiments', description: 'A/B testing and model comparison' },
                { name: 'Resources', description: 'Resource optimization and management' },
                { name: 'MLOps', description: 'MLOps orchestration and deployment' },
                { name: 'Integrations', description: 'Integration with existing AI systems' },
                { name: 'Metrics', description: 'System metrics and analytics' },
                { name: 'WebSocket', description: 'Real-time updates and streaming' },
            ],
            securityDefinitions: {
                apiKey: {
                    type: 'apiKey',
                    name: 'X-API-Key',
                    in: 'header',
                },
                bearer: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            security: [
                { apiKey: [] },
                { bearer: [] },
            ],
        },
    });
    await fastify.register(swagger_ui_1.default, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false,
            defaultModelRendering: 'model',
        },
        uiHooks: {
            onRequest: (request, reply, next) => {
                next();
            },
        },
        staticCSP: true,
        transformStaticCSP: (header) => header,
    });
    fastify.setErrorHandler(async (error, request, reply) => {
        const statusCode = error.statusCode || 500;
        fastify.log.error({
            error: error.message,
            stack: error.stack,
            request: {
                method: request.method,
                url: request.url,
                headers: request.headers,
            },
        });
        const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
            ? 'Internal Server Error'
            : error.message;
        await reply.status(statusCode).send({
            error: true,
            message,
            statusCode,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
        });
    });
    fastify.setNotFoundHandler(async (request, reply) => {
        await reply.status(404).send({
            error: true,
            message: 'Route not found',
            statusCode: 404,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            suggestion: 'Check the API documentation at /docs for available endpoints',
        });
    });
    fastify.addHook('onRequest', async (request, reply) => {
        request.log.info({
            method: request.method,
            url: request.url,
            userAgent: request.headers['user-agent'],
            ip: request.ip,
        }, 'Incoming request');
    });
    fastify.addHook('onResponse', async (request, reply) => {
        request.log.info({
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            responseTime: reply.getResponseTime(),
        }, 'Request completed');
    });
    fastify.addHook('onReady', async () => {
        fastify.log.info('AI/ML Engineering Service is ready to accept connections');
    });
}
//# sourceMappingURL=plugins.js.map