import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '@fineprintai/shared-middleware';
import { metricsService } from '../index';

const metricsRoutes = async (server: FastifyInstance) => {
  // Add auth middleware to all routes
  server.addHook('preHandler', authMiddleware);

  // Get Prometheus-format metrics
  server.get('/prometheus', {
    schema: {
      tags: ['Metrics'],
      summary: 'Get Prometheus-format metrics',
      description: 'Returns metrics in Prometheus exposition format',
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics',
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!metricsService) {
      reply.status(503);
      return { error: 'Metrics service not available' };
    }

    const metrics = metricsService.getPrometheusMetrics();
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return metrics;
  });

  // Get JSON metrics snapshot
  server.get('/snapshot', {
    schema: {
      tags: ['Metrics'],
      summary: 'Get JSON metrics snapshot',
      description: 'Returns current metrics snapshot in JSON format',
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
            counters: { type: 'array' },
            gauges: { type: 'array' },
            histograms: { type: 'array' },
            uptime: { type: 'number' },
            memory: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!metricsService) {
      reply.status(503);
      return { error: 'Metrics service not available' };
    }

    return metricsService.getMetricsSnapshot();
  });

  // Get specific counter
  server.get('/counter/:name', {
    schema: {
      tags: ['Metrics'],
      summary: 'Get specific counter value',
      description: 'Returns the current value of a specific counter',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      querystring: {
        type: 'object',
        properties: {
          labels: { type: 'string', description: 'JSON string of labels' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' },
            labels: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Params: { name: string };
    Querystring: { labels?: string };
  }>, reply: FastifyReply) => {
    if (!metricsService) {
      reply.status(503);
      return { error: 'Metrics service not available' };
    }

    try {
      const { name } = request.params;
      const labels = request.query.labels ? JSON.parse(request.query.labels) : {};
      const value = metricsService.getCounter(name, labels);

      return { name, value, labels };
    } catch (error) {
      reply.status(400);
      return { error: 'Invalid labels format' };
    }
  });

  // Get specific gauge
  server.get('/gauge/:name', {
    schema: {
      tags: ['Metrics'],
      summary: 'Get specific gauge value',
      description: 'Returns the current value of a specific gauge',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      querystring: {
        type: 'object',
        properties: {
          labels: { type: 'string', description: 'JSON string of labels' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' },
            labels: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Params: { name: string };
    Querystring: { labels?: string };
  }>, reply: FastifyReply) => {
    if (!metricsService) {
      reply.status(503);
      return { error: 'Metrics service not available' };
    }

    try {
      const { name } = request.params;
      const labels = request.query.labels ? JSON.parse(request.query.labels) : {};
      const value = metricsService.getGauge(name, labels);

      return { name, value, labels };
    } catch (error) {
      reply.status(400);
      return { error: 'Invalid labels format' };
    }
  });

  // Get histogram statistics
  server.get('/histogram/:name', {
    schema: {
      tags: ['Metrics'],
      summary: 'Get histogram statistics',
      description: 'Returns statistics for a specific histogram',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      querystring: {
        type: 'object',
        properties: {
          labels: { type: 'string', description: 'JSON string of labels' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            labels: { type: 'object' },
            stats: {
              type: 'object',
              properties: {
                count: { type: 'number' },
                sum: { type: 'number' },
                avg: { type: 'number' },
                min: { type: 'number' },
                max: { type: 'number' },
                p50: { type: 'number' },
                p95: { type: 'number' },
                p99: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Params: { name: string };
    Querystring: { labels?: string };
  }>, reply: FastifyReply) => {
    if (!metricsService) {
      reply.status(503);
      return { error: 'Metrics service not available' };
    }

    try {
      const { name } = request.params;
      const labels = request.query.labels ? JSON.parse(request.query.labels) : {};
      const stats = metricsService.getHistogramStats(name, labels);

      return { name, labels, stats };
    } catch (error) {
      reply.status(400);
      return { error: 'Invalid labels format' };
    }
  });

  // Reset specific counter
  server.post('/counter/:name/reset', {
    schema: {
      tags: ['Metrics'],
      summary: 'Reset specific counter',
      description: 'Resets a specific counter to zero',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      body: {
        type: 'object',
        properties: {
          labels: { type: 'object' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            name: { type: 'string' },
            labels: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest<{
    Params: { name: string };
    Body: { labels?: Record<string, string> };
  }>, reply: FastifyReply) => {
    if (!metricsService) {
      reply.status(503);
      return { error: 'Metrics service not available' };
    }

    const { name } = request.params;
    const labels = request.body.labels || {};

    metricsService.resetCounter(name, labels);

    return { success: true, name, labels };
  });
};

export default metricsRoutes;