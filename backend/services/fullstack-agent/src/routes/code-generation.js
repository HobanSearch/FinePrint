"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = codeGenerationRoutes;
const code_generation_engine_1 = require("@/services/code-generation-engine");
const types_1 = require("@/types");
const logger_1 = require("@/utils/logger");
const logger = logger_1.Logger.getInstance();
const codeGenEngine = new code_generation_engine_1.CodeGenerationEngine();
const generateCodeSchema = {
    body: types_1.CodeGenerationRequestSchema,
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        generatedCode: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    path: { type: 'string' },
                                    content: { type: 'string' },
                                    type: { type: 'string' },
                                    language: { type: 'string' },
                                    dependencies: { type: 'array', items: { type: 'string' } },
                                    description: { type: 'string' },
                                },
                            },
                        },
                        qualityScore: { type: 'number' },
                        recommendations: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    },
};
const batchGenerateSchema = {
    body: {
        type: 'object',
        properties: {
            requests: {
                type: 'array',
                items: types_1.CodeGenerationRequestSchema,
            },
        },
        required: ['requests'],
    },
};
const enhanceCodeSchema = {
    body: {
        type: 'object',
        properties: {
            code: { type: 'string' },
            language: { type: 'string' },
            enhancementType: {
                type: 'string',
                enum: ['performance', 'security', 'maintainability', 'accessibility'],
            },
            context: { type: 'object' },
        },
        required: ['code', 'language', 'enhancementType'],
    },
};
const refactorCodeSchema = {
    body: {
        type: 'object',
        properties: {
            code: { type: 'string' },
            language: { type: 'string' },
            refactoringPattern: { type: 'string' },
            options: { type: 'object' },
        },
        required: ['code', 'language', 'refactoringPattern'],
    },
};
const generateFromDescriptionSchema = {
    body: {
        type: 'object',
        properties: {
            description: { type: 'string' },
            framework: { type: 'string' },
            language: { type: 'string' },
            context: { type: 'object' },
        },
        required: ['description', 'framework', 'language'],
    },
};
async function codeGenerationRoutes(fastify) {
    fastify.post('/', {
        schema: generateCodeSchema,
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const startTime = Date.now();
            logger.info('Code generation request received', {
                userId: request.user?.id,
                type: request.body.type,
                framework: request.body.framework,
            });
            const result = await codeGenEngine.generateCode(request.body);
            const processingTime = Date.now() - startTime;
            logger.info('Code generation completed', {
                requestId: result.id,
                processingTime,
                filesGenerated: result.generatedCode.length,
                qualityScore: result.qualityScore,
            });
            const response = {
                success: true,
                data: result,
                metadata: {
                    requestId: result.id,
                    timestamp: new Date(),
                    processingTime,
                    version: '1.0.0',
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Code generation failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'CODE_GENERATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/batch', {
        schema: batchGenerateSchema,
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { requests } = request.body;
            logger.info('Batch code generation request received', {
                userId: request.user?.id,
                requestCount: requests.length,
            });
            const results = await codeGenEngine.batchGenerate(requests);
            const totalFiles = results.reduce((sum, r) => sum + r.generatedCode.length, 0);
            const avgQualityScore = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
            logger.info('Batch code generation completed', {
                requestCount: requests.length,
                totalFiles,
                avgQualityScore,
            });
            const response = {
                success: true,
                data: {
                    results,
                    summary: {
                        totalRequests: requests.length,
                        totalFiles,
                        averageQualityScore: avgQualityScore,
                    },
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Batch code generation failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'BATCH_GENERATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/enhance', {
        schema: enhanceCodeSchema,
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { code, language, enhancementType, context } = request.body;
            logger.info('Code enhancement request received', {
                userId: request.user?.id,
                language,
                enhancementType,
            });
            const result = await codeGenEngine.enhanceCode(code, language, enhancementType, context);
            logger.info('Code enhancement completed', {
                changesCount: result.changes.length,
                complexity: result.metrics.complexity,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Code enhancement failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'CODE_ENHANCEMENT_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/refactor', {
        schema: refactorCodeSchema,
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { code, language, refactoringPattern, options } = request.body;
            logger.info('Code refactoring request received', {
                userId: request.user?.id,
                language,
                refactoringPattern,
            });
            const result = await codeGenEngine.refactorCode(code, language, refactoringPattern, options || {});
            logger.info('Code refactoring completed', {
                changesCount: result.changes.length,
                complexityImpact: result.impact.complexity,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Code refactoring failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'CODE_REFACTORING_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/from-description', {
        schema: generateFromDescriptionSchema,
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { description, framework, language, context } = request.body;
            logger.info('Natural language code generation request received', {
                userId: request.user?.id,
                framework,
                language,
                descriptionLength: description.length,
            });
            const result = await codeGenEngine.generateFromDescription(description, framework, language, context);
            logger.info('Natural language code generation completed', {
                requestId: result.id,
                filesGenerated: result.generatedCode.length,
                qualityScore: result.qualityScore,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Natural language code generation failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'NL_GENERATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/history', {
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const response = {
                success: true,
                data: {
                    history: [],
                    total: 0,
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Failed to get generation history', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'HISTORY_FETCH_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/capabilities', async (request, reply) => {
        try {
            const response = {
                success: true,
                data: {
                    frameworks: [
                        'react',
                        'vue',
                        'angular',
                        'svelte',
                        'nextjs',
                        'nuxt',
                        'express',
                        'fastify',
                        'nestjs',
                        'django',
                        'flask',
                        'spring',
                        'laravel',
                    ],
                    languages: [
                        'typescript',
                        'javascript',
                        'python',
                        'java',
                        'go',
                        'rust',
                        'php',
                        'ruby',
                        'csharp',
                        'sql',
                        'html',
                        'css',
                        'yaml',
                        'json',
                        'markdown',
                    ],
                    types: [
                        'component',
                        'service',
                        'api',
                        'database',
                        'infrastructure',
                        'test',
                        'documentation',
                    ],
                    enhancementTypes: [
                        'performance',
                        'security',
                        'maintainability',
                        'accessibility',
                    ],
                    refactoringPatterns: [
                        'extract-function',
                        'extract-class',
                        'inline-function',
                        'move-method',
                        'rename-variable',
                        'introduce-parameter',
                        'extract-interface',
                        'strategy-pattern',
                        'observer-pattern',
                        'factory-pattern',
                    ],
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Failed to get capabilities', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'CAPABILITIES_FETCH_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
}
//# sourceMappingURL=code-generation.js.map