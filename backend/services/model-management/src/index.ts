/**
 * Model Management Service - Main entry point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Redis from 'ioredis';
import pino from 'pino';
import { register } from 'prom-client';
import { ModelRegistry } from './registry/model-registry';
import { LoadBalancer } from './balancer/load-balancer';
import { CostOptimizer } from './optimizer/cost-optimizer';
import { QueueManager } from './queue/queue-manager';
import { managementRoutes } from './routes/management';

// Configure logger
const logger = pino({
  name: 'model-management-service',
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  }
});

// Service configuration
const config = {
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '3010', 10),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: '1 minute'
  },
  swagger: {
    openapi: {
      info: {
        title: 'Model Management Service',
        description: 'AI Model Management Service for Fine Print AI',
        version: '1.0.0'
      },
      servers: [
        {
          url: process.env.API_URL || 'http://localhost:3010',
          description: 'Development server'
        }
      ],
      tags: [
        { name: 'models', description: 'Model management operations' },
        { name: 'routing', description: 'Request routing operations' },
        { name: 'queue', description: 'Queue management operations' },
        { name: 'costs', description: 'Cost tracking operations' },
        { name: 'maintenance', description: 'Maintenance operations' }
      ]
    }
  }
};

/**
 * Initialize service
 */
async function initializeService() {
  // Create Fastify instance
  const fastify = Fastify({
    logger,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    trustProxy: true
  });

  // Register plugins
  await fastify.register(cors, config.cors);
  await fastify.register(helmet, {
    contentSecurityPolicy: false // Disable for API
  });
  await fastify.register(rateLimit, config.rateLimit);
  await fastify.register(sensible);
  
  // Register Swagger
  await fastify.register(swagger, config.swagger);
  await fastify.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  // Initialize Redis
  const redis = new Redis(config.redis);
  
  redis.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });

  redis.on('connect', () => {
    logger.info('Connected to Redis');
  });

  // Initialize components
  const registry = new ModelRegistry(redis);
  const loadBalancer = new LoadBalancer(registry, redis);
  const costOptimizer = new CostOptimizer(registry, redis);
  const queueManager = new QueueManager(registry, loadBalancer, costOptimizer, redis);

  // Attach components to Fastify instance
  fastify.decorate('redis', redis);
  fastify.decorate('registry', registry);
  fastify.decorate('loadBalancer', loadBalancer);
  fastify.decorate('costOptimizer', costOptimizer);
  fastify.decorate('queueManager', queueManager);

  // Register routes
  await fastify.register(managementRoutes, { prefix: '/api/v1' });

  // Metrics endpoint for Prometheus
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

  // Root endpoint
  fastify.get('/', async (request, reply) => {
    return {
      service: 'Model Management Service',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date()
    };
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({
      err: error,
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query
      }
    }, 'Request error');

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: error.message,
        statusCode,
        timestamp: new Date()
      }
    });
  });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    logger.info('Shutting down gracefully...');
    
    try {
      // Stop accepting new requests
      await fastify.close();
      
      // Cleanup components
      await queueManager.destroy();
      registry.destroy();
      
      // Close Redis connection
      redis.disconnect();
      
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // Start server
  try {
    await fastify.listen({
      host: config.host,
      port: config.port
    });
    
    logger.info({
      host: config.host,
      port: config.port,
      environment: process.env.NODE_ENV || 'development'
    }, 'Model Management Service started');
    
    logger.info(`API documentation available at http://${config.host}:${config.port}/documentation`);
  } catch (err) {
    logger.error({ err }, 'Failed to start service');
    process.exit(1);
  }

  return fastify;
}

// Start the service
initializeService().catch((err) => {
  logger.error({ err }, 'Failed to initialize service');
  process.exit(1);
});

// Export for testing
export default initializeService;