import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';

export async function setupPlugins(fastify: FastifyInstance): Promise<void> {
  // Security plugins
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  // CORS configuration
  await fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests from Fine Print AI frontend and authorized origins
      const allowedOrigins = [
        'http://localhost:3000', // Frontend dev
        'http://localhost:3001', // Alternative frontend
        'https://fineprint.ai',   // Production frontend
        'https://app.fineprint.ai', // Production app
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // Rate limiting
  await fastify.register(fastifyRateLimit, {
    max: 1000, // requests
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.headers['x-api-key'] as string || request.ip;
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

  // WebSocket support
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB
      verifyClient: (info) => {
        // Add WebSocket authentication if needed
        return true;
      },
    },
  });

  // API Documentation with Swagger
  await fastify.register(fastifySwagger, {
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
      host: 'localhost:3006', // Will be updated for production
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

  // Swagger UI
  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
      defaultModelRendering: 'model',
    },
    uiHooks: {
      onRequest: (request, reply, next) => {
        // Add any UI-specific middleware here
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Custom error handler
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

    // Don't expose internal errors in production
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

  // Not found handler
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

  // Request logging
  fastify.addHook('onRequest', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    }, 'Incoming request');
  });

  // Response logging
  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.getResponseTime(),
    }, 'Request completed');
  });

  // Health check hook
  fastify.addHook('onReady', async () => {
    fastify.log.info('AI/ML Engineering Service is ready to accept connections');
  });
}