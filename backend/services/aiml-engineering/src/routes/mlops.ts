import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function mlopsRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Get MLOps Status
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = aimlServices.mlOpsOrchestrator.getServiceMetrics();
      return reply.code(200).send({ success: true, status });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}