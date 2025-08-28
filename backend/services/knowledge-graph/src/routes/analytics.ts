import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function analyticsRoutes(server: FastifyInstance): Promise<void> {
  const graphAnalytics = (server as any).graphAnalytics;

  // Get comprehensive graph analytics
  server.get('/graph', {
    schema: {
      tags: ['Analytics'],
      summary: 'Get comprehensive graph analytics',
      description: 'Retrieve detailed analytics about knowledge graph performance and insights',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const analytics = await graphAnalytics.getGraphAnalytics();
      return analytics;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to get graph analytics', message: error.message };
    }
  });

  // Analyze knowledge evolution
  server.get('/evolution', {
    schema: {
      tags: ['Analytics'],
      summary: 'Analyze knowledge evolution',
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'], default: 'WEEKLY' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) => {
    try {
      const evolution = await graphAnalytics.analyzeKnowledgeEvolution(request.query.period as any);
      return evolution;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to analyze knowledge evolution', message: error.message };
    }
  });

  // Get curriculum optimization recommendations
  server.get('/curriculum-optimization', {
    schema: {
      tags: ['Analytics'],
      summary: 'Get curriculum optimization recommendations',
      description: 'Get recommendations for optimizing curriculum and learning paths',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const recommendations = await graphAnalytics.getCurriculumOptimizationRecommendations();
      return recommendations;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to get curriculum optimization recommendations', message: error.message };
    }
  });
}