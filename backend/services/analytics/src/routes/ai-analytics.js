"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const ai_analytics_1 = require("@/services/ai-analytics");
const logger_1 = require("@/utils/logger");
const trackModelRequestSchema = zod_1.z.object({
    modelName: zod_1.z.string().min(1).max(100),
    modelVersion: zod_1.z.string().min(1).max(50),
    sessionId: zod_1.z.string().optional(),
    inputTokens: zod_1.z.number().int().min(0),
    outputTokens: zod_1.z.number().int().min(0),
    latency: zod_1.z.number().min(0),
    success: zod_1.z.boolean(),
    errorType: zod_1.z.string().optional(),
    confidenceScore: zod_1.z.number().min(0).max(1).optional(),
    inputLength: zod_1.z.number().int().min(0).optional(),
    outputLength: zod_1.z.number().int().min(0).optional(),
    costEstimate: zod_1.z.number().min(0).optional()
});
const getPerformanceMetricsSchema = zod_1.z.object({
    modelName: zod_1.z.string().min(1).max(100),
    modelVersion: zod_1.z.string().min(1).max(50),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime()
});
const compareModelsSchema = zod_1.z.object({
    modelName: zod_1.z.string().min(1).max(100),
    versions: zod_1.z.array(zod_1.z.string().min(1).max(50)).min(2).max(10),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime()
});
const createExperimentSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().optional(),
    models: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1).max(100),
        version: zod_1.z.string().min(1).max(50),
        traffic: zod_1.z.number().min(0).max(1)
    })).min(2).max(5),
    metrics: zod_1.z.array(zod_1.z.string()).min(1),
    duration: zod_1.z.number().int().min(1).max(365)
});
const getUsageTrendsSchema = zod_1.z.object({
    modelName: zod_1.z.string().min(1).max(100),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    granularity: zod_1.z.enum(['hour', 'day', 'week']).default('day')
});
const aiAnalyticsRoutes = async (fastify) => {
    fastify.post('/track-request', {
        schema: {
            description: 'Track an AI model request',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            body: trackModelRequestSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const requestData = request.body;
            const userId = request.user?.id;
            await ai_analytics_1.aiAnalyticsService.trackModelRequest(requestData.modelName, requestData.modelVersion, {
                ...requestData,
                userId
            });
            return reply.code(200).send({
                success: true,
                message: 'Model request tracked successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_model_request_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to track model request'
            });
        }
    });
    fastify.get('/performance-metrics', {
        schema: {
            description: 'Get AI model performance metrics',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            querystring: getPerformanceMetricsSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        modelName: { type: 'string' },
                        modelVersion: { type: 'string' },
                        timestamp: { type: 'string' },
                        performance: {
                            type: 'object',
                            properties: {
                                avgLatency: { type: 'number' },
                                p50Latency: { type: 'number' },
                                p95Latency: { type: 'number' },
                                p99Latency: { type: 'number' },
                                throughput: { type: 'number' },
                                errorRate: { type: 'number' },
                                timeoutRate: { type: 'number' }
                            }
                        },
                        usage: {
                            type: 'object',
                            properties: {
                                totalRequests: { type: 'number' },
                                totalTokens: { type: 'number' },
                                inputTokens: { type: 'number' },
                                outputTokens: { type: 'number' },
                                costEstimate: { type: 'number' },
                                activeUsers: { type: 'number' }
                            }
                        },
                        quality: {
                            type: 'object',
                            properties: {
                                confidenceScore: { type: 'number' },
                                userSatisfactionScore: { type: 'number' },
                                flaggedResponses: { type: 'number' },
                                modelDriftScore: { type: 'number' }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { modelName, modelVersion, startDate, endDate } = request.query;
            const metrics = await ai_analytics_1.aiAnalyticsService.getModelPerformanceMetrics(modelName, modelVersion, {
                start: new Date(startDate),
                end: new Date(endDate)
            });
            return reply.code(200).send(metrics);
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_performance_metrics_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to get performance metrics'
            });
        }
    });
    fastify.get('/compare-models', {
        schema: {
            description: 'Compare AI model versions',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            querystring: compareModelsSchema,
            response: {
                200: {
                    type: 'object',
                    additionalProperties: {
                        type: 'object',
                        properties: {
                            modelName: { type: 'string' },
                            modelVersion: { type: 'string' },
                            timestamp: { type: 'string' },
                            performance: { type: 'object' },
                            usage: { type: 'object' },
                            quality: { type: 'object' }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { modelName, versions, startDate, endDate } = request.query;
            const comparison = await ai_analytics_1.aiAnalyticsService.compareModelVersions(modelName, versions, {
                start: new Date(startDate),
                end: new Date(endDate)
            });
            return reply.code(200).send(comparison);
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'compare_models_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to compare models'
            });
        }
    });
    fastify.post('/experiments', {
        schema: {
            description: 'Create AI model A/B test experiment',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            body: createExperimentSchema,
            response: {
                201: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        experimentId: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { name, description, models, metrics, duration } = request.body;
            const experimentId = await ai_analytics_1.aiAnalyticsService.createModelExperiment(name, description || '', models, metrics, duration);
            return reply.code(201).send({
                success: true,
                experimentId,
                message: 'Experiment created successfully'
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'create_experiment_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to create experiment'
            });
        }
    });
    fastify.get('/experiments/:experimentId/results', {
        schema: {
            description: 'Get AI model experiment results',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    experimentId: { type: 'string' }
                },
                required: ['experimentId']
            },
            response: {
                200: {
                    type: 'object',
                    additionalProperties: true
                },
                404: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { experimentId } = request.params;
            const results = await ai_analytics_1.aiAnalyticsService.getExperimentResults(experimentId);
            if (!results) {
                return reply.code(404).send({
                    error: 'Not Found',
                    message: 'Experiment not found'
                });
            }
            return reply.code(200).send(results);
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_experiment_results_route',
                userId: request.user?.id,
                experimentId: request.params?.experimentId
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to get experiment results'
            });
        }
    });
    fastify.get('/real-time/:modelName/:modelVersion', {
        schema: {
            description: 'Get real-time AI model performance',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    modelName: { type: 'string' },
                    modelVersion: { type: 'string' }
                },
                required: ['modelName', 'modelVersion']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        modelName: { type: 'string' },
                        modelVersion: { type: 'string' },
                        timestamp: { type: 'string' },
                        sampleSize: { type: 'number' },
                        avgLatency: { type: 'number' },
                        errorRate: { type: 'number' },
                        throughput: { type: 'number' },
                        totalTokens: { type: 'number' },
                        totalCost: { type: 'number' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { modelName, modelVersion } = request.params;
            const performance = ai_analytics_1.aiAnalyticsService.getRealTimePerformance(modelName, modelVersion);
            if (!performance) {
                return reply.code(200).send({
                    modelName,
                    modelVersion,
                    timestamp: new Date().toISOString(),
                    sampleSize: 0,
                    avgLatency: 0,
                    errorRate: 0,
                    throughput: 0,
                    totalTokens: 0,
                    totalCost: 0
                });
            }
            return reply.code(200).send(performance);
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_real_time_performance_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to get real-time performance'
            });
        }
    });
    fastify.get('/usage-trends', {
        schema: {
            description: 'Get AI model usage trends',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            querystring: getUsageTrendsSchema,
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            period: { type: 'string' },
                            modelVersion: { type: 'string' },
                            requestCount: { type: 'number' },
                            avgLatency: { type: 'number' },
                            totalTokens: { type: 'number' },
                            totalCost: { type: 'number' },
                            errorRate: { type: 'number' }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { modelName, startDate, endDate, granularity } = request.query;
            const trends = await ai_analytics_1.aiAnalyticsService.getModelUsageTrends(modelName, {
                start: new Date(startDate),
                end: new Date(endDate)
            }, granularity);
            return reply.code(200).send(trends);
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_usage_trends_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to get usage trends'
            });
        }
    });
    fastify.get('/models', {
        schema: {
            description: 'Get list of available AI models',
            tags: ['AI Performance'],
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            modelName: { type: 'string' },
                            versions: {
                                type: 'array',
                                items: { type: 'string' }
                            },
                            latestVersion: { type: 'string' },
                            totalRequests: { type: 'number' },
                            lastUsed: { type: 'string' }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const models = await fastify.prisma.$queryRaw `
        SELECT 
          model_name,
          array_agg(DISTINCT model_version ORDER BY model_version DESC) as versions,
          COUNT(*) as total_requests,
          MAX(timestamp) as last_used
        FROM ai_model_requests
        GROUP BY model_name
        ORDER BY last_used DESC
      `;
            const modelList = models.map((model) => ({
                modelName: model.model_name,
                versions: model.versions,
                latestVersion: model.versions[0],
                totalRequests: Number(model.total_requests),
                lastUsed: model.last_used?.toISOString()
            }));
            return reply.code(200).send(modelList);
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_models_route',
                userId: request.user?.id
            });
            return reply.code(500).send({
                error: 'Internal Server Error',
                message: 'Failed to get models list'
            });
        }
    });
};
exports.default = aiAnalyticsRoutes;
//# sourceMappingURL=ai-analytics.js.map