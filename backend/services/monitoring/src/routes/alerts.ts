import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { alertingService } from '../services/alertingService';
import { TracingUtils } from '../monitoring/tracing';
import { metricsCollector } from '../monitoring/metrics';

const createAlertRuleSchema = {
  body: {
    type: 'object',
    required: ['userId', 'name', 'conditions', 'actions'],
    properties: {
      userId: { type: 'string' },
      teamId: { type: 'string' },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      conditions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'operator', 'value'],
          properties: {
            type: {
              type: 'string',
              enum: ['change_type', 'risk_change', 'document_type', 'keyword_match']
            },
            operator: {
              type: 'string',
              enum: ['equals', 'contains', 'greater_than', 'less_than', 'matches_regex']
            },
            value: { oneOf: [{ type: 'string' }, { type: 'number' }] },
          },
        },
        minItems: 1,
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'config'],
          properties: {
            type: {
              type: 'string',
              enum: ['email', 'slack', 'teams', 'webhook', 'push_notification']
            },
            config: { type: 'object' },
          },
        },
        minItems: 1,
      },
      cooldownMinutes: { type: 'number', minimum: 1, maximum: 1440 }, // Max 24 hours
    },
  },
};

const createNotificationChannelSchema = {
  body: {
    type: 'object',
    required: ['userId', 'type', 'config'],
    properties: {
      userId: { type: 'string' },
      teamId: { type: 'string' },
      type: {
        type: 'string',
        enum: ['email', 'slack', 'teams', 'push']
      },
      config: { type: 'object' },
      preferences: {
        type: 'object',
        properties: {
          severities: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical']
            },
          },
          quietHours: {
            type: 'object',
            properties: {
              start: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
              end: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
              timezone: { type: 'string' },
            },
          },
          frequency: {
            type: 'string',
            enum: ['immediate', 'hourly', 'daily']
          },
        },
      },
    },
  },
};

export async function alertRoutes(server: FastifyInstance): Promise<void> {
  
  // Create alert rule
  server.post('/rules', {
    schema: createAlertRuleSchema,
  }, async (request: FastifyRequest<{
    Body: {
      userId: string;
      teamId?: string;
      name: string;
      conditions: any[];
      actions: any[];
      cooldownMinutes?: number;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const rule = await TracingUtils.traceFunction(
        'alert.create_rule',
        async (span) => {
          span.setAttributes({
            'alert.rule.name': request.body.name,
            'alert.rule.conditions': request.body.conditions.length,
            'alert.rule.actions': request.body.actions.length,
            'user.id': request.body.userId,
          });

          return await alertingService.createAlertRule(request.body);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/alerts/rules',
        201,
        Date.now() - startTime,
        request.body.userId
      );

      reply.code(201);
      return {
        success: true,
        data: rule,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/alerts/rules',
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

  // Create notification channel
  server.post('/channels', {
    schema: createNotificationChannelSchema,
  }, async (request: FastifyRequest<{
    Body: {
      userId: string;
      teamId?: string;
      type: string;
      config: any;
      preferences?: any;
    };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const channel = await TracingUtils.traceFunction(
        'alert.create_channel',
        async (span) => {
          span.setAttributes({
            'alert.channel.type': request.body.type,
            'user.id': request.body.userId,
          });

          return await alertingService.createNotificationChannel(request.body);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/alerts/channels',
        201,
        Date.now() - startTime,
        request.body.userId
      );

      reply.code(201);
      return {
        success: true,
        data: channel,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/alerts/channels',
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

  // Test notification channel
  server.post('/channels/:channelId/test', async (request: FastifyRequest<{
    Params: { channelId: string };
  }>, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const testResult = await TracingUtils.traceFunction(
        'alert.test_channel',
        async (span) => {
          span.setAttributes({
            'alert.channel.id': request.params.channelId,
            'alert.test': true,
          });

          return await alertingService.testNotificationChannel(request.params.channelId);
        }
      );

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/alerts/channels/:channelId/test',
        200,
        Date.now() - startTime
      );

      metricsCollector.recordNotificationSent(
        'test',
        testResult.success ? 'success' : 'failure',
        'medium'
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
        '/api/v1/alerts/channels/:channelId/test',
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

  // Get alert statistics
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const stats = await alertingService.getAlertStats();

      metricsCollector.recordHttpRequest(
        request.method,
        '/api/v1/alerts/stats',
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
        '/api/v1/alerts/stats',
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