import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OptimizationConfigSchema } from '../services/hyperparameter-optimizer';

export default async function hyperparameterOptimizationRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Start Optimization Study
  fastify.post('/start', {
    schema: {
      description: 'Start a hyperparameter optimization study',
      tags: ['Optimization'],
      body: OptimizationConfigSchema,
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const studyId = await aimlServices.hyperparameterOptimizer.startOptimization(request.body);
      return reply.code(200).send({ success: true, study_id: studyId });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // Get Studies
  fastify.get('/studies', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const studies = aimlServices.hyperparameterOptimizer.listStudies();
      return reply.code(200).send({ success: true, studies });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}