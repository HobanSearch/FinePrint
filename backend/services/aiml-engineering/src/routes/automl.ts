import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function automlRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Start AutoML Pipeline
  fastify.post('/start', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const pipelineId = await aimlServices.automlPipeline.startAutoMLPipeline(request.body);
      return reply.code(200).send({ success: true, pipeline_id: pipelineId });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}