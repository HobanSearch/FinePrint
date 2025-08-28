/**
 * Management API Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import {
  RequestContext,
  RequestPriority,
  ComplexityLevel,
  UserTier,
  RequestType,
  ModelCapability
} from '../types';

// Request validation schemas
const routeRequestSchema = Joi.object({
  userId: Joi.string().required(),
  userTier: Joi.string().valid(...Object.values(UserTier)).required(),
  requestType: Joi.string().valid(...Object.values(RequestType)).required(),
  priority: Joi.string().valid(...Object.values(RequestPriority)).required(),
  complexity: Joi.string().valid(...Object.values(ComplexityLevel)).required(),
  capabilities: Joi.array().items(
    Joi.string().valid(...Object.values(ModelCapability))
  ).required(),
  timeout: Joi.number().optional(),
  metadata: Joi.object().optional(),
  payload: Joi.object().required()
});

const processRequestSchema = Joi.object({
  context: routeRequestSchema,
  modelId: Joi.string().optional()
});

export async function managementRoutes(fastify: FastifyInstance) {
  const { registry, loadBalancer, costOptimizer, queueManager } = fastify;

  /**
   * Health check endpoint
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const models = registry.getAllModels();
    const modelHealth = models.map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      lastHealthCheck: m.lastHealthCheck
    }));

    return {
      service: 'model-management',
      status: 'healthy',
      uptime: process.uptime(),
      models: modelHealth,
      timestamp: new Date()
    };
  });

  /**
   * Get all models
   */
  fastify.get('/models', async (request: FastifyRequest, reply: FastifyReply) => {
    const models = registry.getAllModels();
    return {
      models,
      count: models.length
    };
  });

  /**
   * Get model by ID
   */
  fastify.get('/models/:modelId', async (request: FastifyRequest<{
    Params: { modelId: string }
  }>, reply: FastifyReply) => {
    const { modelId } = request.params;
    const model = registry.getModel(modelId);
    
    if (!model) {
      return reply.code(404).send({
        error: 'Model not found',
        modelId
      });
    }

    const load = await registry.getModelLoad(modelId);
    const queueMetrics = await queueManager.getQueueMetrics(modelId);

    return {
      model,
      load,
      queueMetrics
    };
  });

  /**
   * Update model status
   */
  fastify.patch('/models/:modelId/status', async (request: FastifyRequest<{
    Params: { modelId: string },
    Body: { status: string }
  }>, reply: FastifyReply) => {
    const { modelId } = request.params;
    const { status } = request.body;

    try {
      await registry.updateModelStatus(modelId, status as any);
      return {
        success: true,
        modelId,
        status
      };
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message
      });
    }
  });

  /**
   * Route request to optimal model
   */
  fastify.post('/route', async (request: FastifyRequest<{
    Body: any
  }>, reply: FastifyReply) => {
    const { error, value } = routeRequestSchema.validate(request.body);
    
    if (error) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: error.details
      });
    }

    const context: RequestContext = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...value,
      createdAt: new Date()
    };

    try {
      const decision = await loadBalancer.routeRequest(context);
      
      if (decision.cacheHit) {
        return {
          success: true,
          cached: true,
          decision
        };
      }

      // Add job to queue
      const job = await queueManager.addJob(
        context,
        decision.selectedModel.id,
        value.payload
      );

      return {
        success: true,
        jobId: job.id,
        decision,
        estimatedResponseTime: decision.estimatedResponseTime,
        estimatedCost: decision.estimatedCost
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to route request',
        message: error.message
      });
    }
  });

  /**
   * Process request directly (bypass routing)
   */
  fastify.post('/process', async (request: FastifyRequest<{
    Body: any
  }>, reply: FastifyReply) => {
    const { error, value } = processRequestSchema.validate(request.body);
    
    if (error) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: error.details
      });
    }

    const { context: contextData, modelId } = value;
    
    const context: RequestContext = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...contextData,
      createdAt: new Date()
    };

    try {
      let selectedModelId = modelId;
      
      // If no model specified, use routing
      if (!selectedModelId) {
        const decision = await loadBalancer.routeRequest(context);
        selectedModelId = decision.selectedModel.id;
      }

      // Add job to queue
      const job = await queueManager.addJob(
        context,
        selectedModelId,
        contextData.payload
      );

      return {
        success: true,
        jobId: job.id,
        modelId: selectedModelId
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to process request',
        message: error.message
      });
    }
  });

  /**
   * Get job status
   */
  fastify.get('/jobs/:jobId', async (request: FastifyRequest<{
    Params: { jobId: string }
  }>, reply: FastifyReply) => {
    const { jobId } = request.params;
    const job = await queueManager.getJobStatus(jobId);
    
    if (!job) {
      return reply.code(404).send({
        error: 'Job not found',
        jobId
      });
    }

    return job;
  });

  /**
   * Cancel job
   */
  fastify.delete('/jobs/:jobId', async (request: FastifyRequest<{
    Params: { jobId: string }
  }>, reply: FastifyReply) => {
    const { jobId } = request.params;
    const cancelled = await queueManager.cancelJob(jobId);
    
    if (!cancelled) {
      return reply.code(404).send({
        error: 'Job not found',
        jobId
      });
    }

    return {
      success: true,
      jobId,
      status: 'cancelled'
    };
  });

  /**
   * Get queue statistics
   */
  fastify.get('/queues/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await queueManager.getQueueStats();
    return stats;
  });

  /**
   * Pause queue for model
   */
  fastify.post('/queues/:modelId/pause', async (request: FastifyRequest<{
    Params: { modelId: string }
  }>, reply: FastifyReply) => {
    const { modelId } = request.params;
    
    try {
      await queueManager.pauseQueue(modelId);
      return {
        success: true,
        modelId,
        status: 'paused'
      };
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message
      });
    }
  });

  /**
   * Resume queue for model
   */
  fastify.post('/queues/:modelId/resume', async (request: FastifyRequest<{
    Params: { modelId: string }
  }>, reply: FastifyReply) => {
    const { modelId } = request.params;
    
    try {
      await queueManager.resumeQueue(modelId);
      return {
        success: true,
        modelId,
        status: 'resumed'
      };
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message
      });
    }
  });

  /**
   * Get cost report
   */
  fastify.get('/costs/report', async (request: FastifyRequest<{
    Querystring: { period?: string }
  }>, reply: FastifyReply) => {
    const { period } = request.query;
    const report = await costOptimizer.generateCostReport(period);
    return report;
  });

  /**
   * Get cost optimization recommendations
   */
  fastify.get('/costs/recommendations', async (request: FastifyRequest, reply: FastifyReply) => {
    const recommendations = await costOptimizer.getOptimizationRecommendations();
    return recommendations;
  });

  /**
   * Get user cost summary
   */
  fastify.get('/costs/users/:userId', async (request: FastifyRequest<{
    Params: { userId: string }
  }>, reply: FastifyReply) => {
    const { userId } = request.params;
    const summary = await costOptimizer.getUserCostSummary(userId);
    return summary;
  });

  /**
   * Export cost data
   */
  fastify.get('/costs/export', async (request: FastifyRequest<{
    Querystring: { month: string }
  }>, reply: FastifyReply) => {
    const { month } = request.query;
    
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return reply.code(400).send({
        error: 'Invalid month format. Use YYYY-MM'
      });
    }

    const data = await costOptimizer.exportCostData(month);
    return data;
  });

  /**
   * Get routing statistics
   */
  fastify.get('/routing/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await loadBalancer.getRoutingStats();
    return stats;
  });

  /**
   * Clean old jobs
   */
  fastify.post('/maintenance/clean-jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    await queueManager.cleanOldJobs();
    return {
      success: true,
      message: 'Old jobs cleaned'
    };
  });

  /**
   * Reset monthly alerts
   */
  fastify.post('/maintenance/reset-alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    await costOptimizer.resetMonthlyAlerts();
    return {
      success: true,
      message: 'Monthly alerts reset'
    };
  });
}