import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { authenticateToken, requireSubscription } from '@fineprintai/shared-middleware';
import { addAnalysisJob, queueManager } from '@fineprintai/queue';
import { analysisCache } from '@fineprintai/shared-cache';
import type { AuthenticatedRequest, DocumentAnalysisRequest, DocumentAnalysisResponse } from '@fineprintai/shared-types';
import { AnalysisService } from '../services/analysis';
import { DocumentService } from '../services/document';

const logger = createServiceLogger('analysis-routes');

const analysisRequestSchema = z.object({
  content: z.string().optional(),
  url: z.string().url().optional(),
  documentType: z.enum(['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other']).optional(),
  language: z.string().default('en'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
}).refine(data => data.content || data.url, {
  message: "Either 'content' or 'url' must be provided",
});

const analysisQuerySchema = z.object({
  page: z.string().transform(Number).default(1),
  limit: z.string().transform(Number).default(20),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

export async function analysisRoutes(server: FastifyInstance) {
  const analysisService = new AnalysisService();
  const documentService = new DocumentService();

  // Create new analysis
  server.post('/', {
    preHandler: [authenticateToken, requireSubscription(['starter', 'professional', 'team', 'enterprise'])],
    schema: {
      tags: ['Analysis'],
      summary: 'Create new document analysis',
      description: 'Analyze a legal document for problematic clauses and terms',
      body: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Document content (plain text)' },
          url: { type: 'string', format: 'uri', description: 'URL to fetch document from' },
          documentType: { 
            type: 'string', 
            enum: ['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other'],
            description: 'Type of document being analyzed'
          },
          language: { type: 'string', default: 'en', description: 'Document language' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal', description: 'Analysis priority' },
        },
        anyOf: [
          { required: ['content'] },
          { required: ['url'] }
        ],
      },
      security: [{ bearerAuth: [] }],
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                documentId: { type: 'string' },
                estimatedTimeMs: { type: 'number' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    const body = analysisRequestSchema.parse(request.body);

    try {
      let content = body.content;
      let documentType = body.documentType;

      // If URL provided, fetch content
      if (body.url && !content) {
        const fetchedData = await documentService.fetchDocumentFromUrl(body.url);
        content = fetchedData.content;
        documentType = documentType || fetchedData.detectedType;
      }

      if (!content) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST',
          message: 'No content could be extracted from the provided input',
        });
      }

      // Create document record
      const document = await documentService.createDocument({
        title: body.url ? new URL(body.url).hostname : 'Uploaded Document',
        content,
        url: body.url,
        documentType: documentType || 'other',
        language: body.language,
        userId: user.id,
        teamId: user.teamId,
      });

      // Create analysis record
      const analysis = await analysisService.createAnalysis({
        documentId: document.id,
        userId: user.id,
      });

      // Add to queue
      const priority = body.priority === 'high' ? 10 : body.priority === 'low' ? 1 : 5;
      await addAnalysisJob({
        analysisId: analysis.id,
        documentId: document.id,
        userId: user.id,
        content,
        documentType: documentType || 'other',
        language: body.language,
      }, {
        priority,
        attempts: 3,
      });

      logger.info('Analysis job created', {
        analysisId: analysis.id,
        documentId: document.id,
        userId: user.id,
        priority: body.priority,
      });

      return reply.status(201).send({
        success: true,
        data: {
          id: analysis.id,
          status: analysis.status,
          documentId: document.id,
          estimatedTimeMs: 30000, // Estimate based on queue depth
          createdAt: analysis.createdAt,
        },
      });

    } catch (error) {
      logger.error('Failed to create analysis', { error, userId: user.id });
      throw error;
    }
  });

  // Get analysis by ID
  server.get('/:id', {
    preHandler: [authenticateToken],
    schema: {
      tags: ['Analysis'],
      summary: 'Get analysis by ID',
      description: 'Retrieve a specific document analysis',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                documentId: { type: 'string' },
                overallRiskScore: { type: 'number', nullable: true },
                executiveSummary: { type: 'string', nullable: true },
                keyFindings: { type: 'array', items: { type: 'string' } },
                recommendations: { type: 'array', items: { type: 'string' } },
                findings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      category: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      severity: { type: 'string' },
                      confidenceScore: { type: 'number', nullable: true },
                      recommendation: { type: 'string', nullable: true },
                    },
                  },
                },
                processingTimeMs: { type: 'number', nullable: true },
                createdAt: { type: 'string' },
                completedAt: { type: 'string', nullable: true },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    const { id } = request.params as { id: string };

    try {
      // Check cache first
      const cached = await analysisCache.get(`analysis:${id}`);
      if (cached) {
        logger.cacheHit(`analysis:${id}`);
        return reply.send({
          success: true,
          data: cached,
        });
      }

      const analysis = await analysisService.getAnalysisById(id, user.id);
      
      if (!analysis) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Analysis not found',
        });
      }

      // Cache successful result
      if (analysis.status === 'completed') {
        await analysisCache.set(`analysis:${id}`, analysis, 3600); // Cache for 1 hour
      }

      return reply.send({
        success: true,
        data: analysis,
      });

    } catch (error) {
      logger.error('Failed to get analysis', { error, analysisId: id, userId: user.id });
      throw error;
    }
  });

  // List user's analyses
  server.get('/', {
    preHandler: [authenticateToken],
    schema: {
      tags: ['Analysis'],
      summary: 'List user analyses',
      description: 'Get paginated list of user analyses',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
        },
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  documentId: { type: 'string' },
                  documentTitle: { type: 'string' },
                  overallRiskScore: { type: 'number', nullable: true },
                  createdAt: { type: 'string' },
                  completedAt: { type: 'string', nullable: true },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' },
                hasNext: { type: 'boolean' },
                hasPrev: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    const query = analysisQuerySchema.parse(request.query);

    try {
      const result = await analysisService.getUserAnalyses(user.id, {
        page: query.page,
        limit: query.limit,
        status: query.status,
      });

      return reply.send({
        success: true,
        data: result.analyses,
        pagination: result.pagination,
      });

    } catch (error) {
      logger.error('Failed to list analyses', { error, userId: user.id });
      throw error;
    }
  });

  // Get analysis progress/status
  server.get('/:id/status', {
    preHandler: [authenticateToken],
    schema: {
      tags: ['Analysis'],
      summary: 'Get analysis status',
      description: 'Get real-time analysis progress and status',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                progress: {
                  type: 'object',
                  properties: {
                    percentage: { type: 'number' },
                    stage: { type: 'string' },
                    message: { type: 'string' },
                  },
                  nullable: true,
                },
                queuePosition: { type: 'number', nullable: true },
                estimatedTimeMs: { type: 'number', nullable: true },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    const { id } = request.params as { id: string };

    try {
      const analysis = await analysisService.getAnalysisById(id, user.id);
      
      if (!analysis) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Analysis not found',
        });
      }

      // Get queue status if still processing
      let queuePosition = null;
      let estimatedTimeMs = null;
      
      if (analysis.status === 'pending' || analysis.status === 'processing') {
        const jobStatus = await queueManager.getJobStatus('analysis', `analyze-document-${id}`);
        if (jobStatus) {
          // Get queue position (simplified)
          const queueStats = await queueManager.getQueueStats('analysis');
          queuePosition = queueStats.waiting;
          estimatedTimeMs = queuePosition * 30000; // Rough estimate
        }
      }

      return reply.send({
        success: true,
        data: {
          id: analysis.id,
          status: analysis.status,
          progress: null, // Would come from job progress in real implementation
          queuePosition,
          estimatedTimeMs,
        },
      });

    } catch (error) {
      logger.error('Failed to get analysis status', { error, analysisId: id, userId: user.id });
      throw error;
    }
  });

  // Cancel analysis
  server.delete('/:id', {
    preHandler: [authenticateToken],
    schema: {
      tags: ['Analysis'],
      summary: 'Cancel analysis',
      description: 'Cancel a pending or processing analysis',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    const { id } = request.params as { id: string };

    try {
      const analysis = await analysisService.getAnalysisById(id, user.id);
      
      if (!analysis) {
        return reply.status(404).send({
          success: false,
          error: 'NOT_FOUND',
          message: 'Analysis not found',
        });
      }

      if (analysis.status === 'completed' || analysis.status === 'failed') {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_STATUS',
          message: 'Cannot cancel completed or failed analysis',
        });
      }

      // Remove from queue if pending
      if (analysis.status === 'pending') {
        await queueManager.removeJob('analysis', `analyze-document-${id}`);
      }

      // Update analysis status
      await analysisService.updateAnalysisStatus(id, 'failed', 'Cancelled by user');

      logger.info('Analysis cancelled', { analysisId: id, userId: user.id });

      return reply.send({
        success: true,
        message: 'Analysis cancelled successfully',
      });

    } catch (error) {
      logger.error('Failed to cancel analysis', { error, analysisId: id, userId: user.id });
      throw error;
    }
  });
}