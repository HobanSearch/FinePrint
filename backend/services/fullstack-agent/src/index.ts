import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { Logger } from '@/utils/logger';
import { config, serviceConfig } from '@/config';
import routes from '@/routes';

const logger = Logger.getInstance();

// Extend Fastify types for authentication
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
  }
}

async function createServer(): Promise<FastifyInstance> {
  const server = fastify({
    logger: logger.child({ component: 'fastify' }),
    trustProxy: true,
    requestIdLogLabel: 'requestId',
    requestIdHeader: 'x-request-id',
  });

  // Register CORS
  await server.register(cors, {
    origin: serviceConfig.cors.origins,
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
      },
    },
  });

  // Register JWT authentication
  await server.register(jwt, {
    secret: config.env.JWT_SECRET,
    sign: {
      expiresIn: '24h',
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
  if (serviceConfig.rateLimit.enabled) {
    await server.register(rateLimit, {
      max: serviceConfig.rateLimit.max,
      timeWindow: serviceConfig.rateLimit.timeWindow,
      keyGenerator: (request) => {
        return request.ip || 'anonymous';
      },
    });
  }

  // Register multipart support for file uploads
  await server.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 5,
    },
  });

  // Register WebSocket support
  await server.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      verifyClient: (info) => {
        // Add WebSocket authentication logic here
        return true;
      },
    },
  });

  // Register Swagger documentation
  if (serviceConfig.docs.enabled) {
    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Full-Stack Development Agent API',
          description: 'Autonomous code generation and architecture decision system',
          version: serviceConfig.version,
        },
        host: `localhost:${serviceConfig.port}`,
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

    await server.register(swaggerUi, {
      routePrefix: serviceConfig.docs.path,
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }

  // Register routes
  await server.register(routes);

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

async function start(): Promise<void> {
  try {
    logger.info('Starting Full-Stack Development Agent service...', {
      version: serviceConfig.version,
      environment: config.env.NODE_ENV,
      port: serviceConfig.port,
    });

    const server = await createServer();

    // Add graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
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
      host: serviceConfig.host,
      port: serviceConfig.port,
    });

    logger.info('Full-Stack Development Agent service started successfully', {
      address: `http://${serviceConfig.host}:${serviceConfig.port}`,
      docs: serviceConfig.docs.enabled ? `http://${serviceConfig.host}:${serviceConfig.port}${serviceConfig.docs.path}` : null,
      environment: config.env.NODE_ENV,
    });

    // Log service capabilities
    logger.info('Service capabilities initialized', {
      capabilities: [
        'code_generation',
        'architecture_decisions', 
        'quality_assurance',
        'template_management',
        'integration_management',
      ],
      integrations: config.agent.integrations.enabledIntegrations,
      aiModels: Object.keys(config.ai.ollama.models),
    });

  } catch (error) {
    logger.fatal('Failed to start service', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start the service
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { createServer, start };