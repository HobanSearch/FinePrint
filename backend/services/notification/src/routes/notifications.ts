import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { NotificationRequest, BulkNotificationRequest } from '@fineprintai/shared-types';

import { notificationService } from '../services/notificationService';

const logger = createServiceLogger('notification-routes');

// Request schemas
const CreateNotificationSchema = z.object({
  userId: z.string().optional(), // Optional, will use authenticated user if not provided
  type: z.enum(['analysis_complete', 'document_changed', 'subscription_update', 'action_required', 'system_alert']),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  data: z.record(z.any()).optional(),
  actionUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  channels: z.array(z.object({
    type: z.enum(['email', 'push', 'webhook', 'in_app']),
    config: z.record(z.any()).default({}),
  })),
});

const BulkCreateNotificationSchema = z.object({
  userIds: z.array(z.string()).min(1).max(1000),
  type: z.string(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  data: z.record(z.any()).optional(),
  actionUrl: z.string().url().optional(),
  channels: z.array(z.object({
    type: z.enum(['email', 'push', 'webhook', 'in_app']),
    config: z.record(z.any()).default({}),
  })),
  batchSize: z.number().int().min(1).max(100).default(100),
});

const GetNotificationsQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  unreadOnly: z.boolean().default(false),
  type: z.string().optional(),
  category: z.enum(['transactional', 'marketing', 'system']).optional(),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Create single notification
  fastify.post('/', {
    schema: {
      description: 'Create a new notification',
      tags: ['notifications'],
      body: CreateNotificationSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                title: { type: 'string' },
                message: { type: 'string' },
                data: { type: 'object' },
                readAt: { type: ['string', 'null'] },
                actionUrl: { type: ['string', 'null'] },
                expiresAt: { type: ['string', 'null'] },
                createdAt: { type: 'string' },
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
      const body = CreateNotificationSchema.parse(request.body);
      const userId = body.userId || request.user?.id;

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required',
          },
        });
      }

      const notificationRequest: NotificationRequest = {
        userId,
        type: body.type,
        title: body.title,
        message: body.message,
        data: body.data,
        actionUrl: body.actionUrl,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        channels: body.channels,
      };

      const notification = await notificationService.createNotification(notificationRequest);

      reply.status(201).send({
        success: true,
        data: notification,
      });
    } catch (error) {
      logger.error('Failed to create notification', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'NOTIFICATION_CREATE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Create bulk notifications
  fastify.post('/bulk', {
    schema: {
      description: 'Create notifications for multiple users',
      tags: ['notifications'],
      body: BulkCreateNotificationSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                batchId: { type: 'string' },
                queued: { type: 'number' },
                skipped: { type: 'number' },
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
      const body = BulkCreateNotificationSchema.parse(request.body);

      const bulkRequest: BulkNotificationRequest = {
        userIds: body.userIds,
        type: body.type,
        title: body.title,
        message: body.message,
        data: body.data,
        actionUrl: body.actionUrl,
        channels: body.channels,
        batchSize: body.batchSize,
      };

      const result = await notificationService.createBulkNotifications(bulkRequest);

      reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to create bulk notifications', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'BULK_NOTIFICATION_CREATE_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Get user notifications
  fastify.get('/', {
    schema: {
      description: 'Get user notifications',
      tags: ['notifications'],
      querystring: GetNotificationsQuerySchema,
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
                  type: { type: 'string' },
                  title: { type: 'string' },
                  message: { type: 'string' },
                  data: { type: ['object', 'null'] },
                  readAt: { type: ['string', 'null'] },
                  actionUrl: { type: ['string', 'null'] },
                  expiresAt: { type: ['string', 'null'] },
                  createdAt: { type: 'string' },
                },
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
      const query = GetNotificationsQuerySchema.parse(request.query);
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

      const notifications = await notificationService.getUserNotifications(userId, {
        limit: query.limit,
        offset: query.offset,
        unreadOnly: query.unreadOnly,
        type: query.type,
        category: query.category,
      });

      reply.send({
        success: true,
        data: notifications,
      });
    } catch (error) {
      logger.error('Failed to get user notifications', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'NOTIFICATIONS_FETCH_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Mark notification as read
  fastify.put('/:notificationId/read', {
    schema: {
      description: 'Mark notification as read',
      tags: ['notifications'],
      params: {
        type: 'object',
        properties: {
          notificationId: { type: 'string' },
        },
        required: ['notificationId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        401: { $ref: 'Error' },
        404: { $ref: 'Error' },
        500: { $ref: 'Error' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { notificationId } = request.params as { notificationId: string };
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

      await notificationService.markNotificationAsRead(notificationId);

      reply.send({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      logger.error('Failed to mark notification as read', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'NOTIFICATION_READ_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Get notification statistics
  fastify.get('/stats', {
    schema: {
      description: 'Get notification statistics',
      tags: ['notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              additionalProperties: { type: 'number' },
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

      const stats = await notificationService.getNotificationStats(userId);

      reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get notification stats', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'STATS_FETCH_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Get unread count
  fastify.get('/unread/count', {
    schema: {
      description: 'Get unread notifications count',
      tags: ['notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                count: { type: 'number' },
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

      const notifications = await notificationService.getUserNotifications(userId, {
        unreadOnly: true,
        limit: 1000, // Get all unread for counting
      });

      reply.send({
        success: true,
        data: {
          count: notifications.length,
        },
      });
    } catch (error) {
      logger.error('Failed to get unread count', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'UNREAD_COUNT_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Mark all notifications as read
  fastify.put('/read-all', {
    schema: {
      description: 'Mark all notifications as read',
      tags: ['notifications'],
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

      // Get all unread notifications and mark them as read
      const unreadNotifications = await notificationService.getUserNotifications(userId, {
        unreadOnly: true,
        limit: 1000,
      });

      await Promise.all(
        unreadNotifications.map(notification =>
          notificationService.markNotificationAsRead(notification.id)
        )
      );

      reply.send({
        success: true,
        message: `Marked ${unreadNotifications.length} notifications as read`,
      });
    } catch (error) {
      logger.error('Failed to mark all notifications as read', { error: error.message });
      reply.status(500).send({
        success: false,
        error: {
          code: 'READ_ALL_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Test notification (development/staging only)
  if (process.env.NODE_ENV !== 'production') {
    fastify.post('/test', {
      schema: {
        description: 'Send test notification (non-production only)',
        tags: ['notifications'],
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', default: 'system_alert' },
            title: { type: 'string', default: 'Test Notification' },
            message: { type: 'string', default: 'This is a test notification' },
            channels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['email', 'push', 'webhook', 'in_app'] },
                  config: { type: 'object' },
                },
              },
              default: [{ type: 'in_app', config: {} }],
            },
          },
        },
        response: {
          201: { $ref: 'SuccessResponse' },
          401: { $ref: 'Error' },
          500: { $ref: 'Error' },
        },
      },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
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

        const testNotification: NotificationRequest = {
          userId,
          type: body.type || 'system_alert',
          title: body.title || 'Test Notification',
          message: body.message || 'This is a test notification',
          data: { test: true },
          channels: body.channels || [{ type: 'in_app', config: {} }],
        };

        const notification = await notificationService.createNotification(testNotification);

        reply.status(201).send({
          success: true,
          data: notification,
          message: 'Test notification sent successfully',
        });
      } catch (error) {
        logger.error('Failed to send test notification', { error: error.message });
        reply.status(500).send({
          success: false,
          error: {
            code: 'TEST_NOTIFICATION_FAILED',
            message: error.message,
          },
        });
      }
    });
  }
}