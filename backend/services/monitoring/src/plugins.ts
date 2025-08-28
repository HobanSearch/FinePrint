import { FastifyInstance } from 'fastify';
import { config } from '@fineprintai/shared-config';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';

export async function setupPlugins(server: FastifyInstance) {
  // Security plugins
  await server.register(fastifyHelmet, config.security.helmet);
  
  await server.register(fastifyCors, config.security.cors);

  // Rate limiting
  await server.register(fastifyRateLimit, {
    global: true,
    ...config.rateLimiting.global,
    redis: config.redis.url,
    keyGenerator: (request) => {
      const apiKey = request.headers['x-api-key'] as string;
      const userId = request.headers['x-user-id'] as string;
      return apiKey || userId || request.ip;
    },
    errorResponseBuilder: (request, context) => ({
      error: 'Rate limit exceeded',
      message: `Too many requests. Rate limit: ${context.max} requests per ${context.ttl}ms`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });

  // WebSocket support
  await server.register(fastifyWebsocket);

  // Multipart support for file uploads
  await server.register(fastifyMultipart, {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100,
      fields: 10,
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 5,
      headerPairs: 2000,
    },
  });

  // API Documentation
  if (config.NODE_ENV !== 'production') {
    await server.register(fastifySwagger, {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: 'Fine Print AI Monitoring Service',
          description: 'Document monitoring and change detection service',
          version: config.services.monitoring.version,
          contact: {
            name: 'Fine Print AI Team',
            email: 'support@fineprintai.com',
          },
        },
        servers: [
          {
            url: `http://localhost:${config.services.monitoring.port}`,
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

    await server.register(fastifySwaggerUi, {
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

  // Request/Response logging middleware
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

  // Health monitoring hooks
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