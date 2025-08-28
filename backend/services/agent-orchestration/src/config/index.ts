import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const ConfigSchema = z.object({
  // Server configuration
  host: z.string().default('0.0.0.0'),
  port: z.number().default(3010),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  version: z.string().default('1.0.0'),
  
  // JWT configuration
  jwt: z.object({
    secret: z.string().min(32),
    expiresIn: z.string().default('24h'),
    issuer: z.string().default('fine-print-ai'),
  }),

  // CORS configuration
  cors: z.object({
    origins: z.array(z.string()).default(['http://localhost:3000', 'http://localhost:5173']),
    credentials: z.boolean().default(true),
  }),

  // Rate limiting
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    max: z.number().default(1000),
    timeWindow: z.string().default('1 minute'),
  }),

  // Documentation
  docs: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('/docs'),
  }),

  // Redis configuration
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    keyPrefix: z.string().default('orchestration:'),
    maxRetries: z.number().default(3),
    retryDelayOnFailover: z.number().default(100),
  }),

  // Database configuration
  database: z.object({
    url: z.string(),
    maxConnections: z.number().default(20),
    connectionTimeoutMs: z.number().default(5000),
    idleTimeoutMs: z.number().default(10000),
  }),

  // Message queue configuration
  queue: z.object({
    defaultJobOptions: z.object({
      removeOnComplete: z.number().default(100),
      removeOnFail: z.number().default(50),
      attempts: z.number().default(3),
      backoff: z.object({
        type: z.string().default('exponential'),
        delay: z.number().default(2000),
      }),
    }),
    concurrency: z.number().default(10),
  }),

  // Monitoring configuration
  monitoring: z.object({
    enabled: z.boolean().default(true),
    healthCheckInterval: z.number().default(30000), // 30 seconds
    metricsCollectionInterval: z.number().default(10000), // 10 seconds
    alertingEnabled: z.boolean().default(true),
    prometheusEndpoint: z.string().default('/metrics'),
  }),

  // Workflow engine configuration
  workflow: z.object({
    maxConcurrentExecutions: z.number().default(100),
    defaultTimeout: z.number().default(3600000), // 1 hour
    retentionDays: z.number().default(30),
    enableVisualBuilder: z.boolean().default(true),
  }),

  // Agent communication configuration
  communication: z.object({
    maxMessageSize: z.number().default(5 * 1024 * 1024), // 5MB
    messageRetention: z.number().default(86400000), // 24 hours
    enableEncryption: z.boolean().default(true),
    compressionEnabled: z.boolean().default(true),
  }),

  // Resource management configuration
  resources: z.object({
    allocationStrategy: z.enum(['balanced', 'cost_optimized', 'performance_optimized']).default('balanced'),
    autoScalingEnabled: z.boolean().default(true),
    resourcePooling: z.boolean().default(true),
    costTrackingEnabled: z.boolean().default(true),
  }),

  // Decision engine configuration
  decisions: z.object({
    defaultStrategy: z.enum(['round_robin', 'least_loaded', 'capability_based']).default('capability_based'),
    conflictResolutionTimeout: z.number().default(30000), // 30 seconds
    escalationEnabled: z.boolean().default(true),
    auditEnabled: z.boolean().default(true),
  }),

  // Business process configuration
  businessProcesses: z.object({
    templateLibraryEnabled: z.boolean().default(true),
    customProcessesEnabled: z.boolean().default(true),
    processAnalyticsEnabled: z.boolean().default(true),
    slaMonitoringEnabled: z.boolean().default(true),
  }),

  // External integrations
  integrations: z.object({
    prometheus: z.object({
      enabled: z.boolean().default(true),
      pushGateway: z.string().optional(),
    }),
    grafana: z.object({
      enabled: z.boolean().default(true),
      url: z.string().optional(),
      apiKey: z.string().optional(),
    }),
    slack: z.object({
      enabled: z.boolean().default(false),
      webhookUrl: z.string().optional(),
      botToken: z.string().optional(),
    }),
    datadog: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),
      site: z.string().default('datadoghq.com'),
    }),
  }),

  // Security configuration
  security: z.object({
    enableRBAC: z.boolean().default(true),
    auditLogging: z.boolean().default(true),
    encryptionAtRest: z.boolean().default(true),
    sessionTimeout: z.number().default(86400000), // 24 hours
  }),

  // Performance configuration
  performance: z.object({
    cacheEnabled: z.boolean().default(true),
    cacheTTL: z.number().default(300000), // 5 minutes
    compressionEnabled: z.boolean().default(true),
    enableConnectionPooling: z.boolean().default(true),
  }),
});

type Config = z.infer<typeof ConfigSchema>;

// Load configuration from environment variables
function loadConfig(): Config {
  const rawConfig = {
    host: process.env.HOST,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    environment: process.env.NODE_ENV,
    version: process.env.VERSION || process.env.npm_package_version,
    
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN,
      issuer: process.env.JWT_ISSUER,
    },

    cors: {
      origins: process.env.CORS_ORIGINS?.split(','),
      credentials: process.env.CORS_CREDENTIALS === 'true',
    },

    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : undefined,
      timeWindow: process.env.RATE_LIMIT_TIME_WINDOW,
    },

    docs: {
      enabled: process.env.DOCS_ENABLED !== 'false',
      path: process.env.DOCS_PATH,
    },

    redis: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
      keyPrefix: process.env.REDIS_KEY_PREFIX,
      maxRetries: process.env.REDIS_MAX_RETRIES ? parseInt(process.env.REDIS_MAX_RETRIES, 10) : undefined,
      retryDelayOnFailover: process.env.REDIS_RETRY_DELAY ? parseInt(process.env.REDIS_RETRY_DELAY, 10) : undefined,
    },

    database: {
      url: process.env.DATABASE_URL,
      maxConnections: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) : undefined,
      connectionTimeoutMs: process.env.DB_CONNECTION_TIMEOUT ? parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) : undefined,
      idleTimeoutMs: process.env.DB_IDLE_TIMEOUT ? parseInt(process.env.DB_IDLE_TIMEOUT, 10) : undefined,
    },

    queue: {
      defaultJobOptions: {
        removeOnComplete: process.env.QUEUE_REMOVE_ON_COMPLETE ? parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE, 10) : undefined,
        removeOnFail: process.env.QUEUE_REMOVE_ON_FAIL ? parseInt(process.env.QUEUE_REMOVE_ON_FAIL, 10) : undefined,
        attempts: process.env.QUEUE_ATTEMPTS ? parseInt(process.env.QUEUE_ATTEMPTS, 10) : undefined,
        backoff: {
          type: process.env.QUEUE_BACKOFF_TYPE,
          delay: process.env.QUEUE_BACKOFF_DELAY ? parseInt(process.env.QUEUE_BACKOFF_DELAY, 10) : undefined,
        },
      },
      concurrency: process.env.QUEUE_CONCURRENCY ? parseInt(process.env.QUEUE_CONCURRENCY, 10) : undefined,
    },

    monitoring: {
      enabled: process.env.MONITORING_ENABLED !== 'false',
      healthCheckInterval: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) : undefined,
      metricsCollectionInterval: process.env.METRICS_INTERVAL ? parseInt(process.env.METRICS_INTERVAL, 10) : undefined,
      alertingEnabled: process.env.ALERTING_ENABLED !== 'false',
      prometheusEndpoint: process.env.PROMETHEUS_ENDPOINT,
    },

    workflow: {
      maxConcurrentExecutions: process.env.WORKFLOW_MAX_CONCURRENT ? parseInt(process.env.WORKFLOW_MAX_CONCURRENT, 10) : undefined,
      defaultTimeout: process.env.WORKFLOW_DEFAULT_TIMEOUT ? parseInt(process.env.WORKFLOW_DEFAULT_TIMEOUT, 10) : undefined,
      retentionDays: process.env.WORKFLOW_RETENTION_DAYS ? parseInt(process.env.WORKFLOW_RETENTION_DAYS, 10) : undefined,
      enableVisualBuilder: process.env.WORKFLOW_VISUAL_BUILDER !== 'false',
    },

    communication: {
      maxMessageSize: process.env.COMM_MAX_MESSAGE_SIZE ? parseInt(process.env.COMM_MAX_MESSAGE_SIZE, 10) : undefined,
      messageRetention: process.env.COMM_MESSAGE_RETENTION ? parseInt(process.env.COMM_MESSAGE_RETENTION, 10) : undefined,
      enableEncryption: process.env.COMM_ENCRYPTION !== 'false',
      compressionEnabled: process.env.COMM_COMPRESSION !== 'false',
    },

    resources: {
      allocationStrategy: process.env.RESOURCE_ALLOCATION_STRATEGY as any,
      autoScalingEnabled: process.env.RESOURCE_AUTO_SCALING !== 'false',
      resourcePooling: process.env.RESOURCE_POOLING !== 'false',
      costTrackingEnabled: process.env.RESOURCE_COST_TRACKING !== 'false',
    },

    decisions: {
      defaultStrategy: process.env.DECISION_DEFAULT_STRATEGY as any,
      conflictResolutionTimeout: process.env.DECISION_CONFLICT_TIMEOUT ? parseInt(process.env.DECISION_CONFLICT_TIMEOUT, 10) : undefined,
      escalationEnabled: process.env.DECISION_ESCALATION !== 'false',
      auditEnabled: process.env.DECISION_AUDIT !== 'false',
    },

    businessProcesses: {
      templateLibraryEnabled: process.env.BP_TEMPLATE_LIBRARY !== 'false',
      customProcessesEnabled: process.env.BP_CUSTOM_PROCESSES !== 'false',
      processAnalyticsEnabled: process.env.BP_ANALYTICS !== 'false',
      slaMonitoringEnabled: process.env.BP_SLA_MONITORING !== 'false',
    },

    integrations: {
      prometheus: {
        enabled: process.env.PROMETHEUS_ENABLED !== 'false',
        pushGateway: process.env.PROMETHEUS_PUSH_GATEWAY,
      },
      grafana: {
        enabled: process.env.GRAFANA_ENABLED !== 'false',
        url: process.env.GRAFANA_URL,
        apiKey: process.env.GRAFANA_API_KEY,
      },
      slack: {
        enabled: process.env.SLACK_ENABLED === 'true',
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        botToken: process.env.SLACK_BOT_TOKEN,
      },
      datadog: {
        enabled: process.env.DATADOG_ENABLED === 'true',
        apiKey: process.env.DATADOG_API_KEY,
        site: process.env.DATADOG_SITE,
      },
    },

    security: {
      enableRBAC: process.env.SECURITY_RBAC !== 'false',
      auditLogging: process.env.SECURITY_AUDIT_LOGGING !== 'false',
      encryptionAtRest: process.env.SECURITY_ENCRYPTION_AT_REST !== 'false',
      sessionTimeout: process.env.SECURITY_SESSION_TIMEOUT ? parseInt(process.env.SECURITY_SESSION_TIMEOUT, 10) : undefined,
    },

    performance: {
      cacheEnabled: process.env.PERF_CACHE !== 'false',
      cacheTTL: process.env.PERF_CACHE_TTL ? parseInt(process.env.PERF_CACHE_TTL, 10) : undefined,
      compressionEnabled: process.env.PERF_COMPRESSION !== 'false',
      enableConnectionPooling: process.env.PERF_CONNECTION_POOLING !== 'false',
    },
  };

  // Remove undefined values
  const cleanConfig = JSON.parse(JSON.stringify(rawConfig, (key, value) => {
    return value === undefined ? undefined : value;
  }));

  try {
    return ConfigSchema.parse(cleanConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Invalid configuration');
  }
}

export const config = loadConfig();
export type { Config };