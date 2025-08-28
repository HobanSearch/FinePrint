/**
 * RESTful API routes for Fine Print AI Logging System
 * Provides comprehensive endpoints for log management, metrics, and analytics
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { v4 as uuidv4 } from 'uuid';

// Services
import { LoggerService } from '../services/logger-service';
import { MetricsService } from '../services/metrics-service';
import { TracingService } from '../services/tracing-service';
import { StreamingService } from '../services/streaming-service';
import { AnalyticsService } from '../services/analytics-service';
import { AlertingService } from '../services/alerting-service';

// Types
import {
  LogQueryRequest,
  LogQueryResponse,
  MetricsQueryRequest,
  MetricsQueryResponse,
  LogLevel,
  EventCategory,
  ServiceType,
  AlertRule,
  LogPattern,
} from '../types';

interface APIConfig {
  port: number;
  enableAPI: boolean;
  enableSwagger: boolean;
  enableCors: boolean;
  rateLimitPerMinute: number;
  enableAuth: boolean;
  jwtSecret?: string;
}

interface Services {
  logger: LoggerService;
  metrics: MetricsService;
  tracing: TracingService;
  streaming: StreamingService;
  analytics: AnalyticsService;
  alerting: AlertingService;
}

interface APIOptions {
  config: APIConfig;
  services: Services;
  database: PrismaClient;
}

export async function createAPI(options: APIOptions): Promise<FastifyInstance> {
  const { config, services, database } = options;
  
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
  });

  // Register plugins
  await fastify.register(helmet);
  
  if (config.enableCors) {
    await fastify.register(cors, {
      origin: true,
      credentials: true,
    });
  }

  await fastify.register(rateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
  });

  await fastify.register(websocket);

  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        services: {
          logger: true,
          metrics: true,
          tracing: true,
          streaming: true,
          analytics: true,
          alerting: true,
        },
      };

      return reply.code(200).send(health);
    } catch (error) {
      return reply.code(500).send({ error: 'Health check failed' });
    }
  });

  // === LOG MANAGEMENT ENDPOINTS ===

  // Query logs with filters
  fastify.post<{
    Body: LogQueryRequest;
    Reply: LogQueryResponse;
  }>('/api/v1/logs/query', async (request, reply) => {
    try {
      const {
        level,
        service,
        category,
        startTime,
        endTime,
        search,
        limit = 100,
        offset = 0,
        sort = 'desc',
        fields,
        context,
      } = request.body;

      const where: any = {};

      if (level && level.length > 0) {
        where.level = { in: level.map(l => l.toUpperCase()) };
      }

      if (service && service.length > 0) {
        where.service = { in: service };
      }

      if (category && category.length > 0) {
        where.category = { in: category.map(c => c.toUpperCase().replace('-', '_')) };
      }

      if (startTime || endTime) {
        where.timestamp = {};
        if (startTime) where.timestamp.gte = startTime;
        if (endTime) where.timestamp.lte = endTime;
      }

      if (search) {
        where.message = { contains: search, mode: 'insensitive' };
      }

      if (context) {
        if (context.requestId) where.requestId = context.requestId;
        if (context.userId) where.userId = context.userId;
        if (context.sessionId) where.sessionId = context.sessionId;
      }

      const [logs, total] = await Promise.all([
        database.logEntry.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { timestamp: sort === 'asc' ? 'asc' : 'desc' },
          select: fields ? Object.fromEntries(fields.map(f => [f, true])) : undefined,
        }),
        database.logEntry.count({ where }),
      ]);

      const response: LogQueryResponse = {
        logs: logs.map(log => ({
          id: log.id,
          timestamp: log.timestamp,
          level: log.level.toLowerCase() as LogLevel,
          message: log.message,
          category: log.category.toLowerCase().replace('_', '-') as EventCategory,
          context: {
            service: log.service as ServiceType,
            environment: log.environment as any,
            version: log.version,
            component: log.component,
            operation: log.operation,
            duration: log.duration,
            requestId: log.requestId || '',
            sessionId: log.sessionId,
            userId: log.userId,
            agentId: log.agentId,
            workflowId: log.workflowId,
            parentSpanId: log.parentSpanId,
            traceId: log.traceId,
            causationId: log.causationId,
            correlationId: log.correlationId,
            businessContext: log.businessContext as any,
            technicalContext: log.technicalContext as any,
            securityContext: log.securityContext as any,
            metadata: log.metadata as any,
            tags: log.tags,
          },
          error: log.errorDetails as any,
          stackTrace: log.stackTrace,
          fingerprint: log.fingerprint,
          hash: log.hash,
        })),
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
      };

      return reply.code(200).send(response);
    } catch (error) {
      services.logger.error('Failed to query logs', {
        service: 'api' as ServiceType,
        environment: 'production' as any,
      }, error as Error);
      
      return reply.code(500).send({ error: 'Failed to query logs' });
    }
  });

  // Get log statistics
  fastify.get('/api/v1/logs/stats', async (request, reply) => {
    try {
      const stats = services.analytics.getStatistics();
      return reply.code(200).send(stats);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get log statistics' });
    }
  });

  // Export logs
  fastify.post('/api/v1/logs/export', async (request, reply) => {
    try {
      // Implementation for log export (CSV, JSON, etc.)
      return reply.code(200).send({ message: 'Export functionality not yet implemented' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to export logs' });
    }
  });

  // === METRICS ENDPOINTS ===

  // Query metrics
  fastify.post<{
    Body: MetricsQueryRequest;
    Reply: MetricsQueryResponse;
  }>('/api/v1/metrics/query', async (request, reply) => {
    try {
      const { metrics: metricNames, startTime, endTime, granularity, groupBy, filters } = request.body;

      const response: MetricsQueryResponse = {
        metrics: [],
        aggregations: {},
      };

      for (const metricName of metricNames) {
        const timeSeriesData = services.metrics.getTimeSeriesData(metricName);
        if (timeSeriesData) {
          // Filter by time range
          const filteredPoints = timeSeriesData.points.filter(point => {
            return point.timestamp >= startTime && point.timestamp <= endTime;
          });

          response.metrics.push({
            name: metricName,
            data: filteredPoints,
          });
        }
      }

      return reply.code(200).send(response);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to query metrics' });
    }
  });

  // Get Prometheus metrics
  fastify.get('/api/v1/metrics/prometheus', async (request, reply) => {
    try {
      const prometheusMetrics = await services.metrics.getPrometheusMetrics();
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .code(200)
        .send(prometheusMetrics);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get Prometheus metrics' });
    }
  });

  // Get business KPIs
  fastify.get('/api/v1/metrics/kpis', async (request, reply) => {
    try {
      const kpis = services.metrics.getBusinessKPIs();
      return reply.code(200).send(kpis);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get business KPIs' });
    }
  });

  // Get Fine Print specific metrics
  fastify.get('/api/v1/metrics/fineprint', async (request, reply) => {
    try {
      const finePrintMetrics = services.metrics.getFinePrintMetrics();
      return reply.code(200).send(finePrintMetrics);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get Fine Print metrics' });
    }
  });

  // === TRACING ENDPOINTS ===

  // Get trace statistics
  fastify.get('/api/v1/tracing/stats', async (request, reply) => {
    try {
      const stats = services.tracing.getTraceStatistics();
      return reply.code(200).send(stats);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get trace statistics' });
    }
  });

  // === ANALYTICS ENDPOINTS ===

  // Get detected patterns
  fastify.get('/api/v1/analytics/patterns', async (request, reply) => {
    try {
      const patterns = services.analytics.getPatterns();
      return reply.code(200).send(patterns);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get patterns' });
    }
  });

  // Add custom pattern
  fastify.post<{
    Body: Omit<LogPattern, 'id' | 'frequency' | 'lastSeen'>;
  }>('/api/v1/analytics/patterns', async (request, reply) => {
    try {
      services.analytics.addPattern(request.body);
      return reply.code(201).send({ message: 'Pattern added successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to add pattern' });
    }
  });

  // Remove pattern
  fastify.delete<{
    Params: { patternId: string };
  }>('/api/v1/analytics/patterns/:patternId', async (request, reply) => {
    try {
      services.analytics.removePattern(request.params.patternId);
      return reply.code(200).send({ message: 'Pattern removed successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to remove pattern' });
    }
  });

  // Get anomalies
  fastify.get('/api/v1/analytics/anomalies', async (request, reply) => {
    try {
      const anomalies = services.analytics.getAnomalies();
      return reply.code(200).send(anomalies);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get anomalies' });
    }
  });

  // Get trends
  fastify.get('/api/v1/analytics/trends', async (request, reply) => {
    try {
      const trends = services.analytics.getTrends();
      return reply.code(200).send(trends);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get trends' });
    }
  });

  // Get business insights
  fastify.get('/api/v1/analytics/insights', async (request, reply) => {
    try {
      const insights = services.analytics.getBusinessInsights();
      return reply.code(200).send(insights);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get business insights' });
    }
  });

  // Perform comprehensive analysis
  fastify.post('/api/v1/analytics/analyze', async (request, reply) => {
    try {
      const results = await services.analytics.performComprehensiveAnalysis();
      return reply.code(200).send(results);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to perform analysis' });
    }
  });

  // === ALERTING ENDPOINTS ===

  // Get alert rules
  fastify.get('/api/v1/alerts/rules', async (request, reply) => {
    try {
      const rules = services.alerting.getAlertRules();
      return reply.code(200).send(rules);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get alert rules' });
    }
  });

  // Add alert rule
  fastify.post<{
    Body: AlertRule;
  }>('/api/v1/alerts/rules', async (request, reply) => {
    try {
      services.alerting.addAlertRule(request.body);
      return reply.code(201).send({ message: 'Alert rule added successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to add alert rule' });
    }
  });

  // Update alert rule
  fastify.put<{
    Params: { ruleId: string };
    Body: Partial<AlertRule>;
  }>('/api/v1/alerts/rules/:ruleId', async (request, reply) => {
    try {
      services.alerting.updateAlertRule(request.params.ruleId, request.body);
      return reply.code(200).send({ message: 'Alert rule updated successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to update alert rule' });
    }
  });

  // Delete alert rule
  fastify.delete<{
    Params: { ruleId: string };
  }>('/api/v1/alerts/rules/:ruleId', async (request, reply) => {
    try {
      services.alerting.removeAlertRule(request.params.ruleId);
      return reply.code(200).send({ message: 'Alert rule deleted successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to delete alert rule' });
    }
  });

  // Get active alerts
  fastify.get('/api/v1/alerts/active', async (request, reply) => {
    try {
      const alerts = services.alerting.getActiveAlerts();
      return reply.code(200).send(alerts);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get active alerts' });
    }
  });

  // Acknowledge alert
  fastify.post<{
    Params: { alertId: string };
    Body: { acknowledgedBy: string };
  }>('/api/v1/alerts/:alertId/acknowledge', async (request, reply) => {
    try {
      services.alerting.acknowledgeAlert(request.params.alertId, request.body.acknowledgedBy);
      return reply.code(200).send({ message: 'Alert acknowledged successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to acknowledge alert' });
    }
  });

  // Resolve alert
  fastify.post<{
    Params: { alertId: string };
    Body: { resolvedBy: string };
  }>('/api/v1/alerts/:alertId/resolve', async (request, reply) => {
    try {
      services.alerting.resolveAlert(request.params.alertId, request.body.resolvedBy);
      return reply.code(200).send({ message: 'Alert resolved successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to resolve alert' });
    }
  });

  // Suppress alert
  fastify.post<{
    Params: { alertId: string };
    Body: { durationMinutes: number };
  }>('/api/v1/alerts/:alertId/suppress', async (request, reply) => {
    try {
      services.alerting.suppressAlert(request.params.alertId, request.body.durationMinutes);
      return reply.code(200).send({ message: 'Alert suppressed successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to suppress alert' });
    }
  });

  // Get alert statistics
  fastify.get('/api/v1/alerts/stats', async (request, reply) => {
    try {
      const stats = services.alerting.getAlertStatistics();
      return reply.code(200).send(stats);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get alert statistics' });
    }
  });

  // === STREAMING ENDPOINTS ===

  // WebSocket endpoint for real-time streaming
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      connection.socket.on('message', (message) => {
        // Handle incoming WebSocket messages
        try {
          const data = JSON.parse(message.toString());
          // Process subscription/unsubscription requests
          services.logger.debug('WebSocket message received', {
            service: 'api' as ServiceType,
            environment: 'production' as any,
            messageType: data.type,
          });
        } catch (error) {
          connection.socket.send(JSON.stringify({
            type: 'error',
            data: { error: 'Invalid JSON message' },
          }));
        }
      });

      connection.socket.send(JSON.stringify({
        type: 'connected',
        data: { message: 'Connected to Fine Print AI Logging System' },
      }));
    });
  });

  // Get streaming statistics
  fastify.get('/api/v1/streaming/stats', async (request, reply) => {
    try {
      const stats = services.streaming.getConnectionStats();
      return reply.code(200).send(stats);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get streaming statistics' });
    }
  });

  // Get channel statistics
  fastify.get('/api/v1/streaming/channels', async (request, reply) => {
    try {
      const channels = services.streaming.getChannelStats();
      return reply.code(200).send(channels);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get channel statistics' });
    }
  });

  // === SYSTEM ENDPOINTS ===

  // Get comprehensive system statistics
  fastify.get('/api/v1/system/stats', async (request, reply) => {
    try {
      const stats = {
        logs: services.analytics.getStatistics(),
        metrics: services.metrics.getFinePrintMetrics(),
        traces: services.tracing.getTraceStatistics(),
        alerts: services.alerting.getAlertStatistics(),
        streaming: services.streaming.getConnectionStats(),
        analytics: {
          patterns: services.analytics.getPatterns().length,
          anomalies: services.analytics.getAnomalies().length,
          insights: services.analytics.getBusinessInsights().length,
        },
      };
      
      return reply.code(200).send(stats);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get system statistics' });
    }
  });

  // System configuration
  fastify.get('/api/v1/system/config', async (request, reply) => {
    try {
      const config = {
        services: {
          logger: true,
          metrics: true,
          tracing: true,
          streaming: true,
          analytics: true,
          alerting: true,
        },
        version: '1.0.0',
        environment: 'production',
        timestamp: new Date(),
      };
      
      return reply.code(200).send(config);
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get system configuration' });
    }
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    services.logger.error('API error', {
      service: 'api' as ServiceType,
      environment: 'production' as any,
      url: request.url,
      method: request.method,
    }, error);

    reply.code(500).send({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date(),
    });
  });

  // Start server
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    services.logger.info(`API server listening on port ${config.port}`, {
      service: 'api' as ServiceType,
      environment: 'production' as any,
      port: config.port,
    });
  } catch (error) {
    services.logger.error('Failed to start API server', {
      service: 'api' as ServiceType,
      environment: 'production' as any,
      port: config.port,
    }, error as Error);
    throw error;
  }

  return fastify;
}