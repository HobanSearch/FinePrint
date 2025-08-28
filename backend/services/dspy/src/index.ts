import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { authPlugin } from '@fineprintai/auth';

import { dspyRoutes } from './routes/dspy';
import { optimizationRoutes } from './routes/optimization';
import { moduleRoutes } from './routes/modules';
import { metricsRoutes } from './routes/metrics';
import { DSPyService } from './services/dspy-service-new';
import websocket from '@fastify/websocket';

const logger = createServiceLogger('dspy-service');

async function buildApp() {
  const app = Fastify({
    logger: false, // Use our custom logger
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
    origin: config.cors.origins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // WebSocket support
  await app.register(websocket);

  // Auth plugin
  await app.register(authPlugin);

  // Initialize DSPy service
  const dspyService = new DSPyService();

  // Add service to app context
  app.decorate('dspyService', dspyService);

  // Set up WebSocket optimization progress endpoint
  app.register(async function (fastify) {
    fastify.get('/ws/optimization/:jobId', { websocket: true }, (connection, req) => {
      const { jobId } = req.params as { jobId: string };
      
      logger.info(`WebSocket connection established for optimization job ${jobId}`);
      
      // Forward progress updates from DSPy service
      const progressHandler = (data: any) => {
        if (data.jobId === jobId) {
          connection.socket.send(JSON.stringify(data));
        }
      };
      
      dspyService.on('optimizationProgress', progressHandler);
      
      connection.socket.on('close', () => {
        dspyService.removeListener('optimizationProgress', progressHandler);
        logger.info(`WebSocket connection closed for optimization job ${jobId}`);
      });
    });
  });

  // Health check
  app.get('/health', async () => {
    const isHealthy = await dspyService.healthCheck();
    const serviceStatus = dspyService.getServiceStatus();
    
    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        dspy_service: isHealthy ? 'healthy' : 'unhealthy',
        python_backend: serviceStatus.python_service?.initialized ? 'healthy' : 'unhealthy',
        memory_service: serviceStatus.memory_service?.healthy ? 'healthy' : 'unhealthy',
        websocket_connections: serviceStatus.active_websockets || 0,
      },
    };
  });

  // Register routes
  await app.register(dspyRoutes, { prefix: '/api/dspy' });
  await app.register(optimizationRoutes, { prefix: '/api/optimization' });
  await app.register(moduleRoutes, { prefix: '/api/modules' });
  await app.register(metricsRoutes, { prefix: '/api/metrics' });

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
    
    const port = config.services.dspy.port || 8006;
    const host = config.services.dspy.host || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('DSPy service started', {
      port,
      host,
      environment: config.environment,
      version: '1.0.0',
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await app.close();
        logger.info('DSPy service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start DSPy service', { error });
    process.exit(1);
  }
}

// Add TypeScript declarations for decorated services
declare module 'fastify' {
  interface FastifyInstance {
    dspyService: DSPyService;
  }
}

if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}