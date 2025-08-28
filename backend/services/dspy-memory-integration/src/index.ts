/**
 * DSPy-Memory Integration Service - Main Entry Point
 * Autonomous learning system that connects DSPy optimization with Memory service and Business Intelligence
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { authPlugin } from '@fineprintai/auth';

// Import route handlers
import { learningRoutes } from './routes/learning';
import { outcomeRoutes } from './routes/outcomes';
import { patternRoutes } from './routes/patterns';
import { trainingDataRoutes } from './routes/training-data';
import { optimizationRoutes } from './routes/optimization';
import { analyticsRoutes } from './routes/analytics';
import { crossDomainRoutes } from './routes/cross-domain';
import { websocketRoutes } from './routes/websocket';

// Import core services
import { LearningOrchestrator } from './services/learning-orchestrator';
import { IntegrationManager } from './services/integration-manager';
import { BusinessOutcomeLearner } from './services/business-outcome-learner';
import { PatternRecognitionEngine } from './services/pattern-recognition-engine';
import { TrainingDataGenerator } from './services/training-data-generator';

const logger = createServiceLogger('dspy-memory-integration-service');

async function buildApp() {
  const app = Fastify({
    logger: false, // Use our custom logger
    requestTimeout: 300000, // 5 minutes for complex operations
    bodyLimit: 52428800, // 50MB for large training datasets
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.register(cors, {
    origin: config.cors.origins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 200, // Higher limit for learning operations
    timeWindow: '1 minute',
  });

  // WebSocket support for real-time learning progress
  await app.register(websocket);

  // Swagger documentation
  await app.register(swagger, {
    swagger: {
      info: {
        title: 'DSPy-Memory Integration API',
        description: 'Autonomous learning system that enables continuous AI improvement through business outcome feedback',
        version: '1.0.0',
      },
      host: 'localhost:8015',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'learning', description: 'Learning orchestration and job management' },
        { name: 'outcomes', description: 'Business outcome tracking and analysis' },
        { name: 'patterns', description: 'Pattern discovery and management' },
        { name: 'training-data', description: 'Training data generation and quality control' },
        { name: 'optimization', description: 'DSPy optimization control and monitoring' },
        { name: 'analytics', description: 'Learning analytics and insights' },
        { name: 'cross-domain', description: 'Cross-domain learning and transfer' },
      ],
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  // Auth plugin
  await app.register(authPlugin);

  // Initialize core services
  const integrationManager = new IntegrationManager({
    dspyServiceUrl: config.services.dspy?.url || 'http://localhost:8006',
    memoryServiceUrl: config.services.memory?.url || 'http://localhost:3001',
    businessIntelligenceUrl: config.services.businessIntelligence?.url || 'http://localhost:8013',
    timeouts: {
      default: 30000,
      optimization: 300000,
      bulkOperations: 120000,
    },
    retryPolicy: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    },
    healthCheck: {
      interval: 30000,
      timeout: 5000,
    },
  });

  const learningOrchestrator = new LearningOrchestrator({
    redis: {
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 0,
    },
    learning: {
      continuousLearningEnabled: true,
      batchLearningInterval: '0 */5 * * * *', // Every 5 minutes
      emergencyOptimizationThreshold: 0.3,
      maxConcurrentJobs: 5,
      defaultLearningRate: 0.1,
      safetyThreshold: 0.8,
    },
    integrations: {
      dspyServiceUrl: config.services.dspy?.url || 'http://localhost:8006',
      memoryServiceUrl: config.services.memory?.url || 'http://localhost:3001',
      businessIntelligenceUrl: config.services.businessIntelligence?.url || 'http://localhost:8013',
    },
    optimization: {
      defaultMaxIterations: 100,
      convergenceThreshold: 0.01,
      explorationRate: 0.1,
      rollbackThreshold: 0.2,
    },
  });

  const businessOutcomeLearner = new BusinessOutcomeLearner();
  const patternEngine = new PatternRecognitionEngine();
  const trainingGenerator = new TrainingDataGenerator();

  // Add services to app context
  app.decorate('learningOrchestrator', learningOrchestrator);
  app.decorate('integrationManager', integrationManager);
  app.decorate('businessOutcomeLearner', businessOutcomeLearner);
  app.decorate('patternEngine', patternEngine);
  app.decorate('trainingGenerator', trainingGenerator);

  // Initialize services
  await integrationManager.initialize();
  await learningOrchestrator.initialize();
  await businessOutcomeLearner.initialize();
  await patternEngine.initialize();
  await trainingGenerator.initialize();

  // Health check endpoint
  app.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            services: { type: 'object' },
            systemMetrics: { type: 'object' },
          },
        },
      },
    },
  }, async () => {
    const healthChecks = await Promise.allSettled([
      learningOrchestrator.healthCheck(),
      integrationManager.healthCheck(),
      businessOutcomeLearner.healthCheck(),
      patternEngine.healthCheck(),
      trainingGenerator.healthCheck(),
    ]);

    const serviceStatuses = healthChecks.map((result, index) => {
      const serviceNames = ['orchestrator', 'integration', 'outcome_learner', 'pattern_engine', 'training_generator'];
      return {
        service: serviceNames[index],
        healthy: result.status === 'fulfilled' ? result.value : false,
        error: result.status === 'rejected' ? result.reason?.message : undefined,
      };
    });

    const allHealthy = serviceStatuses.every(s => s.healthy);

    // Get system metrics
    const systemMetrics = await learningOrchestrator.getSystemMetrics();

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: serviceStatuses.reduce((acc, s) => {
        acc[s.service] = s.healthy ? 'healthy' : 'unhealthy';
        return acc;
      }, {} as Record<string, string>),
      systemMetrics,
    };
  });

  // Register route handlers
  await app.register(learningRoutes, { prefix: '/api/learning' });
  await app.register(outcomeRoutes, { prefix: '/api/outcomes' });
  await app.register(patternRoutes, { prefix: '/api/patterns' });
  await app.register(trainingDataRoutes, { prefix: '/api/training-data' });
  await app.register(optimizationRoutes, { prefix: '/api/optimization' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(crossDomainRoutes, { prefix: '/api/cross-domain' });
  await app.register(websocketRoutes, { prefix: '/ws' });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      userId: (request as any).user?.id,
    });

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : error.code || 'REQUEST_ERROR',
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    });
  });

  // Request logging hook
  app.addHook('onRequest', async (request, reply) => {
    logger.debug('Incoming request', {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
  });

  // Response timing hook
  app.addHook('onResponse', async (request, reply) => {
    const responseTime = reply.getResponseTime();
    logger.debug('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: `${responseTime}ms`,
    });
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    
    const port = config.services.dspyMemoryIntegration?.port || 8015;
    const host = config.services.dspyMemoryIntegration?.host || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('DSPy-Memory Integration Service started', {
      port,
      host,
      environment: config.environment,
      version: '1.0.0',
    });

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        // Shutdown services in reverse order
        await app.learningOrchestrator.shutdown();
        await app.integrationManager.shutdown();
        
        await app.close();
        logger.info('DSPy-Memory Integration Service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start DSPy-Memory Integration Service', { error });
    process.exit(1);
  }
}

// TypeScript declarations for decorated services
declare module 'fastify' {
  interface FastifyInstance {
    learningOrchestrator: LearningOrchestrator;
    integrationManager: IntegrationManager;
    businessOutcomeLearner: BusinessOutcomeLearner;
    patternEngine: PatternRecognitionEngine;
    trainingGenerator: TrainingDataGenerator;
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp };