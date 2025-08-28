import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { webhookService } from '../services/webhookService';
import { TracingUtils } from '../monitoring/tracing';
import { metricsCollector } from '../monitoring/metrics';

const createWebhookSchema = {
  body: {
    type: 'object',
    required: ['userId', 'url', 'events'],
    properties: {
      userId: { type: 'string' },
      teamId: { type: 'string' },
      url: { type: 'string', format: 'uri' },
      secret: { type: 'string' },
      events: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'document.change.detected',
            'document.risk.increased',
            'document.risk.decreased',
            'monitoring.error',
            'monitoring.resumed',
            'analysis.completed'
          ]
        },
        minItems: 1,
      },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  },
};

const updateWebhookSchema = {
  params: {
    type: 'object',
    required: ['webhookId'],
    properties: {
      webhookId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
      secret: { type: 'string' },
      events: {
        type: 'array',
        items: { type: 'string' },
      },
      isActive: { type: 'boolean' },
      headers: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
  },
};

export async function webhookRoutes(server: FastifyInstance): Promise<void> {
  
  // Create webhook endpoint
  server.post('/', {
    schema: createWebhookSchema,
  }, async (request: FastifyRequest<{
    Body: {
      userId: string;
      teamId?: string;
      url: string;
      secret?: string;
      events: string[];
      headers?: Record<string, string>;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const webhook = await TracingUtils.traceFunction(
        'webhook.create',
        async (span) => {
          span.setAttributes({
            'webhook.url': request.body.url,
            'webhook.events': request.body.events.join(','),
            'user.id': request.body.userId,
          });

          return await webhookService.createWebhookEndpoint(request.body);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks',
        201,
        Date.now() - startTime,
        request.body.userId
      );

      reply.code(201);
      return {
        success: true,
        data: webhook,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks',
        500,
        duration,
        request.body.userId
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Update webhook endpoint
  server.put('/:webhookId', {
    schema: updateWebhookSchema,
  }, async (request: FastifyRequest<{
    Params: { webhookId: string };
    Body: {
      url?: string;
      secret?: string;
      events?: string[];
      isActive?: boolean;
      headers?: Record<string, string>;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const webhook = await TracingUtils.traceFunction(
        'webhook.update',
        async (span) => {
          span.setAttributes({
            'webhook.id': request.params.webhookId,
          });

          return await webhookService.updateWebhookEndpoint(
            request.params.webhookId,
            request.body
          );
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/:webhookId',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        data: webhook,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/:webhookId',
        statusCode,
        duration
      );

      reply.code(statusCode);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Delete webhook endpoint
  server.delete('/:webhookId', async (request: FastifyRequest<{
    Params: { webhookId: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      await TracingUtils.traceFunction(
        'webhook.delete',
        async (span) => {
          span.setAttributes({
            'webhook.id': request.params.webhookId,
          });

          await webhookService.deleteWebhookEndpoint(request.params.webhookId);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/:webhookId',
        204,
        Date.now() - startTime
      );

      reply.code(204);
      return;

    } catch (error) {
      const duration = Date.now() - startTime;
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/:webhookId',
        statusCode,
        duration
      );

      reply.code(statusCode);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Test webhook endpoint
  server.post('/:webhookId/test', async (request: FastifyRequest<{
    Params: { webhookId: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const testResult = await TracingUtils.traceWebhookDelivery(
        request.params.webhookId,
        'webhook.test',
        'test',
        async (span) => {
          span.setAttributes({
            'webhook.id': request.params.webhookId,
            'webhook.test': true,
          });

          return await webhookService.testWebhookEndpoint(request.params.webhookId);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/:webhookId/test',
        200,
        Date.now() - startTime
      );

      metricsCollector.recordWebhookDelivery(
        testResult.success ? 'success' : 'failure',
        testResult.responseTime,
        request.params.webhookId,
        'webhook.test'
      );

      return {
        success: true,
        data: testResult,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/:webhookId/test',
        statusCode,
        duration
      );

      reply.code(statusCode);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get webhook statistics
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const stats = await webhookService.getWebhookStats();

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/stats',
        200,
        Date.now() - startTime
      );

      return {
        success: true,
        data: stats,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/webhooks/stats',
        500,
        duration
      );

      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}