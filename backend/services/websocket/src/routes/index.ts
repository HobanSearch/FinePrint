import { FastifyInstance } from 'fastify';
import { createServiceLogger } from '@fineprintai/shared-logger';

import healthRoutes from './health';
import metricsRoutes from './metrics';
import adminRoutes from './admin';
import websocketRoutes from './websocket';

const logger = createServiceLogger('websocket-routes');

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health check routes (no auth required)
  await server.register(healthRoutes, { prefix: '/health' });

  // Metrics routes (auth required)
  await server.register(metricsRoutes, { prefix: '/metrics' });

  // Admin routes (auth required)
  await server.register(adminRoutes, { prefix: '/admin' });

  // WebSocket management routes (auth required)
  await server.register(websocketRoutes, { prefix: '/ws' });

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      service: 'Fine Print AI WebSocket Service',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      docs: '/docs',
      health: '/health',
      metrics: '/metrics',
    };
  });

  logger.info('All routes registered successfully');
}