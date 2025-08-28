/**
 * Fine Print AI - Automated Training Pipeline API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { AutomatedTrainingPipeline, TrainingPipelineConfigSchema } from '../services/automated-training-pipeline';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('automated-training-api');

const automatedTrainingRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient();
  const trainingPipeline = new AutomatedTrainingPipeline(prisma);

  /**
   * Start new training pipeline
   */
  fastify.post('/start', {
    schema: {
      description: 'Start a new automated training pipeline',
      tags: ['Automated Training'],
      body: TrainingPipelineConfigSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            pipeline: { type: 'object' },
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
      const config = request.body as any;
      
      logger.info('Starting automated training pipeline', { config: config.pipeline_name });
      
      // Start pipeline asynchronously
      const pipeline = await trainingPipeline.startPipeline(config);
      
      return reply.send({
        success: true,
        pipeline: {
          id: pipeline.id,
          name: pipeline.name,
          status: pipeline.status,
          current_stage: pipeline.current_stage,
          progress: pipeline.progress,
          created_at: pipeline.created_at,
        },
        message: `Training pipeline "${config.pipeline_name}" started successfully`,
      });
    } catch (error) {
      logger.error('Error starting training pipeline:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start training pipeline',
      });
    }
  });

  /**
   * List all training pipelines
   */
  fastify.get('/', {
    schema: {
      description: 'List all training pipelines',
      tags: ['Automated Training'],
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'dataset_generation', 'model_training', 'evaluation', 'deployment', 'completed', 'failed'],
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
            pipelines: { type: 'array', items: { type: 'object' } },
            total: { type: 'integer' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { status, limit = 20, offset = 0 } = request.query as any;
      
      let pipelines = await trainingPipeline.listPipelines();
      
      // Apply filters
      if (status) {
        pipelines = pipelines.filter(p => p.status === status);
      }
      
      const total = pipelines.length;
      const paginated = pipelines.slice(offset, offset + limit);
      
      return reply.send({
        success: true,
        pipelines: paginated.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          current_stage: p.current_stage,
          progress: p.progress,
          dataset_id: p.dataset_id,
          model_id: p.model_id,
          created_at: p.created_at,
          updated_at: p.updated_at,
          started_at: p.started_at,
          completed_at: p.completed_at,
          evaluation_results: p.evaluation_results,
        })),
        total,
      });
    } catch (error) {
      logger.error('Error listing training pipelines:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list training pipelines',
      });
    }
  });

  /**
   * Get specific training pipeline
   */
  fastify.get('/:pipelineId', {
    schema: {
      description: 'Get training pipeline by ID',
      tags: ['Automated Training'],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
        },
        required: ['pipelineId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            pipeline: { type: 'object' },
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
      const { pipelineId } = request.params as any;
      
      const pipeline = await trainingPipeline.getPipeline(pipelineId);
      
      if (!pipeline) {
        return reply.status(404).send({
          success: false,
          error: 'Training pipeline not found',
        });
      }
      
      return reply.send({
        success: true,
        pipeline,
      });
    } catch (error) {
      logger.error('Error fetching training pipeline:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch training pipeline',
      });
    }
  });

  /**
   * Cancel training pipeline
   */
  fastify.post('/:pipelineId/cancel', {
    schema: {
      description: 'Cancel running training pipeline',
      tags: ['Automated Training'],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
        },
        required: ['pipelineId'],
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
      const { pipelineId } = request.params as any;
      
      await trainingPipeline.cancelPipeline(pipelineId);
      
      return reply.send({
        success: true,
        message: 'Training pipeline cancelled successfully',
      });
    } catch (error) {
      logger.error('Error cancelling training pipeline:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          success: false,
          error: 'Training pipeline not found',
        });
      }
      
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel training pipeline',
      });
    }
  });

  /**
   * Get pipeline logs
   */
  fastify.get('/:pipelineId/logs', {
    schema: {
      description: 'Get training pipeline logs',
      tags: ['Automated Training'],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
        },
        required: ['pipelineId'],
      },
      querystring: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['info', 'warn', 'error'],
          },
          stage: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            logs: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { pipelineId } = request.params as any;
      const { level, stage, limit = 100 } = request.query as any;
      
      let logs = await trainingPipeline.getPipelineLogs(pipelineId);
      
      // Apply filters
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
      if (stage) {
        logs = logs.filter(log => log.stage === stage);
      }
      
      // Limit and sort by timestamp (newest first)
      logs = logs
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);
      
      return reply.send({
        success: true,
        logs,
      });
    } catch (error) {
      logger.error('Error fetching pipeline logs:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch pipeline logs',
      });
    }
  });

  /**
   * Get pipeline progress/status
   */
  fastify.get('/:pipelineId/progress', {
    schema: {
      description: 'Get training pipeline progress',
      tags: ['Automated Training'],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
        },
        required: ['pipelineId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            progress: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { pipelineId } = request.params as any;
      
      const pipeline = await trainingPipeline.getPipeline(pipelineId);
      
      if (!pipeline) {
        return reply.status(404).send({
          success: false,
          error: 'Training pipeline not found',
        });
      }
      
      const progress = {
        pipeline_id: pipeline.id,
        status: pipeline.status,
        current_stage: pipeline.current_stage,
        progress: pipeline.progress,
        started_at: pipeline.started_at,
        updated_at: pipeline.updated_at,
        estimated_completion: this.estimateCompletion(pipeline),
        stages: {
          dataset_generation: pipeline.progress >= 25 ? 'completed' : pipeline.current_stage === 'dataset_generation' ? 'in_progress' : 'pending',
          model_training: pipeline.progress >= 70 ? 'completed' : pipeline.current_stage === 'model_training' ? 'in_progress' : 'pending',
          evaluation: pipeline.progress >= 90 ? 'completed' : pipeline.current_stage === 'evaluation' ? 'in_progress' : 'pending',
          deployment: pipeline.progress >= 100 ? 'completed' : pipeline.current_stage === 'deployment' ? 'in_progress' : 'pending',
        },
      };
      
      return reply.send({
        success: true,
        progress,
      });
    } catch (error) {
      logger.error('Error fetching pipeline progress:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch pipeline progress',
      });
    }
  });

  /**
   * Get pipeline evaluation results
   */
  fastify.get('/:pipelineId/evaluation', {
    schema: {
      description: 'Get training pipeline evaluation results',
      tags: ['Automated Training'],
      params: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
        },
        required: ['pipelineId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            evaluation: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { pipelineId } = request.params as any;
      
      const pipeline = await trainingPipeline.getPipeline(pipelineId);
      
      if (!pipeline) {
        return reply.status(404).send({
          success: false,
          error: 'Training pipeline not found',
        });
      }
      
      if (!pipeline.evaluation_results) {
        return reply.send({
          success: true,
          evaluation: null,
          message: 'Evaluation not yet completed',
        });
      }
      
      return reply.send({
        success: true,
        evaluation: pipeline.evaluation_results,
      });
    } catch (error) {
      logger.error('Error fetching evaluation results:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch evaluation results',
      });
    }
  });

  /**
   * WebSocket endpoint for real-time pipeline updates
   */
  fastify.register(async function (fastify) {
    fastify.get('/ws/:pipelineId', { websocket: true }, (connection, request) => {
      const { pipelineId } = request.params as any;
      
      logger.info('WebSocket connection established for pipeline', { pipelineId });
      
      // Send initial status
      trainingPipeline.getPipeline(pipelineId).then(pipeline => {
        if (pipeline) {
          connection.send(JSON.stringify({
            type: 'status',
            data: {
              pipeline_id: pipeline.id,
              status: pipeline.status,
              current_stage: pipeline.current_stage,
              progress: pipeline.progress,
            },
          }));
        }
      });
      
      // Listen for pipeline updates
      const onProgress = (progress: any) => {
        if (progress.pipeline_id === pipelineId) {
          connection.send(JSON.stringify({
            type: 'progress',
            data: progress,
          }));
        }
      };
      
      const onStatusChange = (pipeline: any) => {
        if (pipeline.id === pipelineId) {
          connection.send(JSON.stringify({
            type: 'status_change',
            data: {
              pipeline_id: pipeline.id,
              status: pipeline.status,
              current_stage: pipeline.current_stage,
              progress: pipeline.progress,
            },
          }));
        }
      };
      
      const onCompleted = (pipeline: any) => {
        if (pipeline.id === pipelineId) {
          connection.send(JSON.stringify({
            type: 'completed',
            data: {
              pipeline_id: pipeline.id,
              completed_at: pipeline.completed_at,
              evaluation_results: pipeline.evaluation_results,
            },
          }));
        }
      };
      
      const onFailed = (pipeline: any) => {
        if (pipeline.id === pipelineId) {
          connection.send(JSON.stringify({
            type: 'failed',
            data: {
              pipeline_id: pipeline.id,
              error: pipeline.error_message,
            },
          }));
        }
      };
      
      // Register event listeners
      trainingPipeline.on('pipeline:progress', onProgress);
      trainingPipeline.on('pipeline:status_change', onStatusChange);
      trainingPipeline.on('pipeline:completed', onCompleted);
      trainingPipeline.on('pipeline:failed', onFailed);
      
      // Clean up on disconnect
      connection.on('close', () => {
        trainingPipeline.off('pipeline:progress', onProgress);
        trainingPipeline.off('pipeline:status_change', onStatusChange);
        trainingPipeline.off('pipeline:completed', onCompleted);
        trainingPipeline.off('pipeline:failed', onFailed);
        
        logger.info('WebSocket connection closed for pipeline', { pipelineId });
      });
    });
  });

  // Helper method to estimate completion time
  function estimateCompletion(pipeline: any): Date | null {
    if (pipeline.status === 'completed' || pipeline.status === 'failed') {
      return null;
    }
    
    if (!pipeline.started_at || pipeline.progress === 0) {
      return null;
    }
    
    const elapsed = Date.now() - pipeline.started_at.getTime();
    const rate = pipeline.progress / elapsed; // progress per millisecond
    const remaining = 100 - pipeline.progress;
    const estimatedRemaining = remaining / rate;
    
    return new Date(Date.now() + estimatedRemaining);
  }
};

export default automatedTrainingRoutes;