import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TrainingConfigSchema } from '../services/model-lifecycle-manager';

export default async function modelLifecycleRoutes(fastify: FastifyInstance) {
  const aimlServices = fastify.aimlServices;

  // Start Training
  fastify.post('/start', {
    schema: {
      description: 'Start a new model training job',
      tags: ['Training'],
      body: TrainingConfigSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          job_id: z.string(),
          message: z.string(),
        }),
        400: z.object({
          error: z.string(),
          details: z.any().optional(),
        }),
      },
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const jobId = await aimlServices.modelLifecycleManager.startTraining(request.body);
      
      return reply.code(200).send({
        success: true,
        job_id: jobId,
        message: 'Training job started successfully',
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
        details: error.details,
      });
    }
  });

  // Stop Training
  fastify.post('/stop/:jobId', {
    schema: {
      description: 'Stop a running training job',
      tags: ['Training'],
      params: z.object({
        jobId: z.string(),
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    try {
      await aimlServices.modelLifecycleManager.stopTraining(request.params.jobId);
      
      return reply.code(200).send({
        success: true,
        message: 'Training job stopped successfully',
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // Pause Training
  fastify.post('/pause/:jobId', {
    schema: {
      description: 'Pause a running training job',
      tags: ['Training'],
      params: z.object({
        jobId: z.string(),
      }),
    },
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    try {
      await aimlServices.modelLifecycleManager.pauseTraining(request.params.jobId);
      
      return reply.code(200).send({
        success: true,
        message: 'Training job paused successfully',
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // Resume Training
  fastify.post('/resume/:jobId', {
    schema: {
      description: 'Resume a paused training job',
      tags: ['Training'],
      params: z.object({
        jobId: z.string(),
      }),
    },
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    try {
      await aimlServices.modelLifecycleManager.resumeTraining(request.params.jobId);
      
      return reply.code(200).send({
        success: true,
        message: 'Training job resumed successfully',
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // Get Training Job
  fastify.get('/jobs/:jobId', {
    schema: {
      description: 'Get training job details',
      tags: ['Training'],
      params: z.object({
        jobId: z.string(),
      }),
    },
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    try {
      const job = aimlServices.modelLifecycleManager.getJob(request.params.jobId);
      
      if (!job) {
        return reply.code(404).send({
          error: 'Training job not found',
        });
      }
      
      return reply.code(200).send({
        success: true,
        job,
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // List Training Jobs
  fastify.get('/jobs', {
    schema: {
      description: 'List training jobs with optional filtering',
      tags: ['Training'],
      querystring: z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'paused']).optional(),
        limit: z.number().min(1).max(100).default(20).optional(),
        offset: z.number().min(0).default(0).optional(),
      }),
    },
  }, async (request: FastifyRequest<{ Querystring: any }>, reply: FastifyReply) => {
    try {
      const { status, limit = 20, offset = 0 } = request.query;
      
      let jobs = aimlServices.modelLifecycleManager.listJobs(status);
      
      // Apply pagination
      const total = jobs.length;
      jobs = jobs.slice(offset, offset + limit);
      
      return reply.code(200).send({
        success: true,
        jobs,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total,
        },
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // Get Training Logs
  fastify.get('/jobs/:jobId/logs', {
    schema: {
      description: 'Get training job logs',
      tags: ['Training'],
      params: z.object({
        jobId: z.string(),
      }),
      querystring: z.object({
        limit: z.number().min(1).max(1000).default(100).optional(),
        level: z.enum(['info', 'warning', 'error', 'debug']).optional(),
      }),
    },
  }, async (request: FastifyRequest<{ 
    Params: { jobId: string };
    Querystring: { limit?: number; level?: string };
  }>, reply: FastifyReply) => {
    try {
      const { limit = 100, level } = request.query;
      
      let logs = aimlServices.modelLifecycleManager.getJobLogs(request.params.jobId, limit);
      
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
      
      return reply.code(200).send({
        success: true,
        logs,
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // Validate Model
  fastify.post('/validate', {
    schema: {
      description: 'Validate a trained model',
      tags: ['Training'],
      body: z.object({
        model_path: z.string(),
        validation_dataset: z.string(),
        metrics_to_compute: z.array(z.string()).optional(),
        batch_size: z.number().min(1).optional(),
        max_samples: z.number().min(1).optional(),
      }),
    },
  }, async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    try {
      const jobId = await aimlServices.modelLifecycleManager.validateModel(request.body);
      
      return reply.code(200).send({
        success: true,
        validation_job_id: jobId,
        message: 'Model validation started',
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });

  // Get Service Metrics
  fastify.get('/metrics', {
    schema: {
      description: 'Get model lifecycle management metrics',
      tags: ['Training', 'Metrics'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = aimlServices.modelLifecycleManager.getServiceMetrics();
      
      return reply.code(200).send({
        success: true,
        metrics,
      });
    } catch (error: any) {
      return reply.code(400).send({
        error: error.message,
      });
    }
  });
}