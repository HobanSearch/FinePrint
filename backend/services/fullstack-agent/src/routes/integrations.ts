import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IntegrationManager } from '@/services/integration-manager';
import { IntegrationType, APIResponse } from '@/types';
import { Logger } from '@/utils/logger';

const logger = Logger.getInstance();
const integrationManager = new IntegrationManager();

export default async function integrationsRoutes(fastify: FastifyInstance): Promise<void> {
  
  /**
   * Get all integrations
   */
  fastify.get('/', {
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('Integrations list request received', {
        userId: request.user?.id,
      });

      const integrations = Object.values(IntegrationType).map(type => {
        const integration = integrationManager.getIntegration(type);
        const health = integrationManager.getIntegrationHealth(type);
        
        return {
          type,
          integration,
          health,
        };
      });

      const response: APIResponse = {
        success: true,
        data: {
          integrations,
          total: integrations.length,
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get integrations', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATIONS_LIST_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get specific integration
   */
  fastify.get('/:type', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params as { type: string };

      if (!Object.values(IntegrationType).includes(type as IntegrationType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INTEGRATION_TYPE',
            message: `Invalid integration type: ${type}`,
            timestamp: new Date(),
          },
        });
      }

      logger.info('Integration get request received', {
        userId: request.user?.id,
        integrationType: type,
      });

      const integration = integrationManager.getIntegration(type as IntegrationType);
      const health = integrationManager.getIntegrationHealth(type as IntegrationType);

      if (!integration) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'INTEGRATION_NOT_FOUND',
            message: `Integration ${type} not found`,
            timestamp: new Date(),
          },
        });
      }

      const response: APIResponse = {
        success: true,
        data: {
          integration,
          health,
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get integration', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_GET_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Update integration configuration
   */
  fastify.put('/:type/config', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
      body: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          credentials: { type: 'object' },
          settings: { type: 'object' },
          hooks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event: { type: 'string' },
                action: { type: 'string' },
                config: { type: 'object' },
              },
              required: ['event', 'action'],
            },
          },
        },
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params as { type: string };
      const configuration = request.body as any;

      if (!Object.values(IntegrationType).includes(type as IntegrationType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INTEGRATION_TYPE',
            message: `Invalid integration type: ${type}`,
            timestamp: new Date(),
          },
        });
      }

      logger.info('Integration config update request received', {
        userId: request.user?.id,
        integrationType: type,
      });

      const integration = await integrationManager.updateIntegration(
        type as IntegrationType,
        configuration
      );

      logger.info('Integration configuration updated successfully', {
        integrationType: type,
      });

      const response: APIResponse = {
        success: true,
        data: integration,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Integration config update failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_CONFIG_UPDATE_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Test integration connectivity
   */
  fastify.post('/:type/test', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params as { type: string };

      if (!Object.values(IntegrationType).includes(type as IntegrationType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INTEGRATION_TYPE',
            message: `Invalid integration type: ${type}`,
            timestamp: new Date(),
          },
        });
      }

      logger.info('Integration test request received', {
        userId: request.user?.id,
        integrationType: type,
      });

      const health = await integrationManager.testIntegration(type as IntegrationType);

      logger.info('Integration test completed', {
        integrationType: type,
        status: health.status,
        latency: health.latency,
      });

      const response: APIResponse = {
        success: true,
        data: health,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Integration test failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_TEST_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Sync with integration
   */
  fastify.post('/:type/sync', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
      body: {
        type: 'object',
        // Allow any data for sync
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params as { type: string };
      const data = request.body;

      if (!Object.values(IntegrationType).includes(type as IntegrationType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INTEGRATION_TYPE',
            message: `Invalid integration type: ${type}`,
            timestamp: new Date(),
          },
        });
      }

      logger.info('Integration sync request received', {
        userId: request.user?.id,
        integrationType: type,
      });

      const result = await integrationManager.syncWithIntegration(
        type as IntegrationType,
        data
      );

      logger.info('Integration sync completed', {
        integrationType: type,
        success: result.success,
        syncedItems: result.syncedItems,
      });

      const response: APIResponse = {
        success: true,
        data: result,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Integration sync failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_SYNC_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Enable integration
   */
  fastify.post('/:type/enable', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params as { type: string };

      if (!Object.values(IntegrationType).includes(type as IntegrationType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INTEGRATION_TYPE',
            message: `Invalid integration type: ${type}`,
            timestamp: new Date(),
          },
        });
      }

      logger.info('Integration enable request received', {
        userId: request.user?.id,
        integrationType: type,
      });

      await integrationManager.enableIntegration(type as IntegrationType);

      logger.info('Integration enabled successfully', {
        integrationType: type,
      });

      const response: APIResponse = {
        success: true,
        data: { message: 'Integration enabled successfully' },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Integration enable failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_ENABLE_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Disable integration
   */
  fastify.post('/:type/disable', {
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string' },
        },
        required: ['type'],
      },
    },
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params as { type: string };

      if (!Object.values(IntegrationType).includes(type as IntegrationType)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INTEGRATION_TYPE',
            message: `Invalid integration type: ${type}`,
            timestamp: new Date(),
          },
        });
      }

      logger.info('Integration disable request received', {
        userId: request.user?.id,
        integrationType: type,
      });

      await integrationManager.disableIntegration(type as IntegrationType);

      logger.info('Integration disabled successfully', {
        integrationType: type,
      });

      const response: APIResponse = {
        success: true,
        data: { message: 'Integration disabled successfully' },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Integration disable failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_DISABLE_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get integration health status
   */
  fastify.get('/health', {
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.info('Integration health request received', {
        userId: request.user?.id,
      });

      const healthMap = integrationManager.getAllIntegrationHealth();
      const health = Array.from(healthMap.entries()).map(([type, status]) => ({
        type,
        ...status,
      }));

      const response: APIResponse = {
        success: true,
        data: {
          integrations: health,
          overall: health.every(h => h.status === 'healthy') ? 'healthy' : 'degraded',
          timestamp: new Date(),
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Integration health check failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_HEALTH_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get integration capabilities
   */
  fastify.get('/capabilities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response: APIResponse = {
        success: true,
        data: {
          types: Object.values(IntegrationType),
          features: {
            [IntegrationType.DSPY]: ['prompt_optimization', 'metrics_collection'],
            [IntegrationType.LORA]: ['model_updates', 'feedback_processing'],
            [IntegrationType.KNOWLEDGE_GRAPH]: ['pattern_storage', 'entity_extraction'],
            [IntegrationType.GIT]: ['repository_management', 'template_storage'],
            [IntegrationType.CI_CD]: ['pipeline_triggers', 'deployment_automation'],
            [IntegrationType.MONITORING]: ['metrics_collection', 'alerting'],
          },
          events: [
            'code_generated',
            'quality_check',
            'model_update',
            'pattern_discovered',
            'code_analyzed',
            'error_occurred',
            'performance_degraded',
          ],
          actions: [
            'optimize_prompt',
            'update_metrics',
            'refresh_cache',
            'update_graph',
            'extract_entities',
            'send_alert',
            'log_metric',
          ],
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get integration capabilities', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INTEGRATION_CAPABILITIES_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });
}