import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ModelMetadataSchema } from '../services/model-registry';

export default async function modelRegistryRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Register Model
  fastify.post('/models', {
    schema: {
      description: 'Register a new model',
      tags: ['Registry'],
      body: ModelMetadataSchema.partial(),
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const modelId = await aimlServices.modelRegistry.registerModel(request.body);
      return reply.code(201).send({ success: true, model_id: modelId });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // List Models
  fastify.get('/models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const models = await aimlServices.modelRegistry.listModels();
      return reply.code(200).send({ success: true, models });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // Get Model
  fastify.get('/models/:modelId', async (request: FastifyRequest<{ Params: { modelId: string } }>, reply: FastifyReply) => {
    try {
      const model = await aimlServices.modelRegistry.getModel(request.params.modelId);
      if (!model) {
        return reply.code(404).send({ error: 'Model not found' });
      }
      return reply.code(200).send({ success: true, model });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });
}