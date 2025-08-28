"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
exports.start = start;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const routes_1 = __importDefault(require("@/routes"));
const logger = logger_1.Logger.getInstance();
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: logger.child({ component: 'fastify' }),
        trustProxy: true,
        requestIdLogLabel: 'requestId',
        requestIdHeader: 'x-request-id',
    });
    await server.register(cors_1.default, {
        origin: config_1.serviceConfig.cors.origins,
        credentials: true,
    });
    await server.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    });
    await server.register(jwt_1.default, {
        secret: config_1.config.env.JWT_SECRET,
        sign: {
            expiresIn: '24h',
        },
    });
    server.decorate('authenticate', async function (request, reply) {
        try {
            await request.jwtVerify();
        }
        catch (err) {
            reply.send(err);
        }
    });
    server.decorate('verifyJWT', async function (request, reply) {
        try {
            const token = request.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                throw new Error('Missing authentication token');
            }
            const decoded = server.jwt.verify(token);
            request.user = decoded;
        }
        catch (err) {
            reply.status(401).send({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid or missing authentication token',
                    timestamp: new Date(),
                },
            });
        }
    });
    if (config_1.serviceConfig.rateLimit.enabled) {
        await server.register(rate_limit_1.default, {
            max: config_1.serviceConfig.rateLimit.max,
            timeWindow: config_1.serviceConfig.rateLimit.timeWindow,
            keyGenerator: (request) => {
                return request.ip || 'anonymous';
            },
        });
    }
    await server.register(multipart_1.default, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 5,
        },
    });
    await server.register(websocket_1.default, {
        options: {
            maxPayload: 1048576,
            verifyClient: (info) => {
                return true;
            },
        },
    });
    if (config_1.serviceConfig.docs.enabled) {
        await server.register(swagger_1.default, {
            swagger: {
                info: {
                    title: 'Full-Stack Development Agent API',
                    description: 'Autonomous code generation and architecture decision system',
                    version: config_1.serviceConfig.version,
                },
                host: `localhost:${config_1.serviceConfig.port}`,
                schemes: ['http', 'https'],
                consumes: ['application/json'],
                produces: ['application/json'],
                tags: [
                    { name: 'code-generation', description: 'Code generation endpoints' },
                    { name: 'architecture', description: 'Architecture decision endpoints' },
                    { name: 'quality', description: 'Quality assurance endpoints' },
                    { name: 'templates', description: 'Template management endpoints' },
                    { name: 'integrations', description: 'Integration management endpoints' },
                    { name: 'health', description: 'Health check endpoints' },
                ],
                securityDefinitions: {
                    bearerAuth: {
                        type: 'apiKey',
                        name: 'Authorization',
                        in: 'header',
                        description: 'Enter: Bearer <token>',
                    },
                },
                security: [{ bearerAuth: [] }],
            },
        });
        await server.register(swagger_ui_1.default, {
            routePrefix: config_1.serviceConfig.docs.path,
            uiConfig: {
                docExpansion: 'list',
                deepLinking: false,
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
        });
    }
    await server.register(routes_1.default);
    server.setErrorHandler(async (error, request, reply) => {
        logger.error('Unhandled error', {
            error: error.message,
            stack: error.stack,
            requestId: request.id,
            url: request.url,
            method: request.method,
        });
        const statusCode = error.statusCode || 500;
        const response = {
            success: false,
            error: {
                code: error.code || 'INTERNAL_SERVER_ERROR',
                message: statusCode === 500 ? 'Internal server error' : error.message,
                timestamp: new Date(),
                requestId: request.id,
            },
        };
        return reply.status(statusCode).send(response);
    });
    server.setNotFoundHandler(async (request, reply) => {
        return reply.status(404).send({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: `Route ${request.method} ${request.url} not found`,
                timestamp: new Date(),
                requestId: request.id,
            },
        });
    });
    return server;
}
async function start() {
    try {
        logger.info('Starting Full-Stack Development Agent service...', {
            version: config_1.serviceConfig.version,
            environment: config_1.config.env.NODE_ENV,
            port: config_1.serviceConfig.port,
        });
        const server = await createServer();
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            try {
                await server.close();
                logger.info('Server closed successfully');
                process.exit(0);
            }
            catch (error) {
                logger.error('Error during shutdown', { error: error.message });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('uncaughtException', (error) => {
            logger.fatal('Uncaught exception', { error: error.message, stack: error.stack });
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger.fatal('Unhandled rejection', { reason, promise });
            process.exit(1);
        });
        await server.listen({
            host: config_1.serviceConfig.host,
            port: config_1.serviceConfig.port,
        });
        logger.info('Full-Stack Development Agent service started successfully', {
            address: `http://${config_1.serviceConfig.host}:${config_1.serviceConfig.port}`,
            docs: config_1.serviceConfig.docs.enabled ? `http://${config_1.serviceConfig.host}:${config_1.serviceConfig.port}${config_1.serviceConfig.docs.path}` : null,
            environment: config_1.config.env.NODE_ENV,
        });
        logger.info('Service capabilities initialized', {
            capabilities: [
                'code_generation',
                'architecture_decisions',
                'quality_assurance',
                'template_management',
                'integration_management',
            ],
            integrations: config_1.config.agent.integrations.enabledIntegrations,
            aiModels: Object.keys(config_1.config.ai.ollama.models),
        });
    }
    catch (error) {
        logger.fatal('Failed to start service', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}
if (require.main === module) {
    start();
}
//# sourceMappingURL=index.js.map