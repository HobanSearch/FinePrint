"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const adminRoutes = async (server) => {
    server.addHook('preHandler', async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            reply.status(401);
            return { error: 'Admin authentication required' };
        }
    });
    server.get('/connections', {
        schema: {
            tags: ['Admin'],
            summary: 'Get connection statistics',
            description: 'Returns detailed WebSocket connection statistics',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        stats: { type: 'object' },
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
        const stats = index_1.wsService.getConnectionStats();
        return {
            stats,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/connections/detailed', {
        schema: {
            tags: ['Admin'],
            summary: 'Get detailed connection information',
            description: 'Returns detailed information about all connections',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        connections: { type: 'object' },
                        users: { type: 'array' },
                        teams: { type: 'object' },
                        subscriptions: { type: 'object' },
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
        const stats = index_1.wsService.getConnectionStats();
        return {
            connections: stats,
            users: [],
            teams: {},
            subscriptions: {},
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/connections/user/:userId', {
        schema: {
            tags: ['Admin'],
            summary: 'Get user connection information',
            description: 'Returns connection information for a specific user',
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
                        connectionInfo: { type: 'object' },
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
        const { userId } = request.params;
        const connectionInfo = index_1.wsService.getUserConnectionInfo(userId);
        return {
            userId,
            connectionInfo,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/queues', {
        schema: {
            tags: ['Admin'],
            summary: 'Get message queue statistics',
            description: 'Returns statistics for all message queues',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        queues: { type: 'array' },
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
        const queues = await index_1.messageQueueService.getQueueStats();
        return {
            queues,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/queues/detailed', {
        schema: {
            tags: ['Admin'],
            summary: 'Get detailed queue statistics',
            description: 'Returns detailed statistics for all message queues',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        queues: { type: 'array' },
                        users: { type: 'array' },
                        totalMessages: { type: 'number' },
                        messageTypes: { type: 'object' },
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
        const stats = await index_1.messageQueueService.getDetailedStats();
        return {
            ...stats,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/queues/user/:userId', {
        schema: {
            tags: ['Admin'],
            summary: 'Get user queue information',
            description: 'Returns queue information for a specific user',
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
                    limit: { type: 'number', default: 100 },
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
        const limit = request.query.limit || 100;
        const queueSize = await index_1.messageQueueService.getUserQueueSize(userId);
        const messages = await index_1.messageQueueService.getQueuedMessages(userId, limit);
        return {
            userId,
            queueSize,
            messages,
            timestamp: new Date().toISOString(),
        };
    });
    server.delete('/queues/user/:userId', {
        schema: {
            tags: ['Admin'],
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
    server.post('/alert', {
        schema: {
            tags: ['Admin'],
            summary: 'Send system alert',
            description: 'Sends a system alert to all or specific users',
            security: [{ Bearer: [] }],
            body: {
                type: 'object',
                properties: {
                    severity: {
                        type: 'string',
                        enum: ['info', 'warning', 'error'],
                        default: 'info',
                    },
                    title: { type: 'string' },
                    message: { type: 'string' },
                    targetUsers: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional list of user IDs to target. If empty, sends to all users.',
                    },
                },
                required: ['title', 'message'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        alertId: { type: 'string' },
                        targetUsers: { type: 'number' },
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
        const { severity = 'info', title, message, targetUsers } = request.body;
        const alertMessage = {
            type: 'system_alert',
            payload: {
                severity,
                title,
                message,
                timestamp: new Date(),
            },
            timestamp: new Date(),
            id: crypto.randomUUID(),
        };
        await index_1.wsService.sendSystemAlert(alertMessage, targetUsers);
        return {
            success: true,
            alertId: alertMessage.id,
            targetUsers: targetUsers?.length || 0,
            timestamp: new Date().toISOString(),
        };
    });
    server.post('/disconnect/:userId', {
        schema: {
            tags: ['Admin'],
            summary: 'Force disconnect user',
            description: 'Forcefully disconnects all connections for a specific user',
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
                    reason: { type: 'string', default: 'Admin disconnection' },
                },
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        userId: { type: 'string' },
                        disconnectedConnections: { type: 'number' },
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
        const { userId } = request.params;
        const { reason = 'Admin disconnection' } = request.body;
        return {
            success: true,
            userId,
            disconnectedConnections: 0,
            timestamp: new Date().toISOString(),
        };
    });
    server.get('/health', {
        schema: {
            tags: ['Admin'],
            summary: 'Get service health status',
            description: 'Returns detailed health status of all services',
            security: [{ Bearer: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        healthy: { type: 'boolean' },
                        services: { type: 'object' },
                        timestamp: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const services = {};
        if (index_1.wsService) {
            services.websocket = await index_1.wsService.getHealthStatus();
        }
        if (index_1.messageQueueService) {
            services.messageQueue = await index_1.messageQueueService.getHealthStatus();
        }
        const healthy = Object.values(services).every((service) => service.healthy);
        return {
            healthy,
            services,
            timestamp: new Date().toISOString(),
        };
    });
};
exports.default = adminRoutes;
//# sourceMappingURL=admin.js.map