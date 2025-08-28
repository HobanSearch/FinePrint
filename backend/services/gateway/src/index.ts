import Fastify from 'fastify';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { errorHandler, notFoundHandler, setupErrorHandling } from '@fineprintai/shared-middleware';

import { registerRoutes } from './routes';
import { setupPlugins } from './plugins';
import { KongAdminService } from './services/kongAdmin';
import { HealthCheckService } from './services/healthCheck';
import { MetricsService } from './services/metrics';
import { ConfigReloadService } from './services/configReload';

const logger = createServiceLogger('gateway-service');

// Global service instances
let kongAdmin: KongAdminService;
let healthCheck: HealthCheckService;
let metricsService: MetricsService;
let configReload: ConfigReloadService;

async function createServer() {
  const server = Fastify({
    logger: false, // We use our custom logger
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    trustProxy: true, // Important for API Gateway
  });

  // Setup error handling
  setupErrorHandling();
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  // Register plugins
  await setupPlugins(server);

  // Register routes
  await registerRoutes(server);

  return server;
}

async function start() {
  try {
    const server = await createServer();
    
    // Initialize services
    logger.info('Initializing gateway services...');
    
    kongAdmin = new KongAdminService({
      adminUrl: config.kong.adminUrl || 'http://localhost:8001',
      adminToken: config.kong.adminToken,
    });

    healthCheck = new HealthCheckService({
      kongAdmin,
      services: [
        'analysis-service',
        'monitoring-service', 
        'notification-service',
        'billing-service',
        'user-service'
      ],
      redisUrl: config.redis.url,
      checkInterval: 30000, // 30 seconds
    });

    metricsService = new MetricsService({
      kongAdmin,
      prometheusPort: config.services.gateway.metricsPort || 9090,
    });

    configReload = new ConfigReloadService({
      kongAdmin,
      configPath: '/etc/kong/declarative/kong.yml',
      watchInterval: 60000, // 1 minute
    });

    // Initialize all services
    await Promise.all([
      kongAdmin.initialize(),
      healthCheck.initialize(),
      metricsService.initialize(),
      configReload.initialize(),
    ]);

    logger.info('All gateway services initialized successfully');

    // Start health check server
    const address = await server.listen({
      port: config.services.gateway.port || 8003,
      host: '0.0.0.0',
    });

    logger.info(`Gateway health service started on ${address}`, {
      service: 'gateway-service',
      version: '1.0.0',
      port: config.services.gateway.port || 8003,
      environment: config.NODE_ENV,
      features: [
        'kong-admin-api',
        'health-monitoring',
        'metrics-collection',
        'config-hot-reload',
        'service-discovery',
        'circuit-breaker',
        'rate-limiting'
      ]
    });

    // Start metrics server
    await metricsService.startMetricsServer();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        // Stop services in reverse order
        await configReload.shutdown();
        await metricsService.shutdown();
        await healthCheck.shutdown();
        await kongAdmin.shutdown();
        await server.close();
        
        logger.info('Gateway service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start gateway service', { error });
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