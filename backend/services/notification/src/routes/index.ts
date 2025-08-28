import { FastifyInstance } from 'fastify';
import { createServiceLogger } from '@fineprintai/shared-logger';

// Import route modules
import notificationRoutes from './notifications';
import preferenceRoutes from './preferences';
import templateRoutes from './templates';
import deliveryRoutes from './delivery';
import abTestRoutes from './abTests';
import webhookRoutes from './webhooks';
import healthRoutes from './health';

const logger = createServiceLogger('notification-routes');

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Register API routes
  await server.register(notificationRoutes, { prefix: '/api/v1/notifications' });
  await server.register(preferenceRoutes, { prefix: '/api/v1/preferences' });
  await server.register(templateRoutes, { prefix: '/api/v1/templates' });
  await server.register(deliveryRoutes, { prefix: '/api/v1/delivery' });
  await server.register(abTestRoutes, { prefix: '/api/v1/ab-tests' });
  await server.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await server.register(healthRoutes, { prefix: '/health' });

  // Register WebSocket route
  await server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      connection.socket.on('message', (message) => {
        // Handle WebSocket messages
        logger.debug('WebSocket message received', { message: message.toString() });
      });
    });
  });

  logger.info('All notification service routes registered');
}