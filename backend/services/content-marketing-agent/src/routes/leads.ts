import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiResponse } from '../types';
import { LeadGenerationEngine } from '../services/lead-generation-engine';
import { logger } from '../utils/logger';

const leadEngine = new LeadGenerationEngine();

export default async function leadRoutes(fastify: FastifyInstance) {
  // Generate leads from content
  fastify.post('/generate', async (request: FastifyRequest<{
    Body: {
      contentIds: string[];
      leadMagnets: string[];
      targetAudience: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { contentIds, leadMagnets, targetAudience } = request.body;

      const leads = await leadEngine.generateLeadsFromContent(contentIds, leadMagnets, targetAudience);

      const response: ApiResponse = {
        success: true,
        data: leads,
        message: `Generated ${leads.length} leads`
      };

      return response;
    } catch (error) {
      logger.error('Lead generation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to generate leads'
      };
    }
  });

  // Create lead magnet
  fastify.post('/magnets', async (request: FastifyRequest<{
    Body: {
      title: string;
      type: string;
      targetAudience: string;
      topic: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { title, type, targetAudience, topic } = request.body;

      const leadMagnet = await leadEngine.createLeadMagnet(title, type as any, targetAudience, topic);

      const response: ApiResponse = {
        success: true,
        data: leadMagnet,
        message: 'Lead magnet created successfully'
      };

      return response;
    } catch (error) {
      logger.error('Lead magnet creation failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to create lead magnet'
      };
    }
  });

  // Setup nurturing campaign
  fastify.post('/nurturing', async (request: FastifyRequest<{
    Body: {
      segmentName: string;
      leadIds: string[];
      goals: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { segmentName, leadIds, goals } = request.body;

      // Mock leads for demonstration
      const leads = leadIds.map(id => ({
        id,
        email: `lead${id}@example.com`,
        score: Math.floor(Math.random() * 100),
        status: 'new' as const,
        tags: ['generated'],
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const sequence = await leadEngine.setupNurturingCampaign(segmentName, leads, goals);

      const response: ApiResponse = {
        success: true,
        data: sequence,
        message: 'Nurturing campaign setup completed'
      };

      return response;
    } catch (error) {
      logger.error('Nurturing campaign setup failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to setup nurturing campaign'
      };
    }
  });

  // Personalize landing page
  fastify.post('/landing-page/:leadMagnetId/personalize', async (request: FastifyRequest<{
    Params: { leadMagnetId: string };
    Body: {
      firstName?: string;
      lastName?: string;
      company?: string;
      industry?: string;
      interests: string[];
      painPoints: string[];
      contentPreferences: string[];
    }
  }>, reply: FastifyReply) => {
    try {
      const { leadMagnetId } = request.params;
      const visitorData = request.body;

      const personalization = await leadEngine.personalizeLandingPage(leadMagnetId, visitorData);

      const response: ApiResponse = {
        success: true,
        data: personalization,
        message: 'Landing page personalized'
      };

      return response;
    } catch (error) {
      logger.error('Landing page personalization failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to personalize landing page'
      };
    }
  });

  // Identify hot leads
  fastify.post('/hot-leads', async (request: FastifyRequest<{
    Body: { leadIds: string[] }
  }>, reply: FastifyReply) => {
    try {
      const { leadIds } = request.body;

      // Mock leads for demonstration
      const leads = leadIds.map(id => ({
        id,
        email: `lead${id}@example.com`,
        score: Math.floor(Math.random() * 100),
        status: 'new' as const,
        tags: ['generated'],
        customFields: {
          lastActivity: new Date(),
          engagementScore: Math.random() * 10
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const hotLeads = await leadEngine.identifyHotLeads(leads);

      const response: ApiResponse = {
        success: true,
        data: hotLeads,
        message: `Identified ${hotLeads.length} hot leads`
      };

      return response;
    } catch (error) {
      logger.error('Hot lead identification failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to identify hot leads'
      };
    }
  });

  // Optimize lead generation
  fastify.post('/optimize/:campaignId', async (request: FastifyRequest<{
    Params: { campaignId: string }
  }>, reply: FastifyReply) => {
    try {
      const { campaignId } = request.params;

      const optimization = await leadEngine.optimizeLeadGeneration(campaignId);

      const response: ApiResponse = {
        success: true,
        data: optimization,
        message: 'Lead generation optimization completed'
      };

      return response;
    } catch (error) {
      logger.error('Lead generation optimization failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to optimize lead generation'
      };
    }
  });

  // Get lead by ID
  fastify.get('/:leadId', async (request: FastifyRequest<{
    Params: { leadId: string }
  }>, reply: FastifyReply) => {
    try {
      const { leadId } = request.params;

      // This would fetch from database
      const lead = {
        id: leadId,
        email: `lead${leadId}@example.com`,
        firstName: 'John',
        lastName: 'Doe',
        company: 'Example Corp',
        score: 75,
        status: 'qualified',
        tags: ['high-value', 'enterprise'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const response: ApiResponse = {
        success: true,
        data: lead,
        message: 'Lead retrieved successfully'
      };

      return response;
    } catch (error) {
      logger.error('Lead retrieval failed', { error });
      reply.status(404);
      return {
        success: false,
        error: 'Lead not found'
      };
    }
  });

  // List leads
  fastify.get('/', async (request: FastifyRequest<{
    Querystring: {
      page?: string;
      limit?: string;
      status?: string;
      minScore?: string;
      segment?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '20');
      const { status, minScore, segment } = request.query;

      // This would fetch from database with filters
      const leads = [];
      for (let i = 1; i <= limit; i++) {
        leads.push({
          id: `lead_${i}`,
          email: `lead${i}@example.com`,
          firstName: 'John',
          lastName: 'Doe',
          company: 'Example Corp',
          score: Math.floor(Math.random() * 100),
          status: 'new',
          tags: ['generated'],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      const response: ApiResponse = {
        success: true,
        data: leads,
        pagination: {
          page,
          limit,
          total: 500, // Mock total
          totalPages: Math.ceil(500 / limit)
        }
      };

      return response;
    } catch (error) {
      logger.error('Lead listing failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve leads'
      };
    }
  });

  // Update lead
  fastify.put('/:leadId', async (request: FastifyRequest<{
    Params: { leadId: string };
    Body: {
      status?: string;
      score?: number;
      tags?: string[];
      notes?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const { leadId } = request.params;
      const updates = request.body;

      // This would update lead in database
      const response: ApiResponse = {
        success: true,
        data: {
          id: leadId,
          ...updates,
          updatedAt: new Date()
        },
        message: 'Lead updated successfully'
      };

      return response;
    } catch (error) {
      logger.error('Lead update failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to update lead'
      };
    }
  });

  // Get lead magnets
  fastify.get('/magnets', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // This would fetch from database
      const leadMagnets = [
        {
          id: 'magnet_1',
          title: 'Terms of Service Danger Checklist',
          type: 'checklist',
          description: 'Essential checklist to identify dangerous clauses',
          conversionRate: 18,
          downloads: 1250
        },
        {
          id: 'magnet_2',
          title: 'GDPR Compliance Guide',
          type: 'guide',
          description: 'Complete guide to GDPR compliance',
          conversionRate: 14,
          downloads: 890
        }
      ];

      const response: ApiResponse = {
        success: true,
        data: leadMagnets,
        message: 'Lead magnets retrieved'
      };

      return response;
    } catch (error) {
      logger.error('Lead magnets retrieval failed', { error });
      reply.status(500);
      return {
        success: false,
        error: 'Failed to retrieve lead magnets'
      };
    }
  });
}