/**
 * Learning API Routes
 * Endpoints for managing learning orchestration and jobs
 */

import { FastifyPluginAsync } from 'fastify';
import { 
  CreateLearningJobRequest,
  CreateLearningJobResponse,
  GetLearningJobResponse,
  ListLearningJobsRequest,
  ListLearningJobsResponse,
  ApiResponse
} from '../types/api';
import { 
  BusinessDomain, 
  OptimizationType,
  OptimizationStatus 
} from '../types/learning';

export const learningRoutes: FastifyPluginAsync = async function (fastify) {
  
  // Create a new learning job
  fastify.post<{
    Body: CreateLearningJobRequest;
    Reply: CreateLearningJobResponse;
  }>('/jobs', {
    schema: {
      tags: ['learning'],
      summary: 'Create a new learning job',
      description: 'Initiates a new learning optimization job for a specific domain',
      body: {
        type: 'object',
        required: ['domain', 'type', 'parameters'],
        properties: {
          domain: { 
            type: 'string', 
            enum: Object.values(BusinessDomain),
            description: 'Business domain for the learning job'
          },
          type: { 
            type: 'string', 
            enum: ['continuous', 'batch', 'emergency'],
            description: 'Type of learning job to create'
          },
          parameters: {
            type: 'object',
            required: ['targetMetrics'],
            properties: {
              targetMetrics: {
                type: 'array',
                items: { type: 'string' },
                description: 'Metrics to optimize for'
              },
              constraints: {
                type: 'object',
                description: 'Optimization constraints'
              },
              priority: {
                type: 'number',
                minimum: 1,
                maximum: 10,
                description: 'Job priority (1-10)'
              },
              deadline: {
                type: 'string',
                format: 'date-time',
                description: 'Job deadline'
              }
            }
          },
          triggerEvent: {
            type: 'string',
            description: 'Event that triggered this learning job'
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                type: { type: 'string' },
                status: { type: 'string' },
                estimatedDuration: { type: 'number' },
                priority: { type: 'number' },
                createdBy: { type: 'string' },
                startTime: { type: 'string', format: 'date-time' },
              }
            },
            metadata: {
              type: 'object',
              properties: {
                requestId: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                processingTime: { type: 'number' },
                version: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      // Map request type to OptimizationType
      const typeMapping = {
        'continuous': OptimizationType.CONTINUOUS_LEARNING,
        'batch': OptimizationType.BATCH_IMPROVEMENT,
        'emergency': OptimizationType.EMERGENCY_CORRECTION,
      };

      const optimizationType = typeMapping[request.body.type];
      if (!optimizationType) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: `Invalid learning job type: ${request.body.type}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      // Create the optimization job
      const job = await fastify.learningOrchestrator.createOptimizationJob(
        request.body.domain,
        optimizationType,
        {
          targetMetrics: request.body.parameters.targetMetrics,
          constraints: request.body.parameters.constraints || {},
          priority: request.body.parameters.priority || 5,
          deadline: request.body.parameters.deadline ? new Date(request.body.parameters.deadline) : undefined,
          triggerEvent: request.body.triggerEvent,
          metadata: request.body.metadata,
        }
      );

      const response: CreateLearningJobResponse = {
        success: true,
        data: job,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
        },
      };

      reply.status(201).send(response);

    } catch (error) {
      fastify.log.error('Failed to create learning job', { error, requestBody: request.body });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'JOB_CREATION_FAILED',
          message: 'Failed to create learning job',
          details: { originalError: error.message },
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get a specific learning job
  fastify.get<{
    Params: { jobId: string };
    Reply: GetLearningJobResponse;
  }>('/jobs/:jobId', {
    schema: {
      tags: ['learning'],
      summary: 'Get learning job details',
      description: 'Retrieves details of a specific learning job',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { 
            type: 'string',
            description: 'Learning job ID'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                domain: { type: 'string' },
                type: { type: 'string' },
                status: { type: 'string' },
                parameters: { type: 'object' },
                results: { type: 'object' },
                startTime: { type: 'string', format: 'date-time' },
                endTime: { type: 'string', format: 'date-time' },
                estimatedDuration: { type: 'number' },
                priority: { type: 'number' },
                createdBy: { type: 'string' }
              }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                requestId: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      // Get job from integration manager (which would fetch from memory service)
      const job = await fastify.integrationManager.getOptimizationJob?.(request.params.jobId);
      
      if (!job) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Learning job not found: ${request.params.jobId}`,
            timestamp: new Date(),
            requestId: request.id,
          }
        });
      }

      const response: GetLearningJobResponse = {
        success: true,
        data: job,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
        },
      };

      reply.send(response);

    } catch (error) {
      fastify.log.error('Failed to get learning job', { error, jobId: request.params.jobId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'JOB_RETRIEVAL_FAILED',
          message: 'Failed to retrieve learning job',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // List learning jobs with filtering
  fastify.get<{
    Querystring: ListLearningJobsRequest;
    Reply: ListLearningJobsResponse;
  }>('/jobs', {
    schema: {
      tags: ['learning'],
      summary: 'List learning jobs',
      description: 'Retrieves a paginated list of learning jobs with optional filtering',
      querystring: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: Object.values(BusinessDomain),
            description: 'Filter by business domain'
          },
          status: {
            type: 'string',
            enum: Object.values(OptimizationStatus),
            description: 'Filter by job status'
          },
          page: {
            type: 'number',
            minimum: 1,
            default: 1,
            description: 'Page number'
          },
          pageSize: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Items per page'
          },
          sortBy: {
            type: 'string',
            enum: ['startTime', 'priority', 'status', 'domain'],
            default: 'startTime',
            description: 'Sort field'
          },
          sortOrder: {
            type: 'string',
            enum: ['asc', 'desc'],
            default: 'desc',
            description: 'Sort order'
          },
          dateFrom: {
            type: 'string',
            format: 'date-time',
            description: 'Filter jobs from this date'
          },
          dateTo: {
            type: 'string',
            format: 'date-time',
            description: 'Filter jobs to this date'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  domain: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  startTime: { type: 'string', format: 'date-time' },
                  priority: { type: 'number' },
                  estimatedDuration: { type: 'number' }
                }
              }
            },
            metadata: {
              type: 'object',
              properties: {
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'number' },
                    pageSize: { type: 'number' },
                    totalItems: { type: 'number' },
                    totalPages: { type: 'number' },
                    hasNext: { type: 'boolean' },
                    hasPrevious: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    
    try {
      // Default values
      const {
        domain,
        status,
        page = 1,
        pageSize = 20,
        sortBy = 'startTime',
        sortOrder = 'desc',
        dateFrom,
        dateTo
      } = request.query;

      // Get jobs list (in real implementation, would use integration manager)
      // For now, return mock response
      const mockJobs = []; // Would be fetched from storage

      const totalItems = mockJobs.length;
      const totalPages = Math.ceil(totalItems / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedJobs = mockJobs.slice(startIndex, endIndex);

      const response: ListLearningJobsResponse = {
        success: true,
        data: paginatedJobs,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1,
          },
        },
      };

      reply.send(response);

    } catch (error) {
      fastify.log.error('Failed to list learning jobs', { error, query: request.query });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'JOB_LIST_FAILED',
          message: 'Failed to retrieve learning jobs',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Pause a learning job
  fastify.patch<{
    Params: { jobId: string };
    Body: { reason: string };
  }>('/jobs/:jobId/pause', {
    schema: {
      tags: ['learning'],
      summary: 'Pause a learning job',
      description: 'Pauses a running learning job',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { 
            type: 'string',
            description: 'Reason for pausing the job'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Pause learning operations
      await fastify.learningOrchestrator.pauseLearning();

      reply.send({
        success: true,
        data: {
          jobId: request.params.jobId,
          status: 'paused',
          reason: request.body.reason,
          pausedAt: new Date(),
        }
      });

    } catch (error) {
      fastify.log.error('Failed to pause learning job', { error, jobId: request.params.jobId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'JOB_PAUSE_FAILED',
          message: 'Failed to pause learning job',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Resume a learning job
  fastify.patch<{
    Params: { jobId: string };
    Body: { reason?: string };
  }>('/jobs/:jobId/resume', {
    schema: {
      tags: ['learning'],
      summary: 'Resume a paused learning job',
      description: 'Resumes a paused learning job',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          reason: { 
            type: 'string',
            description: 'Reason for resuming the job'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Resume learning operations
      await fastify.learningOrchestrator.resumeLearning();

      reply.send({
        success: true,
        data: {
          jobId: request.params.jobId,
          status: 'running',
          reason: request.body.reason,
          resumedAt: new Date(),
        }
      });

    } catch (error) {
      fastify.log.error('Failed to resume learning job', { error, jobId: request.params.jobId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'JOB_RESUME_FAILED',
          message: 'Failed to resume learning job',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Cancel a learning job
  fastify.delete<{
    Params: { jobId: string };
    Body: { reason: string; rollback?: boolean };
  }>('/jobs/:jobId', {
    schema: {
      tags: ['learning'],
      summary: 'Cancel a learning job',
      description: 'Cancels a learning job and optionally rolls back changes',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { 
            type: 'string',
            description: 'Reason for canceling the job'
          },
          rollback: {
            type: 'boolean',
            default: false,
            description: 'Whether to rollback changes made by this job'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // In a real implementation, would cancel the specific job
      // For now, just acknowledge the cancellation
      
      reply.send({
        success: true,
        data: {
          jobId: request.params.jobId,
          status: 'cancelled',
          reason: request.body.reason,
          rollback: request.body.rollback || false,
          cancelledAt: new Date(),
        }
      });

    } catch (error) {
      fastify.log.error('Failed to cancel learning job', { error, jobId: request.params.jobId });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'JOB_CANCEL_FAILED',
          message: 'Failed to cancel learning job',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get learning system metrics
  fastify.get('/metrics', {
    schema: {
      tags: ['learning'],
      summary: 'Get learning system metrics',
      description: 'Retrieves comprehensive learning system performance metrics'
    }
  }, async (request, reply) => {
    try {
      const metrics = await fastify.learningOrchestrator.getSystemMetrics();

      reply.send({
        success: true,
        data: metrics,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to get learning metrics', { error });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'METRICS_RETRIEVAL_FAILED',
          message: 'Failed to retrieve learning metrics',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });

  // Get integration health status
  fastify.get('/health', {
    schema: {
      tags: ['learning'],
      summary: 'Get integration health status',
      description: 'Checks the health status of all integrated services'
    }
  }, async (request, reply) => {
    try {
      const healthStatus = await fastify.integrationManager.getHealthStatus();

      reply.send({
        success: true,
        data: healthStatus,
        metadata: {
          requestId: request.id,
          timestamp: new Date(),
          version: '1.0.0',
        },
      });

    } catch (error) {
      fastify.log.error('Failed to get integration health', { error });
      
      reply.status(500).send({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to retrieve integration health status',
          timestamp: new Date(),
          requestId: request.id,
        }
      });
    }
  });
};