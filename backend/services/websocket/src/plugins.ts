import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('websocket-plugins');

export async function setupPlugins(server: FastifyInstance): Promise<void> {
  // CORS configuration
  await server.register(cors, {
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: config.rateLimiting.websocket.max,
    timeWindow: config.rateLimiting.websocket.window,
    skipOnError: true,
    keyGenerator: (request) => {
      return request.headers['x-forwarded-for'] as string || 
             request.headers['x-real-ip'] as string || 
             request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        expiresIn: Math.round(context.ttl / 1000),
      };
    },
  });

  // Swagger documentation
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'Fine Print AI WebSocket Service',
        description: 'Real-time WebSocket service with Socket.io and Redis clustering',
        version: '1.0.0',
      },
      host: `localhost:${config.services.websocket.port}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Health', description: 'Service health endpoints' },
        { name: 'Metrics', description: 'Service metrics and monitoring' },
        { name: 'Admin', description: 'Administrative endpoints' },
        { name: 'WebSocket', description: 'WebSocket connection management' },
      ],
      securityDefinitions: {
        Bearer: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          description: 'JWT token for authentication (format: Bearer <token>)',
        },
      },
    },
    transform: ({ schema, url }) => {
      // Add security to all routes by default
      if (schema.security === undefined && !url.includes('/health')) {
        schema.security = [{ Bearer: [] }];
      }
      return { schema, url };
    },
  });

  // Swagger UI
  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });

  // Custom error serializer
  server.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode || 500;
    
    logger.error('HTTP error', {
      error: error.message,
      statusCode,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      stack: error.stack,
    });

    const errorResponse = {
      error: true,
      code: statusCode,
      message: error.message,
      timestamp: new Date().toISOString(),
      requestId: request.id,
    };

    // Don't expose internal errors in production
    if (config.NODE_ENV === 'production' && statusCode === 500) {
      errorResponse.message = 'Internal server error';
    }

    reply.status(statusCode).send(errorResponse);
  });

  // Request logging
  server.addHook('onRequest', async (request) => {
    logger.debug('Incoming request', {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
    });
  });

  // Response logging
  server.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.elapsedTime;
    
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
      requestId: request.id,
    });
  });

  logger.info('All plugins registered successfully');
}