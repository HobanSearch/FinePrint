import { FastifyInstance } from 'fastify';
import healthRoutes from './health';
import adminRoutes from './admin';
import metricsRoutes from './metrics';
import configRoutes from './config';

export async function registerRoutes(server: FastifyInstance) {
  // Health check routes
  await server.register(healthRoutes, { prefix: '/health' });
  
  // Kong admin routes
  await server.register(adminRoutes, { prefix: '/admin' });
  
  // Metrics routes
  await server.register(metricsRoutes, { prefix: '/metrics' });
  
  // Configuration routes
  await server.register(configRoutes, { prefix: '/config' });

  // Root health endpoint
  server.get('/', async (request, reply) => {
    reply.send({
      service: 'gateway-service',
      version: '1.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  });
}