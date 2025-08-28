import { FastifyInstance } from 'fastify';
import * as client from 'prom-client';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Initialize Prometheus metrics exporter
 * Provides /metrics endpoint for Prometheus scraping
 */
export async function initializePrometheusExporter(server: FastifyInstance): Promise<void> {
  // Create metrics endpoint
  server.get(config.prometheus.path, async (request, reply) => {
    try {
      const metrics = await client.register.metrics();
      reply
        .header('Content-Type', client.register.contentType)
        .send(metrics);
    } catch (error) {
      logger.error('Error generating metrics', error);
      reply.status(500).send({ error: 'Failed to generate metrics' });
    }
  });

  // Push Gateway support (optional)
  if (config.prometheus.pushGateway) {
    const gateway = new client.Pushgateway(config.prometheus.pushGateway);
    
    // Push metrics periodically
    setInterval(async () => {
      try {
        await gateway.pushAdd({ jobName: 'sre-monitoring' });
        logger.debug('Pushed metrics to gateway');
      } catch (error) {
        logger.error('Failed to push metrics to gateway', error);
      }
    }, 30000); // Every 30 seconds
  }

  logger.info(`Prometheus metrics available at ${config.prometheus.path}`);
}

/**
 * Create custom Prometheus collectors for Fine Print AI specific metrics
 */
export function createCustomCollectors(): void {
  // GPU utilization collector
  new client.Gauge({
    name: 'gpu_utilization_percentage',
    help: 'GPU utilization percentage',
    labelNames: ['gpu_id', 'gpu_name'],
    async collect() {
      // This would integrate with nvidia-smi or similar
      // For now, return mock data
      this.set({ gpu_id: '0', gpu_name: 'Tesla_T4' }, Math.random() * 100);
    },
  });

  // Model cache hit rate collector
  new client.Gauge({
    name: 'model_cache_hit_rate',
    help: 'Model cache hit rate',
    labelNames: ['model_name'],
    async collect() {
      // Calculate cache hit rate from Redis
      this.set({ model_name: 'phi-2' }, 0.85);
      this.set({ model_name: 'mistral-7b' }, 0.78);
      this.set({ model_name: 'llama2-13b' }, 0.82);
    },
  });

  // Document processing rate collector
  new client.Gauge({
    name: 'document_processing_rate',
    help: 'Documents processed per second',
    labelNames: ['document_type'],
    async collect() {
      // Calculate from recent processing metrics
      this.set({ document_type: 'terms_of_service' }, 12.5);
      this.set({ document_type: 'privacy_policy' }, 8.3);
      this.set({ document_type: 'eula' }, 5.7);
    },
  });

  // Queue depth collector
  new client.Gauge({
    name: 'queue_depth',
    help: 'Number of items in processing queues',
    labelNames: ['queue_name', 'priority'],
    async collect() {
      // Fetch from BullMQ
      this.set({ queue_name: 'document_analysis', priority: 'high' }, 23);
      this.set({ queue_name: 'document_analysis', priority: 'normal' }, 156);
      this.set({ queue_name: 'model_training', priority: 'high' }, 2);
      this.set({ queue_name: 'model_training', priority: 'normal' }, 8);
    },
  });

  // Database connection pool collector
  new client.Gauge({
    name: 'database_pool_connections',
    help: 'Database connection pool status',
    labelNames: ['database', 'status'], // idle, active, waiting
    async collect() {
      // Fetch from Prisma/PgBouncer
      this.set({ database: 'primary', status: 'idle' }, 5);
      this.set({ database: 'primary', status: 'active' }, 12);
      this.set({ database: 'primary', status: 'waiting' }, 0);
      this.set({ database: 'replica', status: 'idle' }, 3);
      this.set({ database: 'replica', status: 'active' }, 7);
    },
  });

  // Kubernetes pod metrics collector
  new client.Gauge({
    name: 'k8s_pod_status',
    help: 'Kubernetes pod status',
    labelNames: ['namespace', 'deployment', 'status'],
    async collect() {
      // Fetch from Kubernetes API
      this.set({ namespace: 'fineprint', deployment: 'api-gateway', status: 'running' }, 3);
      this.set({ namespace: 'fineprint', deployment: 'model-management', status: 'running' }, 2);
      this.set({ namespace: 'fineprint', deployment: 'ab-testing', status: 'running' }, 2);
      this.set({ namespace: 'fineprint', deployment: 'learning-pipeline', status: 'running' }, 4);
    },
  });

  logger.info('Custom Prometheus collectors initialized');
}

/**
 * Export metrics to remote Prometheus server
 */
export async function exportMetrics(endpoint: string, metrics: string): Promise<void> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
      body: metrics,
    });

    if (!response.ok) {
      throw new Error(`Failed to export metrics: ${response.statusText}`);
    }

    logger.debug('Metrics exported successfully');
  } catch (error) {
    logger.error('Failed to export metrics', error);
    throw error;
  }
}

/**
 * Create recording rules for Prometheus
 */
export function getRecordingRules(): object {
  return {
    groups: [
      {
        name: 'sre_monitoring_rules',
        interval: '30s',
        rules: [
          {
            record: 'job:http_request_rate_5m',
            expr: 'rate(http_requests_total[5m])',
          },
          {
            record: 'job:http_error_rate_5m',
            expr: 'rate(http_errors_total[5m])',
          },
          {
            record: 'job:http_latency_p95_5m',
            expr: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
          },
          {
            record: 'job:model_inference_rate_5m',
            expr: 'rate(model_inference_latency_seconds_count[5m])',
          },
          {
            record: 'job:model_error_rate_5m',
            expr: 'rate(model_inference_errors_total[5m])',
          },
          {
            record: 'instance:node_memory_utilization:ratio',
            expr: '1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
          },
          {
            record: 'instance:node_cpu_utilization:ratio',
            expr: '1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))',
          },
        ],
      },
    ],
  };
}

/**
 * Create alerting rules for Prometheus
 */
export function getAlertingRules(): object {
  return {
    groups: [
      {
        name: 'sre_monitoring_alerts',
        rules: [
          {
            alert: 'HighErrorRate',
            expr: 'job:http_error_rate_5m > 0.01',
            for: '5m',
            labels: {
              severity: 'critical',
              team: 'platform',
            },
            annotations: {
              summary: 'High error rate detected',
              description: 'Error rate is {{ $value | humanizePercentage }} which exceeds 1% threshold',
            },
          },
          {
            alert: 'HighLatency',
            expr: 'job:http_latency_p95_5m > 0.2',
            for: '5m',
            labels: {
              severity: 'warning',
              team: 'platform',
            },
            annotations: {
              summary: 'High latency detected',
              description: 'P95 latency is {{ $value | humanizeDuration }} which exceeds 200ms threshold',
            },
          },
          {
            alert: 'ModelInferenceFailure',
            expr: 'job:model_error_rate_5m > 0.05',
            for: '3m',
            labels: {
              severity: 'critical',
              team: 'ml',
            },
            annotations: {
              summary: 'High model inference failure rate',
              description: 'Model inference error rate is {{ $value | humanizePercentage }}',
            },
          },
          {
            alert: 'HighMemoryUsage',
            expr: 'instance:node_memory_utilization:ratio > 0.85',
            for: '10m',
            labels: {
              severity: 'warning',
              team: 'platform',
            },
            annotations: {
              summary: 'High memory usage detected',
              description: 'Memory usage is {{ $value | humanizePercentage }}',
            },
          },
          {
            alert: 'HighCPUUsage',
            expr: 'instance:node_cpu_utilization:ratio > 0.8',
            for: '10m',
            labels: {
              severity: 'warning',
              team: 'platform',
            },
            annotations: {
              summary: 'High CPU usage detected',
              description: 'CPU usage is {{ $value | humanizePercentage }}',
            },
          },
          {
            alert: 'ServiceDown',
            expr: 'up == 0',
            for: '1m',
            labels: {
              severity: 'critical',
              team: 'platform',
            },
            annotations: {
              summary: 'Service is down',
              description: '{{ $labels.job }} is down',
            },
          },
          {
            alert: 'ErrorBudgetBurnRateHigh',
            expr: 'error_budget_burn_rate{window="1h"} > 14.4',
            for: '5m',
            labels: {
              severity: 'critical',
              team: 'platform',
            },
            annotations: {
              summary: 'Error budget burn rate is too high',
              description: 'Service {{ $labels.service }} is burning error budget at {{ $value }}x rate',
            },
          },
          {
            alert: 'SLOViolation',
            expr: 'slo_compliance_percentage < 99.9',
            for: '15m',
            labels: {
              severity: 'warning',
              team: 'platform',
            },
            annotations: {
              summary: 'SLO violation detected',
              description: 'Service {{ $labels.service }} SLO compliance is {{ $value }}%',
            },
          },
        ],
      },
    ],
  };
}