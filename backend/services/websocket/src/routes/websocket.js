"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const websocketRoutes = async (server) => {
    server.addHook('preHandler', async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            reply.status(401);
            return { error: 'Authentication required' };
        }
    });
    server.post('/send/:userId', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Send message to specific user',
            description: 'Sends a WebSocket message to a specific user',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    userId: { type: 'string' },
                },
                required: ['userId'],
            },
            body: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    payload: { type: 'object' },
                    priority: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical'],
                        default: 'medium',
                    },
                    ttl: {
                        type: 'number',
                        description: 'Time to live in milliseconds',
                    },
                },
                required: ['type', 'payload'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        messageId: { type: 'string' },
                        queued: { type: 'boolean' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.wsService || !index_1.messageQueueService) {
            reply.status(503);
            return { error: 'Services not available' };
        }
        const { userId } = request.params;
        const { type, payload, priority = 'medium', ttl } = request.body;
        const message = {
            type,
            payload,
            timestamp: new Date(),
            id: crypto.randomUUID(),
        };
        try {
            const userInfo = index_1.wsService.getUserConnectionInfo(userId);
            if (userInfo.isConnected) {
                await index_1.wsService.sendNotification(userId, {
                    ...message,
                    type: 'notification',
                    payload: {
                        id: message.id,
                        title: type,
                        message: JSON.stringify(payload),
                    },
                });
                return {
                    success: true,
                    messageId: message.id,
                    queued: false,
                    timestamp: new Date().toISOString(),
                };
            }
            else {
                const jobId = await index_1.messageQueueService.queueMessage(userId, message, {
                    priority,
                    ttl,
                });
                return {
                    success: true,
                    messageId: jobId,
                    queued: true,
                    timestamp: new Date().toISOString(),
                };
            }
        }
        catch (error) {
            reply.status(500);
            return { error: 'Failed to send message' };
        }
    });
    server.post('/send/bulk', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Send bulk messages',
            description: 'Sends messages to multiple users',
            security: [{ Bearer: [] }],
            body: {
                type: 'object',
                properties: {
                    messages: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                userId: { type: 'string' },
                                type: { type: 'string' },
                                payload: { type: 'object' },
                                priority: {
                                    type: 'string',
                                    enum: ['low', 'medium', 'high', 'critical'],
                                },
                            },
                            required: ['userId', 'type', 'payload'],
                        },
                    },
                },
                required: ['messages'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        processed: { type: 'number' },
                        sent: { type: 'number' },
                        queued: { type: 'number' },
                        failed: { type: 'number' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.wsService || !index_1.messageQueueService) {
            reply.status(503);
            return { error: 'Services not available' };
        }
        const { messages } = request.body;
        let sent = 0;
        let queued = 0;
        let failed = 0;
        const results = await Promise.allSettled(messages.map(async ({ userId, type, payload, priority }) => {
            const message = {
                type,
                payload,
                timestamp: new Date(),
                id: crypto.randomUUID(),
            };
            const userInfo = index_1.wsService.getUserConnectionInfo(userId);
            if (userInfo.isConnected) {
                await index_1.wsService.sendNotification(userId, {
                    ...message,
                    type: 'notification',
                    payload: {
                        id: message.id,
                        title: type,
                        message: JSON.stringify(payload),
                    },
                });
                return { status: 'sent' };
            }
            else {
                await index_1.messageQueueService.queueMessage(userId, message, { priority });
                return { status: 'queued' };
            }
        }));
        for (const result of results) {
            if (result.status === 'fulfilled') {
                if (result.value.status === 'sent') {
                    sent++;
                }
                else {
                    queued++;
                }
            }
            else {
                failed++;
            }
        }
        return {
            success: true,
            processed: messages.length,
            sent,
            queued,
            failed,
            timestamp: new Date().toISOString(),
        };
    });
    server.post('/broadcast', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Broadcast message to all users',
            description: 'Broadcasts a message to all connected users',
            security: [{ Bearer: [] }],
            body: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    payload: { type: 'object' },
                    excludeUsers: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of user IDs to exclude from broadcast',
                    },
                },
                required: ['type', 'payload'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        messageId: { type: 'string' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.wsService) {
            reply.status(503);
            return { error: 'WebSocket service not available' };
        }
        const { type, payload, excludeUsers } = request.body;
        const message = {
            type: 'system_alert',
            payload: {
                severity: 'info',
                title: type,
                message: JSON.stringify(payload),
                timestamp: new Date(),
            },
            timestamp: new Date(),
            id: crypto.randomUUID(),
        };
        try {
            await index_1.wsService.sendSystemAlert(message);
            return {
                success: true,
                messageId: message.id,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            reply.status(500);
            return { error: 'Failed to broadcast message' };
        }
    });
    server.get('/status/:userId', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Get user connection status',
            description: 'Returns connection status for a specific user',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    userId: { type: 'string' },
                },
                required: ['userId'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        userId: { type: 'string' },
                        isConnected: { type: 'boolean' },
                        connectionCount: { type: 'number' },
                        connections: { type: 'array' },
                        queueSize: { type: 'number' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.wsService || !index_1.messageQueueService) {
            reply.status(503);
            return { error: 'Services not available' };
        }
        const { userId } = request.params;
        const connectionInfo = index_1.wsService.getUserConnectionInfo(userId);
        const queueSize = await index_1.messageQueueService.getUserQueueSize(userId);
        return {
            userId,
            ...connectionInfo,
            queueSize,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/queue/:userId', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Get user message queue',
            description: 'Returns queued messages for a specific user',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    userId: { type: 'string' },
                },
                required: ['userId'],
            },
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'number', default: 50 },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        userId: { type: 'string' },
                        queueSize: { type: 'number' },
                        messages: { type: 'array' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.messageQueueService) {
            reply.status(503);
            return { error: 'Message queue service not available' };
        }
        const { userId } = request.params;
        const limit = request.query.limit || 50;
        const queueSize = await index_1.messageQueueService.getUserQueueSize(userId);
        const messages = await index_1.messageQueueService.getQueuedMessages(userId, limit);
        return {
            userId,
            queueSize,
            messages,
            timestamp: new Date().toISOString(),
        };
    });
    server.delete('/queue/:userId', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Clear user message queue',
            description: 'Clears all queued messages for a specific user',
            security: [{ Bearer: [] }],
            params: {
                type: 'object',
                properties: {
                    userId: { type: 'string' },
                },
                required: ['userId'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        userId: { type: 'string' },
                        clearedCount: { type: 'number' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.messageQueueService) {
            reply.status(503);
            return { error: 'Message queue service not available' };
        }
        const { userId } = request.params;
        const clearedCount = await index_1.messageQueueService.clearQueuedMessages(userId);
        return {
            success: true,
            userId,
            clearedCount,
            timestamp: new Date().toISOString(),
        };
    });
    server.post('/test', {
        schema: {
            tags: ['WebSocket'],
            summary: 'Test WebSocket functionality',
            description: 'Tests WebSocket service functionality',
            security: [{ Bearer: [] }],
            body: {
                type: 'object',
                properties: {
                    testType: {
                        type: 'string',
                        enum: ['ping', 'echo', 'broadcast'],
                        default: 'ping',
                    },
                    payload: { type: 'object' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        testType: { type: 'string' },
                        result: { type: 'object' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        if (!index_1.wsService) {
            reply.status(503);
            return { error: 'WebSocket service not available' };
        }
        const { testType = 'ping', payload } = request.body;
        try {
            let result;
            switch (testType) {
                case 'ping':
                    result = { message: 'WebSocket service is running', connections: index_1.wsService.getConnectionStats() };
                    break;
                case 'echo':
                    result = { echo: payload || { message: 'test payload' } };
                    break;
                case 'broadcast':
                    const testMessage = {
                        type: 'system_alert',
                        payload: {
                            severity: 'info',
                            title: 'Test Message',
                            message: 'This is a test broadcast message',
                            timestamp: new Date(),
                        },
                        timestamp: new Date(),
                        id: crypto.randomUUID(),
                    };
                    await index_1.wsService.sendSystemAlert(testMessage);
                    result = { messageId: testMessage.id, broadcast: true };
                    break;
                default:
                    result = { error: 'Unknown test type' };
            }
            return {
                success: true,
                testType,
                result,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            reply.status(500);
            return { error: 'Test failed' };
        }
    });
};
exports.default = websocketRoutes;
//# sourceMappingURL=websocket.js.map