/**
 * Learning API Routes
 */

import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { LearningEvent } from '../services/learning-history-service';

// Schema definitions
const LearningEventSchema = Type.Object({
  serviceId: Type.String(),
  agentId: Type.String(),
  eventType: Type.Union([
    Type.Literal('training'),
    Type.Literal('feedback'),
    Type.Literal('correction'),
    Type.Literal('reinforcement'),
    Type.Literal('adaptation'),
  ]),
  domain: Type.String(),
  metadata: Type.Object({
    timestamp: Type.String({ format: 'date-time' }),
    sessionId: Type.Optional(Type.String()),
    userId: Type.Optional(Type.String()),
    modelVersion: Type.Optional(Type.String()),
    parentEventId: Type.Optional(Type.String()),
    importance: Type.Number({ minimum: 0, maximum: 10 }),
  }),
  input: Type.Object({
    data: Type.Any(),
    context: Type.Optional(Type.Any()),
    parameters: Type.Optional(Type.Any()),
  }),
  output: Type.Object({
    prediction: Type.Any(),
    confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    alternatives: Type.Optional(Type.Array(Type.Any())),
  }),
  feedback: Type.Optional(
    Type.Object({
      rating: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
      correct: Type.Optional(Type.Boolean()),
      improved: Type.Optional(Type.Any()),
      explanation: Type.Optional(Type.String()),
    })
  ),
  impact: Type.Object({
    modelUpdated: Type.Boolean(),
    performanceChange: Type.Optional(Type.Number()),
    affectedModels: Type.Array(Type.String()),
  }),
  metrics: Type.Optional(
    Type.Object({
      processingTime: Type.Number(),
      tokensUsed: Type.Optional(Type.Number()),
      cost: Type.Optional(Type.Number()),
    })
  ),
});

const LearningHistoryQuerySchema = Type.Object({
  serviceId: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  domain: Type.Optional(Type.String()),
  eventType: Type.Optional(Type.String()),
  startDate: Type.Optional(Type.String({ format: 'date-time' })),
  endDate: Type.Optional(Type.String({ format: 'date-time' })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
});

type LearningEventInput = Static<typeof LearningEventSchema>;
type LearningHistoryQueryInput = Static<typeof LearningHistoryQuerySchema>;

export default async function learningRoutes(fastify: FastifyInstance) {
  // Record a learning event
  fastify.post<{ Body: LearningEventInput }>(
    '/events',
    {
      schema: {
        body: LearningEventSchema,
        response: {
          200: Type.Object({
            id: Type.String(),
            message: Type.String(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const event = request.body;
      
      // Convert string date to Date object
      event.metadata.timestamp = new Date(event.metadata.timestamp);

      const recordedEvent = await fastify.learningHistory.recordLearningEvent(event);

      // Sync with other services
      await fastify.crossServiceSync.syncLearningEvent(recordedEvent);

      // Track in analytics
      await fastify.analyticsEngine.trackEvent(
        'learning_event_recorded',
        event.domain,
        {
          eventType: event.eventType,
          confidence: event.output.confidence,
          hasFeedback: !!event.feedback,
        }
      );

      return {
        id: recordedEvent.id,
        message: 'Learning event recorded successfully',
      };
    }
  );

  // Get learning history
  fastify.post<{ Body: LearningHistoryQueryInput }>(
    '/history',
    {
      schema: {
        body: LearningHistoryQuerySchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const query = {
        ...request.body,
        startDate: request.body.startDate ? new Date(request.body.startDate) : undefined,
        endDate: request.body.endDate ? new Date(request.body.endDate) : undefined,
      };

      const events = await fastify.learningHistory.getLearningHistory(query);

      return {
        events,
        total: events.length,
      };
    }
  );

  // Get learning patterns
  fastify.get<{
    Params: { domain: string };
    Querystring: { minFrequency?: string };
  }>(
    '/patterns/:domain',
    {
      schema: {
        params: Type.Object({
          domain: Type.String(),
        }),
        querystring: Type.Object({
          minFrequency: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain } = request.params;
      const minFrequency = request.query.minFrequency 
        ? parseInt(request.query.minFrequency) 
        : 5;

      const patterns = await fastify.learningHistory.getLearningPatterns(
        domain,
        minFrequency
      );

      return {
        patterns,
        total: patterns.length,
      };
    }
  );

  // Get learning metrics
  fastify.get<{
    Params: { domain: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>(
    '/metrics/:domain',
    {
      schema: {
        params: Type.Object({
          domain: Type.String(),
        }),
        querystring: Type.Object({
          startDate: Type.Optional(Type.String({ format: 'date-time' })),
          endDate: Type.Optional(Type.String({ format: 'date-time' })),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain } = request.params;
      const { startDate, endDate } = request.query;

      const timeframe = {
        start: startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: endDate ? new Date(endDate) : new Date(),
      };

      const metrics = await fastify.learningHistory.getLearningMetrics(
        domain,
        timeframe
      );

      return metrics;
    }
  );

  // Analyze learning trends
  fastify.get<{
    Params: { domain: string };
    Querystring: { periods?: string };
  }>(
    '/trends/:domain',
    {
      schema: {
        params: Type.Object({
          domain: Type.String(),
        }),
        querystring: Type.Object({
          periods: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain } = request.params;
      const periods = request.query.periods ? parseInt(request.query.periods) : 7;

      const trends = await fastify.learningHistory.analyzeLearningTrends(
        domain,
        periods
      );

      return trends;
    }
  );

  // Get learning recommendations
  fastify.get<{ Params: { domain: string } }>(
    '/recommendations/:domain',
    {
      schema: {
        params: Type.Object({
          domain: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain } = request.params;

      const recommendations = await fastify.learningHistory.getLearningRecommendations(
        domain
      );

      return recommendations;
    }
  );

  // Record feedback for a session
  fastify.post<{
    Body: {
      domain: string;
      sessionId: string;
      feedback: {
        rating?: number;
        correct?: boolean;
        improved?: any;
        explanation?: string;
      };
    };
  }>(
    '/feedback',
    {
      schema: {
        body: Type.Object({
          domain: Type.String(),
          sessionId: Type.String(),
          feedback: Type.Object({
            rating: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
            correct: Type.Optional(Type.Boolean()),
            improved: Type.Optional(Type.Any()),
            explanation: Type.Optional(Type.String()),
          }),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain, sessionId, feedback } = request.body;

      // Record feedback in learning history
      await fastify.learningHistory.recordFeedback(domain, sessionId, feedback);

      // Track in analytics
      await fastify.analyticsEngine.trackEvent('feedback_recorded', domain, {
        sessionId,
        hasRating: !!feedback.rating,
        rating: feedback.rating,
        correct: feedback.correct,
      });

      return {
        message: 'Feedback recorded successfully',
      };
    }
  );

  // Get learning statistics dashboard
  fastify.get<{ Querystring: { domain?: string } }>(
    '/dashboard',
    {
      schema: {
        querystring: Type.Object({
          domain: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain } = request.query;

      // Get comprehensive statistics
      const [stats, recentPatterns, trends] = await Promise.all([
        fastify.learningHistory.getLearningStats(domain),
        domain
          ? fastify.learningHistory.getLearningPatterns(domain, 1)
          : Promise.resolve([]),
        domain
          ? fastify.learningHistory.analyzeLearningTrends(domain, 7)
          : Promise.resolve(null),
      ]);

      return {
        statistics: stats,
        recentPatterns: recentPatterns.slice(0, 10),
        trends,
        timestamp: new Date(),
      };
    }
  );
}