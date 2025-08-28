import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';

import { Logger } from './utils/logger';
import { config } from './config';
import { setupPlugins } from './plugins';
import { registerRoutes } from './routes';

// Core orchestration services
import { AgentRegistry } from './services/agent-registry';
import { WorkflowEngine } from './services/workflow-engine';
import { CommunicationBus } from './services/communication-bus';
import { DecisionEngine } from './services/decision-engine';
import { ResourceManager } from './services/resource-manager';
import { MonitoringService } from './services/monitoring-service';
import { BusinessProcessManager } from './services/business-process-manager';

const logger = Logger.getInstance();

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: string;
    };
  }

  interface FastifyInstance {
    authenticate: any;
    verifyJWT: any;
    orchestrationServices: {
      agentRegistry: AgentRegistry;
      workflowEngine: WorkflowEngine;
      communicationBus: CommunicationBus;
      decisionEngine: DecisionEngine;
      resourceManager: ResourceManager;
      monitoringService: MonitoringService;
      businessProcessManager: BusinessProcessManager;
    };
  }
}

async function createServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger: logger.child({ component: 'fastify' }),
    trustProxy: true,
    requestIdLogLabel: 'requestId',
    requestIdHeader: 'x-request-id',
    bodyLimit: 10 * 1024 * 1024, // 10MB for large payloads
    requestTimeout: 300000, // 5 minutes for complex orchestrations
  });

  // Register CORS
  await server.register(cors, {
    origin: config.cors.origins,
    credentials: true,
  });

  // Register security headers
  await server.register(helmet, {
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

  // Register JWT authentication
  await server.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  // Add authentication decorator
  server.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  server.decorate('verifyJWT', async function (request: any, reply: any) {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        throw new Error('Missing authentication token');
      }
      
      const decoded = server.jwt.verify(token);
      request.user = decoded;
    } catch (err) {
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

  // Register rate limiting
  if (config.rateLimit.enabled) {
    await server.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.timeWindow,
      keyGenerator: (request) => {
        return request.ip || 'anonymous';
      },
    });
  }

  // Register multipart support
  await server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB for workflow definitions
      files: 10,
    },
  });

  // Register WebSocket support
  await server.register(websocket, {
    options: {
      maxPayload: 5 * 1024 * 1024, // 5MB
      verifyClient: (info) => {
        // Add WebSocket authentication logic here
        return true;
      },
    },
  });

  // Register Swagger documentation
  if (config.docs.enabled) {
    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Agent Orchestration System API',
          description: 'Comprehensive multi-agent coordination and workflow management platform',
          version: config.version,
        },
        host: `localhost:${config.port}`,
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

    await server.register(swaggerUi, {
      routePrefix: config.docs.path,
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }

  // Initialize orchestration services
  await initializeOrchestrationServices(server);

  // Setup additional plugins
  await setupPlugins(server);

  // Register routes
  await registerRoutes(server);

  // Global error handler
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

  // Not found handler
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

async function initializeOrchestrationServices(server: FastifyInstance): Promise<void> {
  try {
    logger.info('Initializing Agent Orchestration services...');

    // Initialize core services
    const agentRegistry = new AgentRegistry();
    await agentRegistry.initialize();

    const communicationBus = new CommunicationBus();
    await communicationBus.initialize();

    const resourceManager = new ResourceManager();
    await resourceManager.initialize();

    const decisionEngine = new DecisionEngine(agentRegistry, resourceManager);
    await decisionEngine.initialize();

    const workflowEngine = new WorkflowEngine(
      agentRegistry,
      communicationBus,
      decisionEngine,
      resourceManager
    );
    await workflowEngine.initialize();

    const monitoringService = new MonitoringService(
      agentRegistry,
      workflowEngine,
      resourceManager
    );
    await monitoringService.initialize();

    const businessProcessManager = new BusinessProcessManager(
      workflowEngine,
      monitoringService
    );
    await businessProcessManager.initialize();

    // Decorate server with services
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
  } catch (error) {
    logger.error('Failed to initialize orchestration services', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

async function start(): Promise<void> {
  try {
    logger.info('Starting Agent Orchestration System...', {
      version: config.version,
      environment: config.environment,
      port: config.port,
    });

    const server = await createServer();

    // Add graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop background services
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
      } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

    // Start server
    await server.listen({
      host: config.host,
      port: config.port,
    });

    logger.info('Agent Orchestration System started successfully', {
      address: `http://${config.host}:${config.port}`,
      docs: config.docs.enabled ? `http://${config.host}:${config.port}${config.docs.path}` : null,
      environment: config.environment,
    });

    // Log system capabilities
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

    // Start background services
    await startBackgroundServices(server);

  } catch (error) {
    logger.fatal('Failed to start service', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function startBackgroundServices(server: FastifyInstance): Promise<void> {
  try {
    // Start monitoring
    await server.orchestrationServices.monitoringService.startMonitoring();
    
    // Start workflow engine scheduler
    await server.orchestrationServices.workflowEngine.startScheduler();
    
    // Start agent health checking
    await server.orchestrationServices.agentRegistry.startHealthChecking();
    
    // Start resource optimization
    await server.orchestrationServices.resourceManager.startOptimization();

    logger.info('Background services started successfully');
  } catch (error) {
    logger.error('Failed to start background services', { error: error.message });
  }
}

// Start the service
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { createServer, start };