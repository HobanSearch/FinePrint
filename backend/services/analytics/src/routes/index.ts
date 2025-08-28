/**
 * Fine Print AI - Analytics Routes Index
 * 
 * Main routing configuration for analytics service
 */

import { FastifyPluginAsync } from 'fastify';
import productAnalyticsRoutes from './product-analytics';
import aiAnalyticsRoutes from './ai-analytics';

const routes: FastifyPluginAsync = async (fastify) => {
  // Register product analytics routes
  await fastify.register(productAnalyticsRoutes, { prefix: '/product' });
  
  // Register AI analytics routes
  await fastify.register(aiAnalyticsRoutes, { prefix: '/ai' });
  
  // Health check route for load balancer
  fastify.get('/health', async (request, reply) => {
    return reply.code(200).send({
      status: 'healthy',
      service: 'analytics',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });
};

export default routes;