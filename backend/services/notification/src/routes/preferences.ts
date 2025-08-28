import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createServiceLogger } from '@fineprintai/shared-logger';

import { preferenceService } from '../services/preferenceService';

const logger = createServiceLogger('preference-routes');

const UpdatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
  analysisComplete: z.boolean().optional(),
  documentChanges: z.boolean().optional(),
  highRiskFindings: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
  billingUpdates: z.boolean().optional(),
  systemMaintenance: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  quietHoursEnd: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  timezone: z.string().optional(),
  batchingEnabled: z.boolean().optional(),
  batchingInterval: z.number().int().min(1).optional(),
  maxBatchSize: z.number().int().min(1).max(100).optional(),
});

const ConsentSchema = z.object({
  consentGiven: z.boolean(),
  consentTypes: z.array(z.string()).default([]),
  source: z.string().optional(),
});

const UnsubscribeSchema = z.object({
  type: z.enum(['all', 'marketing', 'transactional', 'specific']),
  categories: z.array(z.string()).optional(),
  reason: z.string().optional(),
  source: z.string().default('preferences_page'),
});

export default async function preferenceRoutes(fastify: FastifyInstance) {
  // Get user preferences
  fastify.get('/', {
    schema: {
      description: 'Get user notification preferences',
      tags: ['preferences'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                emailEnabled: { type: 'boolean' },
                browserEnabled: { type: 'boolean' },
                webhookEnabled: { type: 'boolean' },
                webhookUrl: { type: ['string', 'null'] },
                analysisComplete: { type: 'boolean' },
                documentChanges: { type: 'boolean' },
                highRiskFindings: { type: 'boolean' },
                weeklySummary: { type: 'boolean' },
                marketingEmails: { type: 'boolean' },
              },
            },
          },
        },
        401: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const preferences = await preferenceService.getUserPreferences(userId);

      reply.send({
        success: true,
        data: preferences,
      });
    } catch (error) {
      logger.error('Failed to get user preferences', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'PREFERENCES_FETCH_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Update user preferences
  fastify.put('/', {
    schema: {
      description: 'Update user notification preferences',
      tags: ['preferences'],
      body: UpdatePreferencesSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                userId: { type: 'string' },
                emailEnabled: { type: 'boolean' },
                browserEnabled: { type: 'boolean' },
                webhookEnabled: { type: 'boolean' },
                webhookUrl: { type: ['string', 'null'] },
                analysisComplete: { type: 'boolean' },
                documentChanges: { type: 'boolean' },
                highRiskFindings: { type: 'boolean' },
                weeklySummary: { type: 'boolean' },
                marketingEmails: { type: 'boolean' },
              },
            },
          },
        },
        400: { $ref: 'Error' },
        401: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      const updates = UpdatePreferencesSchema.parse(request.body);

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const preferences = await preferenceService.updateUserPreferences(userId, updates);

      reply.send({
        success: true,
        data: preferences,
      });
    } catch (error) {
      logger.error('Failed to update user preferences', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'PREFERENCES_UPDATE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Update consent
  fastify.post('/consent', {
    schema: {
      description: 'Update user consent for notifications',
      tags: ['preferences'],
      body: ConsentSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: { $ref: 'Error' },
        401: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      const consentRequest = ConsentSchema.parse(request.body);

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const result = await preferenceService.updateConsent(userId, {
        ...consentRequest,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.send(result);
    } catch (error) {
      logger.error('Failed to update consent', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'CONSENT_UPDATE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Unsubscribe
  fastify.post('/unsubscribe', {
    schema: {
      description: 'Unsubscribe from notifications',
      tags: ['preferences'],
      body: UnsubscribeSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        400: { $ref: 'Error' },
        401: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;
      const unsubscribeRequest = UnsubscribeSchema.parse(request.body);

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const result = await preferenceService.processUnsubscribe(userId, {
        ...unsubscribeRequest,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.send(result);
    } catch (error) {
      logger.error('Failed to process unsubscribe', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'UNSUBSCRIBE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Export user data (GDPR)
  fastify.get('/export', {
    schema: {
      description: 'Export user notification data (GDPR)',
      tags: ['preferences'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
        401: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const data = await preferenceService.exportUserData(userId);

      reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Failed to export user data', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'DATA_EXPORT_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Delete user data (GDPR)
  fastify.delete('/data', {
    schema: {
      description: 'Delete user notification data (GDPR right to be forgotten)',
      tags: ['preferences'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        401: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user?.id;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const result = await preferenceService.deleteUserData(userId);

      reply.send(result);
    } catch (error) {
      logger.error('Failed to delete user data', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'DATA_DELETE_FAILED',
          message: error.message,
        },
      });
    }
  });
}