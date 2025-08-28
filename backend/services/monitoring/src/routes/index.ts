import { FastifyInstance } from 'fastify';
import { monitoringRoutes } from './monitoring';
import { webhookRoutes } from './webhooks';
import { alertRoutes } from './alerts';
import { metricsRoutes } from './metrics';
import { healthRoutes } from './health';

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health and status routes
  await server.register(healthRoutes, { prefix: '/health' });
  
  // Metrics routes
  await server.register(metricsRoutes, { prefix: '/metrics' });
  
  // Core monitoring functionality
  await server.register(monitoringRoutes, { prefix: '/api/v1/monitoring' });
  
  // Webhook management
  await server.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  
  // Alert management
  await server.register(alertRoutes, { prefix: '/api/v1/alerts' });
}