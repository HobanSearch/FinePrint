/**
 * Fine Print AI - AI Analytics Routes
 * 
 * API endpoints for AI/ML model performance analytics including:
 * - Model performance metrics
 * - Usage tracking
 * - Model comparisons
 * - A/B testing experiments
 * - Real-time monitoring
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { aiAnalyticsService } from '@/services/ai-analytics';
import { analyticsLogger } from '@/utils/logger';

// Request schemas
const trackModelRequestSchema = z.object({
  modelName: z.string().min(1).max(100),
  modelVersion: z.string().min(1).max(50),
  sessionId: z.string().optional(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  latency: z.number().min(0),
  success: z.boolean(),
  errorType: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  inputLength: z.number().int().min(0).optional(),
  outputLength: z.number().int().min(0).optional(),
  costEstimate: z.number().min(0).optional()
});

const getPerformanceMetricsSchema = z.object({
  modelName: z.string().min(1).max(100),
  modelVersion: z.string().min(1).max(50),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

const compareModelsSchema = z.object({
  modelName: z.string().min(1).max(100),
  versions: z.array(z.string().min(1).max(50)).min(2).max(10),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

const createExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  models: z.array(z.object({
    name: z.string().min(1).max(100),
    version: z.string().min(1).max(50),
    traffic: z.number().min(0).max(1)
  })).min(2).max(5),
  metrics: z.array(z.string()).min(1),
  duration: z.number().int().min(1).max(365) // days
});

const getUsageTrendsSchema = z.object({
  modelName: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week']).default('day')
});

const aiAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  // Track model request
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
      const requestData = request.body as z.infer<typeof trackModelRequestSchema>;
      const userId = request.user?.id;

      await aiAnalyticsService.trackModelRequest(
        requestData.modelName,
        requestData.modelVersion,
        {
          ...requestData,
          userId
        }
      );

      return reply.code(200).send({
        success: true,
        message: 'Model request tracked successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'track_model_request_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to track model request'
      });
    }
  });

  // Get model performance metrics
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
      const {
        modelName,
        modelVersion,
        startDate,
        endDate
      } = request.query as z.infer<typeof getPerformanceMetricsSchema>;

      const metrics = await aiAnalyticsService.getModelPerformanceMetrics(
        modelName,
        modelVersion,
        {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      );

      return reply.code(200).send(metrics);
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'get_performance_metrics_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get performance metrics'
      });
    }
  });

  // Compare model versions
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
      const {
        modelName,
        versions,
        startDate,
        endDate
      } = request.query as z.infer<typeof compareModelsSchema>;

      const comparison = await aiAnalyticsService.compareModelVersions(
        modelName,
        versions,
        {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      );

      return reply.code(200).send(comparison);
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'compare_models_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to compare models'
      });
    }
  });

  // Create model experiment
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
      const {
        name,
        description,
        models,
        metrics,
        duration
      } = request.body as z.infer<typeof createExperimentSchema>;

      const experimentId = await aiAnalyticsService.createModelExperiment(
        name,
        description || '',
        models,
        metrics,
        duration
      );

      return reply.code(201).send({
        success: true,
        experimentId,
        message: 'Experiment created successfully'
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'create_experiment_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create experiment'
      });
    }
  });

  // Get experiment results
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
      const { experimentId } = request.params as { experimentId: string };

      const results = await aiAnalyticsService.getExperimentResults(experimentId);

      if (!results) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Experiment not found'
        });
      }

      return reply.code(200).send(results);
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'get_experiment_results_route',
        userId: request.user?.id,
        experimentId: (request.params as any)?.experimentId
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get experiment results'
      });
    }
  });

  // Get real-time performance
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
      const { modelName, modelVersion } = request.params as {
        modelName: string;
        modelVersion: string;
      };

      const performance = aiAnalyticsService.getRealTimePerformance(
        modelName,
        modelVersion
      );

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
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'get_real_time_performance_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get real-time performance'
      });
    }
  });

  // Get usage trends
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
      const {
        modelName,
        startDate,
        endDate,
        granularity
      } = request.query as z.infer<typeof getUsageTrendsSchema>;

      const trends = await aiAnalyticsService.getModelUsageTrends(
        modelName,
        {
          start: new Date(startDate),
          end: new Date(endDate)
        },
        granularity
      );

      return reply.code(200).send(trends);
    } catch (error) {
      analyticsLogger.error(error as Error, { 
        context: 'get_usage_trends_route',
        userId: request.user?.id 
      });
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get usage trends'
      });
    }
  });

  // Get model list
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
      // Query available models from database
      const models = await fastify.prisma.$queryRaw`
        SELECT 
          model_name,
          array_agg(DISTINCT model_version ORDER BY model_version DESC) as versions,
          COUNT(*) as total_requests,
          MAX(timestamp) as last_used
        FROM ai_model_requests
        GROUP BY model_name
        ORDER BY last_used DESC
      ` as any[];

      const modelList = models.map((model: any) => ({
        modelName: model.model_name,
        versions: model.versions,
        latestVersion: model.versions[0],
        totalRequests: Number(model.total_requests),
        lastUsed: model.last_used?.toISOString()
      }));

      return reply.code(200).send(modelList);
    } catch (error) {
      analyticsLogger.error(error as Error, { 
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

export default aiAnalyticsRoutes;