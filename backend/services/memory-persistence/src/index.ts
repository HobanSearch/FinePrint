/**
 * Memory Persistence Service for Business Intelligence
 * Unified persistence layer for AI learning and memory across all services
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { createServiceLogger } from './logger';
import { authPlugin } from './auth';

import memoryRoutes from './routes/memory';
import learningRoutes from './routes/learning';
import analyticsRoutes from './routes/analytics';
import { MemoryPersistenceEngine } from './services/memory-persistence-engine';
import { LearningHistoryService } from './services/learning-history-service';
import { AnalyticsEngine } from './services/analytics-engine';
import { CrossServiceSync } from './services/cross-service-sync';

const logger = createServiceLogger('memory-persistence-service');

async function buildApp() {
  const app = Fastify({
    logger: false,
    requestTimeout: 60000,
    bodyLimit: 10485760, // 10MB
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
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Auth plugin
  await app.register(authPlugin);

  // Initialize services
  const memoryEngine = new MemoryPersistenceEngine();
  const learningHistory = new LearningHistoryService();
  const analyticsEngine = new AnalyticsEngine(memoryEngine, learningHistory);
  const crossServiceSync = new CrossServiceSync(memoryEngine, learningHistory);
  
  // Initialize all services
  await memoryEngine.initialize();
  await learningHistory.initialize();
  await analyticsEngine.initialize();
  await crossServiceSync.initialize();

  // Add services to app context
  app.decorate('memoryEngine', memoryEngine);
  app.decorate('learningHistory', learningHistory);
  app.decorate('analyticsEngine', analyticsEngine);
  app.decorate('crossServiceSync', crossServiceSync);

  // Health check
  app.get('/health', async () => {
    const services = {
      memory_engine: memoryEngine.isHealthy(),
      learning_history: learningHistory.isHealthy(),
      analytics_engine: analyticsEngine.isHealthy(),
      cross_service_sync: crossServiceSync.isHealthy(),
    };

    const allHealthy = Object.values(services).every(status => status);

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services,
    };
  });

  // Register routes
  await app.register(memoryRoutes, { prefix: '/api/memory' });
  await app.register(learningRoutes, { prefix: '/api/learning' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8009;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Memory Persistence Service started', {
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await app.close();
        logger.info('Memory Persistence Service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Memory Persistence Service', { error });
    process.exit(1);
  }
}

// Add TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    memoryEngine: MemoryPersistenceEngine;
    learningHistory: LearningHistoryService;
    analyticsEngine: AnalyticsEngine;
    crossServiceSync: CrossServiceSync;
  }
}

if (require.main === module) {
  start();
}