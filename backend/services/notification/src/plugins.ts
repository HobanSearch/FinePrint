import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { authMiddleware } from '@fineprintai/shared-middleware';

const logger = createServiceLogger('notification-plugins');

export async function setupPlugins(server: FastifyInstance): Promise<void> {
  // CORS
  await server.register(cors, {
    origin: config.cors.origins,
    credentials: true,
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: config.rateLimit.notification.max,
    timeWindow: config.rateLimit.notification.timeWindow,
    skipSuccessfulRequests: false,
    skipOnError: false,
    keyGenerator: (request) => {
      const userId = request.user?.id;
      const ip = request.ip;
      return userId || ip;
    },
    errorResponseBuilder: (request, context) => ({
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Rate limit exceeded',
      message: `Too many requests. Try again in ${Math.round(context.ttl / 1000)} seconds.`,
      retryAfter: Math.round(context.ttl / 1000),
    }),
  });

  // WebSocket support
  await server.register(websocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB
      verifyClient: (info, callback) => {
        // Add custom WebSocket authentication here
        callback(true);
      },
    },
  });

  // Multipart file upload support
  await server.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB for template files
      files: 5,
    },
  });

  // Swagger documentation
  if (config.NODE_ENV !== 'production') {
    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Fine Print AI Notification Service',
          description: 'Multi-channel notification service with SendGrid/SES integration, user preferences, and real-time delivery tracking',
          version: '1.0.0',
        },
        host: `localhost:${config.services.notification.port}`,
        schemes: ['http', 'https'],
        consumes: ['application/json', 'multipart/form-data'],
        produces: ['application/json'],
        tags: [
          { name: 'notifications', description: 'Notification management' },
          { name: 'preferences', description: 'User notification preferences' },
          { name: 'templates', description: 'Email and notification templates' },
          { name: 'delivery', description: 'Delivery tracking and analytics' },
          { name: 'ab-testing', description: 'A/B testing for notifications' },
          { name: 'webhooks', description: 'Webhook integrations' },
          { name: 'health', description: 'Service health and monitoring' },
        ],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'JWT token. Format: Bearer {token}',
          },
        },
        security: [{ Bearer: [] }],
      },
      transform: ({ schema, url }) => {
        // Add common response schemas
        if (!schema.definitions) {
          schema.definitions = {};
        }
        
        schema.definitions.Error = {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
          required: ['code', 'message'],
        };

        schema.definitions.SuccessResponse = {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
          required: ['success'],
        };

        return { schema, url };
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }

  // Authentication middleware
  server.addHook('preHandler', async (request, reply) => {
    // Skip auth for health checks and public endpoints
    const publicPaths = ['/health', '/metrics', '/docs'];
    const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
    
    if (!isPublicPath) {
      await authMiddleware(request, reply);
    }
  });

  // Request logging
  server.addHook('onRequest', async (request) => {
    logger.info('Incoming request', {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: request.user?.id,
    });
  });

  // Response logging
  server.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.getResponseTime();
    
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: Math.round(responseTime),
      userId: request.user?.id,
    });
  });

  // Error logging
  server.addHook('onError', async (request, reply, error) => {
    logger.error('Request error', {
      method: request.method,
      url: request.url,
      error: error.message,
      stack: error.stack,
      userId: request.user?.id,
    });
  });

  logger.info('All plugins registered successfully');
}