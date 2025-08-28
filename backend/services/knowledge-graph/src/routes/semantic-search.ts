import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function semanticSearchRoutes(server: FastifyInstance): Promise<void> {
  const knowledgeGraph = (server as any).knowledgeGraph;
  const semanticSearch = knowledgeGraph.getSemanticSearchService();

  // Semantic search across all types
  server.post('/semantic', {
    schema: {
      tags: ['Semantic Search'],
      summary: 'Semantic search across knowledge graph',
      body: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { query: string; limit?: number } }>, reply: FastifyReply) => {
    try {
      const results = await semanticSearch.searchAcrossTypes(request.body.query, request.body.limit || 20);
      return { results, query: request.body.query, total: results.length };
    } catch (error) {
      reply.status(500);
      return { error: 'Semantic search failed', message: error.message };
    }
  });

  // Find similar nodes using embeddings
  server.get('/similar/:nodeId', {
    schema: {
      tags: ['Semantic Search'],
      summary: 'Find similar nodes',
      params: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          node_type: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.7 },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Params: { nodeId: string }; 
    Querystring: { node_type?: string; limit?: number; threshold?: number } 
  }>, reply: FastifyReply) => {
    try {
      const embeddings = knowledgeGraph.getEmbeddingsService();
      const results = await embeddings.findSimilarNodes(
        request.params.nodeId,
        request.query.node_type,
        request.query.limit || 10,
        request.query.threshold || 0.7
      );
      return { results, node_id: request.params.nodeId, total: results.length };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to find similar nodes', message: error.message };
    }
  });
}