import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { wsService, messageQueueService } from '../index';

const websocketRoutes = async (server: FastifyInstance) => {
  // Auth middleware - simplified for demo
  server.addHook('preHandler', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401);
      return { error: 'Authentication required' };
    }
  });

  // Send message to specific user
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
    Body: {
      type: string;
      payload: any;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      ttl?: number;
    };
  }>, reply: FastifyReply) => {
    if (!wsService || !messageQueueService) {
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
      // Check if user is online
      const userInfo = wsService.getUserConnectionInfo(userId);
      
      if (userInfo.isConnected) {
        // Send directly via WebSocket
        await wsService.sendNotification(userId, {
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
      } else {
        // Queue message for offline user
        const jobId = await messageQueueService.queueMessage(userId, message, {
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
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to send message' };
    }
  });

  // Send bulk messages
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
  }, async (request: FastifyRequest<{
    Body: {
      messages: Array<{
        userId: string;
        type: string;
        payload: any;
        priority?: 'low' | 'medium' | 'high' | 'critical';
      }>;
    };
  }>, reply: FastifyReply) => {
    if (!wsService || !messageQueueService) {
      reply.status(503);
      return { error: 'Services not available' };
    }

    const { messages } = request.body;
    let sent = 0;
    let queued = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      messages.map(async ({ userId, type, payload, priority }) => {
        const message = {
          type,
          payload,
          timestamp: new Date(),
          id: crypto.randomUUID(),
        };

        const userInfo = wsService.getUserConnectionInfo(userId);
        
        if (userInfo.isConnected) {
          await wsService.sendNotification(userId, {
            ...message,
            type: 'notification',
            payload: {
              id: message.id,
              title: type,
              message: JSON.stringify(payload),
            },
          });
          return { status: 'sent' };
        } else {
          await messageQueueService.queueMessage(userId, message, { priority });
          return { status: 'queued' };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.status === 'sent') {
          sent++;
        } else {
          queued++;
        }
      } else {
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

  // Broadcast message to all connected users
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
  }, async (request: FastifyRequest<{
    Body: {
      type: string;
      payload: any;
      excludeUsers?: string[];
    };
  }>, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    const { type, payload, excludeUsers } = request.body;

    const message = {
      type: 'system_alert' as const,
      payload: {
        severity: 'info' as const,
        title: type,
        message: JSON.stringify(payload),
        timestamp: new Date(),
      },
      timestamp: new Date(),
      id: crypto.randomUUID(),
    };

    try {
      await wsService.sendSystemAlert(message);

      return {
        success: true,
        messageId: message.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to broadcast message' };
    }
  });

  // Get connection status for user
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
  }>, reply: FastifyReply) => {
    if (!wsService || !messageQueueService) {
      reply.status(503);
      return { error: 'Services not available' };
    }

    const { userId } = request.params;

    const connectionInfo = wsService.getUserConnectionInfo(userId);
    const queueSize = await messageQueueService.getUserQueueSize(userId);

    return {
      userId,
      ...connectionInfo,
      queueSize,
      timestamp: new Date().toISOString(),
    };
  });

  // Get message queue for user
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
  }, async (request: FastifyRequest<{
    Params: { userId: string };
    Querystring: { limit?: number };
  }>, reply: FastifyReply) => {
    if (!messageQueueService) {
      reply.status(503);
      return { error: 'Message queue service not available' };
    }

    const { userId } = request.params;
    const limit = request.query.limit || 50;

    const queueSize = await messageQueueService.getUserQueueSize(userId);
    const messages = await messageQueueService.getQueuedMessages(userId, limit);

    return {
      userId,
      queueSize,
      messages,
      timestamp: new Date().toISOString(),
    };
  });

  // Clear user message queue
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

  // Test WebSocket connection
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
  }, async (request: FastifyRequest<{
    Body: {
      testType?: 'ping' | 'echo' | 'broadcast';
      payload?: any;
    };
  }>, reply: FastifyReply) => {
    if (!wsService) {
      reply.status(503);
      return { error: 'WebSocket service not available' };
    }

    const { testType = 'ping', payload } = request.body;

    try {
      let result: any;

      switch (testType) {
        case 'ping':
          result = { message: 'WebSocket service is running', connections: wsService.getConnectionStats() };
          break;
        
        case 'echo':
          result = { echo: payload || { message: 'test payload' } };
          break;
        
        case 'broadcast':
          const testMessage = {
            type: 'system_alert' as const,
            payload: {
              severity: 'info' as const,
              title: 'Test Message',
              message: 'This is a test broadcast message',
              timestamp: new Date(),
            },
            timestamp: new Date(),
            id: crypto.randomUUID(),
          };
          
          await wsService.sendSystemAlert(testMessage);
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
    } catch (error) {
      reply.status(500);
      return { error: 'Test failed' };
    }
  });
};

export default websocketRoutes;