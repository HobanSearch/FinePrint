import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { wsService, messageQueueService } from '../index';

const adminRoutes = async (server: FastifyInstance) => {
  // Admin auth middleware - simplified for demo
  server.addHook('preHandler', async (request, reply) => {
    // In production, this would validate admin permissions
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401);
      return { error: 'Admin authentication required' };
    }
    
    // Simplified admin check - would validate JWT and check admin role
    // For now, just check if token exists
  });

  // Get connection statistics
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    const stats = wsService.getConnectionStats();
    return {
      stats,
      timestamp: new Date().toISOString(),
    };
  });

  // Get detailed connection information
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    // This would call a method on ConnectionManager for detailed stats
    const stats = wsService.getConnectionStats();
    return {
      connections: stats,
      users: [], // Would be populated by ConnectionManager
      teams: {},
      subscriptions: {},
      timestamp: new Date().toISOString(),
    };
  });

  // Get user connection info
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
  }>, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    const { userId } = request.params;
    const connectionInfo = wsService.getUserConnectionInfo(userId);

    return {
      userId,
      connectionInfo,
      timestamp: new Date().toISOString(),
    };
  });

  // Get message queue statistics
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!messageQueueService) {
      reply.status(503);
      return { error: 'Message queue service not available' };
    }

    const queues = await messageQueueService.getQueueStats();
    return {
      queues,
      timestamp: new Date().toISOString(),
    };
  });

  // Get detailed queue statistics
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!messageQueueService) {
      reply.status(503);
      return { error: 'Message queue service not available' };
    }

    const stats = await messageQueueService.getDetailedStats();
    return {
      ...stats,
      timestamp: new Date().toISOString(),
    };
  });

  // Get user queue information
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
    Querystring: { limit?: number };
  }>, reply: FastifyReply) => {
    if (!messageQueueService) {
      reply.status(503);
      return { error: 'Message queue service not available' };
    }

    const { userId } = request.params;
    const limit = request.query.limit || 100;

    const queueSize = await messageQueueService.getUserQueueSize(userId);
    const messages = await messageQueueService.getQueuedMessages(userId, limit);

    return {
      userId,
      queueSize,
      messages,
      timestamp: new Date().toISOString(),
    };
  });

  // Clear user queue
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
  }>, reply: FastifyReply) => {
    if (!messageQueueService) {
      reply.status(503);
      return { error: 'Message queue service not available' };
    }

    const { userId } = request.params;
    const clearedCount = await messageQueueService.clearQueuedMessages(userId);

    return {
      success: true,
      userId,
      clearedCount,
      timestamp: new Date().toISOString(),
    };
  });

  // Send system alert
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
  }, async (request: FastifyRequest<{
    Body: {
      severity?: 'info' | 'warning' | 'error';
      title: string;
      message: string;
      targetUsers?: string[];
    };
  }>, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    const { severity = 'info', title, message, targetUsers } = request.body;

    const alertMessage = {
      type: 'system_alert' as const,
      payload: {
        severity,
        title,
        message,
        timestamp: new Date(),
      },
      timestamp: new Date(),
      id: crypto.randomUUID(),
    };

    await wsService.sendSystemAlert(alertMessage, targetUsers);

    return {
      success: true,
      alertId: alertMessage.id,
      targetUsers: targetUsers?.length || 0,
      timestamp: new Date().toISOString(),
    };
  });

  // Force disconnect user
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
    Body: { reason?: string };
  }>, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    const { userId } = request.params;
    const { reason = 'Admin disconnection' } = request.body;

    // This would need to be implemented in the WebSocket service
    // For now, return a placeholder response
    
    return {
      success: true,
      userId,
      disconnectedConnections: 0, // Would return actual count
      timestamp: new Date().toISOString(),
    };
  });

  // Get service health
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const services: any = {};

    if (wsService) {
      services.websocket = await wsService.getHealthStatus();
    }

    if (messageQueueService) {
      services.messageQueue = await messageQueueService.getHealthStatus();
    }

    const healthy = Object.values(services).every((service: any) => service.healthy);

    return {
      healthy,
      services,
      timestamp: new Date().toISOString(),
    };
  });
};

export default adminRoutes;