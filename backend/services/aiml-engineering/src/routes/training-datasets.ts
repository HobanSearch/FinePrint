/**
 * Fine Print AI - Training Dataset API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { TrainingDatasetGenerator, DatasetConfigSchema } from '../services/training-dataset-generator';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('training-datasets-api');

const trainingDatasetsRoutes: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient();
  const datasetGenerator = new TrainingDatasetGenerator(prisma);

  /**
   * Generate new training dataset
   */
  fastify.post('/generate', {
    schema: {
      description: 'Generate a new training dataset from aggregated documents',
      tags: ['Training Datasets'],
      body: DatasetConfigSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            dataset: { type: 'object' },
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
      
      logger.info('Generating training dataset', { config });
      
      const dataset = await datasetGenerator.generateDataset(config);
      
      return reply.send({
        success: true,
        dataset,
        message: `Dataset "${config.name}" generated successfully with ${dataset.statistics.total_examples} examples`,
      });
    } catch (error) {
      logger.error('Error generating dataset:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate dataset',
      });
    }
  });

  /**
   * List all datasets
   */
  fastify.get('/', {
    schema: {
      description: 'List all training datasets',
      tags: ['Training Datasets'],
      querystring: {
        type: 'object',
        properties: {
          task_type: {
            type: 'string',
            enum: ['risk_assessment', 'clause_detection', 'compliance_analysis', 'recommendation_generation'],
          },
          jurisdiction: {
            type: 'string',
            enum: ['global', 'eu', 'us', 'ca', 'br', 'sg'],
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
            datasets: { type: 'array', items: { type: 'object' } },
            total: { type: 'integer' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { task_type, jurisdiction, limit = 20, offset = 0 } = request.query as any;
      
      const datasets = await datasetGenerator.listDatasets();
      
      // Apply filters
      let filtered = datasets;
      if (task_type) {
        filtered = filtered.filter(d => d.config.task_type === task_type);
      }
      if (jurisdiction) {
        filtered = filtered.filter(d => d.config.jurisdiction === jurisdiction);
      }
      
      const paginated = filtered.slice(offset, offset + limit);
      
      return reply.send({
        success: true,
        datasets: paginated,
        total: filtered.length,
      });
    } catch (error) {
      logger.error('Error listing datasets:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list datasets',
      });
    }
  });

  /**
   * Get specific dataset
   */
  fastify.get('/:datasetId', {
    schema: {
      description: 'Get dataset by ID',
      tags: ['Training Datasets'],
      params: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
        },
        required: ['datasetId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            dataset: { type: 'object' },
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
      const { datasetId } = request.params as any;
      
      const dataset = await datasetGenerator.getDataset(datasetId);
      
      if (!dataset) {
        return reply.status(404).send({
          success: false,
          error: 'Dataset not found',
        });
      }
      
      return reply.send({
        success: true,
        dataset,
      });
    } catch (error) {
      logger.error('Error fetching dataset:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch dataset',
      });
    }
  });

  /**
   * Delete dataset
   */
  fastify.delete('/:datasetId', {
    schema: {
      description: 'Delete dataset by ID',
      tags: ['Training Datasets'],
      params: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
        },
        required: ['datasetId'],
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
      const { datasetId } = request.params as any;
      
      await datasetGenerator.deleteDataset(datasetId);
      
      return reply.send({
        success: true,
        message: 'Dataset deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting dataset:', error);
      
      if (error instanceof Error && error.message === 'Dataset not found') {
        return reply.status(404).send({
          success: false,
          error: 'Dataset not found',
        });
      }
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete dataset',
      });
    }
  });

  /**
   * Get dataset statistics
   */
  fastify.get('/:datasetId/stats', {
    schema: {
      description: 'Get dataset statistics and metrics',
      tags: ['Training Datasets'],
      params: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
        },
        required: ['datasetId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            statistics: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { datasetId } = request.params as any;
      
      const dataset = await datasetGenerator.getDataset(datasetId);
      
      if (!dataset) {
        return reply.status(404).send({
          success: false,
          error: 'Dataset not found',
        });
      }
      
      return reply.send({
        success: true,
        statistics: {
          ...dataset.statistics,
          config: dataset.config,
          created_at: dataset.created_at,
          updated_at: dataset.updated_at,
          status: dataset.status,
        },
      });
    } catch (error) {
      logger.error('Error fetching dataset statistics:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch dataset statistics',
      });
    }
  });

  /**
   * Download dataset files
   */
  fastify.get('/:datasetId/download/:split', {
    schema: {
      description: 'Download dataset split (train/validation/test)',
      tags: ['Training Datasets'],
      params: {
        type: 'object',
        properties: {
          datasetId: { type: 'string' },
          split: { 
            type: 'string',
            enum: ['train', 'validation', 'test', 'metadata'],
          },
        },
        required: ['datasetId', 'split'],
      },
    },
  }, async (request, reply) => {
    try {
      const { datasetId, split } = request.params as any;
      
      const dataset = await datasetGenerator.getDataset(datasetId);
      
      if (!dataset) {
        return reply.status(404).send({
          success: false,
          error: 'Dataset not found',
        });
      }
      
      const filePath = dataset.file_paths[split as keyof typeof dataset.file_paths];
      if (!filePath) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid split requested',
        });
      }
      
      // Determine content type based on file extension
      const extension = filePath.split('.').pop();
      const contentTypes: Record<string, string> = {
        'jsonl': 'application/jsonlines',
        'json': 'application/json',
        'csv': 'text/csv',
        'parquet': 'application/octet-stream',
      };
      
      const contentType = contentTypes[extension || 'json'] || 'application/octet-stream';
      const filename = `${dataset.name}_${split}.${extension}`;
      
      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      
      return reply.sendFile(filePath);
    } catch (error) {
      logger.error('Error downloading dataset file:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to download dataset file',
      });
    }
  });

  /**
   * Validate dataset configuration
   */
  fastify.post('/validate-config', {
    schema: {
      description: 'Validate dataset configuration',
      tags: ['Training Datasets'],
      body: DatasetConfigSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            valid: { type: 'boolean' },
            errors: { type: 'array', items: { type: 'string' } },
            estimated_examples: { type: 'integer' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const config = request.body as any;
      
      // Validate configuration
      const validation = DatasetConfigSchema.safeParse(config);
      
      if (!validation.success) {
        return reply.send({
          success: true,
          valid: false,
          errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          estimated_examples: 0,
        });
      }
      
      // Estimate available examples (would query actual data in production)
      const estimatedExamples = Math.min(config.max_examples, 5000);
      
      return reply.send({
        success: true,
        valid: true,
        errors: [],
        estimated_examples: estimatedExamples,
      });
    } catch (error) {
      logger.error('Error validating config:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to validate configuration',
      });
    }
  });
};

export default trainingDatasetsRoutes;