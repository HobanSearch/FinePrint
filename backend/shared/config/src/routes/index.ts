// Configuration Management API Routes
// RESTful API for configuration and feature flag management

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ConfigurationService } from '../services/configuration';
import { FeatureFlagsService } from '../services/feature-flags';
import { SecretManagementService } from '../services/secrets';
import { ConfigurationSchema, FeatureFlagSchema } from '../schemas';
import { z } from 'zod';

// Request/Response schemas
const GetConfigRequestSchema = z.object({
  serviceName: z.string().min(1),
  environment: z.string().optional(),
  version: z.number().int().optional(),
});

const UpdateConfigRequestSchema = z.object({
  serviceName: z.string().min(1),
  environment: z.string().optional(),
  config: z.record(z.any()),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const FeatureFlagEvaluationRequestSchema = z.object({
  flags: z.array(z.string()).optional(),
  context: z.object({
    userId: z.string().optional(),
    userGroup: z.string().optional(),
    region: z.string().optional(),
    environment: z.string(),
    customAttributes: z.record(z.any()).optional(),
  }),
});

export async function configurationRoutes(
  fastify: FastifyInstance,
  configService: ConfigurationService,
  featureFlagsService: FeatureFlagsService,
  secretsService: SecretManagementService
) {
  // Configuration Management Routes

  // Get configuration for a service
  fastify.get('/config/:serviceName', {
    schema: {
      params: z.object({
        serviceName: z.string(),
      }),
      querystring: z.object({
        environment: z.string().optional(),
        version: z.string().optional(),
        includeSecrets: z.boolean().optional(),
      }),
    },
  }, async (request: FastifyRequest<{
    Params: { serviceName: string };
    Querystring: { environment?: string; version?: string; includeSecrets?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const { serviceName } = request.params;
      const { environment = 'production', version, includeSecrets = false } = request.query;

      const config = await configService.getConfiguration(serviceName, environment, version ? parseInt(version) : undefined);
      
      if (!config) {
        return reply.code(404).send({
          error: 'Configuration not found',
          message: `No configuration found for service ${serviceName} in environment ${environment}`,
        });
      }

      let response = { ...config };

      // Include decrypted secrets if requested and user has permission
      if (includeSecrets) {
        // TODO: Add proper authorization check
        const secrets = await secretsService.getSecretsForConfiguration(config.id);
        response.secrets = secrets;
      }

      return reply.send({
        success: true,
        data: response,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve configuration',
      });
    }
  });

  // Update configuration for a service
  fastify.put('/config/:serviceName', {
    schema: {
      params: z.object({
        serviceName: z.string(),
      }),
      body: z.object({
        environment: z.string().optional(),
        config: z.record(z.any()),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        secrets: z.record(z.string()).optional(),
      }),
    },
  }, async (request: FastifyRequest<{
    Params: { serviceName: string };
    Body: {
      environment?: string;
      config: Record<string, any>;
      description?: string;
      tags?: string[];
      secrets?: Record<string, string>;
    };
  }>, reply: FastifyReply) => {
    try {
      const { serviceName } = request.params;
      const { environment = 'production', config, description, tags, secrets } = request.body;
      
      // TODO: Add proper authorization and validation
      const updatedBy = 'system'; // Get from JWT token

      const updatedConfig = await configService.updateConfiguration(
        serviceName,
        environment,
        config,
        {
          description,
          tags,
          updatedBy,
        }
      );

      // Update secrets if provided
      if (secrets) {
        await secretsService.updateSecretsForConfiguration(updatedConfig.id, secrets, updatedBy);
      }

      return reply.send({
        success: true,
        data: updatedConfig,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to update configuration',
      });
    }
  });

  // Reload configuration (trigger hot-reload)
  fastify.post('/config/:serviceName/reload', {
    schema: {
      params: z.object({
        serviceName: z.string(),
      }),
      body: z.object({
        environment: z.string().optional(),
        force: z.boolean().optional(),
      }),
    },
  }, async (request: FastifyRequest<{
    Params: { serviceName: string };
    Body: { environment?: string; force?: boolean };
  }>, reply: FastifyReply) => {
    try {
      const { serviceName } = request.params;
      const { environment = 'production', force = false } = request.body;

      await configService.triggerConfigurationReload(serviceName, environment, force);

      return reply.send({
        success: true,
        message: `Configuration reload triggered for ${serviceName} in ${environment}`,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to trigger configuration reload',
      });
    }
  });

  // Get configuration history
  fastify.get('/config/:serviceName/history', {
    schema: {
      params: z.object({
        serviceName: z.string(),
      }),
      querystring: z.object({
        environment: z.string().optional(),
        limit: z.string().optional(),
        offset: z.string().optional(),
      }),
    },
  }, async (request: FastifyRequest<{
    Params: { serviceName: string };
    Querystring: { environment?: string; limit?: string; offset?: string };
  }>, reply: FastifyReply) => {
    try {
      const { serviceName } = request.params;
      const { environment = 'production', limit = '10', offset = '0' } = request.query;

      const history = await configService.getConfigurationHistory(
        serviceName,
        environment,
        parseInt(limit),
        parseInt(offset)
      );

      return reply.send({
        success: true,
        data: history,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve configuration history',
      });
    }
  });

  // Feature Flags Routes

  // Get all feature flags
  fastify.get('/features', {
    schema: {
      querystring: z.object({
        environment: z.string().optional(),
        enabled: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
  }, async (request: FastifyRequest<{
    Querystring: { environment?: string; enabled?: boolean; tags?: string[] };
  }>, reply: FastifyReply) => {
    try {
      const { environment, enabled, tags } = request.query;

      const flags = await featureFlagsService.getFeatureFlags({
        environment,
        enabled,
        tags,
      });

      return reply.send({
        success: true,
        data: flags,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve feature flags',
      });
    }
  });

  // Create a new feature flag
  fastify.post('/features', {
    schema: {
      body: FeatureFlagSchema.omit({ id: true }),
    },
  }, async (request: FastifyRequest<{
    Body: Omit<z.infer<typeof FeatureFlagSchema>, 'id'>;
  }>, reply: FastifyReply) => {
    try {
      const createdBy = 'system'; // TODO: Get from JWT token
      const flag = await featureFlagsService.createFeatureFlag(request.body, createdBy);

      return reply.code(201).send({
        success: true,
        data: flag,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to create feature flag',
      });
    }
  });

  // Update a feature flag
  fastify.put('/features/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      body: FeatureFlagSchema.partial(),
    },
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Body: Partial<z.infer<typeof FeatureFlagSchema>>;
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updatedBy = 'system'; // TODO: Get from JWT token

      const flag = await featureFlagsService.updateFeatureFlag(id, request.body, updatedBy);

      return reply.send({
        success: true,
        data: flag,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to update feature flag',
      });
    }
  });

  // Delete a feature flag
  fastify.delete('/features/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
    },
  }, async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const deletedBy = 'system'; // TODO: Get from JWT token

      await featureFlagsService.deleteFeatureFlag(id, deletedBy);

      return reply.send({
        success: true,
        message: 'Feature flag deleted successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to delete feature flag',
      });
    }
  });

  // Evaluate feature flags
  fastify.post('/features/evaluate', {
    schema: {
      body: FeatureFlagEvaluationRequestSchema,
    },
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof FeatureFlagEvaluationRequestSchema>;
  }>, reply: FastifyReply) => {
    try {
      const { flags, context } = request.body;

      // Add client IP and user agent to context
      const evaluationContext = {
        ...context,
        clientIp: request.ip,
        userAgent: request.headers['user-agent'],
      };

      let evaluations;
      if (flags && flags.length > 0) {
        evaluations = await featureFlagsService.evaluateFeatureFlags(flags, evaluationContext);
      } else {
        // Evaluate all flags if none specified
        const allFlags = await featureFlagsService.getFeatureFlags({
          environment: context.environment,
        });
        const flagKeys = allFlags.map(f => f.name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        evaluations = await featureFlagsService.evaluateFeatureFlags(flagKeys, evaluationContext);
      }

      return reply.send({
        success: true,
        data: evaluations,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to evaluate feature flags',
      });
    }
  });

  // Get feature flag analytics
  fastify.get('/features/:flagKey/analytics', {
    schema: {
      params: z.object({
        flagKey: z.string(),
      }),
      querystring: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request: FastifyRequest<{
    Params: { flagKey: string };
    Querystring: { startDate?: string; endDate?: string };
  }>, reply: FastifyReply) => {
    try {
      const { flagKey } = request.params;
      const { startDate, endDate } = request.query;

      const analytics = await featureFlagsService.getFeatureFlagAnalytics(
        flagKey,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );

      return reply.send({
        success: true,
        data: analytics,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve feature flag analytics',
      });
    }
  });

  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check database connectivity
      const dbCheck = await configService.healthCheck();
      
      // Check Redis connectivity
      const redisCheck = await featureFlagsService.healthCheck();

      const isHealthy = dbCheck.healthy && redisCheck.healthy;

      return reply.code(isHealthy ? 200 : 503).send({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbCheck,
          redis: redisCheck,
        },
        version: process.env.npm_package_version || '1.0.0',
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  });

  // Service registration endpoint
  fastify.post('/services/register', {
    schema: {
      body: z.object({
        serviceName: z.string().min(1),
        displayName: z.string().min(1),
        description: z.string().optional(),
        version: z.string(),
        endpoints: z.array(z.string()).default([]),
        healthCheck: z.string().optional(),
        requiredConfigs: z.array(z.string()).default([]),
        optionalConfigs: z.array(z.string()).default([]),
        environment: z.string(),
        tags: z.array(z.string()).default([]),
      }),
    },
  }, async (request: FastifyRequest<{
    Body: {
      serviceName: string;
      displayName: string;
      description?: string;
      version: string;
      endpoints: string[];
      healthCheck?: string;
      requiredConfigs: string[];
      optionalConfigs: string[];
      environment: string;
      tags: string[];
    };
  }>, reply: FastifyReply) => {
    try {
      const registeredBy = 'system'; // TODO: Get from JWT token
      const service = await configService.registerService(request.body, registeredBy);

      return reply.code(201).send({
        success: true,
        data: service,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to register service',
      });
    }
  });
}