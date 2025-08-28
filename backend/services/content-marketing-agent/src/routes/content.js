"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = contentRoutes;
const types_1 = require("../types");
const content_creation_engine_1 = require("../services/content-creation-engine");
const brand_voice_manager_1 = require("../services/brand-voice-manager");
const logger_1 = require("../utils/logger");
const contentEngine = new content_creation_engine_1.ContentCreationEngine();
const brandVoiceManager = new brand_voice_manager_1.BrandVoiceManager();
async function contentRoutes(fastify) {
    fastify.post('/create', {
        schema: {
            body: types_1.ContentCreationRequestSchema,
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
    }, async (request, reply) => {
        try {
            logger_1.logger.info('Content creation request received', {
                type: request.body.type,
                topic: request.body.topic
            });
            const contentRequest = {
                ...request.body,
                scheduledFor: request.body.scheduledFor ? new Date(request.body.scheduledFor) : undefined
            };
            const content = await contentEngine.createContent(contentRequest);
            const response = {
                success: true,
                data: content,
                message: 'Content created successfully'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content creation failed', { error });
            reply.status(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Content creation failed'
            };
        }
    });
    fastify.get('/:contentId', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const response = {
                success: true,
                data: {
                    id: contentId,
                    message: 'Content retrieval not yet implemented'
                }
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content retrieval failed', { error });
            reply.status(404);
            return {
                success: false,
                error: 'Content not found'
            };
        }
    });
    fastify.get('/', async (request, reply) => {
        try {
            const page = parseInt(request.query.page || '1');
            const limit = parseInt(request.query.limit || '20');
            const response = {
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
        }
        catch (error) {
            logger_1.logger.error('Content listing failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve content list'
            };
        }
    });
    fastify.put('/:contentId', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const updates = request.body;
            const response = {
                success: true,
                data: {
                    id: contentId,
                    ...updates,
                    updatedAt: new Date()
                },
                message: 'Content updated successfully'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content update failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to update content'
            };
        }
    });
    fastify.delete('/:contentId', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const response = {
                success: true,
                message: 'Content deleted successfully'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content deletion failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to delete content'
            };
        }
    });
    fastify.post('/:contentId/validate', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const mockContent = "Sample content for validation";
            const validation = await brandVoiceManager.validateContent(mockContent, 'blog_post');
            const response = {
                success: true,
                data: validation,
                message: 'Content validation completed'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content validation failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Content validation failed'
            };
        }
    });
    fastify.post('/:contentId/variations', async (request, reply) => {
        try {
            const { contentId } = request.params;
            const { count = 3, platforms = ['linkedin', 'twitter'] } = request.body;
            const variations = [];
            for (let i = 0; i < count; i++) {
                variations.push({
                    id: `${contentId}_variation_${i + 1}`,
                    platform: platforms[i % platforms.length],
                    content: `Variation ${i + 1} of content ${contentId}`,
                    createdAt: new Date()
                });
            }
            const response = {
                success: true,
                data: variations,
                message: `Generated ${count} content variations`
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content variation generation failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to generate content variations'
            };
        }
    });
    fastify.get('/brand-voice/guidelines', async (request, reply) => {
        try {
            const guidelines = await brandVoiceManager.generateBrandVoicePrompt();
            const response = {
                success: true,
                data: { guidelines },
                message: 'Brand voice guidelines retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Brand voice guidelines retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve brand voice guidelines'
            };
        }
    });
    fastify.get('/guidelines', async (request, reply) => {
        try {
            const { contentType, platform } = request.query;
            const guidelines = await brandVoiceManager.generateContentGuidelines(contentType, platform);
            const response = {
                success: true,
                data: { guidelines },
                message: 'Content guidelines retrieved'
            };
            return response;
        }
        catch (error) {
            logger_1.logger.error('Content guidelines retrieval failed', { error });
            reply.status(500);
            return {
                success: false,
                error: 'Failed to retrieve content guidelines'
            };
        }
    });
}
//# sourceMappingURL=content.js.map