import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from '../utils/logger';

const logger = Logger.child({ component: 'communication-routes' });

export default async function communicationRoutes(fastify: FastifyInstance) {
  const { communicationBus } = fastify.orchestrationServices;

  // Get communication statistics
  fastify.get('/stats', {
    schema: {
      tags: ['communication'],
      summary: 'Get communication bus statistics',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = {
        queues: communicationBus.getQueues().size,
        routes: communicationBus.getRoutes().size,
        channels: communicationBus.getChannels().size,
        totalMessages: communicationBus.getMetrics().size,
      };

      reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get communication stats', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve communication statistics',
      });
    }
  });

  // Get message metrics
  fastify.get('/metrics', {
    schema: {
      tags: ['communication'],
      summary: 'Get message metrics',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = Array.from(communicationBus.getMetrics().values());

      reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Failed to get message metrics', { error: error.message });
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve message metrics',
      });
    }
  });

  // Send message (for testing)
  fastify.post('/send', {
    schema: {
      tags: ['communication'],
      summary: 'Send a test message',
      body: {
        type: 'object',
        required: ['to', 'subject', 'payload'],
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          payload: { type: 'object' },
          type: { type: 'string' },
          priority: { type: 'number' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { to, subject, payload, type = 'event', priority = 5 } = request.body as any;

      await communicationBus.publish({
        id: require('uuid').v4(),
        type: type as any,
        from: 'orchestration-api',
        to,
        subject,
        payload,
        timestamp: new Date(),
        priority: priority as any,
      });

      reply.send({
        success: true,
        message: 'Message sent successfully',
      });
    } catch (error) {
      logger.error('Failed to send message', { error: error.message });
      reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });
}