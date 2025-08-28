import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { OptimizationConfig, DatasetEntry } from '../services/optimization-engine';

const optimizationRoutes: FastifyPluginAsync = async (fastify) => {
  const { optimizationEngine, metricsCollector, moduleRegistry } = fastify;

  // Request/Response Schemas
  const StartOptimizationRequest = z.object({
    module_name: z.string().min(1),
    config: OptimizationConfig,
    dataset: z.array(DatasetEntry).min(1).max(1000),
  });

  const OptimizationJobResponse = z.object({
    id: z.string(),
    module_name: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
    progress: z.number().min(0).max(100),
    started_at: z.string().optional(),
    completed_at: z.string().optional(),
    error_message: z.string().optional(),
  });

  // Start Optimization Job
  fastify.post('/start', {
    schema: {
      body: StartOptimizationRequest,
      response: {
        200: {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            message: { type: 'string' },
            estimated_duration_minutes: { type: 'number' },
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = StartOptimizationRequest.parse(request.body);
      
      // Validate module exists
      const module = fastify.dspyService.getModule(body.module_name);
      if (!module) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${body.module_name}' not found`,
        });
        return;
      }

      // Estimate duration based on configuration
      const estimatedDuration = Math.ceil(
        (body.config.max_iterations * body.config.dataset_size * 0.1) / 60
      ); // Rough estimation in minutes

      // Start optimization
      const jobId = await optimizationEngine.startOptimization(
        body.module_name,
        body.config,
        body.dataset
      );

      // Record optimization start metric
      await metricsCollector.recordMetric({
        module_name: body.module_name,
        module_version: module.version,
        operation: 'optimize',
        input_size: body.dataset.length,
        output_size: 0,
        latency_ms: 0,
        success: true,
        optimization_type: body.config.optimizer_type,
        metadata: {
          job_id: jobId,
          dataset_size: body.config.dataset_size,
          max_iterations: body.config.max_iterations,
        },
      });

      reply.send({
        job_id: jobId,
        message: `Optimization started for module '${body.module_name}' using ${body.config.optimizer_type}`,
        estimated_duration_minutes: estimatedDuration,
      });

    } catch (error) {
      fastify.log.error('Failed to start optimization', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'OptimizationError',
        message: statusCode === 500 ? 'Failed to start optimization job' : error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get Optimization Job Status
  fastify.get('/jobs/:jobId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
      response: {
        200: OptimizationJobResponse,
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      
      const job = optimizationEngine.getJob(jobId);
      if (!job) {
        reply.code(404).send({
          error: 'JobNotFound',
          message: `Optimization job '${jobId}' not found`,
        });
        return;
      }

      reply.send({
        id: job.id,
        module_name: job.module_name,
        status: job.status,
        progress: job.progress,
        started_at: job.started_at,
        completed_at: job.completed_at,
        error_message: job.error_message,
        config: job.config,
        results: job.results,
      });

    } catch (error) {
      fastify.log.error('Failed to get optimization job', { error: error.message });
      reply.code(500).send({
        error: 'JobRetrievalError',
        message: 'Failed to retrieve optimization job',
      });
    }
  });

  // List All Optimization Jobs
  fastify.get('/jobs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { 
            type: 'string', 
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] 
          },
          module_name: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const query = request.query as {
        status?: string;
        module_name?: string;
        limit?: number;
        offset?: number;
      };

      let jobs = optimizationEngine.listJobs();

      // Apply filters
      if (query.status) {
        jobs = jobs.filter(job => job.status === query.status);
      }
      
      if (query.module_name) {
        jobs = jobs.filter(job => job.module_name === query.module_name);
      }

      // Sort by start time (newest first)
      jobs.sort((a, b) => {
        const timeA = new Date(a.started_at || 0).getTime();
        const timeB = new Date(b.started_at || 0).getTime();
        return timeB - timeA;
      });

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 50;
      const paginatedJobs = jobs.slice(offset, offset + limit);

      reply.send({
        jobs: paginatedJobs.map(job => ({
          id: job.id,
          module_name: job.module_name,
          status: job.status,
          progress: job.progress,
          started_at: job.started_at,
          completed_at: job.completed_at,
          optimizer_type: job.config.optimizer_type,
          dataset_size: job.config.dataset_size,
        })),
        total: jobs.length,
        offset,
        limit,
      });

    } catch (error) {
      fastify.log.error('Failed to list optimization jobs', { error: error.message });
      reply.code(500).send({
        error: 'JobListError',
        message: 'Failed to list optimization jobs',
      });
    }
  });

  // Cancel Optimization Job
  fastify.post('/jobs/:jobId/cancel', {
    schema: {
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      
      const cancelled = await optimizationEngine.cancelJob(jobId);
      
      if (!cancelled) {
        reply.code(400).send({
          error: 'CancellationFailed',
          message: 'Job cannot be cancelled (not found or already completed)',
        });
        return;
      }

      reply.send({
        message: `Optimization job '${jobId}' has been cancelled`,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to cancel optimization job', { error: error.message });
      reply.code(500).send({
        error: 'CancellationError',
        message: 'Failed to cancel optimization job',
      });
    }
  });

  // Get Optimization Results
  fastify.get('/jobs/:jobId/results', {
    schema: {
      params: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      
      const job = optimizationEngine.getJob(jobId);
      if (!job) {
        reply.code(404).send({
          error: 'JobNotFound',
          message: `Optimization job '${jobId}' not found`,
        });
        return;
      }

      if (job.status !== 'completed') {
        reply.code(400).send({
          error: 'JobNotCompleted',
          message: `Job '${jobId}' is not completed (status: ${job.status})`,
        });
        return;
      }

      if (!job.results) {
        reply.code(500).send({
          error: 'ResultsNotAvailable',
          message: 'Optimization results are not available',
        });
        return;
      }

      reply.send({
        job_id: jobId,
        module_name: job.module_name,
        optimization_config: job.config,
        results: job.results,
        completed_at: job.completed_at,
      });

    } catch (error) {
      fastify.log.error('Failed to get optimization results', { error: error.message });
      reply.code(500).send({
        error: 'ResultsError',
        message: 'Failed to retrieve optimization results',
      });
    }
  });

  // Get Optimization Metrics/Analytics
  fastify.get('/metrics', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const metrics = await optimizationEngine.getOptimizationMetrics();
      
      reply.send({
        optimization_metrics: metrics,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to get optimization metrics', { error: error.message });
      reply.code(500).send({
        error: 'MetricsError',
        message: 'Failed to retrieve optimization metrics',
      });
    }
  });

  // Create Optimization Dataset from Historical Data
  fastify.post('/dataset/create', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          source_filter: {
            type: 'object',
            properties: {
              document_types: { 
                type: 'array', 
                items: { 
                  type: 'string',
                  enum: ['terms_of_service', 'privacy_policy', 'eula', 'license']
                }
              },
              date_range: {
                type: 'object',
                properties: {
                  start: { type: 'string', format: 'date-time' },
                  end: { type: 'string', format: 'date-time' }
                }
              },
              min_quality_score: { type: 'number', minimum: 0, maximum: 1 },
            }
          },
          max_entries: { type: 'number', minimum: 10, maximum: 5000, default: 1000 },
        },
        required: ['name'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = request.body as {
        name: string;
        description?: string;
        source_filter?: any;
        max_entries?: number;
      };

      // In a real implementation, this would query historical analysis data
      // and create a properly formatted dataset for training
      
      // For now, we'll create a mock dataset
      const mockDataset = Array.from({ length: Math.min(body.max_entries || 100, 50) }, (_, i) => ({
        input: {
          document_content: `Sample legal document ${i + 1} content for training...`,
          document_type: ['terms_of_service', 'privacy_policy', 'eula'][i % 3] as any,
          language: 'en',
          analysis_depth: 'detailed' as any,
        },
        expected_output: {
          risk_score: Math.floor(Math.random() * 100),
          key_findings: [`Finding ${i + 1}`, `Finding ${i + 2}`],
          findings: [{
            category: 'Data Privacy',
            severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any,
            confidence_score: Math.random(),
          }],
        },
        metadata: {
          source: 'historical_analysis',
          verified_by_expert: Math.random() > 0.7,
          difficulty_level: ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)] as any,
        },
      }));

      // In reality, we would save this dataset to persistent storage
      const datasetId = `dataset_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      reply.send({
        dataset_id: datasetId,
        name: body.name,
        description: body.description || `Dataset created from historical data`,
        entries_created: mockDataset.length,
        created_at: new Date().toISOString(),
        dataset_preview: mockDataset.slice(0, 3), // Show first 3 entries
      });

    } catch (error) {
      fastify.log.error('Failed to create optimization dataset', { error: error.message });
      reply.code(500).send({
        error: 'DatasetCreationError',
        message: 'Failed to create optimization dataset',
      });
    }
  });

  // Validate Dataset for Optimization
  fastify.post('/dataset/validate', {
    schema: {
      body: {
        type: 'object',
        properties: {
          dataset: { type: 'array', items: DatasetEntry },
          target_optimizer: { 
            type: 'string', 
            enum: ['MIPROv2', 'BootstrapFewShot', 'COPRO', 'SignatureOptimizer'] 
          },
        },
        required: ['dataset'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { dataset, target_optimizer } = request.body as {
        dataset: z.infer<typeof DatasetEntry>[];
        target_optimizer?: string;
      };

      // Validate dataset entries
      const validationResults = {
        total_entries: dataset.length,
        valid_entries: 0,
        invalid_entries: 0,
        errors: [] as string[],
        warnings: [] as string[],
        recommendations: [] as string[],
      };

      dataset.forEach((entry, index) => {
        try {
          DatasetEntry.parse(entry);
          validationResults.valid_entries++;
        } catch (error) {
          validationResults.invalid_entries++;
          validationResults.errors.push(`Entry ${index}: ${error.message}`);
        }
      });

      // Add optimizer-specific recommendations
      if (target_optimizer) {
        switch (target_optimizer) {
          case 'MIPROv2':
            if (dataset.length < 100) {
              validationResults.warnings.push('MIPROv2 works best with 100+ examples');
            }
            break;
          case 'BootstrapFewShot':
            if (dataset.length > 50) {
              validationResults.recommendations.push('BootstrapFewShot typically uses 8-32 examples');
            }
            break;
          case 'COPRO':
            validationResults.recommendations.push('COPRO benefits from diverse, high-quality examples');
            break;
        }
      }

      // Calculate dataset quality metrics
      const qualityMetrics = {
        document_type_distribution: {} as Record<string, number>,
        average_content_length: 0,
        expert_verified_percentage: 0,
        difficulty_distribution: {} as Record<string, number>,
      };

      let totalContentLength = 0;
      let expertVerifiedCount = 0;

      dataset.forEach(entry => {
        // Document type distribution
        const docType = entry.input.document_type;
        qualityMetrics.document_type_distribution[docType] = 
          (qualityMetrics.document_type_distribution[docType] || 0) + 1;

        // Content length
        totalContentLength += entry.input.document_content.length;

        // Expert verification
        if (entry.metadata?.verified_by_expert) {
          expertVerifiedCount++;
        }

        // Difficulty distribution
        const difficulty = entry.metadata?.difficulty_level || 'medium';
        qualityMetrics.difficulty_distribution[difficulty] = 
          (qualityMetrics.difficulty_distribution[difficulty] || 0) + 1;
      });

      qualityMetrics.average_content_length = totalContentLength / dataset.length;
      qualityMetrics.expert_verified_percentage = (expertVerifiedCount / dataset.length) * 100;

      reply.send({
        validation_results: validationResults,
        quality_metrics: qualityMetrics,
        suitable_for_optimization: validationResults.valid_entries >= 10 && 
                                  (validationResults.invalid_entries / dataset.length) < 0.1,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to validate dataset', { error: error.message });
      reply.code(500).send({
        error: 'DatasetValidationError',
        message: 'Failed to validate optimization dataset',
      });
    }
  });
};

export { optimizationRoutes };