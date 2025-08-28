"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const model_evaluation_service_1 = require("../services/model-evaluation-service");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('model-evaluation-api');
const modelEvaluationRoutes = async (fastify) => {
    const prisma = new client_1.PrismaClient();
    const evaluationService = new model_evaluation_service_1.ModelEvaluationService(prisma);
    fastify.post('/start', {
        schema: {
            description: 'Start a new model evaluation',
            tags: ['Model Evaluation'],
            body: model_evaluation_service_1.EvaluationConfigSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        evaluation: { type: 'object' },
                        message: { type: 'string' },
                    },
                },
                400: {
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
            const config = request.body;
            logger.info('Starting model evaluation', { evaluationName: config.evaluation_name, modelCount: config.model_ids.length });
            const evaluation = await evaluationService.startEvaluation(config);
            return reply.send({
                success: true,
                evaluation: {
                    id: evaluation.id,
                    name: evaluation.name,
                    status: evaluation.status,
                    model_count: config.model_ids.length,
                    validation_status: evaluation.validation_status,
                    created_at: evaluation.created_at,
                },
                message: `Evaluation "${config.evaluation_name}" started successfully`,
            });
        }
        catch (error) {
            logger.error('Error starting evaluation:', error);
            return reply.status(400).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to start evaluation',
            });
        }
    });
    fastify.get('/', {
        schema: {
            description: 'List all model evaluations',
            tags: ['Model Evaluation'],
            querystring: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['pending', 'running', 'completed', 'failed'],
                    },
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    offset: { type: 'integer', minimum: 0, default: 0 },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        evaluations: { type: 'array', items: { type: 'object' } },
                        total: { type: 'integer' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { status, limit = 20, offset = 0 } = request.query;
            let evaluations = await evaluationService.listEvaluations();
            if (status) {
                evaluations = evaluations.filter(e => e.status === status);
            }
            const total = evaluations.length;
            const paginated = evaluations.slice(offset, offset + limit);
            return reply.send({
                success: true,
                evaluations: paginated.map(e => ({
                    id: e.id,
                    name: e.name,
                    status: e.status,
                    validation_status: e.validation_status,
                    model_count: e.config.model_ids.length,
                    evaluation_type: e.config.evaluation_type,
                    created_at: e.created_at,
                    completed_at: e.completed_at,
                    recommendations_count: e.recommendations.length,
                })),
                total,
            });
        }
        catch (error) {
            logger.error('Error listing evaluations:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to list evaluations',
            });
        }
    });
    fastify.get('/:evaluationId', {
        schema: {
            description: 'Get evaluation by ID',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        evaluation: { type: 'object' },
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
            const { evaluationId } = request.params;
            const evaluation = await evaluationService.getEvaluation(evaluationId);
            if (!evaluation) {
                return reply.status(404).send({
                    success: false,
                    error: 'Evaluation not found',
                });
            }
            return reply.send({
                success: true,
                evaluation,
            });
        }
        catch (error) {
            logger.error('Error fetching evaluation:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch evaluation',
            });
        }
    });
    fastify.post('/:evaluationId/cancel', {
        schema: {
            description: 'Cancel running evaluation',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
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
            const { evaluationId } = request.params;
            await evaluationService.cancelEvaluation(evaluationId);
            return reply.send({
                success: true,
                message: 'Evaluation cancelled successfully',
            });
        }
        catch (error) {
            logger.error('Error cancelling evaluation:', error);
            if (error instanceof Error && error.message.includes('not found')) {
                return reply.status(404).send({
                    success: false,
                    error: 'Evaluation not found',
                });
            }
            return reply.status(400).send({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to cancel evaluation',
            });
        }
    });
    fastify.get('/:evaluationId/results', {
        schema: {
            description: 'Get evaluation results summary',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        results_summary: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { evaluationId } = request.params;
            const evaluation = await evaluationService.getEvaluation(evaluationId);
            if (!evaluation) {
                return reply.status(404).send({
                    success: false,
                    error: 'Evaluation not found',
                });
            }
            const resultsSummary = {
                evaluation_id: evaluation.id,
                status: evaluation.status,
                validation_status: evaluation.validation_status,
                models_evaluated: evaluation.results.length,
                best_model: evaluation.comparison_analysis?.winner || null,
                overall_metrics: this.calculateOverallMetrics(evaluation.results),
                performance_comparison: evaluation.comparison_analysis ? {
                    statistical_significance: evaluation.comparison_analysis.statistical_significance,
                    performance_differences: evaluation.comparison_analysis.performance_differences,
                } : null,
                top_recommendations: evaluation.recommendations
                    .filter(r => r.priority === 'high')
                    .slice(0, 3)
                    .map(r => ({
                    type: r.type,
                    description: r.description,
                    expected_impact: r.expected_impact,
                })),
            };
            return reply.send({
                success: true,
                results_summary: resultsSummary,
            });
        }
        catch (error) {
            logger.error('Error fetching evaluation results:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch evaluation results',
            });
        }
    });
    function calculateOverallMetrics(results) {
        if (results.length === 0)
            return {};
        const avgMetrics = {};
        const metricKeys = ['accuracy', 'f1_score', 'precision', 'recall'];
        metricKeys.forEach(metric => {
            const values = results
                .map(r => r.metrics[metric])
                .filter(v => v !== undefined && v !== null);
            if (values.length > 0) {
                avgMetrics[`avg_${metric}`] = values.reduce((sum, v) => sum + v, 0) / values.length;
                avgMetrics[`max_${metric}`] = Math.max(...values);
                avgMetrics[`min_${metric}`] = Math.min(...values);
            }
        });
        return avgMetrics;
    }
    fastify.post('/:evaluationId/export', {
        schema: {
            description: 'Export evaluation results',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            body: {
                type: 'object',
                properties: {
                    format: {
                        type: 'string',
                        enum: ['json', 'csv'],
                        default: 'json',
                    },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        export_path: { type: 'string' },
                        download_url: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { evaluationId } = request.params;
            const { format = 'json' } = request.body;
            const exportPath = await evaluationService.exportResults(evaluationId, format);
            return reply.send({
                success: true,
                export_path: exportPath,
                download_url: `/api/v1/evaluation/${evaluationId}/download?format=${format}`,
            });
        }
        catch (error) {
            logger.error('Error exporting evaluation results:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to export evaluation results',
            });
        }
    });
    fastify.get('/:evaluationId/download', {
        schema: {
            description: 'Download exported evaluation results',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            querystring: {
                type: 'object',
                properties: {
                    format: {
                        type: 'string',
                        enum: ['json', 'csv'],
                        default: 'json',
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { evaluationId } = request.params;
            const { format = 'json' } = request.query;
            const exportPath = `./exports/evaluation_${evaluationId}.${format}`;
            const contentTypes = {
                json: 'application/json',
                csv: 'text/csv',
            };
            reply.header('Content-Type', contentTypes[format]);
            reply.header('Content-Disposition', `attachment; filename="evaluation_${evaluationId}.${format}"`);
            return reply.sendFile(exportPath);
        }
        catch (error) {
            logger.error('Error downloading evaluation results:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to download evaluation results',
            });
        }
    });
    fastify.get('/:evaluationId/comparison', {
        schema: {
            description: 'Get detailed metrics comparison between models',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        comparison: { type: 'object' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { evaluationId } = request.params;
            const evaluation = await evaluationService.getEvaluation(evaluationId);
            if (!evaluation) {
                return reply.status(404).send({
                    success: false,
                    error: 'Evaluation not found',
                });
            }
            if (!evaluation.comparison_analysis) {
                return reply.send({
                    success: true,
                    comparison: null,
                    message: 'No comparison analysis available (single model evaluation)',
                });
            }
            const detailedComparison = {
                ...evaluation.comparison_analysis,
                model_rankings: evaluation.results
                    .map((result, index) => ({
                    rank: index + 1,
                    model_id: result.model_id,
                    model_name: result.model_name,
                    overall_score: this.calculateModelScore(result),
                    strengths: this.identifyModelStrengths(result),
                    weaknesses: this.identifyModelWeaknesses(result),
                }))
                    .sort((a, b) => b.overall_score - a.overall_score)
                    .map((model, index) => ({ ...model, rank: index + 1 })),
                metric_breakdown: this.createMetricBreakdown(evaluation.results),
            };
            return reply.send({
                success: true,
                comparison: detailedComparison,
            });
        }
        catch (error) {
            logger.error('Error fetching evaluation comparison:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch evaluation comparison',
            });
        }
    });
    function calculateModelScore(result) {
        let score = 0;
        if (result.metrics.accuracy)
            score += result.metrics.accuracy * 0.4;
        if (result.metrics.f1_score)
            score += result.metrics.f1_score * 0.3;
        if (result.performance_stats.avg_response_time) {
            const latencyScore = Math.max(0, 1 - (result.performance_stats.avg_response_time / 2000));
            score += latencyScore * 0.2;
        }
        const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
        score += (1 - errorRate) * 0.1;
        return Math.round(score * 100) / 100;
    }
    function identifyModelStrengths(result) {
        const strengths = [];
        if (result.metrics.accuracy && result.metrics.accuracy > 0.9)
            strengths.push('High accuracy');
        if (result.metrics.f1_score && result.metrics.f1_score > 0.85)
            strengths.push('Excellent F1 score');
        if (result.performance_stats.avg_response_time < 500)
            strengths.push('Fast response time');
        const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
        if (errorRate < 0.02)
            strengths.push('Low error rate');
        return strengths;
    }
    function identifyModelWeaknesses(result) {
        const weaknesses = [];
        if (result.metrics.accuracy && result.metrics.accuracy < 0.7)
            weaknesses.push('Low accuracy');
        if (result.performance_stats.avg_response_time > 1500)
            weaknesses.push('Slow response time');
        const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
        if (errorRate > 0.1)
            weaknesses.push('High error rate');
        if (result.metrics.precision && result.metrics.precision < 0.6)
            weaknesses.push('Low precision');
        return weaknesses;
    }
    function createMetricBreakdown(results) {
        const breakdown = {};
        const metrics = ['accuracy', 'f1_score', 'precision', 'recall'];
        metrics.forEach(metric => {
            breakdown[metric] = results.map(result => ({
                model_name: result.model_name,
                value: result.metrics[metric] || 0,
            }));
        });
        return breakdown;
    }
    fastify.get('/:evaluationId/recommendations', {
        schema: {
            description: 'Get evaluation recommendations',
            tags: ['Model Evaluation'],
            params: {
                type: 'object',
                properties: {
                    evaluationId: { type: 'string' },
                },
                required: ['evaluationId'],
            },
            querystring: {
                type: 'object',
                properties: {
                    priority: {
                        type: 'string',
                        enum: ['high', 'medium', 'low'],
                    },
                    type: {
                        type: 'string',
                        enum: ['performance', 'deployment', 'training', 'data'],
                    },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        recommendations: { type: 'array', items: { type: 'object' } },
                    },
                },
            },
        },
    }, async (request, reply) => {
        try {
            const { evaluationId } = request.params;
            const { priority, type } = request.query;
            const evaluation = await evaluationService.getEvaluation(evaluationId);
            if (!evaluation) {
                return reply.status(404).send({
                    success: false,
                    error: 'Evaluation not found',
                });
            }
            let recommendations = evaluation.recommendations;
            if (priority) {
                recommendations = recommendations.filter(r => r.priority === priority);
            }
            if (type) {
                recommendations = recommendations.filter(r => r.type === type);
            }
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
            return reply.send({
                success: true,
                recommendations,
            });
        }
        catch (error) {
            logger.error('Error fetching recommendations:', error);
            return reply.status(500).send({
                success: false,
                error: 'Failed to fetch recommendations',
            });
        }
    });
};
exports.default = modelEvaluationRoutes;
//# sourceMappingURL=model-evaluation.js.map