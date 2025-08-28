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
const multipart_1 = __importDefault(require("@fastify/multipart"));
const config_1 = require("@fineprintai/shared-config");
const redis_1 = __importDefault(require("@fastify/redis"));
async function setupPlugins(server) {
    await server.register(cors_1.default, {
        origin: config_1.config.security.cors.origin,
        credentials: config_1.config.security.cors.credentials,
        methods: config_1.config.security.cors.methods,
        allowedHeaders: config_1.config.security.cors.allowedHeaders,
    });
    await server.register(helmet_1.default, {
        contentSecurityPolicy: config_1.config.security.helmet.contentSecurityPolicy,
        hsts: config_1.config.security.helmet.hsts,
    });
    await server.register(rate_limit_1.default, {
        max: config_1.config.rateLimiting.global.max,
        timeWindow: config_1.config.rateLimiting.global.timeWindow,
        redis: redis_1.default,
        nameSpace: 'analysis-service-rl:',
        errorResponseBuilder: (request, context) => ({
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
            retryAfter: Math.round(context.ttl / 1000),
        }),
    });
    await server.register(redis_1.default, {
        host: config_1.config.redis.url.split('://')[1].split(':')[0],
        port: parseInt(config_1.config.redis.url.split(':')[2] || '6379'),
        namespace: 'analysis-service',
    });
    await server.register(multipart_1.default, {
        limits: {
            fileSize: 50 * 1024 * 1024,
            files: 1,
        },
    });
    await server.register(swagger_1.default, {
        openapi: {
            openapi: '3.1.0',
            info: {
                title: 'Fine Print AI - Analysis Service',
                description: 'Document analysis microservice with AI-powered legal document processing',
                version: '1.0.0',
                contact: {
                    name: 'Fine Print AI Team',
                    email: 'support@fineprintai.com',
                },
                license: {
                    name: 'MIT',
                },
            },
            servers: [
                {
                    url: `http://localhost:${config_1.config.services.analysis.port}`,
                    description: 'Development server',
                },
                {
                    url: 'https://api.fineprintai.com/analysis',
                    description: 'Production server',
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                    apiKey: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'X-API-Key',
                    },
                },
            },
            security: [
                { bearerAuth: [] },
                { apiKey: [] },
            ],
            tags: [
                {
                    name: 'Analysis',
                    description: 'Document analysis operations',
                },
                {
                    name: 'Documents',
                    description: 'Document management operations',
                },
                {
                    name: 'Patterns',
                    description: 'Pattern library operations',
                },
                {
                    name: 'Health',
                    description: 'Service health and monitoring',
                },
            ],
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
        transformSpecification: (swaggerObject, request, reply) => {
            return swaggerObject;
        },
        transformSpecificationClone: true,
    });
    server.get('/health', {
        schema: {
            tags: ['Health'],
            summary: 'Health check endpoint',
            description: 'Returns service health status',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        timestamp: { type: 'string' },
                        uptime: { type: 'number' },
                        version: { type: 'string' },
                        dependencies: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    status: { type: 'string' },
                                    responseTimeMs: { type: 'number' },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const startTime = Date.now();
        const dependencies = [];
        try {
            const redisStart = Date.now();
            await server.redis.ping();
            dependencies.push({
                name: 'Redis',
                status: 'connected',
                responseTimeMs: Date.now() - redisStart,
            });
        }
        catch (error) {
            dependencies.push({
                name: 'Redis',
                status: 'disconnected',
                error: error.message,
            });
        }
        try {
            const ollamaStart = Date.now();
            const response = await fetch(`${config_1.config.ai.ollama.url}/api/tags`);
            dependencies.push({
                name: 'Ollama',
                status: response.ok ? 'connected' : 'error',
                responseTimeMs: Date.now() - ollamaStart,
            });
        }
        catch (error) {
            dependencies.push({
                name: 'Ollama',
                status: 'disconnected',
                error: error.message,
            });
        }
        const isHealthy = dependencies.every(dep => dep.status === 'connected');
        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: config_1.config.services.analysis.version,
            dependencies,
        };
    });
    server.get('/ready', {
        schema: {
            tags: ['Health'],
            summary: 'Readiness check endpoint',
            description: 'Returns service readiness status',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        ready: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return {
            ready: true,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/metrics', {
        schema: {
            tags: ['Health'],
            summary: 'Prometheus metrics endpoint',
            description: 'Returns service metrics in Prometheus format',
            response: {
                200: {
                    type: 'string',
                    description: 'Prometheus metrics',
                },
            },
        },
    }, async (request, reply) => {
        reply.header('Content-Type', 'text/plain');
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();
        return `
# HELP nodejs_process_uptime_seconds Process uptime in seconds
# TYPE nodejs_process_uptime_seconds counter
nodejs_process_uptime_seconds ${uptime}

# HELP nodejs_memory_usage_bytes Process memory usage in bytes
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}
nodejs_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}
nodejs_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}
nodejs_memory_usage_bytes{type="external"} ${memUsage.external}

# HELP fineprintai_analysis_service_info Service information
# TYPE fineprintai_analysis_service_info gauge
fineprintai_analysis_service_info{version="${config_1.config.services.analysis.version}",environment="${config_1.config.NODE_ENV}"} 1
`.trim();
    });
}
//# sourceMappingURL=plugins.js.map