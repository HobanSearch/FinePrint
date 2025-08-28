/**
 * Analytics API Routes
 */

import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { AnalyticsQuery } from '../services/analytics-engine';

// Schema definitions
const AnalyticsQuerySchema = Type.Object({
  type: Type.Union([
    Type.Literal('realtime'),
    Type.Literal('historical'),
    Type.Literal('predictive'),
  ]),
  domain: Type.String(),
  metrics: Type.Array(Type.String()),
  timeRange: Type.Optional(
    Type.Object({
      start: Type.String({ format: 'date-time' }),
      end: Type.String({ format: 'date-time' }),
    })
  ),
  aggregation: Type.Optional(
    Type.Union([
      Type.Literal('sum'),
      Type.Literal('avg'),
      Type.Literal('min'),
      Type.Literal('max'),
      Type.Literal('count'),
    ])
  ),
  groupBy: Type.Optional(
    Type.Union([
      Type.Literal('hour'),
      Type.Literal('day'),
      Type.Literal('week'),
      Type.Literal('month'),
    ])
  ),
  filters: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const TrackEventSchema = Type.Object({
  eventName: Type.String(),
  domain: Type.String(),
  data: Type.Record(Type.String(), Type.Any()),
});

type AnalyticsQueryInput = Static<typeof AnalyticsQuerySchema>;
type TrackEventInput = Static<typeof TrackEventSchema>;

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // Execute analytics query
  fastify.post<{ Body: AnalyticsQueryInput }>(
    '/query',
    {
      schema: {
        body: AnalyticsQuerySchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const query: AnalyticsQuery = {
        ...request.body,
        timeRange: request.body.timeRange
          ? {
              start: new Date(request.body.timeRange.start),
              end: new Date(request.body.timeRange.end),
            }
          : undefined,
      };

      const results = await fastify.analyticsEngine.query(query);

      return {
        query,
        results,
        timestamp: new Date(),
      };
    }
  );

  // Get business metrics
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

      const timeRange = startDate && endDate
        ? {
            start: new Date(startDate),
            end: new Date(endDate),
          }
        : undefined;

      const metrics = await fastify.analyticsEngine.getBusinessMetrics(
        domain,
        timeRange
      );

      return metrics;
    }
  );

  // Get dashboard data
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

      const dashboardData = await fastify.analyticsEngine.getDashboardData(domain);

      return dashboardData;
    }
  );

  // Generate report
  fastify.get<{
    Params: {
      reportType: 'performance' | 'learning' | 'business' | 'executive';
      domain: string;
    };
    Querystring: {
      startDate: string;
      endDate: string;
    };
  }>(
    '/reports/:reportType/:domain',
    {
      schema: {
        params: Type.Object({
          reportType: Type.Union([
            Type.Literal('performance'),
            Type.Literal('learning'),
            Type.Literal('business'),
            Type.Literal('executive'),
          ]),
          domain: Type.String(),
        }),
        querystring: Type.Object({
          startDate: Type.String({ format: 'date-time' }),
          endDate: Type.String({ format: 'date-time' }),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { reportType, domain } = request.params;
      const { startDate, endDate } = request.query;

      const timeRange = {
        start: new Date(startDate),
        end: new Date(endDate),
      };

      const report = await fastify.analyticsEngine.generateReport(
        reportType,
        domain,
        timeRange
      );

      return {
        reportType,
        domain,
        timeRange,
        report,
        generatedAt: new Date(),
      };
    }
  );

  // Track custom event
  fastify.post<{ Body: TrackEventInput }>(
    '/events',
    {
      schema: {
        body: TrackEventSchema,
        response: {
          200: Type.Object({
            message: Type.String(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { eventName, domain, data } = request.body;

      await fastify.analyticsEngine.trackEvent(eventName, domain, data);

      return {
        message: 'Event tracked successfully',
      };
    }
  );

  // Get insights
  fastify.get<{
    Querystring: {
      domain?: string;
      type?: string;
      severity?: string;
      limit?: string;
    };
  }>(
    '/insights',
    {
      schema: {
        querystring: Type.Object({
          domain: Type.Optional(Type.String()),
          type: Type.Optional(Type.String()),
          severity: Type.Optional(Type.String()),
          limit: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { domain, type, severity, limit } = request.query;

      // This would need to be implemented in the analytics engine
      const insights = await fastify.analyticsEngine.getDashboardData(domain);

      return {
        insights: insights.insights,
        total: insights.insights.length,
      };
    }
  );

  // Get real-time metrics stream (WebSocket would be better for this)
  fastify.get<{ Querystring: { domain?: string } }>(
    '/realtime',
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

      const realtimeData = await fastify.analyticsEngine.query({
        type: 'realtime',
        domain: domain || 'all',
        metrics: [
          'active_agents',
          'requests_per_second',
          'average_latency',
          'error_rate',
        ],
      });

      return {
        metrics: realtimeData,
        timestamp: new Date(),
      };
    }
  );

  // Export analytics data
  fastify.get<{
    Querystring: {
      domain: string;
      format: 'json' | 'csv';
      startDate: string;
      endDate: string;
    };
  }>(
    '/export',
    {
      schema: {
        querystring: Type.Object({
          domain: Type.String(),
          format: Type.Union([Type.Literal('json'), Type.Literal('csv')]),
          startDate: Type.String({ format: 'date-time' }),
          endDate: Type.String({ format: 'date-time' }),
        }),
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin', 'analyst'])],
    },
    async (request, reply) => {
      const { domain, format, startDate, endDate } = request.query;

      const timeRange = {
        start: new Date(startDate),
        end: new Date(endDate),
      };

      // Get all data for export
      const [businessMetrics, learningMetrics, patterns] = await Promise.all([
        fastify.analyticsEngine.getBusinessMetrics(domain, timeRange),
        fastify.learningHistory.getLearningMetrics(domain, timeRange),
        fastify.learningHistory.getLearningPatterns(domain),
      ]);

      const exportData = {
        domain,
        timeRange,
        businessMetrics,
        learningMetrics,
        patterns,
        exportedAt: new Date(),
      };

      if (format === 'csv') {
        // Convert to CSV format (simplified)
        reply.type('text/csv');
        reply.header(
          'Content-Disposition',
          `attachment; filename="analytics-${domain}-${Date.now()}.csv"`
        );
        
        // This is a simplified CSV conversion
        const csv = Object.entries(exportData.businessMetrics.aiPerformance)
          .map(([key, value]) => `${key},${value}`)
          .join('\n');
        
        return csv;
      }

      // Default to JSON
      reply.type('application/json');
      reply.header(
        'Content-Disposition',
        `attachment; filename="analytics-${domain}-${Date.now()}.json"`
      );
      
      return exportData;
    }
  );
}