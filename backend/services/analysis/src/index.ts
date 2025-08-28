import Fastify from 'fastify';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { errorHandler, notFoundHandler, setupErrorHandling } from '@fineprintai/shared-middleware';
import { queueManager } from '@fineprintai/queue';
import { analysisCache } from '@fineprintai/shared-cache';

import { registerRoutes } from './routes';
import { setupWorkers } from './workers';
import { setupPlugins } from './plugins';

// Import all unified services
import { unifiedAnalysisEngine } from './services/analysisEngine';
import { documentPipeline } from './services/documentPipeline';
import { dashboardService } from './services/dashboardService';
import { reportGenerator } from './services/reportGenerator';
import { changeMonitoringService } from './services/changeMonitor';
import { exportService } from './services/exportService';
import { createWebSocketService, WebSocketService } from './services/websocketService';

const logger = createServiceLogger('unified-analysis-service');

// Global WebSocket service instance
let wsService: WebSocketService;

async function createServer() {
  const server = Fastify({
    logger: false, // We use our custom logger
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
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
    
    // Initialize all unified services
    logger.info('Initializing unified analysis services...');
    await Promise.all([
      unifiedAnalysisEngine.initialize(),
      changeMonitoringService.initialize()
    ]);
    logger.info('All unified services initialized successfully');
    
    // Setup queue workers
    await setupWorkers();

    // Start server
    const address = await server.listen({
      port: config.services.analysis.port,
      host: '0.0.0.0',
    });

    // Initialize WebSocket service
    logger.info('Initializing WebSocket service...');
    wsService = createWebSocketService(server.server);
    logger.info('WebSocket service initialized successfully');

    logger.info(`Unified Analysis service started on ${address}`, {
      service: config.services.analysis.name,
      version: config.services.analysis.version,
      port: config.services.analysis.port,
      environment: config.NODE_ENV,
      features: [
        'unified-analysis-engine',
        'document-pipeline',
        'dashboard-service',
        'report-generator',
        'change-monitoring',
        'export-service',
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
        
        // Close server and other services
        await server.close();
        await queueManager.closeAll();
        await analysisCache.disconnect();
        
        logger.info('Unified Analysis service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start analysis service', { error });
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