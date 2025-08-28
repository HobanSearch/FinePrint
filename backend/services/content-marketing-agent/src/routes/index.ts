import { FastifyInstance } from 'fastify';
import contentRoutes from './content';
import campaignRoutes from './campaigns';
import analyticsRoutes from './analytics';
import leadRoutes from './leads';
import seoRoutes from './seo';
import distributionRoutes from './distribution';
import healthRoutes from './health';

export default async function routes(fastify: FastifyInstance) {
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(contentRoutes, { prefix: '/content' });
  await fastify.register(campaignRoutes, { prefix: '/campaigns' });
  await fastify.register(analyticsRoutes, { prefix: '/analytics' });
  await fastify.register(leadRoutes, { prefix: '/leads' });
  await fastify.register(seoRoutes, { prefix: '/seo' });
  await fastify.register(distributionRoutes, { prefix: '/distribution' });
}