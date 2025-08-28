/**
 * Webhook API Routes
 */

import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Stripe webhook
  fastify.post(
    '/stripe',
    {
      config: {
        rawBody: true, // Need raw body for signature verification
      },
    },
    async (request, reply) => {
      try {
        await fastify.webhookProcessor.processWebhook(
          'stripe',
          request.headers as Record<string, string>,
          request.body,
          request.rawBody
        );

        return { received: true };
      } catch (error) {
        logger.error('Stripe webhook error', { error });
        return reply.code(400).send({ error: 'Webhook processing failed' });
      }
    }
  );

  // SendGrid webhook
  fastify.post(
    '/sendgrid',
    {
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      try {
        await fastify.webhookProcessor.processWebhook(
          'sendgrid',
          request.headers as Record<string, string>,
          request.body,
          request.rawBody
        );

        return { received: true };
      } catch (error) {
        logger.error('SendGrid webhook error', { error });
        return reply.code(400).send({ error: 'Webhook processing failed' });
      }
    }
  );

  // Social media webhooks
  fastify.post(
    '/social/:platform',
    {
      schema: {
        params: Type.Object({
          platform: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      try {
        await fastify.webhookProcessor.processWebhook(
          'social',
          request.headers as Record<string, string>,
          {
            platform: request.params.platform,
            ...request.body,
          }
        );

        return { received: true };
      } catch (error) {
        logger.error('Social media webhook error', { error });
        return reply.code(400).send({ error: 'Webhook processing failed' });
      }
    }
  );

  // Generic webhook endpoint
  fastify.post<{
    Params: { source: string };
  }>(
    '/custom/:source',
    {
      schema: {
        params: Type.Object({
          source: Type.String(),
        }),
      },
      config: {
        rawBody: true,
      },
    },
    async (request, reply) => {
      try {
        await fastify.webhookProcessor.processWebhook(
          'custom',
          request.headers as Record<string, string>,
          {
            source: request.params.source,
            ...request.body,
          },
          request.rawBody
        );

        return { received: true };
      } catch (error) {
        logger.error('Custom webhook error', { error });
        return reply.code(400).send({ error: 'Webhook processing failed' });
      }
    }
  );

  // Get webhook events
  fastify.get<{
    Querystring: {
      source?: string;
      type?: string;
      processed?: string;
      startDate?: string;
      endDate?: string;
      limit?: string;
    };
  }>(
    '/events',
    {
      schema: {
        querystring: Type.Object({
          source: Type.Optional(Type.String()),
          type: Type.Optional(Type.String()),
          processed: Type.Optional(Type.String()),
          startDate: Type.Optional(Type.String({ format: 'date-time' })),
          endDate: Type.Optional(Type.String({ format: 'date-time' })),
          limit: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const filters = {
        source: request.query.source,
        type: request.query.type,
        processed: request.query.processed === 'true',
        startDate: request.query.startDate 
          ? new Date(request.query.startDate) 
          : undefined,
        endDate: request.query.endDate 
          ? new Date(request.query.endDate) 
          : undefined,
        limit: request.query.limit ? parseInt(request.query.limit) : undefined,
      };

      const events = await fastify.webhookProcessor.getWebhookEvents(filters);

      return {
        events,
        total: events.length,
      };
    }
  );

  // Retry webhook
  fastify.post<{
    Params: { eventId: string };
  }>(
    '/events/:eventId/retry',
    {
      schema: {
        params: Type.Object({
          eventId: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        await fastify.webhookProcessor.retryWebhook(request.params.eventId);

        return {
          message: 'Webhook retry initiated',
        };
      } catch (error) {
        logger.error('Webhook retry failed', { error });
        return reply.code(400).send({ 
          error: (error as Error).message 
        });
      }
    }
  );

  // Get webhook statistics
  fastify.get<{
    Querystring: {
      source?: string;
      startDate?: string;
      endDate?: string;
    };
  }>(
    '/statistics',
    {
      schema: {
        querystring: Type.Object({
          source: Type.Optional(Type.String()),
          startDate: Type.Optional(Type.String({ format: 'date-time' })),
          endDate: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const timeRange = request.query.startDate && request.query.endDate
        ? {
            start: new Date(request.query.startDate),
            end: new Date(request.query.endDate),
          }
        : undefined;

      const statistics = await fastify.webhookProcessor.getStatistics(
        request.query.source,
        timeRange
      );

      return statistics;
    }
  );
}

// Import logger
import { createServiceLogger } from '../logger';
const logger = createServiceLogger('webhook-routes');