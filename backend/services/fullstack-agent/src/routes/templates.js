"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = templatesRoutes;
const template_manager_1 = require("@/services/template-manager");
const logger_1 = require("@/utils/logger");
const logger = logger_1.Logger.getInstance();
const templateManager = new template_manager_1.TemplateManager();
async function templatesRoutes(fastify) {
    fastify.get('/search', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    framework: { type: 'string' },
                    language: { type: 'string' },
                    category: { type: 'string' },
                    tags: { type: 'string' },
                    minRating: { type: 'number' },
                },
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const query = request.query;
            const criteria = {
                type: query.type,
                framework: query.framework,
                language: query.language,
                category: query.category,
                tags: query.tags ? query.tags.split(',') : undefined,
                minRating: query.minRating,
            };
            logger.info('Template search request received', {
                userId: request.user?.id,
                criteria,
            });
            const templates = await templateManager.findTemplates(criteria);
            logger.info('Template search completed', {
                resultCount: templates.length,
            });
            const response = {
                success: true,
                data: {
                    templates,
                    total: templates.length,
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template search failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_SEARCH_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            logger.info('Template get request received', {
                userId: request.user?.id,
                templateId: id,
            });
            const template = await templateManager.getTemplate(id);
            if (!template) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'TEMPLATE_NOT_FOUND',
                        message: `Template with ID ${id} not found`,
                        timestamp: new Date(),
                    },
                });
            }
            const response = {
                success: true,
                data: template,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template get failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_GET_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string' },
                    type: { type: 'string' },
                    framework: { type: 'string' },
                    language: { type: 'string' },
                    content: {
                        type: 'object',
                        properties: {
                            files: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        path: { type: 'string' },
                                        content: { type: 'string' },
                                        isTemplate: { type: 'boolean' },
                                    },
                                    required: ['path', 'content'],
                                },
                            },
                            variables: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        type: { type: 'string' },
                                        description: { type: 'string' },
                                        required: { type: 'boolean' },
                                        defaultValue: {},
                                    },
                                    required: ['name', 'type', 'description', 'required'],
                                },
                            },
                        },
                        required: ['files'],
                    },
                    metadata: {
                        type: 'object',
                        properties: {
                            tags: { type: 'array', items: { type: 'string' } },
                            dependencies: { type: 'array', items: { type: 'string' } },
                            documentation: { type: 'string' },
                        },
                    },
                },
                required: ['name', 'content'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const templateData = request.body;
            logger.info('Template creation request received', {
                userId: request.user?.id,
                templateName: templateData.name,
                fileCount: templateData.content.files.length,
            });
            const template = await templateManager.createTemplate(templateData);
            logger.info('Template created successfully', {
                templateId: template.id,
                templateName: template.name,
            });
            const response = {
                success: true,
                data: template,
            };
            return reply.status(201).send(response);
        }
        catch (error) {
            logger.error('Template creation failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_CREATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.put('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
            body: {
                type: 'object',
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const updates = request.body;
            logger.info('Template update request received', {
                userId: request.user?.id,
                templateId: id,
            });
            const template = await templateManager.updateTemplate(id, updates);
            logger.info('Template updated successfully', {
                templateId: template.id,
            });
            const response = {
                success: true,
                data: template,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template update failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_UPDATE_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.delete('/:id', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            logger.info('Template deletion request received', {
                userId: request.user?.id,
                templateId: id,
            });
            await templateManager.deleteTemplate(id);
            logger.info('Template deleted successfully', {
                templateId: id,
            });
            const response = {
                success: true,
                data: { message: 'Template deleted successfully' },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template deletion failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_DELETION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/install', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    source: { type: 'string' },
                    force: { type: 'boolean', default: false },
                    skipValidation: { type: 'boolean', default: false },
                    customVariables: { type: 'object' },
                },
                required: ['source'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { source, force, skipValidation, customVariables } = request.body;
            logger.info('Template installation request received', {
                userId: request.user?.id,
                source,
                force,
            });
            const template = await templateManager.installTemplate(source, {
                force,
                skipValidation,
                customVariables,
            });
            logger.info('Template installed successfully', {
                templateId: template.id,
                templateName: template.name,
            });
            const response = {
                success: true,
                data: template,
            };
            return reply.status(201).send(response);
        }
        catch (error) {
            logger.error('Template installation failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_INSTALLATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/:id/export', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
            querystring: {
                type: 'object',
                properties: {
                    format: { type: 'string', enum: ['zip', 'tar'], default: 'zip' },
                },
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { format = 'zip' } = request.query;
            logger.info('Template export request received', {
                userId: request.user?.id,
                templateId: id,
                format,
            });
            const archive = await templateManager.exportTemplate(id, format);
            logger.info('Template exported successfully', {
                templateId: id,
                format,
                size: archive.length,
            });
            const contentType = format === 'zip' ? 'application/zip' : 'application/x-tar';
            const filename = `template-${id}.${format}`;
            return reply
                .header('Content-Type', contentType)
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(archive);
        }
        catch (error) {
            logger.error('Template export failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_EXPORT_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/:id/feedback', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                },
                required: ['id'],
            },
            body: {
                type: 'object',
                properties: {
                    rating: { type: 'number', minimum: 1, maximum: 5 },
                    comment: { type: 'string' },
                },
                required: ['rating'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const { rating, comment = '' } = request.body;
            logger.info('Template feedback request received', {
                userId: request.user?.id,
                templateId: id,
                rating,
            });
            await templateManager.addFeedback(id, request.user?.id || 'anonymous', rating, comment);
            logger.info('Template feedback added successfully', {
                templateId: id,
                rating,
            });
            const response = {
                success: true,
                data: { message: 'Feedback added successfully' },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template feedback failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_FEEDBACK_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/update', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    force: { type: 'boolean', default: false },
                },
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { force = false } = request.body;
            logger.info('Template update request received', {
                userId: request.user?.id,
                force,
            });
            await templateManager.updateTemplates(force);
            logger.info('Templates updated successfully');
            const response = {
                success: true,
                data: { message: 'Templates updated successfully' },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template update failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_UPDATE_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/statistics', {
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            logger.info('Template statistics request received', {
                userId: request.user?.id,
            });
            const statistics = templateManager.getStatistics();
            const response = {
                success: true,
                data: statistics,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template statistics failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_STATISTICS_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
}
//# sourceMappingURL=templates.js.map