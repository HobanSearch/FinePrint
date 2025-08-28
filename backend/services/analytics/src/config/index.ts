/**
 * Fine Print AI - Analytics Service Configuration
 * 
 * Centralized configuration for analytics infrastructure including:
 * - Database connections
 * - Analytics providers (Mixpanel, Amplitude)
 * - Data warehouse connections (Snowflake, ClickHouse)
 * - Privacy and compliance settings
 * - Performance and monitoring settings
 */

import { z } from 'zod';

// Configuration schema validation
const configSchema = z.object({
  // Environment
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.number().default(3007),
  
  // Database
  database: z.object({
    url: z.string(),
    maxConnections: z.number().default(10),
    connectionTimeout: z.number().default(30000),
    idleTimeout: z.number().default(600000)
  }),
  
  // Redis
  redis: z.object({
    url: z.string(),
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    retryDelayOnFailover: z.number().default(100),
    enableReadyCheck: z.boolean().default(true)
  }),
  
  // Product Analytics
  productAnalytics: z.object({
    mixpanel: z.object({
      token: z.string(),
      secret: z.string().optional(),
      region: z.enum(['US', 'EU']).default('US'),
      enabled: z.boolean().default(true)
    }),
    amplitude: z.object({
      apiKey: z.string(),
      secretKey: z.string().optional(),
      enabled: z.boolean().default(true)
    }),
    segment: z.object({
      writeKey: z.string().optional(),
      enabled: z.boolean().default(false)
    })
  }),
  
  // Data Warehouse
  dataWarehouse: z.object({
    snowflake: z.object({
      account: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      warehouse: z.string().default('ANALYTICS_WH'),
      database: z.string().default('FINEPRINTAI'),
      schema: z.string().default('ANALYTICS'),
      enabled: z.boolean().default(false)
    }),
    clickhouse: z.object({
      host: z.string().optional(),
      port: z.number().default(8123),
      username: z.string().optional(),
      password: z.string().optional(),
      database: z.string().default('fineprintai_analytics'),
      enabled: z.boolean().default(false)
    })
  }),
  
  // Search and Indexing
  elasticsearch: z.object({
    url: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    index: z.string().default('fineprintai-analytics'),
    enabled: z.boolean().default(false)
  }),
  
  // Privacy and Compliance
  privacy: z.object({
    enablePiiDetection: z.boolean().default(true),
    enableDataAnonymization: z.boolean().default(true),
    dataRetentionDays: z.number().default(365),
    gdprCompliant: z.boolean().default(true),
    ccpaCompliant: z.boolean().default(true),
    cookieConsentRequired: z.boolean().default(true),
    allowedCountries: z.array(z.string()).default([]),
    restrictedCountries: z.array(z.string()).default([])
  }),
  
  // Performance and Monitoring
  performance: z.object({
    enableMetrics: z.boolean().default(true),
    metricsInterval: z.number().default(60000), // 1 minute
    enableTracing: z.boolean().default(true),
    enableProfiling: z.boolean().default(false),
    maxMemoryUsage: z.number().default(1024 * 1024 * 1024), // 1GB
    requestTimeout: z.number().default(30000) // 30 seconds
  }),
  
  // Analytics Processing
  processing: z.object({
    batchSize: z.number().default(1000),
    batchTimeout: z.number().default(5000), // 5 seconds
    maxRetries: z.number().default(3),
    retryDelay: z.number().default(1000),
    enableRealTimeProcessing: z.boolean().default(true),
    enableBatchProcessing: z.boolean().default(true)
  }),
  
  // Reporting
  reporting: z.object({
    enableAutomatedReports: z.boolean().default(true),
    reportSchedule: z.string().default('0 9 * * MON'), // Every Monday at 9 AM
    reportRetentionDays: z.number().default(90),
    enableEmailReports: z.boolean().default(true),
    enableSlackReports: z.boolean().default(false)
  }),
  
  // A/B Testing
  abTesting: z.object({
    enabled: z.boolean().default(true),
    defaultTrafficAllocation: z.number().default(0.1), // 10%
    minSampleSize: z.number().default(100),
    confidenceLevel: z.number().default(0.95),
    enableAutoWinner: z.boolean().default(false)
  }),
  
  // AI/ML Analytics
  aiAnalytics: z.object({
    enableModelPerformanceTracking: z.boolean().default(true),
    enableTokenUsageTracking: z.boolean().default(true),
    enableLatencyTracking: z.boolean().default(true),
    enableAccuracyTracking: z.boolean().default(true),
    modelMetricsInterval: z.number().default(300000) // 5 minutes
  }),
  
  // Security
  security: z.object({
    enableApiKeyAuth: z.boolean().default(true),
    enableJwtAuth: z.boolean().default(true),
    enableRateLimit: z.boolean().default(true),
    rateLimitWindow: z.number().default(900000), // 15 minutes
    rateLimitMax: z.number().default(1000),
    enableCors: z.boolean().default(true),
    allowedOrigins: z.array(z.string()).default([])
  })
});

type Config = z.infer<typeof configSchema>;

// Load and validate configuration
function loadConfig(): Config {
  const rawConfig = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3007', 10),
    
    database: {
      url: process.env.DATABASE_URL || '',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '600000', 10)
    },
    
    redis: {
      url: process.env.REDIS_URL || '',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
      enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false'
    },
    
    productAnalytics: {
      mixpanel: {
        token: process.env.MIXPANEL_TOKEN || '',
        secret: process.env.MIXPANEL_SECRET,
        region: (process.env.MIXPANEL_REGION as 'US' | 'EU') || 'US',
        enabled: process.env.MIXPANEL_ENABLED !== 'false'
      },
      amplitude: {
        apiKey: process.env.AMPLITUDE_API_KEY || '',
        secretKey: process.env.AMPLITUDE_SECRET_KEY,
        enabled: process.env.AMPLITUDE_ENABLED !== 'false'
      },
      segment: {
        writeKey: process.env.SEGMENT_WRITE_KEY,
        enabled: process.env.SEGMENT_ENABLED === 'true'
      }
    },
    
    dataWarehouse: {
      snowflake: {
        account: process.env.SNOWFLAKE_ACCOUNT,
        username: process.env.SNOWFLAKE_USERNAME,
        password: process.env.SNOWFLAKE_PASSWORD,
        warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'ANALYTICS_WH',
        database: process.env.SNOWFLAKE_DATABASE || 'FINEPRINTAI',
        schema: process.env.SNOWFLAKE_SCHEMA || 'ANALYTICS',
        enabled: process.env.SNOWFLAKE_ENABLED === 'true'
      },
      clickhouse: {
        host: process.env.CLICKHOUSE_HOST,
        port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
        username: process.env.CLICKHOUSE_USERNAME,
        password: process.env.CLICKHOUSE_PASSWORD,
        database: process.env.CLICKHOUSE_DATABASE || 'fineprintai_analytics',
        enabled: process.env.CLICKHOUSE_ENABLED === 'true'
      }
    },
    
    elasticsearch: {
      url: process.env.ELASTICSEARCH_URL,
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD,
      index: process.env.ELASTICSEARCH_INDEX || 'fineprintai-analytics',
      enabled: process.env.ELASTICSEARCH_ENABLED === 'true'
    },
    
    privacy: {
      enablePiiDetection: process.env.ENABLE_PII_DETECTION !== 'false',
      enableDataAnonymization: process.env.ENABLE_DATA_ANONYMIZATION !== 'false',
      dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
      gdprCompliant: process.env.GDPR_COMPLIANT !== 'false',
      ccpaCompliant: process.env.CCPA_COMPLIANT !== 'false',
      cookieConsentRequired: process.env.COOKIE_CONSENT_REQUIRED !== 'false',
      allowedCountries: process.env.ALLOWED_COUNTRIES?.split(',') || [],
      restrictedCountries: process.env.RESTRICTED_COUNTRIES?.split(',') || []
    },
    
    performance: {
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      metricsInterval: parseInt(process.env.METRICS_INTERVAL || '60000', 10),
      enableTracing: process.env.ENABLE_TRACING !== 'false',
      enableProfiling: process.env.ENABLE_PROFILING === 'true',
      maxMemoryUsage: parseInt(process.env.MAX_MEMORY_USAGE || '1073741824', 10),
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10)
    },
    
    processing: {
      batchSize: parseInt(process.env.BATCH_SIZE || '1000', 10),
      batchTimeout: parseInt(process.env.BATCH_TIMEOUT || '5000', 10),
      maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),
      enableRealTimeProcessing: process.env.ENABLE_REALTIME_PROCESSING !== 'false',
      enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING !== 'false'
    },
    
    reporting: {
      enableAutomatedReports: process.env.ENABLE_AUTOMATED_REPORTS !== 'false',
      reportSchedule: process.env.REPORT_SCHEDULE || '0 9 * * MON',
      reportRetentionDays: parseInt(process.env.REPORT_RETENTION_DAYS || '90', 10),
      enableEmailReports: process.env.ENABLE_EMAIL_REPORTS !== 'false',
      enableSlackReports: process.env.ENABLE_SLACK_REPORTS === 'true'
    },
    
    abTesting: {
      enabled: process.env.AB_TESTING_ENABLED !== 'false',
      defaultTrafficAllocation: parseFloat(process.env.AB_DEFAULT_TRAFFIC || '0.1'),
      minSampleSize: parseInt(process.env.AB_MIN_SAMPLE_SIZE || '100', 10),
      confidenceLevel: parseFloat(process.env.AB_CONFIDENCE_LEVEL || '0.95'),
      enableAutoWinner: process.env.AB_ENABLE_AUTO_WINNER === 'true'
    },
    
    aiAnalytics: {
      enableModelPerformanceTracking: process.env.ENABLE_MODEL_PERFORMANCE !== 'false',
      enableTokenUsageTracking: process.env.ENABLE_TOKEN_USAGE !== 'false',
      enableLatencyTracking: process.env.ENABLE_LATENCY_TRACKING !== 'false',
      enableAccuracyTracking: process.env.ENABLE_ACCURACY_TRACKING !== 'false',
      modelMetricsInterval: parseInt(process.env.MODEL_METRICS_INTERVAL || '300000', 10)
    },
    
    security: {
      enableApiKeyAuth: process.env.ENABLE_API_KEY_AUTH !== 'false',
      enableJwtAuth: process.env.ENABLE_JWT_AUTH !== 'false',
      enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
      enableCors: process.env.ENABLE_CORS !== 'false',
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || []
    }
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Invalid configuration');
  }
}

export const config = loadConfig();

// Export types
export type { Config };

// Export individual configuration sections
export const {
  nodeEnv,
  port,
  database,
  redis,
  productAnalytics,
  dataWarehouse,
  elasticsearch,
  privacy,
  performance,
  processing,
  reporting,
  abTesting,
  aiAnalytics,
  security
} = config;