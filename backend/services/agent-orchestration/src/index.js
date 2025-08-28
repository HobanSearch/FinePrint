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
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
const plugins_1 = require("./plugins");
const routes_1 = require("./routes");
const agent_registry_1 = require("./services/agent-registry");
const workflow_engine_1 = require("./services/workflow-engine");
const communication_bus_1 = require("./services/communication-bus");
const decision_engine_1 = require("./services/decision-engine");
const resource_manager_1 = require("./services/resource-manager");
const monitoring_service_1 = require("./services/monitoring-service");
const business_process_manager_1 = require("./services/business-process-manager");
const logger = logger_1.Logger.getInstance();
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: logger.child({ component: 'fastify' }),
        trustProxy: true,
        requestIdLogLabel: 'requestId',
        requestIdHeader: 'x-request-id',
        bodyLimit: 10 * 1024 * 1024,
        requestTimeout: 300000,
    });
    await server.register(cors_1.default, {
        origin: config_1.config.cors.origins,
        credentials: true,
    });
    await server.register(helmet_1.default, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"],
            },
        },
    });
    await server.register(jwt_1.default, {
        secret: config_1.config.jwt.secret,
        sign: {
            expiresIn: config_1.config.jwt.expiresIn,
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
    if (config_1.config.rateLimit.enabled) {
        await server.register(rate_limit_1.default, {
            max: config_1.config.rateLimit.max,
            timeWindow: config_1.config.rateLimit.timeWindow,
            keyGenerator: (request) => {
                return request.ip || 'anonymous';
            },
        });
    }
    await server.register(multipart_1.default, {
        limits: {
            fileSize: 50 * 1024 * 1024,
            files: 10,
        },
    });
    await server.register(websocket_1.default, {
        options: {
            maxPayload: 5 * 1024 * 1024,
            verifyClient: (info) => {
                return true;
            },
        },
    });
    if (config_1.config.docs.enabled) {
        await server.register(swagger_1.default, {
            swagger: {
                info: {
                    title: 'Agent Orchestration System API',
                    description: 'Comprehensive multi-agent coordination and workflow management platform',
                    version: config_1.config.version,
                },
                host: `localhost:${config_1.config.port}`,
                schemes: ['http', 'https'],
                consumes: ['application/json'],
                produces: ['application/json'],
                tags: [
                    { name: 'agents', description: 'Agent registration and management' },
                    { name: 'workflows', description: 'Workflow definition and execution' },
                    { name: 'communication', description: 'Inter-agent messaging' },
                    { name: 'decisions', description: 'Decision engine and conflict resolution' },
                    { name: 'resources', description: 'Resource allocation and management' },
                    { name: 'monitoring', description: 'System monitoring and observability' },
                    { name: 'business-processes', description: 'Business process automation' },
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
            routePrefix: config_1.config.docs.path,
            uiConfig: {
                docExpansion: 'list',
                deepLinking: false,
            },
            staticCSP: true,
            transformStaticCSP: (header) => header,
        });
    }
    await initializeOrchestrationServices(server);
    await (0, plugins_1.setupPlugins)(server);
    await (0, routes_1.registerRoutes)(server);
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
async function initializeOrchestrationServices(server) {
    try {
        logger.info('Initializing Agent Orchestration services...');
        const agentRegistry = new agent_registry_1.AgentRegistry();
        await agentRegistry.initialize();
        const communicationBus = new communication_bus_1.CommunicationBus();
        await communicationBus.initialize();
        const resourceManager = new resource_manager_1.ResourceManager();
        await resourceManager.initialize();
        const decisionEngine = new decision_engine_1.DecisionEngine(agentRegistry, resourceManager);
        await decisionEngine.initialize();
        const workflowEngine = new workflow_engine_1.WorkflowEngine(agentRegistry, communicationBus, decisionEngine, resourceManager);
        await workflowEngine.initialize();
        const monitoringService = new monitoring_service_1.MonitoringService(agentRegistry, workflowEngine, resourceManager);
        await monitoringService.initialize();
        const businessProcessManager = new business_process_manager_1.BusinessProcessManager(workflowEngine, monitoringService);
        await businessProcessManager.initialize();
        server.decorate('orchestrationServices', {
            agentRegistry,
            workflowEngine,
            communicationBus,
            decisionEngine,
            resourceManager,
            monitoringService,
            businessProcessManager,
        });
        logger.info('Agent Orchestration services initialized successfully');
    }
    catch (error) {
        logger.error('Failed to initialize orchestration services', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}
async function start() {
    try {
        logger.info('Starting Agent Orchestration System...', {
            version: config_1.config.version,
            environment: config_1.config.environment,
            port: config_1.config.port,
        });
        const server = await createServer();
        const gracefulShutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            try {
                if (server.orchestrationServices?.monitoringService) {
                    await server.orchestrationServices.monitoringService.stop();
                }
                if (server.orchestrationServices?.workflowEngine) {
                    await server.orchestrationServices.workflowEngine.stop();
                }
                if (server.orchestrationServices?.communicationBus) {
                    await server.orchestrationServices.communicationBus.stop();
                }
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
            host: config_1.config.host,
            port: config_1.config.port,
        });
        logger.info('Agent Orchestration System started successfully', {
            address: `http://${config_1.config.host}:${config_1.config.port}`,
            docs: config_1.config.docs.enabled ? `http://${config_1.config.host}:${config_1.config.port}${config_1.config.docs.path}` : null,
            environment: config_1.config.environment,
        });
        logger.info('Orchestration capabilities initialized', {
            capabilities: [
                'multi_agent_coordination',
                'workflow_orchestration',
                'resource_management',
                'decision_automation',
                'business_process_automation',
                'real_time_monitoring',
                'intelligent_routing',
                'conflict_resolution',
                'performance_optimization',
                'cost_optimization',
            ],
            supportedAgents: [
                'fullstack-agent',
                'aiml-engineering',
                'ui-ux-design',
                'devops-agent',
                'dspy-framework',
                'gated-lora-system',
                'knowledge-graph',
                'enhanced-ollama',
                'sales-agent',
                'customer-success-agent',
                'content-marketing-agent',
            ],
        });
        await startBackgroundServices(server);
    }
    catch (error) {
        logger.fatal('Failed to start service', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}
async function startBackgroundServices(server) {
    try {
        await server.orchestrationServices.monitoringService.startMonitoring();
        await server.orchestrationServices.workflowEngine.startScheduler();
        await server.orchestrationServices.agentRegistry.startHealthChecking();
        await server.orchestrationServices.resourceManager.startOptimization();
        logger.info('Background services started successfully');
    }
    catch (error) {
        logger.error('Failed to start background services', { error: error.message });
    }
}
if (require.main === module) {
    start();
}
//# sourceMappingURL=index.js.map