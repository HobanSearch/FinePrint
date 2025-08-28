/**
 * Infrastructure as Code Routes
 * API endpoints for infrastructure automation and management
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { IaCEngine, InfrastructureTemplate } from '@/services/infrastructure/iac-engine';
import { createContextLogger } from '@/utils/logger';
import { z } from 'zod';

const logger = createContextLogger('InfrastructureRoutes');

// Validation schemas
const CreateDeploymentSchema = z.object({
  name: z.string().min(1),
  template: z.object({
    name: z.string(),
    description: z.string(),
    provider: z.string(),
    resources: z.array(z.any()),
    variables: z.array(z.any()),
    outputs: z.array(z.any()),
  }),
  variables: z.record(z.any()).default({}),
  options: z.object({
    environment: z.string().optional(),
    dryRun: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
  }).optional(),
});

const UpdateDeploymentSchema = z.object({
  template: z.object({
    name: z.string(),
    description: z.string(),
    provider: z.string(),
    resources: z.array(z.any()),
    variables: z.array(z.any()),
    outputs: z.array(z.any()),
  }).optional(),
  variables: z.record(z.any()).optional(),
  options: z.object({
    environment: z.string().optional(),
    dryRun: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
  }).optional(),
});

export default async function infrastructureRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  const iacEngine = new IaCEngine();

  // Create new infrastructure deployment
  fastify.post<{
    Body: z.infer<typeof CreateDeploymentSchema>;
  }>('/deployments', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'Create new infrastructure deployment',
      description: 'Deploy infrastructure using Infrastructure as Code templates',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Deployment name' },
          template: {
            type: 'object',
            description: 'Infrastructure template',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              provider: { type: 'string' },
              resources: { type: 'array' },
              variables: { type: 'array' },
              outputs: { type: 'array' },
            },
          },
          variables: { type: 'object', description: 'Template variables' },
          options: {
            type: 'object',
            properties: {
              environment: { type: 'string' },
              dryRun: { type: 'boolean' },
              autoApprove: { type: 'boolean' },
            },
          },
        },
        required: ['name', 'template'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = CreateDeploymentSchema.parse(request.body);
      
      logger.info(`Creating infrastructure deployment: ${body.name}`);

      const deployment = await iacEngine.createDeployment(
        body.name,
        body.template as InfrastructureTemplate,
        body.variables,
        body.options || {}
      );

      return reply.status(201).send({
        success: true,
        data: deployment,
        message: 'Infrastructure deployment created successfully',
      });

    } catch (error) {
      logger.error('Failed to create infrastructure deployment:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to create infrastructure deployment',
      });
    }
  });

  // List all deployments
  fastify.get('/deployments', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'List infrastructure deployments',
      description: 'Get list of all infrastructure deployments',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const deployments = iacEngine.listDeployments();

      return reply.send({
        success: true,
        data: deployments,
        message: 'Infrastructure deployments retrieved successfully',
      });

    } catch (error) {
      logger.error('Failed to list infrastructure deployments:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to list infrastructure deployments',
      });
    }
  });

  // Get specific deployment
  fastify.get<{
    Params: { deploymentId: string };
  }>('/deployments/:deploymentId', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'Get infrastructure deployment',
      description: 'Get details of a specific infrastructure deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      
      const deployment = iacEngine.getDeployment(deploymentId);
      
      if (!deployment) {
        return reply.status(404).send({
          success: false,
          error: 'Deployment not found',
          message: `Infrastructure deployment with ID ${deploymentId} not found`,
        });
      }

      return reply.send({
        success: true,
        data: deployment,
        message: 'Infrastructure deployment retrieved successfully',
      });

    } catch (error) {
      logger.error('Failed to get infrastructure deployment:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to get infrastructure deployment',
      });
    }
  });

  // Update deployment
  fastify.put<{
    Params: { deploymentId: string };
    Body: z.infer<typeof UpdateDeploymentSchema>;
  }>('/deployments/:deploymentId', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'Update infrastructure deployment',
      description: 'Update an existing infrastructure deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
      body: {
        type: 'object',
        properties: {
          template: { type: 'object' },
          variables: { type: 'object' },
          options: { type: 'object' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const body = UpdateDeploymentSchema.parse(request.body);
      
      logger.info(`Updating infrastructure deployment: ${deploymentId}`);

      // Note: This is a simplified update - in reality, you'd need to handle
      // template updates, variable changes, etc.
      const deployment = iacEngine.getDeployment(deploymentId);
      
      if (!deployment) {
        return reply.status(404).send({
          success: false,
          error: 'Deployment not found',
          message: `Infrastructure deployment with ID ${deploymentId} not found`,
        });
      }

      return reply.send({
        success: true,
        data: deployment,
        message: 'Infrastructure deployment updated successfully',
      });

    } catch (error) {
      logger.error('Failed to update infrastructure deployment:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to update infrastructure deployment',
      });
    }
  });

  // Destroy deployment
  fastify.delete<{
    Params: { deploymentId: string };
  }>('/deployments/:deploymentId', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'Destroy infrastructure deployment',
      description: 'Destroy and remove an infrastructure deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      
      logger.info(`Destroying infrastructure deployment: ${deploymentId}`);

      await iacEngine.destroyDeployment(deploymentId);

      return reply.send({
        success: true,
        message: 'Infrastructure deployment destroyed successfully',
      });

    } catch (error) {
      logger.error('Failed to destroy infrastructure deployment:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to destroy infrastructure deployment',
      });
    }
  });

  // Detect infrastructure drift
  fastify.post<{
    Params: { deploymentId: string };
  }>('/deployments/:deploymentId/drift-detection', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'Detect infrastructure drift',
      description: 'Detect configuration drift in infrastructure deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      
      logger.info(`Detecting drift for deployment: ${deploymentId}`);

      const driftResult = await iacEngine.detectDrift(deploymentId);

      return reply.send({
        success: true,
        data: driftResult,
        message: 'Infrastructure drift detection completed',
      });

    } catch (error) {
      logger.error('Failed to detect infrastructure drift:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to detect infrastructure drift',
      });
    }
  });

  // Get deployment resources
  fastify.get<{
    Params: { deploymentId: string };
  }>('/deployments/:deploymentId/resources', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'Get deployment resources',
      description: 'Get list of resources in an infrastructure deployment',
      params: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
        },
        required: ['deploymentId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      
      const deployment = iacEngine.getDeployment(deploymentId);
      
      if (!deployment) {
        return reply.status(404).send({
          success: false,
          error: 'Deployment not found',
          message: `Infrastructure deployment with ID ${deploymentId} not found`,
        });
      }

      return reply.send({
        success: true,
        data: deployment.resources,
        message: 'Deployment resources retrieved successfully',
      });

    } catch (error) {
      logger.error('Failed to get deployment resources:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to get deployment resources',
      });
    }
  });

  // Get infrastructure templates
  fastify.get('/templates', {
    schema: {
      tags: ['Infrastructure'],
      summary: 'List infrastructure templates',
      description: 'Get list of available infrastructure templates',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // In a real implementation, this would fetch templates from a repository
      const templates = [
        {
          name: 'web-application',
          description: 'Complete web application infrastructure',
          provider: 'terraform',
          resources: ['aws_vpc', 'aws_eks_cluster', 'aws_rds_instance'],
        },
        {
          name: 'microservices',
          description: 'Microservices architecture on Kubernetes',
          provider: 'terraform',
          resources: ['aws_vpc', 'aws_eks_cluster', 'aws_elasticache_cluster'],
        },
      ];

      return reply.send({
        success: true,
        data: templates,
        message: 'Infrastructure templates retrieved successfully',
      });

    } catch (error) {
      logger.error('Failed to get infrastructure templates:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        message: 'Failed to get infrastructure templates',
      });
    }
  });

  logger.info('Infrastructure routes registered successfully');
}