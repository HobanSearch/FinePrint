import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ContentCreationRequestSchema, ApiResponse } from '../types';
import { ContentCreationEngine } from '../services/content-creation-engine';
import { BrandVoiceManager } from '../services/brand-voice-manager';
import { logger } from '../utils/logger';

const contentEngine = new ContentCreationEngine();
const brandVoiceManager = new BrandVoiceManager();

export default async function contentRoutes(fastify: FastifyInstance) {
  // Create content
  fastify.post('/create', {
    schema: {
      body: ContentCreationRequestSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: {
      type: string;
      topic: string;
      targetAudience: string;
      keywords?: string[];
      tone?: string;
      length?: string;
      platform?: string;
      includeCallToAction?: boolean;
      seoOptimized?: boolean;
      includeVisuals?: boolean;
      scheduledFor?: string;
      campaignId?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      logger.info('Content creation request received', { 
        type: request.body.type,
        topic: request.body.topic 
      });

      const contentRequest = {
        ...request.body,
        scheduledFor: request.body.scheduledFor ? new Date(request.body.scheduledFor) : undefined
      } as any;

      const content = await contentEngine.createContent(contentRequest);

      const response: ApiResponse = {
        success: true,
        data: content,
        message: 'Content created successfully'
      };

      return response;
    } catch (error) {
      logger.error('Content creation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Content creation failed'
      };
    }
  });

  // Get content by ID
  fastify.get('/:contentId', async (request: FastifyRequest<{
    Params: { contentId: string }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      
      // This would fetch from database
      // For now, return placeholder
      const response: ApiResponse = {
        success: true,
        data: {
          id: contentId,
          message: 'Content retrieval not yet implemented'
        }
      };

      return response;
    } catch (error) {
      logger.error('Content retrieval failed', { error });
      reply.status(404);
      return {
        success: false,
        error: 'Content not found'
      };
    }
  });

  // List content
  fastify.get('/', async (request: FastifyRequest<{
    Querystring: {
      page?: string;
      limit?: string;
      type?: string;
      campaignId?: string;
      status?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '20');
      
      // This would fetch from database with pagination
      const response: ApiResponse = {
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      };

      return response;
    } catch (error) {
      logger.error('Content listing failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve content list'
      };
    }
  });

  // Update content
  fastify.put('/:contentId', async (request: FastifyRequest<{
    Params: { contentId: string };
    Body: {
      title?: string;
      content?: string;
      status?: string;
      tags?: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const updates = request.body;

      // This would update in database
      const response: ApiResponse = {
        success: true,
        data: {
          id: contentId,
          ...updates,
          updatedAt: new Date()
        },
        message: 'Content updated successfully'
      };

      return response;
    } catch (error) {
      logger.error('Content update failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to update content'
      };
    }
  });

  // Delete content
  fastify.delete('/:contentId', async (request: FastifyRequest<{
    Params: { contentId: string }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;

      // This would delete from database
      const response: ApiResponse = {
        success: true,
        message: 'Content deleted successfully'
      };

      return response;
    } catch (error) {
      logger.error('Content deletion failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to delete content'
      };
    }
  });

  // Validate content against brand voice
  fastify.post('/:contentId/validate', async (request: FastifyRequest<{
    Params: { contentId: string }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      
      // This would fetch content and validate
      const mockContent = "Sample content for validation";
      const validation = await brandVoiceManager.validateContent(mockContent, 'blog_post');

      const response: ApiResponse = {
        success: true,
        data: validation,
        message: 'Content validation completed'
      };

      return response;
    } catch (error) {
      logger.error('Content validation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Content validation failed'
      };
    }
  });

  // Generate content variations
  fastify.post('/:contentId/variations', async (request: FastifyRequest<{
    Params: { contentId: string };
    Body: {
      count?: number;
      platforms?: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentId } = request.params;
      const { count = 3, platforms = ['linkedin', 'twitter'] } = request.body;

      // This would generate variations of existing content
      const variations = [];
      for (let i = 0; i < count; i++) {
        variations.push({
          id: `${contentId}_variation_${i + 1}`,
          platform: platforms[i % platforms.length],
          content: `Variation ${i + 1} of content ${contentId}`,
          createdAt: new Date()
        });
      }

      const response: ApiResponse = {
        success: true,
        data: variations,
        message: `Generated ${count} content variations`
      };

      return response;
    } catch (error) {
      logger.error('Content variation generation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate content variations'
      };
    }
  });

  // Get brand voice guidelines
  fastify.get('/brand-voice/guidelines', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const guidelines = await brandVoiceManager.generateBrandVoicePrompt();

      const response: ApiResponse = {
        success: true,
        data: { guidelines },
        message: 'Brand voice guidelines retrieved'
      };

      return response;
    } catch (error) {
      logger.error('Brand voice guidelines retrieval failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve brand voice guidelines'
      };
    }
  });

  // Get content guidelines for specific type and platform
  fastify.get('/guidelines', async (request: FastifyRequest<{
    Querystring: {
      contentType: string;
      platform?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentType, platform } = request.query;
      
      const guidelines = await brandVoiceManager.generateContentGuidelines(contentType, platform);

      const response: ApiResponse = {
        success: true,
        data: { guidelines },
        message: 'Content guidelines retrieved'
      };

      return response;
    } catch (error) {
      logger.error('Content guidelines retrieval failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve content guidelines'
      };
    }
  });
}