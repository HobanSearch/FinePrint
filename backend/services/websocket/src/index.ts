import Fastify from 'fastify';
import { Server as HttpServer } from 'http';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { errorHandler, notFoundHandler, setupErrorHandling } from '@fineprintai/shared-middleware';

import { setupPlugins } from './plugins';
import { registerRoutes } from './routes';
import { WebSocketService } from './services/websocketService';
import { MessageQueueService } from './services/messageQueueService';
import { MetricsService } from './services/metricsService';

const logger = createServiceLogger('websocket-service');

// Global service instances
let wsService: WebSocketService;
let messageQueueService: MessageQueueService;
let metricsService: MetricsService;
let httpServer: HttpServer;

async function createServer() {
  const server = Fastify({
    logger: false, // We use our custom logger
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    keepAliveTimeout: 30000,
    bodyLimit: 1048576, // 1MB
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
    
    // Get underlying HTTP server for Socket.io
    httpServer = server.server;
    
    // Initialize services
    logger.info('Initializing WebSocket services...');
    
    // Initialize metrics service first
    metricsService = new MetricsService();
    await metricsService.initialize();
    
    // Initialize message queue service
    messageQueueService = new MessageQueueService();
    await messageQueueService.initialize();
    
    // Initialize WebSocket service
    wsService = new WebSocketService(httpServer, messageQueueService, metricsService);
    await wsService.initialize();
    
    logger.info('All WebSocket services initialized successfully');
    
    // Start HTTP server
    const address = await server.listen({
      port: config.services.websocket.port,
      host: '0.0.0.0',
    });

    logger.info(`WebSocket service started on ${address}`, {
      service: config.services.websocket.name,
      version: config.services.websocket.version,
      port: config.services.websocket.port,
      environment: config.NODE_ENV,
      features: [
        'socket.io-v4',
        'redis-clustering',
        'jwt-authentication',
        'rate-limiting',
        'message-queuing',
        'offline-support',
        'horizontal-scaling',
        'monitoring-metrics'
      ]
    });

    // Setup health checks
    setupHealthChecks();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        // Shutdown services in reverse order
        if (wsService) {
          await wsService.shutdown();
        }
        
        if (messageQueueService) {
          await messageQueueService.shutdown();
        }
        
        if (metricsService) {
          await metricsService.shutdown();
        }
        
        // Close HTTP server
        await server.close();
        
        logger.info('WebSocket service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start WebSocket service', { error });
    process.exit(1);
  }
}

function setupHealthChecks() {
  // Periodic health checks
  setInterval(async () => {
    try {
      const health = await getHealthStatus();
      if (!health.healthy) {
        logger.warn('Health check failed', { health });
      }
    } catch (error) {
      logger.error('Health check error', { error });
    }
  }, 30000); // Every 30 seconds
}

export async function getHealthStatus() {
  try {
    const wsHealth = wsService ? await wsService.getHealthStatus() : { healthy: false };
    const queueHealth = messageQueueService ? await messageQueueService.getHealthStatus() : { healthy: false };
    const metricsHealth = metricsService ? await metricsService.getHealthStatus() : { healthy: false };

    const healthy = wsHealth.healthy && queueHealth.healthy && metricsHealth.healthy;

    return {
      healthy,
      timestamp: new Date().toISOString(),
      services: {
        websocket: wsHealth,
        messageQueue: queueHealth,
        metrics: metricsHealth,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: wsService ? wsService.getConnectionStats() : { total: 0, unique: 0 },
    };
  } catch (error) {
    logger.error('Error getting health status', { error });
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
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

// Start the service
start();

// Export services for testing
export { wsService, messageQueueService, metricsService };