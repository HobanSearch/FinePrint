import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

export default async function performanceMonitoringRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Get Model Dashboard
  fastify.get('/dashboard/:modelId', {
    schema: {
      description: 'Get performance dashboard for a model',
      tags: ['Monitoring'],
      params: z.object({ modelId: z.string() }),
      querystring: z.object({ timeRange: z.string().default('24h') }),
    },
  }, async (request: FastifyRequest<{ Params: { modelId: string }; Querystring: { timeRange: string } }>, reply: FastifyReply) => {
    try {
      const dashboard = await aimlServices.performanceMonitor.getModelDashboard(
        request.params.modelId,
        request.query.timeRange
      );
      return reply.code(200).send({ success: true, dashboard });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // Configure Drift Detection
  fastify.post('/drift-detection/configure', {
    schema: {
      description: 'Configure data drift detection for a model',
      tags: ['Monitoring'],
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      await aimlServices.performanceMonitor.configureDriftDetection(request.body);
      return reply.code(200).send({ success: true, message: 'Drift detection configured' });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}