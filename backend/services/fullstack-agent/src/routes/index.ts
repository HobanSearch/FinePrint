import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import codeGenerationRoutes from './code-generation';
import architectureRoutes from './architecture';
import qualityRoutes from './quality';
import templatesRoutes from './templates';
import integrationsRoutes from './integrations';
import healthRoutes from './health';
import metricsRoutes from './metrics';
import webhooksRoutes from './webhooks';
import websocketRoutes from './websocket';

export default async function routes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
): Promise<void> {
  // Register all route modules
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(metricsRoutes, { prefix: '/metrics' });
  await fastify.register(codeGenerationRoutes, { prefix: '/api/v1/generate' });
  await fastify.register(architectureRoutes, { prefix: '/api/v1/architecture' });
  await fastify.register(qualityRoutes, { prefix: '/api/v1/quality' });
  await fastify.register(templatesRoutes, { prefix: '/api/v1/templates' });
  await fastify.register(integrationsRoutes, { prefix: '/api/v1/integrations' });
  await fastify.register(webhooksRoutes, { prefix: '/webhooks' });
  await fastify.register(websocketRoutes);

  // Root endpoint
  fastify.get('/', async (request, reply) => {
    return {
      service: 'Full-Stack Development Agent',
      version: '1.0.0',
      status: 'operational',
      capabilities: [
        'code_generation',
        'architecture_decisions',
        'quality_assurance',
        'template_management',
        'integration_management',
      ],
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        api: '/api/v1',
        docs: '/docs',
        websocket: '/ws',
      },
    });
  });
}