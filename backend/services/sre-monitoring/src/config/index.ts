import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  server: z.object({
    port: z.number(),
    host: z.string(),
  }),
  database: z.object({
    url: z.string(),
    maxConnections: z.number(),
    connectionTimeout: z.number(),
  }),
  redis: z.object({
    host: z.string(),
    port: z.number(),
    password: z.string().optional(),
    db: z.number(),
    maxRetries: z.number(),
  }),
  prometheus: z.object({
    port: z.number(),
    path: z.string(),
    defaultLabels: z.record(z.string()),
    pushGateway: z.string().optional(),
    scrapeInterval: z.number(),
  }),
  grafana: z.object({
    url: z.string(),
    apiKey: z.string(),
    organizationId: z.number(),
    dashboardFolder: z.string(),
  }),
  jaeger: z.object({
    endpoint: z.string(),
    serviceName: z.string(),
    sampleRate: z.number(),
    maxTraceSize: z.number(),
  }),
  loki: z.object({
    host: z.string(),
    port: z.number(),
    batchSize: z.number(),
    batchInterval: z.number(),
    labels: z.record(z.string()),
  }),
  pagerduty: z.object({
    apiKey: z.string(),
    integrationKey: z.string(),
    escalationPolicyId: z.string(),
    defaultSeverity: z.enum(['critical', 'error', 'warning', 'info']),
  }),
  slo: z.object({
    uptimeTarget: z.number(), // 99.9%
    latencyP95Target: z.number(), // 100ms
    latencyP99Target: z.number(), // 200ms
    errorRateTarget: z.number(), // 0.1%
    errorBudgetWindow: z.number(), // 30 days in ms
    burnRateThresholds: z.object({
      fast: z.number(), // 14.4x
      slow: z.number(), // 1x
    }),
  }),
  alerting: z.object({
    enabled: z.boolean(),
    channels: z.array(z.enum(['pagerduty', 'slack', 'email', 'webhook'])),
    deduplicationWindow: z.number(), // 5 minutes
    groupingWindow: z.number(), // 1 minute
    repeatInterval: z.number(), // 4 hours
    severityLevels: z.object({
      critical: z.object({
        notifyChannels: z.array(z.string()),
        autoRemediate: z.boolean(),
        escalateAfter: z.number(),
      }),
      warning: z.object({
        notifyChannels: z.array(z.string()),
        autoRemediate: z.boolean(),
        escalateAfter: z.number(),
      }),
      info: z.object({
        notifyChannels: z.array(z.string()),
        autoRemediate: z.boolean(),
        escalateAfter: z.number(),
      }),
    }),
  }),
  chaos: z.object({
    enabled: z.boolean(),
    interval: z.number(), // Run experiments interval
    dryRun: z.boolean(),
    experiments: z.array(z.string()),
    maxConcurrentExperiments: z.number(),
    rollbackOnFailure: z.boolean(),
  }),
  healthChecks: z.object({
    interval: z.number(), // 30 seconds
    timeout: z.number(), // 5 seconds
    retries: z.number(),
    endpoints: z.array(z.object({
      name: z.string(),
      url: z.string(),
      method: z.enum(['GET', 'POST', 'HEAD']),
      expectedStatus: z.number(),
      timeout: z.number().optional(),
    })),
  }),
  capacity: z.object({
    forecastWindow: z.number(), // 7 days
    scalingThresholds: z.object({
      cpu: z.number(), // 80%
      memory: z.number(), // 85%
      disk: z.number(), // 90%
      network: z.number(), // 75%
    }),
    autoScaling: z.object({
      enabled: z.boolean(),
      minReplicas: z.number(),
      maxReplicas: z.number(),
      targetCPU: z.number(),
      targetMemory: z.number(),
      scaleDownDelay: z.number(),
    }),
  }),
  monitoring: z.object({
    services: z.array(z.object({
      name: z.string(),
      type: z.enum(['api', 'worker', 'database', 'cache', 'queue', 'ai-model']),
      endpoints: z.array(z.string()),
      criticality: z.enum(['critical', 'high', 'medium', 'low']),
      owner: z.string(),
      slo: z.object({
        availability: z.number(),
        latencyP95: z.number(),
        errorRate: z.number(),
      }).optional(),
    })),
    customMetrics: z.array(z.object({
      name: z.string(),
      type: z.enum(['counter', 'gauge', 'histogram', 'summary']),
      labels: z.array(z.string()),
      unit: z.string(),
      description: z.string(),
    })),
  }),
  cors: z.object({
    origins: z.array(z.string()),
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
    pretty: z.boolean(),
    redact: z.array(z.string()),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config: Config = {
  environment: (process.env.NODE_ENV as any) || 'development',
  server: {
    port: parseInt(process.env.SRE_PORT || '9000'),
    host: process.env.SRE_HOST || '0.0.0.0',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/fineprint_sre',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
  },
  prometheus: {
    port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
    path: '/metrics',
    defaultLabels: {
      app: 'fineprint-ai',
      component: 'sre-monitoring',
      environment: process.env.NODE_ENV || 'development',
    },
    pushGateway: process.env.PROMETHEUS_PUSH_GATEWAY,
    scrapeInterval: 15000, // 15 seconds
  },
  grafana: {
    url: process.env.GRAFANA_URL || 'http://localhost:3000',
    apiKey: process.env.GRAFANA_API_KEY || '',
    organizationId: parseInt(process.env.GRAFANA_ORG_ID || '1'),
    dashboardFolder: 'fineprint-sre',
  },
  jaeger: {
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    serviceName: 'fineprint-sre-monitoring',
    sampleRate: parseFloat(process.env.JAEGER_SAMPLE_RATE || '1.0'),
    maxTraceSize: parseInt(process.env.JAEGER_MAX_TRACE_SIZE || '65536'),
  },
  loki: {
    host: process.env.LOKI_HOST || 'localhost',
    port: parseInt(process.env.LOKI_PORT || '3100'),
    batchSize: 100,
    batchInterval: 1000, // 1 second
    labels: {
      app: 'fineprint-ai',
      component: 'sre-monitoring',
    },
  },
  pagerduty: {
    apiKey: process.env.PAGERDUTY_API_KEY || '',
    integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY || '',
    escalationPolicyId: process.env.PAGERDUTY_ESCALATION_POLICY || '',
    defaultSeverity: 'warning',
  },
  slo: {
    uptimeTarget: 0.999, // 99.9%
    latencyP95Target: 100, // 100ms
    latencyP99Target: 200, // 200ms
    errorRateTarget: 0.001, // 0.1%
    errorBudgetWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
    burnRateThresholds: {
      fast: 14.4, // 1 hour burn rate
      slow: 1.0, // 30 day burn rate
    },
  },
  alerting: {
    enabled: true,
    channels: ['pagerduty', 'slack', 'email'],
    deduplicationWindow: 5 * 60 * 1000, // 5 minutes
    groupingWindow: 60 * 1000, // 1 minute
    repeatInterval: 4 * 60 * 60 * 1000, // 4 hours
    severityLevels: {
      critical: {
        notifyChannels: ['pagerduty', 'slack', 'email'],
        autoRemediate: true,
        escalateAfter: 5 * 60 * 1000, // 5 minutes
      },
      warning: {
        notifyChannels: ['slack', 'email'],
        autoRemediate: true,
        escalateAfter: 30 * 60 * 1000, // 30 minutes
      },
      info: {
        notifyChannels: ['slack'],
        autoRemediate: false,
        escalateAfter: 0, // No escalation
      },
    },
  },
  chaos: {
    enabled: process.env.CHAOS_ENABLED === 'true',
    interval: 24 * 60 * 60 * 1000, // Daily
    dryRun: process.env.CHAOS_DRY_RUN !== 'false',
    experiments: ['network-delay', 'pod-failure', 'cpu-stress', 'memory-stress'],
    maxConcurrentExperiments: 2,
    rollbackOnFailure: true,
  },
  healthChecks: {
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    retries: 3,
    endpoints: [
      {
        name: 'api-gateway',
        url: process.env.API_GATEWAY_URL || 'http://localhost:8000/health',
        method: 'GET',
        expectedStatus: 200,
      },
      {
        name: 'model-management',
        url: 'http://localhost:8001/health',
        method: 'GET',
        expectedStatus: 200,
      },
      {
        name: 'ab-testing',
        url: 'http://localhost:8002/health',
        method: 'GET',
        expectedStatus: 200,
      },
      {
        name: 'learning-pipeline',
        url: 'http://localhost:8003/health',
        method: 'GET',
        expectedStatus: 200,
      },
    ],
  },
  capacity: {
    forecastWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
    scalingThresholds: {
      cpu: 0.8, // 80%
      memory: 0.85, // 85%
      disk: 0.9, // 90%
      network: 0.75, // 75%
    },
    autoScaling: {
      enabled: true,
      minReplicas: 2,
      maxReplicas: 20,
      targetCPU: 0.7, // 70%
      targetMemory: 0.75, // 75%
      scaleDownDelay: 5 * 60 * 1000, // 5 minutes
    },
  },
  monitoring: {
    services: [
      {
        name: 'model-management',
        type: 'api',
        endpoints: ['/api/models', '/api/inference'],
        criticality: 'critical',
        owner: 'ml-team',
        slo: {
          availability: 0.999,
          latencyP95: 100,
          errorRate: 0.001,
        },
      },
      {
        name: 'ab-testing',
        type: 'api',
        endpoints: ['/api/experiments', '/api/metrics'],
        criticality: 'high',
        owner: 'product-team',
        slo: {
          availability: 0.995,
          latencyP95: 200,
          errorRate: 0.005,
        },
      },
      {
        name: 'learning-pipeline',
        type: 'worker',
        endpoints: ['/api/train', '/api/evaluate'],
        criticality: 'high',
        owner: 'ml-team',
        slo: {
          availability: 0.99,
          latencyP95: 5000,
          errorRate: 0.01,
        },
      },
      {
        name: 'postgres-primary',
        type: 'database',
        endpoints: ['postgresql://localhost:5432'],
        criticality: 'critical',
        owner: 'platform-team',
      },
      {
        name: 'redis-cache',
        type: 'cache',
        endpoints: ['redis://localhost:6379'],
        criticality: 'high',
        owner: 'platform-team',
      },
    ],
    customMetrics: [
      {
        name: 'model_inference_duration',
        type: 'histogram',
        labels: ['model_name', 'model_version', 'status'],
        unit: 'milliseconds',
        description: 'Time taken for model inference',
      },
      {
        name: 'ab_test_conversions',
        type: 'counter',
        labels: ['experiment_id', 'variant', 'action'],
        unit: 'count',
        description: 'Number of conversions in A/B tests',
      },
      {
        name: 'training_pipeline_queue_size',
        type: 'gauge',
        labels: ['priority', 'model_type'],
        unit: 'jobs',
        description: 'Number of jobs in training queue',
      },
      {
        name: 'error_budget_consumption',
        type: 'gauge',
        labels: ['service', 'slo_type'],
        unit: 'percentage',
        description: 'Percentage of error budget consumed',
      },
    ],
  },
  cors: {
    origins: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://fineprint.ai',
      'https://*.fineprint.ai',
    ],
  },
  logging: {
    level: process.env.LOG_LEVEL as any || 'info',
    pretty: process.env.NODE_ENV === 'development',
    redact: ['password', 'apiKey', 'token', 'secret', 'authorization'],
  },
};

// Validate configuration
try {
  ConfigSchema.parse(config);
} catch (error) {
  console.error('Invalid configuration:', error);
  process.exit(1);
}

export default config;