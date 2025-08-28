import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { InferenceRequest } from '../services/graph-enhanced-inference-service';

export async function graphInferenceRoutes(server: FastifyInstance): Promise<void> {
  const knowledgeGraph = (server as any).knowledgeGraph;

  // Perform graph-enhanced inference
  server.post('/enhanced', {
    schema: {
      tags: ['Graph Inference'],
      summary: 'Graph-enhanced AI inference',
      description: 'Perform AI inference enhanced with knowledge graph context and curriculum learning',
      body: {
        type: 'object',
        required: ['query', 'context_type'],
        properties: {
          query: { type: 'string', minLength: 1 },
          document_content: { type: 'string' },
          context_type: { 
            type: 'string', 
            enum: ['DOCUMENT_ANALYSIS', 'CONCEPT_EXPLANATION', 'LEGAL_REASONING'] 
          },
          use_graph_context: { type: 'boolean', default: true },
          use_curriculum_guidance: { type: 'boolean', default: false },
          inference_parameters: {
            type: 'object',
            properties: {
              temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.1 },
              max_tokens: { type: 'number', minimum: 1, maximum: 8192, default: 2048 },
              top_p: { type: 'number', minimum: 0, maximum: 1, default: 0.9 },
              frequency_penalty: { type: 'number', minimum: -2, maximum: 2, default: 0 },
            },
          },
          curriculum_context: {
            type: 'object',
            properties: {
              learner_id: { type: 'string' },
              current_difficulty: { type: 'number', minimum: 1, maximum: 10 },
              focus_concepts: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: InferenceRequest }>, reply: FastifyReply) => {
    try {
      const { GraphEnhancedInferenceService } = await import('../services/graph-enhanced-inference-service');
      const inferenceService = new GraphEnhancedInferenceService(knowledgeGraph);
      
      const result = await inferenceService.performEnhancedInference(request.body);
      return result;
    } catch (error) {
      request.log.error('Graph-enhanced inference failed', { error, body: request.body });
      reply.status(500);
      return { error: 'Failed to perform enhanced inference', message: error.message };
    }
  });

  // Batch inference requests
  server.post('/batch-enhanced', {
    schema: {
      tags: ['Graph Inference'],
      summary: 'Batch graph-enhanced inference',
      body: {
        type: 'object',
        required: ['requests'],
        properties: {
          requests: {
            type: 'array',
            items: {
              type: 'object',
              required: ['query', 'context_type'],
              properties: {
                query: { type: 'string' },
                context_type: { type: 'string' },
                use_graph_context: { type: 'boolean', default: true },
              },
            },
          },
          share_context: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { requests: InferenceRequest[]; share_context?: boolean } }>, reply: FastifyReply) => {
    try {
      const { GraphEnhancedInferenceService } = await import('../services/graph-enhanced-inference-service');
      const inferenceService = new GraphEnhancedInferenceService(knowledgeGraph);
      
      const results = await inferenceService.batchEnhancedInference(
        request.body.requests,
        request.body.share_context !== false
      );
      return { results, total: results.length };
    } catch (error) {
      request.log.error('Batch graph-enhanced inference failed', { error });
      reply.status(500);
      return { error: 'Failed to perform batch enhanced inference', message: error.message };
    }
  });
}