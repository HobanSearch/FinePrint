"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = leadRoutes;
const lead_generation_engine_1 = require("../services/lead-generation-engine");
const logger_1 = require("../utils/logger");
const leadEngine = new lead_generation_engine_1.LeadGenerationEngine();
async function leadRoutes(fastify) {
    fastify.post('/generate', async (request, reply) => {
        try {
            const { contentIds, leadMagnets, targetAudience } = request.body;
            const leads = await leadEngine.generateLeadsFromContent(contentIds, leadMagnets, targetAudience);
            const response = {
                success: true,
                data: leads,
                message: `Generated ${leads.length} leads`
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead generation failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to generate leads'
            };
        }
    });
    fastify.post('/magnets', async (request, reply) => {
        try {
            const { title, type, targetAudience, topic } = request.body;
            const leadMagnet = await leadEngine.createLeadMagnet(title, type, targetAudience, topic);
            const response = {
                success: true,
                data: leadMagnet,
                message: 'Lead magnet created successfully'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead magnet creation failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to create lead magnet'
            };
        }
    });
    fastify.post('/nurturing', async (request, reply) => {
        try {
            const { segmentName, leadIds, goals } = request.body;
            const leads = leadIds.map(id => ({
                id,
                email: `lead${id}@example.com`,
                score: Math.floor(Math.random() * 100),
                status: 'new',
                tags: ['generated'],
                createdAt: new Date(),
                updatedAt: new Date()
            }));
            const sequence = await leadEngine.setupNurturingCampaign(segmentName, leads, goals);
            const response = {
                success: true,
                data: sequence,
                message: 'Nurturing campaign setup completed'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Nurturing campaign setup failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to setup nurturing campaign'
            };
        }
    });
    fastify.post('/landing-page/:leadMagnetId/personalize', async (request, reply) => {
        try {
            const { leadMagnetId } = request.params;
            const visitorData = request.body;
            const personalization = await leadEngine.personalizeLandingPage(leadMagnetId, visitorData);
            const response = {
                success: true,
                data: personalization,
                message: 'Landing page personalized'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Landing page personalization failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to personalize landing page'
            };
        }
    });
    fastify.post('/hot-leads', async (request, reply) => {
        try {
            const { leadIds } = request.body;
            const leads = leadIds.map(id => ({
                id,
                email: `lead${id}@example.com`,
                score: Math.floor(Math.random() * 100),
                status: 'new',
                tags: ['generated'],
                customFields: {
                    lastActivity: new Date(),
                    engagementScore: Math.random() * 10
                },
                createdAt: new Date(),
                updatedAt: new Date()
            }));
            const hotLeads = await leadEngine.identifyHotLeads(leads);
            const response = {
                success: true,
                data: hotLeads,
                message: `Identified ${hotLeads.length} hot leads`
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Hot lead identification failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to identify hot leads'
            };
        }
    });
    fastify.post('/optimize/:campaignId', async (request, reply) => {
        try {
            const { campaignId } = request.params;
            const optimization = await leadEngine.optimizeLeadGeneration(campaignId);
            const response = {
                success: true,
                data: optimization,
                message: 'Lead generation optimization completed'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead generation optimization failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to optimize lead generation'
            };
        }
    });
    fastify.get('/:leadId', async (request, reply) => {
        try {
            const { leadId } = request.params;
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
            const response = {
                success: true,
                data: lead,
                message: 'Lead retrieved successfully'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead retrieval failed', { error });
            reply.status(404);
            return {
                success: false,
                error: 'Lead not found'
            };
        }
    });
    fastify.get('/', async (request, reply) => {
        try {
            const page = parseInt(request.query.page || '1');
            const limit = parseInt(request.query.limit || '20');
            const { status, minScore, segment } = request.query;
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
            const response = {
                success: true,
                data: leads,
                pagination: {
                    page,
                    limit,
                    total: 500,
                    totalPages: Math.ceil(500 / limit)
                }
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead listing failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve leads'
            };
        }
    });
    fastify.put('/:leadId', async (request, reply) => {
        try {
            const { leadId } = request.params;
            const updates = request.body;
            const response = {
                success: true,
                data: {
                    id: leadId,
                    ...updates,
                    updatedAt: new Date()
                },
                message: 'Lead updated successfully'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead update failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to update lead'
            };
        }
    });
    fastify.get('/magnets', async (request, reply) => {
        try {
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
            const response = {
                success: true,
                data: leadMagnets,
                message: 'Lead magnets retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Lead magnets retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve lead magnets'
            };
        }
    });
}
//# sourceMappingURL=leads.js.map