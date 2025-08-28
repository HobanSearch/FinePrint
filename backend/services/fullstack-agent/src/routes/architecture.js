"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = architectureRoutes;
const architecture_decision_service_1 = require("@/services/architecture-decision-service");
const types_1 = require("@/types");
const logger_1 = require("@/utils/logger");
const logger = logger_1.Logger.getInstance();
const architectureService = new architecture_decision_service_1.ArchitectureDecisionService();
async function architectureRoutes(fastify) {
    fastify.post('/decision', {
        schema: {
            body: types_1.ArchitectureDecisionRequestSchema,
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            logger.info('Architecture decision request received', {
                userId: request.user?.id,
                decisionType: request.body.decisionType,
                optionsCount: request.body.options.length,
            });
            const result = await architectureService.makeDecision(request.body);
            logger.info('Architecture decision completed', {
                requestId: result.id,
                recommendedOption: result.recommendation.option,
                confidence: result.recommendation.confidence,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Architecture decision failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'ARCHITECTURE_DECISION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/compare', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                description: { type: 'string' },
                            },
                            required: ['name'],
                        },
                    },
                    criteria: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    weights: {
                        type: 'object',
                        additionalProperties: { type: 'number' },
                    },
                },
                required: ['options', 'criteria'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { options, criteria, weights } = request.body;
            logger.info('Options comparison request received', {
                userId: request.user?.id,
                optionsCount: options.length,
                criteria,
            });
            const result = await architectureService.compareOptions(options, criteria, weights);
            logger.info('Options comparison completed', {
                recommendation: result.recommendation,
                insightsCount: result.insights.length,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Options comparison failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'OPTIONS_COMPARISON_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/recommendations', {
        schema: {
            body: {
                type: 'object',
                properties: {
                    useCase: { type: 'string' },
                    constraints: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    preferences: {
                        type: 'object',
                        additionalProperties: { type: 'number' },
                    },
                },
                required: ['useCase'],
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { useCase, constraints = [], preferences = {} } = request.body;
            logger.info('Use case recommendations request received', {
                userId: request.user?.id,
                useCase,
                constraintsCount: constraints.length,
            });
            const result = await architectureService.getRecommendationsForUseCase(useCase, constraints, preferences);
            logger.info('Use case recommendations completed', {
                recommendationsCount: result.recommendations.length,
                alternativesCount: result.alternatives.length,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Use case recommendations failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'USE_CASE_RECOMMENDATIONS_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/validate/:decisionId', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    decisionId: { type: 'string' },
                },
                required: ['decisionId'],
            },
            body: {
                type: 'object',
                properties: {
                    currentContext: { type: 'object' },
                },
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { decisionId } = request.params;
            const { currentContext } = request.body;
            logger.info('Decision validation request received', {
                userId: request.user?.id,
                decisionId,
            });
            const result = {
                isValid: true,
                concerns: [],
                suggestions: [],
                updatedRecommendation: null,
            };
            logger.info('Decision validation completed', {
                decisionId,
                isValid: result.isValid,
                concernsCount: result.concerns.length,
            });
            const response = {
                success: true,
                data: result,
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Decision validation failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'DECISION_VALIDATION_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/history', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'number', default: 50 },
                    offset: { type: 'number', default: 0 },
                    type: { type: 'string' },
                },
            },
        },
        preHandler: fastify.auth([fastify.verifyJWT]),
    }, async (request, reply) => {
        try {
            const { limit = 50, offset = 0, type } = request.query;
            logger.info('Decision history request received', {
                userId: request.user?.id,
                limit,
                offset,
                type,
            });
            const response = {
                success: true,
                data: {
                    decisions: [],
                    total: 0,
                    limit,
                    offset,
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Failed to get decision history', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'DECISION_HISTORY_FAILED',
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
                    decisionTypes: [
                        'framework_selection',
                        'database_choice',
                        'architecture_pattern',
                        'deployment_strategy',
                        'integration_approach',
                        'security_model',
                        'caching_strategy',
                        'messaging_system',
                    ],
                    criteria: [
                        'performance',
                        'scalability',
                        'maintainability',
                        'cost',
                        'complexity',
                        'maturity',
                        'team_expertise',
                        'time_constraints',
                    ],
                    scalabilityLevels: [
                        'small',
                        'medium',
                        'large',
                        'enterprise',
                    ],
                    riskTypes: [
                        'technical',
                        'security',
                        'performance',
                        'scalability',
                        'maintainability',
                        'cost',
                    ],
                    benefitTypes: [
                        'performance',
                        'scalability',
                        'maintainability',
                        'developer_experience',
                        'cost_efficiency',
                        'security',
                        'reliability',
                    ],
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Failed to get architecture capabilities', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'ARCHITECTURE_CAPABILITIES_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.get('/technologies', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    category: { type: 'string' },
                    search: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { category, search } = request.query;
            const response = {
                success: true,
                data: {
                    technologies: [
                        {
                            name: 'React',
                            category: 'Frontend Framework',
                            description: 'A JavaScript library for building user interfaces',
                            scores: {
                                performance: 8,
                                scalability: 9,
                                maintainability: 8,
                                cost: 9,
                                complexity: 6,
                                maturity: 9,
                            },
                            pros: [
                                'Large ecosystem',
                                'Strong community support',
                                'Component-based architecture',
                                'Virtual DOM performance',
                            ],
                            cons: [
                                'Steep learning curve',
                                'Rapid ecosystem changes',
                                'Bundle size can be large',
                            ],
                            useCases: [
                                'Single Page Applications',
                                'Progressive Web Apps',
                                'Complex user interfaces',
                            ],
                        },
                    ],
                    total: 1,
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Failed to get technology profiles', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TECHNOLOGY_PROFILES_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
}
//# sourceMappingURL=architecture.js.map