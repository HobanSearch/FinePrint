import Fastify from 'fastify';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { errorHandler, notFoundHandler, setupErrorHandling } from '@fineprintai/shared-middleware';
import { queueManager } from '@fineprintai/queue';
import { notificationCache } from '@fineprintai/shared-cache';

import { registerRoutes } from './routes';
import { setupWorkers } from './workers';
import { setupPlugins } from './plugins';

// Import all services
import { notificationService } from './services/notificationService';
import { emailService } from './services/emailService';
import { webhookService } from './services/webhookService';
import { preferenceService } from './services/preferenceService';
import { templateService } from './services/templateService';
import { deliveryTracker } from './services/deliveryTracker';
import { abTestService } from './services/abTestService';
import { createWebSocketService, WebSocketService } from './services/websocketService';

const logger = createServiceLogger('notification-service');

// Global WebSocket service instance
let wsService: WebSocketService;

async function createServer() {
  const server = Fastify({
    logger: false, // We use our custom logger
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 10 * 1024 * 1024, // 10MB for template uploads
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
    
    // Initialize all services
    logger.info('Initializing notification services...');
    await Promise.all([
      notificationService.initialize(),
      emailService.initialize(),
      webhookService.initialize(),
      preferenceService.initialize(),
      templateService.initialize(),
      deliveryTracker.initialize(),
      abTestService.initialize()
    ]);
    logger.info('All notification services initialized successfully');
    
    // Setup queue workers
    await setupWorkers();

    // Start server
    const address = await server.listen({
      port: config.services.notification.port,
      host: '0.0.0.0',
    });

    // Initialize WebSocket service
    logger.info('Initializing WebSocket service...');
    wsService = createWebSocketService(server.server);
    logger.info('WebSocket service initialized successfully');

    logger.info(`Notification service started on ${address}`, {
      service: config.services.notification.name,
      version: config.services.notification.version,
      port: config.services.notification.port,
      environment: config.NODE_ENV,
      features: [
        'multi-channel-notifications',
        'sendgrid-ses-integration',
        'user-preferences',
        'gdpr-compliance',
        'notification-batching',
        'priority-queues',
        'ab-testing',
        'delivery-tracking',
        'retry-mechanisms',
        'websocket-real-time'
      ]
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        // Shutdown WebSocket service first
        if (wsService) {
          await wsService.shutdown();
        }
        
        // Shutdown all services
        await Promise.all([
          notificationService.shutdown(),
          emailService.shutdown(),
          webhookService.shutdown(),
          deliveryTracker.shutdown(),
          abTestService.shutdown()
        ]);
        
        // Close server and other services
        await server.close();
        await queueManager.closeAll();
        await notificationCache.disconnect();
        
        logger.info('Notification service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start notification service', { error });
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