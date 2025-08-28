import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '@fineprintai/shared-config';

/**
 * Register Fastify plugins for the Knowledge Graph Service
 */
export async function registerPlugins(server: FastifyInstance): Promise<void> {
  // CORS configuration
  await server.register(cors, {
    origin: config.app.environment === 'production' 
      ? ['https://fineprintai.com', 'https://app.fineprintai.com']
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: config.app.environment === 'production' ? undefined : false,
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: 100, // requests
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      code: 429,
      error: 'Rate limit exceeded',
      message: `Too many requests, retry after ${Math.round(context.ttl / 1000)} seconds`,
      retryAfter: Math.round(context.ttl / 1000),
    }),
  });

  // API Documentation with Swagger
  await server.register(swagger, {
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
          url: config.app.environment === 'production' 
            ? 'https://api.fineprintai.com/knowledge-graph'
            : 'http://localhost:3007',
          description: config.app.environment === 'production' ? 'Production' : 'Development',
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

  // Swagger UI
  await server.register(swaggerUi, {
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

  // Add global request logging
  server.addHook('onRequest', async (request) => {
    request.log.info('Incoming request', {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });
  });

  // Add response time tracking
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

  // Initialize request start time
  server.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
  });
}