/**
 * Fine Print AI - A/B Testing API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ABTestingService, ABTestConfigSchema } from '../services/ab-testing-service';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('ab-testing-api');

const abTestingRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient();
  const abTestingService = new ABTestingService(prisma);

  /**
   * Create new A/B test
   */
  fastify.post('/create', {
    schema: {
      description: 'Create a new A/B test',
      tags: ['A/B Testing'],
      body: ABTestConfigSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            test: { type: 'object' },
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
      
      logger.info('Creating A/B test', { testName: config.test_name, variantCount: config.model_variants.length });
      
      const test = await abTestingService.createTest(config);
      
      return reply.send({
        success: true,
        test: {
          id: test.id,
          name: test.name,
          status: test.status,
          variants: test.variants.map(v => ({
            id: v.id,
            model_name: v.model_name,
            is_control: v.is_control,
            traffic_percentage: v.traffic_percentage,
          })),
          created_at: test.created_at,
        },
        message: `A/B test "${config.test_name}" created successfully`,
      });
    } catch (error) {
      logger.error('Error creating A/B test:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create A/B test',
      });
    }
  });

  /**
   * List all A/B tests
   */
  fastify.get('/', {
    schema: {
      description: 'List all A/B tests',
      tags: ['A/B Testing'],
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['draft', 'running', 'completed', 'stopped', 'failed'],
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
            tests: { type: 'array', items: { type: 'object' } },
            total: { type: 'integer' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { status, limit = 20, offset = 0 } = request.query as any;
      
      let tests = await abTestingService.listTests();
      
      // Apply filters
      if (status) {
        tests = tests.filter(t => t.status === status);
      }
      
      const total = tests.length;
      const paginated = tests.slice(offset, offset + limit);
      
      return reply.send({
        success: true,
        tests: paginated.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          variants: t.variants.length,
          current_sample_size: t.current_sample_size,
          winner: t.winner,
          confidence_level: t.confidence_level,
          created_at: t.created_at,
          started_at: t.started_at,
          completed_at: t.completed_at,
          estimated_completion: t.estimated_completion,
        })),
        total,
      });
    } catch (error) {
      logger.error('Error listing A/B tests:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list A/B tests',
      });
    }
  });

  /**
   * Get specific A/B test
   */
  fastify.get('/:testId', {
    schema: {
      description: 'Get A/B test by ID',
      tags: ['A/B Testing'],
      params: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
        },
        required: ['testId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            test: { type: 'object' },
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
      const { testId } = request.params as any;
      
      const test = await abTestingService.getTest(testId);
      
      if (!test) {
        return reply.status(404).send({
          success: false,
          error: 'A/B test not found',
        });
      }
      
      return reply.send({
        success: true,
        test,
      });
    } catch (error) {
      logger.error('Error fetching A/B test:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch A/B test',
      });
    }
  });

  /**
   * Start A/B test
   */
  fastify.post('/:testId/start', {
    schema: {
      description: 'Start an A/B test',
      tags: ['A/B Testing'],
      params: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
        },
        required: ['testId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            test: { type: 'object' },
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
      const { testId } = request.params as any;
      
      const test = await abTestingService.startTest(testId);
      
      return reply.send({
        success: true,
        test: {
          id: test.id,
          name: test.name,
          status: test.status,
          started_at: test.started_at,
          estimated_completion: test.estimated_completion,
          minimum_sample_size: test.config.statistical_config.minimum_sample_size,
        },
        message: `A/B test "${test.name}" started successfully`,
      });
    } catch (error) {
      logger.error('Error starting A/B test:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start A/B test',
      });
    }
  });

  /**
   * Stop A/B test
   */
  fastify.post('/:testId/stop', {
    schema: {
      description: 'Stop an A/B test',
      tags: ['A/B Testing'],
      params: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
        },
        required: ['testId'],
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string', default: 'Manual stop' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            test: { type: 'object' },
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
      const { testId } = request.params as any;
      const { reason = 'Manual stop' } = request.body as any;
      
      const test = await abTestingService.stopTest(testId, reason);
      
      return reply.send({
        success: true,
        test: {
          id: test.id,
          name: test.name,
          status: test.status,
          completed_at: test.completed_at,
          winner: test.winner,
          confidence_level: test.confidence_level,
          sample_size: test.current_sample_size,
        },
        message: `A/B test "${test.name}" stopped successfully`,
      });
    } catch (error) {
      logger.error('Error stopping A/B test:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop A/B test',
      });
    }
  });

  /**
   * Get A/B test results
   */
  fastify.get('/:testId/results', {
    schema: {
      description: 'Get A/B test results and analysis',
      tags: ['A/B Testing'],
      params: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
        },
        required: ['testId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            results: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { testId } = request.params as any;
      
      const test = await abTestingService.getTest(testId);
      const rawResults = await abTestingService.getTestResults(testId);
      
      if (!test) {
        return reply.status(404).send({
          success: false,
          error: 'A/B test not found',
        });
      }
      
      const results = {
        test_summary: {
          id: test.id,
          name: test.name,
          status: test.status,
          duration_hours: test.started_at && test.completed_at ? 
            (test.completed_at.getTime() - test.started_at.getTime()) / (1000 * 60 * 60) : null,
          total_sample_size: test.current_sample_size,
        },
        variants: test.variants.map(variant => ({
          id: variant.id,
          model_name: variant.model_name,
          is_control: variant.is_control,
          sample_size: variant.sample_size,
          traffic_percentage: variant.traffic_percentage,
          metrics: variant.metrics,
          confidence_intervals: variant.metrics.confidence_intervals,
        })),
        overall_metrics: test.metrics,
        statistical_analysis: test.statistical_results,
        winner: test.winner,
        confidence_level: test.confidence_level,
        raw_data_points: rawResults.length,
      };
      
      return reply.send({
        success: true,
        results,
      });
    } catch (error) {
      logger.error('Error fetching A/B test results:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch A/B test results',
      });
    }
  });

  /**
   * Record test result (for model predictions)
   */
  fastify.post('/:testId/record', {
    schema: {
      description: 'Record a test result',
      tags: ['A/B Testing'],
      params: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
        },
        required: ['testId'],
      },
      body: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          request_id: { type: 'string' },
          response_time: { type: 'number' },
          accuracy_score: { type: 'number', minimum: 0, maximum: 1 },
          user_feedback: { type: 'number', minimum: 1, maximum: 5 },
          conversion: { type: 'boolean' },
          error_occurred: { type: 'boolean' },
          metadata: { type: 'object' },
        },
        required: ['user_id', 'request_id', 'response_time', 'conversion', 'error_occurred'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { testId } = request.params as any;
      const resultData = request.body as any;
      
      await abTestingService.recordResult({
        test_id: testId,
        user_id: resultData.user_id,
        request_id: resultData.request_id,
        timestamp: new Date(),
        response_time: resultData.response_time,
        accuracy_score: resultData.accuracy_score,
        user_feedback: resultData.user_feedback,
        conversion: resultData.conversion,
        error_occurred: resultData.error_occurred,
        metadata: resultData.metadata || {},
      });
      
      return reply.send({
        success: true,
        message: 'Test result recorded successfully',
      });
    } catch (error) {
      logger.error('Error recording test result:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to record test result',
      });
    }
  });
};

export default abTestingRoutes;