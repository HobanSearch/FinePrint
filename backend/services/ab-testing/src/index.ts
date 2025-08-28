// A/B Testing Service - Main Application Entry Point

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import pino from 'pino';
import { register } from 'prom-client';
import { experimentRoutes } from './routes/experiments';
import { metricsRoutes } from './routes/metrics';
import { analysisRoutes } from './routes/analysis';
import { assignmentRoutes } from './routes/assignments';
import { reportingRoutes } from './routes/reporting';
import { ExperimentManager } from './experiments/experiment-manager';
import { TrafficAllocator } from './experiments/traffic-allocator';
import { MetricsCollector } from './metrics/metrics-collector';
import { StatisticalEngine } from './statistics/statistical-engine';
import { BayesianEngine } from './statistics/bayesian-engine';
import { DecisionEngine } from './decision/decision-engine';
import { ReportGenerator } from './reporting/report-generator';
import { ModelIntegration } from './integration/model-integration';

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'UTC:yyyy-mm-dd HH:MM:ss'
    }
  }
});

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty'
});

// Initialize Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3
});

// Initialize services
const experimentManager = new ExperimentManager(prisma, redis, logger);
const trafficAllocator = new TrafficAllocator(prisma, redis, logger);
const metricsCollector = new MetricsCollector(prisma, redis, logger);
const statisticalEngine = new StatisticalEngine(prisma, logger);
const bayesianEngine = new BayesianEngine(logger);
const decisionEngine = new DecisionEngine(prisma, redis, logger);
const reportGenerator = new ReportGenerator(prisma, logger);
const modelIntegration = new ModelIntegration(redis, logger);

// Create Fastify instance
const app = Fastify({
  logger,
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  disableRequestLogging: false,
  bodyLimit: 10485760 // 10MB
});

// Register plugins
app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
});

app.register(helmet, {
  contentSecurityPolicy: false // Disable for API
});

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  cache: 10000,
  allowList: ['127.0.0.1'],
  redis
});

// Register Swagger
app.register(swagger, {
  swagger: {
    info: {
      title: 'Fine Print AI - A/B Testing Service',
      description: 'Comprehensive A/B testing and experimentation platform',
      version: '1.0.0'
    },
    host: process.env.API_HOST || 'localhost:3005',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { name: 'experiments', description: 'Experiment management endpoints' },
      { name: 'assignments', description: 'User assignment endpoints' },
      { name: 'metrics', description: 'Metrics collection endpoints' },
      { name: 'analysis', description: 'Statistical analysis endpoints' },
      { name: 'reporting', description: 'Reporting and visualization endpoints' }
    ]
  }
});

app.register(swaggerUI, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true
  }
});

// Decorate Fastify instance with services
app.decorate('prisma', prisma);
app.decorate('redis', redis);
app.decorate('services', {
  experimentManager,
  trafficAllocator,
  metricsCollector,
  statisticalEngine,
  bayesianEngine,
  decisionEngine,
  reportGenerator,
  modelIntegration
});

// Health check
app.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected'
      }
    };
  } catch (error) {
    reply.code(503);
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (request, reply) => {
  reply.type('text/plain');
  return register.metrics();
});

// Register route modules
app.register(experimentRoutes, { prefix: '/api/v1/experiments' });
app.register(assignmentRoutes, { prefix: '/api/v1/assignments' });
app.register(metricsRoutes, { prefix: '/api/v1/metrics' });
app.register(analysisRoutes, { prefix: '/api/v1/analysis' });
app.register(reportingRoutes, { prefix: '/api/v1/reports' });

// Error handler
app.setErrorHandler((error, request, reply) => {
  logger.error({
    error: error.message,
    stack: error.stack,
    request: {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
      body: request.body
    }
  }, 'Request error');

  reply.code(error.statusCode || 500);
  return {
    error: {
      message: error.message,
      code: error.code || 'INTERNAL_ERROR',
      statusCode: error.statusCode || 500
    }
  };
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');
  
  try {
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3005');
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    logger.info(`A/B Testing Service running on ${host}:${port}`);
    logger.info(`API Documentation available at http://${host}:${port}/docs`);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
};

// Export for testing
export { app, start };

// Start if run directly
if (require.main === module) {
  start();
}