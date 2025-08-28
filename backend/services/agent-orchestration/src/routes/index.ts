import { FastifyInstance } from 'fastify';
import { Logger } from '../utils/logger';

// Import route modules
import agentRoutes from './agents';
import workflowRoutes from './workflows';
import communicationRoutes from './communication';
import decisionRoutes from './decisions';
import resourceRoutes from './resources';
import monitoringRoutes from './monitoring';
import businessProcessRoutes from './business-processes';
import healthRoutes from './health';

const logger = Logger.child({ component: 'routes' });

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  logger.info('Registering routes...');

  // Health check routes (no auth required)
  await server.register(healthRoutes, { prefix: '/health' });

  // API routes (authentication disabled for testing)
  await server.register(async function (fastify) {
    // Add authentication hook (disabled for testing)
    // fastify.addHook('preHandler', fastify.authenticate);

    // Register API routes
    await fastify.register(agentRoutes, { prefix: '/api/v1/agents' });
    await fastify.register(workflowRoutes, { prefix: '/api/v1/workflows' });
    await fastify.register(communicationRoutes, { prefix: '/api/v1/communication' });
    await fastify.register(decisionRoutes, { prefix: '/api/v1/decisions' });
    await fastify.register(resourceRoutes, { prefix: '/api/v1/resources' });
    await fastify.register(monitoringRoutes, { prefix: '/api/v1/monitoring' });
    await fastify.register(businessProcessRoutes, { prefix: '/api/v1/business-processes' });
  });

  logger.info('Routes registered successfully');
}