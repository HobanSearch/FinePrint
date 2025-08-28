/**
 * Business Agents API Service
 * Main entry point for the unified business agent API
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from './config';
import { registerRoutes } from './routes';
import { websocketService } from './services/websocket.service';
import { performanceService } from './services/performance.service';
import { cacheService } from './services/cache.service';
import { errorHandler } from './middleware/error.middleware';
import { createLogger } from './utils/logger';

const logger = createLogger('main');

async function buildApp() {
  const fastify = Fastify({
    logger: false, // We use our own logger
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    bodyLimit: 10485760 // 10MB
  });

  // Register error handler
  fastify.setErrorHandler(errorHandler);

  // Register JWT plugin
  await fastify.register(jwt, {
    secret: config.security.jwtSecret,
    sign: {
      expiresIn: config.security.jwtExpiresIn
    }
  });

  // Register CORS
  await fastify.register(cors, {
    origin: config.security.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
  });

  // Register Helmet for security headers
  if (config.security.enableHelmet) {
    await fastify.register(helmet, {
      contentSecurityPolicy: false // Disable for API
    });
  }

  // Register global rate limiting
  await fastify.register(rateLimit, {
    global: true,
    max: 1000,
    timeWindow: '1 minute',
    skipOnError: true
  });

  // Register Swagger documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Business Agents API',
        description: 'Unified API for Fine Print AI Business Agents',
        version: config.service.version
      },
      host: `${config.service.host}:${config.service.port}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Marketing', description: 'Marketing content generation endpoints' },
        { name: 'Sales', description: 'Sales lead qualification endpoints' },
        { name: 'Support', description: 'Customer support response endpoints' },
        { name: 'Analytics', description: 'Business analytics endpoints' },
        { name: 'Performance', description: 'Agent performance monitoring' },
        { name: 'Testing', description: 'Digital twin testing endpoints' }
      ],
      securityDefinitions: {
        Bearer: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          description: 'Enter the token with the `Bearer ` prefix'
        }
      }
    }
  });

  // Register Swagger UI
  await fastify.register(swaggerUI, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // Initialize WebSocket service
  await websocketService.initialize(fastify);

  // Register application routes
  await registerRoutes(fastify);

  // Add hooks for logging
  fastify.addHook('onRequest', async (request, reply) => {
    logger.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      msg: 'Request received'
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    logger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.getResponseTime(),
      msg: 'Request completed'
    });
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async () => {
    logger.info('Graceful shutdown initiated');

    try {
      // Stop accepting new connections
      await fastify.close();

      // Clean up services
      performanceService.stop();
      websocketService.stop();
      await cacheService.close();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return fastify;
}

async function start() {
  try {
    logger.info('Starting Business Agents API Service');
    
    const fastify = await buildApp();

    await fastify.listen({
      port: config.service.port,
      host: config.service.host
    });

    logger.info({
      service: config.service.name,
      version: config.service.version,
      port: config.service.port,
      environment: config.service.environment,
      msg: 'Business Agents API Service started successfully'
    });

    // Log available routes
    const routes = fastify.printRoutes();
    logger.debug('Available routes:', routes);

    // Log service URLs
    logger.info(`📊 API Documentation: http://${config.service.host}:${config.service.port}/documentation`);
    logger.info(`🔌 WebSocket Endpoint: ws://${config.service.host}:${config.service.port}/ws/agents`);
    logger.info(`❤️ Health Check: http://${config.service.host}:${config.service.port}/health`);

    // Initial health check
    const health = performanceService.getHealthStatus();
    logger.info({
      health: health.healthy ? 'healthy' : 'unhealthy',
      agents: Object.keys(health.agents),
      msg: 'Initial health check'
    });

  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Start the service
if (require.main === module) {
  start();
}

export { buildApp };