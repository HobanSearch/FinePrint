"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadsRoutes = leadsRoutes;
const zod_1 = require("zod");
const services_1 = require("../services");
const createLeadSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    firstName: zod_1.z.string().min(1),
    lastName: zod_1.z.string().min(1),
    company: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    source: zod_1.z.enum(['website', 'referral', 'marketing', 'cold_outreach', 'organic']),
    notes: zod_1.z.array(zod_1.z.string()).optional().default([]),
});
const updateLeadSchema = zod_1.z.object({
    score: zod_1.z.number().min(0).max(100).optional(),
    stage: zod_1.z.enum(['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
    assignedTo: zod_1.z.string().optional(),
    notes: zod_1.z.array(zod_1.z.string()).optional(),
    nextFollowUp: zod_1.z.string().datetime().optional(),
    estimatedValue: zod_1.z.number().positive().optional(),
    probability: zod_1.z.number().min(0).max(100).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
});
const leadParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
const leadQuerySchema = zod_1.z.object({
    page: zod_1.z.string().transform(Number).default('1'),
    limit: zod_1.z.string().transform(Number).default('50'),
    source: zod_1.z.string().optional(),
    stage: zod_1.z.string().optional(),
    assignedTo: zod_1.z.string().optional(),
    minScore: zod_1.z.string().transform(Number).optional(),
    search: zod_1.z.string().optional(),
});
async function leadsRoutes(fastify) {
    const { leadScoringService, emailAutomationService, workflowAutomationService } = (0, services_1.getServices)();
    fastify.post('/', {
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
    }, async (request, reply) => {
        try {
            const lead = await leadScoringService.createLead(request.body);
            await emailAutomationService.startEmailSequence(lead.id, 'welcome');
            await workflowAutomationService.setupLeadNurturingWorkflow(lead.id);
            reply.code(201).send({
                success: true,
                data: lead,
                message: 'Lead created successfully',
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to create lead',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    fastify.get('/', {
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
    }, async (request, reply) => {
        try {
            const { page, limit, source, stage, assignedTo, minScore, search } = request.query;
            const where = {};
            if (source)
                where.source = source;
            if (stage)
                where.stage = stage;
            if (assignedTo)
                where.assignedTo = assignedTo;
            if (minScore)
                where.score = { gte: minScore };
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
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to retrieve leads',
            });
        }
    });
    fastify.get('/:id', {
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
    }, async (request, reply) => {
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
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to retrieve lead',
            });
        }
    });
    fastify.put('/:id', {
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
    }, async (request, reply) => {
        try {
            const lead = await leadScoringService.updateLead(request.params.id, request.body);
            reply.send({
                success: true,
                data: lead,
                message: 'Lead updated successfully',
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to update lead',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    fastify.post('/:id/score', {
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
    }, async (request, reply) => {
        try {
            const leadId = request.params.id;
            const currentLead = await fastify.prisma.lead.findUnique({
                where: { id: leadId },
                select: { score: true },
            });
            const newScore = await leadScoringService.calculateLeadScore(leadId);
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
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to calculate lead score',
            });
        }
    });
    fastify.get('/hot', {
        schema: {
            tags: ['leads'],
            summary: 'Get hot leads (high score)',
            querystring: zod_1.z.object({
                limit: zod_1.z.string().transform(Number).default('20'),
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
    }, async (request, reply) => {
        try {
            const hotLeads = await leadScoringService.getHotLeads(request.query.limit);
            reply.send({
                success: true,
                data: hotLeads,
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to retrieve hot leads',
            });
        }
    });
    fastify.post('/bulk-score', {
        schema: {
            tags: ['leads'],
            summary: 'Bulk score multiple leads',
            body: zod_1.z.object({
                leadIds: zod_1.z.array(zod_1.z.string().uuid()),
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
    }, async (request, reply) => {
        try {
            const results = await leadScoringService.bulkScoreLeads(request.body.leadIds);
            reply.send({
                success: true,
                data: results,
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to bulk score leads',
            });
        }
    });
    fastify.post('/:id/email', {
        schema: {
            tags: ['leads'],
            summary: 'Send personalized email to lead',
            params: leadParamsSchema,
            body: zod_1.z.object({
                templateId: zod_1.z.string(),
                customData: zod_1.z.record(zod_1.z.any()).optional(),
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
    }, async (request, reply) => {
        try {
            const success = await emailAutomationService.sendPersonalizedEmail(request.params.id, request.body.templateId, request.body.customData);
            reply.send({
                success,
                message: success ? 'Email sent successfully' : 'Failed to send email',
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to send email',
            });
        }
    });
    fastify.post('/:id/sequence', {
        schema: {
            tags: ['leads'],
            summary: 'Start email sequence for lead',
            params: leadParamsSchema,
            body: zod_1.z.object({
                sequenceId: zod_1.z.string(),
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
    }, async (request, reply) => {
        try {
            await emailAutomationService.startEmailSequence(request.params.id, request.body.sequenceId);
            reply.send({
                success: true,
                message: 'Email sequence started successfully',
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to start email sequence',
            });
        }
    });
    fastify.delete('/:id', {
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
    }, async (request, reply) => {
        try {
            await fastify.prisma.lead.delete({
                where: { id: request.params.id },
            });
            reply.send({
                success: true,
                message: 'Lead deleted successfully',
            });
        }
        catch (error) {
            fastify.log.error(error);
            reply.code(500).send({
                success: false,
                error: 'Failed to delete lead',
            });
        }
    });
}
//# sourceMappingURL=leads.js.map