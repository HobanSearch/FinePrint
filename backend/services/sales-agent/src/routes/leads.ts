import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CreateLeadRequest, UpdateLeadRequest, Lead } from '@fineprintai/shared-types';
import { getServices } from '../services';

const createLeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.enum(['website', 'referral', 'marketing', 'cold_outreach', 'organic']),
  notes: z.array(z.string()).optional().default([]),
});

const updateLeadSchema = z.object({
  score: z.number().min(0).max(100).optional(),
  stage: z.enum(['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
  assignedTo: z.string().optional(),
  notes: z.array(z.string()).optional(),
  nextFollowUp: z.string().datetime().optional(),
  estimatedValue: z.number().positive().optional(),
  probability: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
});

const leadParamsSchema = z.object({
  id: z.string().uuid(),
});

const leadQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('50'),
  source: z.string().optional(),
  stage: z.string().optional(),
  assignedTo: z.string().optional(),
  minScore: z.string().transform(Number).optional(),
  search: z.string().optional(),
});

export async function leadsRoutes(fastify: FastifyInstance) {
  const { leadScoringService, emailAutomationService, workflowAutomationService } = getServices();

  // Create lead
  fastify.post<{
    Body: CreateLeadRequest;
  }>('/', {
    schema: {
      tags: ['leads'],
      summary: 'Create a new lead',
      body: createLeadSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: CreateLeadRequest }>, reply: FastifyReply) => {
    try {
      const lead = await leadScoringService.createLead(request.body);
      
      // Trigger welcome email sequence
      await emailAutomationService.startEmailSequence(lead.id, 'welcome');
      
      // Set up nurturing workflow
      await workflowAutomationService.setupLeadNurturingWorkflow(lead.id);

      reply.code(201).send({
        success: true,
        data: lead,
        message: 'Lead created successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to create lead',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get leads with filtering and pagination
  fastify.get<{
    Querystring: z.infer<typeof leadQuerySchema>;
  }>('/', {
    schema: {
      tags: ['leads'],
      summary: 'Get leads with filtering and pagination',
      querystring: leadQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                leads: { type: 'array' },
                pagination: { type: 'object' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof leadQuerySchema> }>, reply: FastifyReply) => {
    try {
      const { page, limit, source, stage, assignedTo, minScore, search } = request.query;
      
      const where: any = {};
      if (source) where.source = source;
      if (stage) where.stage = stage;
      if (assignedTo) where.assignedTo = assignedTo;
      if (minScore) where.score = { gte: minScore };
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [leads, total] = await Promise.all([
        fastify.prisma.lead.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { score: 'desc' },
          include: {
            activities: {
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        }),
        fastify.prisma.lead.count({ where }),
      ]);

      reply.send({
        success: true,
        data: {
          leads,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve leads',
      });
    }
  });

  // Get lead by ID
  fastify.get<{
    Params: z.infer<typeof leadParamsSchema>;
  }>('/:id', {
    schema: {
      tags: ['leads'],
      summary: 'Get lead by ID',
      params: leadParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof leadParamsSchema> }>, reply: FastifyReply) => {
    try {
      const lead = await fastify.prisma.lead.findUnique({
        where: { id: request.params.id },
        include: {
          activities: {
            orderBy: { createdAt: 'desc' },
          },
          opportunities: true,
        },
      });

      if (!lead) {
        return reply.code(404).send({
          success: false,
          error: 'Lead not found',
        });
      }

      reply.send({
        success: true,
        data: lead,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve lead',
      });
    }
  });

  // Update lead
  fastify.put<{
    Params: z.infer<typeof leadParamsSchema>;
    Body: UpdateLeadRequest;
  }>('/:id', {
    schema: {
      tags: ['leads'],
      summary: 'Update lead',
      params: leadParamsSchema,
      body: updateLeadSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof leadParamsSchema>; Body: UpdateLeadRequest }>, reply: FastifyReply) => {
    try {
      const lead = await leadScoringService.updateLead(request.params.id, request.body);

      reply.send({
        success: true,
        data: lead,
        message: 'Lead updated successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to update lead',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Calculate lead score
  fastify.post<{
    Params: z.infer<typeof leadParamsSchema>;
  }>('/:id/score', {
    schema: {
      tags: ['leads'],
      summary: 'Recalculate lead score',
      params: leadParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                previousScore: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof leadParamsSchema> }>, reply: FastifyReply) => {
    try {
      const leadId = request.params.id;
      
      // Get current score
      const currentLead = await fastify.prisma.lead.findUnique({
        where: { id: leadId },
        select: { score: true },
      });

      const newScore = await leadScoringService.calculateLeadScore(leadId);
      
      // Update lead with new score
      await fastify.prisma.lead.update({
        where: { id: leadId },
        data: { score: newScore, updatedAt: new Date() },
      });

      reply.send({
        success: true,
        data: {
          score: newScore,
          previousScore: currentLead?.score || 0,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to calculate lead score',
      });
    }
  });

  // Get hot leads
  fastify.get('/hot', {
    schema: {
      tags: ['leads'],
      summary: 'Get hot leads (high score)',
      querystring: z.object({
        limit: z.string().transform(Number).default('20'),
      }),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { limit: number } }>, reply: FastifyReply) => {
    try {
      const hotLeads = await leadScoringService.getHotLeads(request.query.limit);

      reply.send({
        success: true,
        data: hotLeads,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to retrieve hot leads',
      });
    }
  });

  // Bulk score leads
  fastify.post('/bulk-score', {
    schema: {
      tags: ['leads'],
      summary: 'Bulk score multiple leads',
      body: z.object({
        leadIds: z.array(z.string().uuid()),
      }),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Body: { leadIds: string[] } }>, reply: FastifyReply) => {
    try {
      const results = await leadScoringService.bulkScoreLeads(request.body.leadIds);

      reply.send({
        success: true,
        data: results,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to bulk score leads',
      });
    }
  });

  // Send personalized email
  fastify.post<{
    Params: z.infer<typeof leadParamsSchema>;
  }>('/:id/email', {
    schema: {
      tags: ['leads'],
      summary: 'Send personalized email to lead',
      params: leadParamsSchema,
      body: z.object({
        templateId: z.string(),
        customData: z.record(z.any()).optional(),
      }),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Params: z.infer<typeof leadParamsSchema>; 
    Body: { templateId: string; customData?: Record<string, any> } 
  }>, reply: FastifyReply) => {
    try {
      const success = await emailAutomationService.sendPersonalizedEmail(
        request.params.id,
        request.body.templateId,
        request.body.customData
      );

      reply.send({
        success,
        message: success ? 'Email sent successfully' : 'Failed to send email',
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to send email',
      });
    }
  });

  // Start email sequence
  fastify.post<{
    Params: z.infer<typeof leadParamsSchema>;
  }>('/:id/sequence', {
    schema: {
      tags: ['leads'],
      summary: 'Start email sequence for lead',
      params: leadParamsSchema,
      body: z.object({
        sequenceId: z.string(),
      }),
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ 
    Params: z.infer<typeof leadParamsSchema>; 
    Body: { sequenceId: string } 
  }>, reply: FastifyReply) => {
    try {
      await emailAutomationService.startEmailSequence(
        request.params.id,
        request.body.sequenceId
      );

      reply.send({
        success: true,
        message: 'Email sequence started successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to start email sequence',
      });
    }
  });

  // Delete lead
  fastify.delete<{
    Params: z.infer<typeof leadParamsSchema>;
  }>('/:id', {
    schema: {
      tags: ['leads'],
      summary: 'Delete lead',
      params: leadParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: z.infer<typeof leadParamsSchema> }>, reply: FastifyReply) => {
    try {
      await fastify.prisma.lead.delete({
        where: { id: request.params.id },
      });

      reply.send({
        success: true,
        message: 'Lead deleted successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({
        success: false,
        error: 'Failed to delete lead',
      });
    }
  });
}