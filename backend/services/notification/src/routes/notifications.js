"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = notificationRoutes;
const zod_1 = require("zod");
const logger_1 = require("@fineprintai/shared-logger");
const notificationService_1 = require("../services/notificationService");
const logger = (0, logger_1.createServiceLogger)('notification-routes');
const CreateNotificationSchema = zod_1.z.object({
    userId: zod_1.z.string().optional(),
    type: zod_1.z.enum(['analysis_complete', 'document_changed', 'subscription_update', 'action_required', 'system_alert']),
    title: zod_1.z.string().min(1).max(200),
    message: zod_1.z.string().min(1).max(1000),
    data: zod_1.z.record(zod_1.z.any()).optional(),
    actionUrl: zod_1.z.string().url().optional(),
    expiresAt: zod_1.z.string().datetime().optional(),
    scheduledAt: zod_1.z.string().datetime().optional(),
    channels: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['email', 'push', 'webhook', 'in_app']),
        config: zod_1.z.record(zod_1.z.any()).default({}),
    })),
});
const BulkCreateNotificationSchema = zod_1.z.object({
    userIds: zod_1.z.array(zod_1.z.string()).min(1).max(1000),
    type: zod_1.z.string(),
    title: zod_1.z.string().min(1).max(200),
    message: zod_1.z.string().min(1).max(1000),
    data: zod_1.z.record(zod_1.z.any()).optional(),
    actionUrl: zod_1.z.string().url().optional(),
    channels: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['email', 'push', 'webhook', 'in_app']),
        config: zod_1.z.record(zod_1.z.any()).default({}),
    })),
    batchSize: zod_1.z.number().int().min(1).max(100).default(100),
});
const GetNotificationsQuerySchema = zod_1.z.object({
    limit: zod_1.z.number().int().min(1).max(100).default(50),
    offset: zod_1.z.number().int().min(0).default(0),
    unreadOnly: zod_1.z.boolean().default(false),
    type: zod_1.z.string().optional(),
    category: zod_1.z.enum(['transactional', 'marketing', 'system']).optional(),
});
async function notificationRoutes(fastify) {
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
    }, async (request, reply) => {
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
            const notificationRequest = {
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
            const notification = await notificationService_1.notificationService.createNotification(notificationRequest);
            reply.status(201).send({
                success: true,
                data: notification,
            });
        }
        catch (error) {
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
    }, async (request, reply) => {
        try {
            const body = BulkCreateNotificationSchema.parse(request.body);
            const bulkRequest = {
                userIds: body.userIds,
                type: body.type,
                title: body.title,
                message: body.message,
                data: body.data,
                actionUrl: body.actionUrl,
                channels: body.channels,
                batchSize: body.batchSize,
            };
            const result = await notificationService_1.notificationService.createBulkNotifications(bulkRequest);
            reply.status(201).send({
                success: true,
                data: result,
            });
        }
        catch (error) {
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
    }, async (request, reply) => {
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
            const notifications = await notificationService_1.notificationService.getUserNotifications(userId, {
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
        }
        catch (error) {
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
    }, async (request, reply) => {
        try {
            const { notificationId } = request.params;
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
            await notificationService_1.notificationService.markNotificationAsRead(notificationId);
            reply.send({
                success: true,
                message: 'Notification marked as read',
            });
        }
        catch (error) {
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
    }, async (request, reply) => {
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
            const stats = await notificationService_1.notificationService.getNotificationStats(userId);
            reply.send({
                success: true,
                data: stats,
            });
        }
        catch (error) {
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
    }, async (request, reply) => {
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
            const notifications = await notificationService_1.notificationService.getUserNotifications(userId, {
                unreadOnly: true,
                limit: 1000,
            });
            reply.send({
                success: true,
                data: {
                    count: notifications.length,
                },
            });
        }
        catch (error) {
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
    }, async (request, reply) => {
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
            const unreadNotifications = await notificationService_1.notificationService.getUserNotifications(userId, {
                unreadOnly: true,
                limit: 1000,
            });
            await Promise.all(unreadNotifications.map(notification => notificationService_1.notificationService.markNotificationAsRead(notification.id)));
            reply.send({
                success: true,
                message: `Marked ${unreadNotifications.length} notifications as read`,
            });
        }
        catch (error) {
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
        }, async (request, reply) => {
            try {
                const body = request.body;
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
                const testNotification = {
                    userId,
                    type: body.type || 'system_alert',
                    title: body.title || 'Test Notification',
                    message: body.message || 'This is a test notification',
                    data: { test: true },
                    channels: body.channels || [{ type: 'in_app', config: {} }],
                };
                const notification = await notificationService_1.notificationService.createNotification(testNotification);
                reply.status(201).send({
                    success: true,
                    data: notification,
                    message: 'Test notification sent successfully',
                });
            }
            catch (error) {
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
//# sourceMappingURL=notifications.js.map