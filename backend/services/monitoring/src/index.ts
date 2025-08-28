import Fastify from 'fastify';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { errorHandler, notFoundHandler, setupErrorHandling } from '@fineprintai/shared-middleware';

import { registerRoutes } from './routes';
import { setupWorkers } from './workers';
import { setupPlugins } from './plugins';
import { initializeMetrics } from './monitoring/metrics';
import { initializeTracing } from './monitoring/tracing';

// Import all monitoring services
import { changeDetectionEngine } from './services/changeDetection';
import { tosMonitoringService } from './services/tosMonitoring';
import { webhookService } from './services/webhookService';
import { alertingService } from './services/alertingService';
import { mongoChangeStreamService } from './services/mongoChangeStream';
import { circuitBreakerService } from './services/circuitBreaker';
import { rateLimitingService } from './services/rateLimiting';
import { documentCrawlerService } from './services/documentCrawler';
import { schedulerService } from './services/scheduler';

const logger = createServiceLogger('monitoring-service');

// Global service instances
let isShuttingDown = false;

async function createServer() {
  const server = Fastify({
    logger: false, // We use our custom logger
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
    disableRequestLogging: false,
  });

  // Setup error handling
  setupErrorHandling();
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  // Add graceful shutdown hook
  server.addHook('onClose', async () => {
    logger.info('Fastify server is closing');
    isShuttingDown = true;
  });

  // Setup plugins
  await setupPlugins(server);

  // Register routes
  await registerRoutes(server);

  return server;
}

async function initializeServices() {
  logger.info('Initializing monitoring services...');
  
  // Initialize core services in order
  await Promise.all([
    changeDetectionEngine.initialize(),
    documentCrawlerService.initialize(),
    circuitBreakerService.initialize(),
    rateLimitingService.initialize(),
  ]);

  // Initialize dependent services
  await Promise.all([
    tosMonitoringService.initialize(),
    webhookService.initialize(),
    alertingService.initialize(),
    mongoChangeStreamService.initialize(),
    schedulerService.initialize(),
  ]);

  logger.info('All monitoring services initialized successfully');
}

async function start() {
  try {
    // Initialize observability first
    initializeTracing();
    initializeMetrics();

    const server = await createServer();
    
    // Initialize all monitoring services
    await initializeServices();
    
    // Setup queue workers
    await setupWorkers();

    // Start server
    const address = await server.listen({
      port: config.services.monitoring.port,
      host: '0.0.0.0',
    });

    logger.info(`Monitoring service started on ${address}`, {
      service: config.services.monitoring.name,
      version: config.services.monitoring.version,
      port: config.services.monitoring.port,
      environment: config.NODE_ENV,
      features: [
        'document-change-detection',
        'tos-monitoring',
        'webhook-integrations',
        'real-time-alerting',
        'mongodb-change-streams',
        'prometheus-metrics',
        'opentelemetry-tracing',
        'circuit-breaker-patterns',
        'rate-limiting',
        'scheduled-monitoring'
      ]
    });

    // Health check endpoint
    server.get('/health', async (request, reply) => {
      if (isShuttingDown) {
        return reply.code(503).send({ status: 'shutting down' });
      }

      const healthChecks = await Promise.allSettled([
        changeDetectionEngine.healthCheck(),
        tosMonitoringService.healthCheck(),
        documentCrawlerService.healthCheck(),
        mongoChangeStreamService.healthCheck(),
      ]);

      const failed = healthChecks.filter(check => check.status === 'rejected');
      if (failed.length > 0) {
        return reply.code(503).send({
          status: 'unhealthy',
          checks: healthChecks.map((check, index) => ({
            service: ['changeDetection', 'tosMonitoring', 'documentCrawler', 'mongoChangeStream'][index],
            status: check.status,
            error: check.status === 'rejected' ? check.reason?.message : undefined
          }))
        });
      }

      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: config.services.monitoring.version
      });
    });

    // Ready check endpoint
    server.get('/ready', async (request, reply) => {
      if (isShuttingDown) {
        return reply.code(503).send({ status: 'shutting down' });
      }
      return reply.send({ status: 'ready' });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
      }
      
      logger.info(`Received ${signal}, shutting down gracefully`);
      isShuttingDown = true;
      
      try {
        // Stop accepting new requests
        await server.close();
        
        // Shutdown services in reverse order
        await Promise.all([
          schedulerService.shutdown(),
          mongoChangeStreamService.shutdown(),
          alertingService.shutdown(),
          webhookService.shutdown(),
          tosMonitoringService.shutdown(),
        ]);

        await Promise.all([
          rateLimitingService.shutdown(),
          circuitBreakerService.shutdown(),
          documentCrawlerService.shutdown(),
          changeDetectionEngine.shutdown(),
        ]);
        
        logger.info('Monitoring service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start monitoring service', { error });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

start();