import { FastifyInstance } from 'fastify';
import { knowledgeGraphRoutes } from './knowledge-graph';
import { curriculumLearningRoutes } from './curriculum-learning';
import { semanticSearchRoutes } from './semantic-search';
import { analyticsRoutes } from './analytics';
import { knowledgeExtractionRoutes } from './knowledge-extraction';
import { graphInferenceRoutes } from './graph-inference';
import { healthRoutes } from './health';

/**
 * Register all routes for the Knowledge Graph Service
 */
export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health check routes (no auth required)
  await server.register(healthRoutes);

  // Core API routes (auth required)
  await server.register(async function (server) {
    // Apply authentication middleware to all routes in this scope
    server.addHook('onRequest', async (request, reply) => {
      // TODO: Implement authentication middleware
      // For now, skip authentication in development
      if (process.env.NODE_ENV !== 'development') {
        // Add JWT verification logic here
      }
    });

    // Register feature routes
    await server.register(knowledgeGraphRoutes, { prefix: '/api/knowledge-graph' });
    await server.register(curriculumLearningRoutes, { prefix: '/api/curriculum' });
    await server.register(semanticSearchRoutes, { prefix: '/api/search' });
    await server.register(analyticsRoutes, { prefix: '/api/analytics' });
    await server.register(knowledgeExtractionRoutes, { prefix: '/api/extraction' });
    await server.register(graphInferenceRoutes, { prefix: '/api/inference' });
  });
}