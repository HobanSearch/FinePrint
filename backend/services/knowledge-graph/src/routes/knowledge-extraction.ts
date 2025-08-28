import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ExtractionRequest } from '../services/knowledge-extraction-service';

export async function knowledgeExtractionRoutes(server: FastifyInstance): Promise<void> {
  const knowledgeGraph = (server as any).knowledgeGraph;

  // Extract knowledge from document
  server.post('/extract', {
    schema: {
      tags: ['Knowledge Extraction'],
      summary: 'Extract knowledge from legal document',
      body: {
        type: 'object',
        required: ['document_content', 'document_type'],
        properties: {
          document_content: { type: 'string', minLength: 100 },
          document_type: { 
            type: 'string', 
            enum: ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'EULA', 'COOKIE_POLICY'] 
          },
          document_metadata: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              company_name: { type: 'string' },
              company_domain: { type: 'string' },
              jurisdiction: { type: 'string' },
              language: { type: 'string', default: 'en' },
            },
          },
          extraction_depth: { 
            type: 'string', 
            enum: ['BASIC', 'DETAILED', 'COMPREHENSIVE'],
            default: 'DETAILED',
          },
          enable_pattern_matching: { type: 'boolean', default: true },
          enable_concept_extraction: { type: 'boolean', default: true },
          enable_relationship_inference: { type: 'boolean', default: true },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: ExtractionRequest }>, reply: FastifyReply) => {
    try {
      // Create extraction service instance
      const { KnowledgeExtractionService } = await import('../services/knowledge-extraction-service');
      const extractionService = new KnowledgeExtractionService(knowledgeGraph);
      
      const result = await extractionService.extractKnowledge(request.body);
      return result;
    } catch (error) {
      request.log.error('Knowledge extraction failed', { error, body: request.body });
      reply.status(500);
      return { error: 'Failed to extract knowledge', message: error.message };
    }
  });

  // Batch extract from multiple documents
  server.post('/batch-extract', {
    schema: {
      tags: ['Knowledge Extraction'],
      summary: 'Batch extract knowledge from multiple documents',
      body: {
        type: 'object',
        required: ['requests'],
        properties: {
          requests: {
            type: 'array',
            items: {
              type: 'object',
              required: ['document_content', 'document_type'],
              properties: {
                document_content: { type: 'string', minLength: 100 },
                document_type: { type: 'string' },
                document_metadata: { type: 'object' },
                extraction_depth: { type: 'string', default: 'DETAILED' },
              },
            },
          },
          batch_size: { type: 'number', minimum: 1, maximum: 10, default: 5 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { requests: ExtractionRequest[]; batch_size?: number } }>, reply: FastifyReply) => {
    try {
      const { KnowledgeExtractionService } = await import('../services/knowledge-extraction-service');
      const extractionService = new KnowledgeExtractionService(knowledgeGraph);
      
      const results = await extractionService.batchExtractKnowledge(
        request.body.requests,
        request.body.batch_size || 5
      );
      return { results, total: results.length };
    } catch (error) {
      request.log.error('Batch knowledge extraction failed', { error });
      reply.status(500);
      return { error: 'Failed to batch extract knowledge', message: error.message };
    }
  });
}