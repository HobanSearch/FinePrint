import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './mocks/shared-config';
import { createServiceLogger } from './mocks/shared-logger';
import { authPlugin } from './mocks/auth';

import loraRoutes from './routes/lora';
import trainingRoutes from './routes/training';
import modelsRoutes from './routes/models';
import metricsRoutes from './routes/metrics';
import modelManagementRoutes from './routes/model-management';
import monitoringRoutes from './routes/monitoring';
import { GatedLoRAService } from './services/gated-lora-service';
import TrainingEngine from './services/training-engine';
import ModelRegistry from './services/model-registry';
import PerformanceMonitor from './services/performance-monitor';
import { PythonLoRAIntegration } from './services/python-integration';
import { MultiModelManager } from './services/multi-model-manager';

const logger = createServiceLogger('lora-service');

async function buildApp() {
  const app = Fastify({
    logger: false,
    requestTimeout: 300000, // 5 minutes for long training operations
    bodyLimit: 52428800, // 50MB for model uploads
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
    max: 50, // Lower rate limit for training operations
    timeWindow: '1 minute',
  });

  // Multipart support for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 52428800, // 50MB
      files: 10,
    },
  });

  // Auth plugin
  await app.register(authPlugin);

  // Initialize services
  const pythonLoRAIntegration = new PythonLoRAIntegration();
  const gatedLoRAService = new GatedLoRAService();
  const trainingEngine = new TrainingEngine();
  const modelRegistry = new ModelRegistry();
  const performanceMonitor = new PerformanceMonitor();
  const multiModelManager = new MultiModelManager(pythonLoRAIntegration);
  
  // Initialize model registry with default models
  await modelRegistry.initialize();
  
  // Initialize Python LoRA integration
  await pythonLoRAIntegration.initialize();
  
  // Initialize multi-model manager
  await multiModelManager.initialize();

  // Add services to app context
  app.decorate('pythonLoRAIntegration', pythonLoRAIntegration);
  app.decorate('gatedLoRAService', gatedLoRAService);
  app.decorate('trainingEngine', trainingEngine);
  app.decorate('modelRegistry', modelRegistry);
  app.decorate('performanceMonitor', performanceMonitor);
  app.decorate('multiModelManager', multiModelManager);

  // Health check
  app.get('/health', async () => {
    const pythonServiceHealthy = await pythonLoRAIntegration.healthCheck();
    
    const services = {
      python_lora_backend: pythonServiceHealthy,
      gated_lora: true,
      training_engine: true,
      model_registry: true,
      performance_monitor: true,
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
  await app.register(loraRoutes, { prefix: '/api/lora' });
  await app.register(trainingRoutes, { prefix: '/api/training' });
  await app.register(modelsRoutes, { prefix: '/api/models' });
  await app.register(metricsRoutes, { prefix: '/api/metrics' });
  await app.register(modelManagementRoutes, { prefix: '/api/model-management' });
  await app.register(monitoringRoutes, { prefix: '/api/monitoring' });

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
    
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8007;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Gated LoRA service started', {
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
        logger.info('Gated LoRA service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Gated LoRA service', { error });
    process.exit(1);
  }
}

// Add TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    pythonLoRAIntegration: PythonLoRAIntegration;
    gatedLoRAService: GatedLoRAService;
    trainingEngine: TrainingEngine;
    modelRegistry: ModelRegistry;
    performanceMonitor: PerformanceMonitor;
    multiModelManager: MultiModelManager;
  }
}

if (require.main === module) {
  start();
}