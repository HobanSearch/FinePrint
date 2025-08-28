import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function resourceOptimizationRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Get Resource Usage
  fastify.get('/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const usage = await aimlServices.resourceOptimizer.getResourceUsage();
      return reply.code(200).send({ success: true, usage });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}