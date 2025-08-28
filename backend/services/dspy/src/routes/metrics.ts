import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  const { metricsCollector } = fastify;

  // Request/Response Schemas
  const GetMetricsQuery = z.object({
    time_range: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
    module_name: z.string().optional(),
    operation: z.enum(['predict', 'compile', 'optimize']).optional(),
    include_trends: z.boolean().optional().default(true),
  });

  const AlertsQuery = z.object({
    status: z.enum(['active', 'resolved', 'all']).optional().default('active'),
    type: z.enum(['latency_spike', 'accuracy_drop', 'error_rate_high', 'token_usage_high']).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    limit: z.number().min(1).max(500).optional().default(100),
  });

  const UpdateThresholdsRequest = z.object({
    latency_ms: z.number().min(100).max(60000).optional(),
    error_rate: z.number().min(0).max(1).optional(),
    accuracy_drop: z.number().min(0).max(1).optional(),
    token_usage_per_request: z.number().min(100).max(100000).optional(),
  });

  // Get DSPy Metrics Summary
  fastify.get('/summary', {
    schema: {
      querystring: GetMetricsQuery,
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const query = GetMetricsQuery.parse(request.query);
      
      // Calculate time range
      const now = new Date();
      const timeRangeMs = {
        '1h': 3600000,
        '6h': 21600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
      };
      
      const startTime = new Date(now.getTime() - timeRangeMs[query.time_range]);
      
      // Get metrics summary
      const summary = await metricsCollector.getMetricsSummary({
        start: startTime.toISOString(),
        end: now.toISOString(),
      });

      // Filter by module if specified
      let filteredSummary = summary;
      if (query.module_name) {
        const moduleUsage = summary.modules_by_usage[query.module_name] || 0;
        filteredSummary = {
          ...summary,
          total_operations: moduleUsage,
          modules_by_usage: { [query.module_name]: moduleUsage },
        };
      }

      // Filter by operation if specified
      if (query.operation) {
        const operationCount = summary.operations_by_type[query.operation] || 0;
        filteredSummary = {
          ...filteredSummary,
          total_operations: operationCount,
          operations_by_type: { [query.operation]: operationCount },
        };
      }

      reply.send({
        time_range: query.time_range,
        start_time: startTime.toISOString(),
        end_time: now.toISOString(),
        filters: {
          module_name: query.module_name,
          operation: query.operation,
        },
        metrics: filteredSummary,
        generated_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to get metrics summary', { error: error.message });
      reply.code(500).send({
        error: 'MetricsSummaryError',
        message: 'Failed to retrieve metrics summary',
      });
    }
  });

  // Get Performance Trends
  fastify.get('/trends', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          granularity: { 
            type: 'string', 
            enum: ['hourly', 'daily', 'weekly'],
            default: 'hourly'
          },
          metric: {
            type: 'string',
            enum: ['operations', 'success_rate', 'latency', 'accuracy'],
            default: 'operations'
          },
          module_name: { type: 'string' },
          days: { type: 'number', minimum: 1, maximum: 90, default: 7 },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { granularity, metric, module_name, days } = request.query as {
        granularity?: 'hourly' | 'daily' | 'weekly';
        metric?: string;
        module_name?: string;
        days?: number;
      };

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - (days || 7) * 24 * 60 * 60 * 1000);

      const summary = await metricsCollector.getMetricsSummary({
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      });

      const trends = summary.performance_trends[granularity || 'hourly'];

      // Filter and format trend data
      const trendData = trends.map(point => ({
        timestamp: point.timestamp,
        value: getMetricValue(point, metric || 'operations'),
        operations: point.operations,
        success_rate: point.success_rate,
        average_latency: point.average_latency,
        average_accuracy: point.average_accuracy,
      }));

      reply.send({
        granularity: granularity || 'hourly',
        metric: metric || 'operations',
        module_filter: module_name,
        time_range: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          days: days || 7,
        },
        data_points: trendData.length,
        trends: trendData,
      });

    } catch (error) {
      fastify.log.error('Failed to get performance trends', { error: error.message });
      reply.code(500).send({
        error: 'TrendsError',
        message: 'Failed to retrieve performance trends',
      });
    }
  });

  // Helper function to extract metric value
  function getMetricValue(point: any, metric: string): number {
    switch (metric) {
      case 'operations':
        return point.operations;
      case 'success_rate':
        return point.success_rate;
      case 'latency':
        return point.average_latency;
      case 'accuracy':
        return point.average_accuracy;
      default:
        return point.operations;
    }
  }

  // Get Performance Alerts
  fastify.get('/alerts', {
    schema: {
      querystring: AlertsQuery,
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const query = AlertsQuery.parse(request.query);
      
      let alerts = query.status === 'active' 
        ? metricsCollector.getActiveAlerts()
        : metricsCollector.getAllAlerts(query.limit);

      // Apply filters
      if (query.type) {
        alerts = alerts.filter(alert => alert.type === query.type);
      }
      
      if (query.severity) {
        alerts = alerts.filter(alert => alert.severity === query.severity);
      }

      if (query.status === 'resolved') {
        alerts = alerts.filter(alert => alert.resolved);
      } else if (query.status === 'active') {
        alerts = alerts.filter(alert => !alert.resolved);
      }

      // Limit results
      const limitedAlerts = alerts.slice(0, query.limit);

      reply.send({
        filters: {
          status: query.status,
          type: query.type,
          severity: query.severity,
        },
        alerts: limitedAlerts,
        total_alerts: alerts.length,
        returned: limitedAlerts.length,
        summary: {
          active_alerts: alerts.filter(a => !a.resolved).length,
          resolved_alerts: alerts.filter(a => a.resolved).length,
          by_severity: getAlertsBySeverity(alerts),
          by_type: getAlertsByType(alerts),
        },
      });

    } catch (error) {
      fastify.log.error('Failed to get alerts', { error: error.message });
      reply.code(500).send({
        error: 'AlertsError',
        message: 'Failed to retrieve performance alerts',
      });
    }
  });

  // Helper functions for alert summaries
  function getAlertsBySeverity(alerts: any[]): Record<string, number> {
    const summary: Record<string, number> = {};
    alerts.forEach(alert => {
      summary[alert.severity] = (summary[alert.severity] || 0) + 1;
    });
    return summary;
  }

  function getAlertsByType(alerts: any[]): Record<string, number> {
    const summary: Record<string, number> = {};
    alerts.forEach(alert => {
      summary[alert.type] = (summary[alert.type] || 0) + 1;
    });
    return summary;
  }

  // Resolve Alert
  fastify.post('/alerts/:alertId/resolve', {
    schema: {
      params: {
        type: 'object',
        properties: {
          alertId: { type: 'string' },
        },
        required: ['alertId'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { alertId } = request.params as { alertId: string };
      
      const resolved = await metricsCollector.resolveAlert(alertId);
      
      if (!resolved) {
        reply.code(404).send({
          error: 'AlertNotFound',
          message: `Alert '${alertId}' not found`,
        });
        return;
      }

      reply.send({
        message: `Alert '${alertId}' has been resolved`,
        resolved_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to resolve alert', { error: error.message });
      reply.code(500).send({
        error: 'AlertResolutionError',
        message: 'Failed to resolve alert',
      });
    }
  });

  // Get Current Performance Thresholds
  fastify.get('/thresholds', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const thresholds = metricsCollector.getThresholds();
      
      reply.send({
        thresholds,
        description: {
          latency_ms: 'Maximum acceptable average latency in milliseconds',
          error_rate: 'Maximum acceptable error rate (0.0 to 1.0)',
          accuracy_drop: 'Maximum acceptable accuracy drop percentage (0.0 to 1.0)',
          token_usage_per_request: 'Maximum acceptable tokens per request',
        },
        last_updated: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to get thresholds', { error: error.message });
      reply.code(500).send({
        error: 'ThresholdsError',
        message: 'Failed to retrieve performance thresholds',
      });
    }
  });

  // Update Performance Thresholds
  fastify.put('/thresholds', {
    schema: {
      body: UpdateThresholdsRequest,
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const updates = UpdateThresholdsRequest.parse(request.body);
      
      // Update thresholds
      metricsCollector.updateThresholds(updates);
      
      const newThresholds = metricsCollector.getThresholds();

      reply.send({
        message: 'Performance thresholds updated successfully',
        updated_thresholds: newThresholds,
        updated_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to update thresholds', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'ThresholdUpdateError',
        message: statusCode === 500 ? 'Failed to update thresholds' : error.message,
      });
    }
  });

  // Get Module-specific Metrics
  fastify.get('/modules/:moduleName', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleName: { type: 'string' },
        },
        required: ['moduleName'],
      },
      querystring: {
        type: 'object',
        properties: {
          time_range: { 
            type: 'string', 
            enum: ['1h', '6h', '24h', '7d', '30d'],
            default: '24h'
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleName } = request.params as { moduleName: string };
      const { time_range } = request.query as { time_range?: string };
      
      // Calculate time range
      const now = new Date();
      const timeRangeMs = {
        '1h': 3600000,
        '6h': 21600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
      };
      
      const startTime = new Date(now.getTime() - timeRangeMs[time_range || '24h']);
      
      // Get overall metrics first
      const summary = await metricsCollector.getMetricsSummary({
        start: startTime.toISOString(),
        end: now.toISOString(),
      });

      // Extract module-specific metrics
      const moduleUsage = summary.modules_by_usage[moduleName] || 0;
      const modulePercentage = summary.total_operations > 0 
        ? (moduleUsage / summary.total_operations) * 100 
        : 0;

      reply.send({
        module_name: moduleName,
        time_range: time_range || '24h',
        period: {
          start: startTime.toISOString(),
          end: now.toISOString(),
        },
        metrics: {
          total_operations: moduleUsage,
          percentage_of_total: modulePercentage,
          // Note: In a real implementation, we would filter the original metrics
          // to get module-specific success rate, latency, etc.
          estimated_success_rate: summary.success_rate,
          estimated_average_latency_ms: summary.average_latency_ms,
          estimated_average_accuracy: summary.average_accuracy,
        },
        comparison: {
          global_average_latency: summary.average_latency_ms,
          global_success_rate: summary.success_rate,
          global_average_accuracy: summary.average_accuracy,
        },
        generated_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to get module metrics', { error: error.message });
      reply.code(500).send({
        error: 'ModuleMetricsError',
        message: 'Failed to retrieve module-specific metrics',
      });
    }
  });

  // Export Metrics Data
  fastify.get('/export', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
          time_range: { 
            type: 'string', 
            enum: ['1h', '6h', '24h', '7d', '30d'],
            default: '24h'
          },
          include_raw_data: { type: 'boolean', default: false },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { format, time_range, include_raw_data } = request.query as {
        format?: 'json' | 'csv';
        time_range?: string;
        include_raw_data?: boolean;
      };

      // Calculate time range
      const now = new Date();
      const timeRangeMs = {
        '1h': 3600000,
        '6h': 21600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
      };
      
      const startTime = new Date(now.getTime() - timeRangeMs[time_range || '24h']);
      
      // Get metrics summary
      const summary = await metricsCollector.getMetricsSummary({
        start: startTime.toISOString(),
        end: now.toISOString(),
      });

      const exportData = {
        export_metadata: {
          generated_at: new Date().toISOString(),
          time_range: time_range || '24h',
          period: {
            start: startTime.toISOString(),
            end: now.toISOString(),
          },
          format: format || 'json',
          include_raw_data: include_raw_data || false,
        },
        summary,
        // Raw data would be included here if requested
        // raw_metrics: include_raw_data ? rawMetrics : undefined,
      };

      if (format === 'csv') {
        // Convert to CSV format
        const csvContent = convertMetricsToCSV(exportData);
        
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="dspy_metrics_${time_range}_${Date.now()}.csv"`);
        reply.send(csvContent);
      } else {
        // JSON format
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="dspy_metrics_${time_range}_${Date.now()}.json"`);
        reply.send(exportData);
      }

    } catch (error) {
      fastify.log.error('Failed to export metrics', { error: error.message });
      reply.code(500).send({
        error: 'MetricsExportError',
        message: 'Failed to export metrics data',
      });
    }
  });

  // Helper function to convert metrics to CSV
  function convertMetricsToCSV(data: any): string {
    const summary = data.summary;
    
    let csv = 'Metric,Value\n';
    csv += `Total Operations,${summary.total_operations}\n`;
    csv += `Success Rate,${summary.success_rate}\n`;
    csv += `Average Latency (ms),${summary.average_latency_ms}\n`;
    csv += `Average Accuracy,${summary.average_accuracy}\n`;
    csv += `Average Confidence,${summary.average_confidence}\n`;
    csv += `Total Token Usage,${summary.total_token_usage}\n`;
    
    // Add operations by type
    csv += '\nOperation Type,Count\n';
    Object.entries(summary.operations_by_type).forEach(([type, count]) => {
      csv += `${type},${count}\n`;
    });
    
    // Add modules by usage
    csv += '\nModule,Usage Count\n';
    Object.entries(summary.modules_by_usage).forEach(([module, count]) => {
      csv += `${module},${count}\n`;
    });
    
    return csv;
  }

  // Real-time Metrics Stream (Server-Sent Events)
  fastify.get('/stream', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');
      reply.header('Access-Control-Allow-Origin', '*');

      // Send initial connection message
      reply.raw.write('data: {"type":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n');

      // Set up periodic metrics updates
      const interval = setInterval(async () => {
        try {
          const now = new Date();
          const oneHourAgo = new Date(now.getTime() - 3600000);
          
          const summary = await metricsCollector.getMetricsSummary({
            start: oneHourAgo.toISOString(),
            end: now.toISOString(),
          });

          const activeAlerts = metricsCollector.getActiveAlerts();

          const streamData = {
            type: 'metrics_update',
            timestamp: now.toISOString(),
            metrics: {
              total_operations: summary.total_operations,
              success_rate: summary.success_rate,
              average_latency_ms: summary.average_latency_ms,
              average_accuracy: summary.average_accuracy,
              active_alerts_count: activeAlerts.length,
            },
            alerts: activeAlerts.slice(0, 5), // Latest 5 alerts
          };

          reply.raw.write(`data: ${JSON.stringify(streamData)}\n\n`);
        } catch (error) {
          fastify.log.error('Error in metrics stream', { error: error.message });
        }
      }, 10000); // Update every 10 seconds

      // Clean up on connection close
      request.raw.on('close', () => {
        clearInterval(interval);
      });

    } catch (error) {
      fastify.log.error('Failed to start metrics stream', { error: error.message });
      reply.code(500).send({
        error: 'StreamError',
        message: 'Failed to start real-time metrics stream',
      });
    }
  });
};

export { metricsRoutes };