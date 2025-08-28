// Configuration validation schemas for Fine Print AI
// Comprehensive Zod schemas for type-safe configuration management

import { z } from 'zod';

// Environment validation
export const NodeEnvSchema = z.enum(['development', 'staging', 'production']);
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

// Base configuration schemas
export const DatabaseConfigSchema = z.object({
  url: z.string().url('Invalid database URL'),
  poolSize: z.number().int().min(1).max(100).default(20),
  ssl: z.boolean().default(false),
  connectionTimeout: z.number().int().min(1000).default(30000),
  idleTimeout: z.number().int().min(1000).default(600000),
});

export const RedisConfigSchema = z.object({
  url: z.string().url('Invalid Redis URL'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  password: z.string().optional(),
  db: z.number().int().min(0).max(15).default(0),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelayOnFailover: z.number().int().min(100).default(100),
  connectTimeout: z.number().int().min(1000).default(10000),
  commandTimeout: z.number().int().min(1000).default(5000),
});

export const AuthConfigSchema = z.object({
  jwt: z.object({
    secret: z.string().min(32, 'JWT secret must be at least 32 characters'),
    algorithm: z.literal('HS256'),
    accessExpiry: z.string().regex(/^\d+[smhd]$/, 'Invalid time format'),
    refreshExpiry: z.string().regex(/^\d+[smhd]$/, 'Invalid time format'),
  }),
  bcrypt: z.object({
    rounds: z.number().int().min(10).max(15).default(12),
  }),
  rateLimit: z.object({
    windowMs: z.number().int().min(60000).default(900000), // 15 minutes
    max: z.number().int().min(1).default(100),
  }),
});

export const ApiConfigSchema = z.object({
  host: z.string().ip().or(z.literal('0.0.0.0')).default('0.0.0.0'),
  port: z.number().int().min(1).max(65535).default(3000),
  cors: z.object({
    origin: z.string().or(z.array(z.string())).default('*'),
    credentials: z.boolean().default(true),
    methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  }),
  requestTimeout: z.number().int().min(1000).default(30000),
  bodyLimit: z.number().int().min(1024).default(1048576), // 1MB
});

// AI/ML Configuration schemas
export const AIModelConfigSchema = z.object({
  modelName: z.string().min(1),
  provider: z.enum(['ollama', 'openai', 'anthropic']),
  endpoint: z.string().url().optional(),
  apiKey: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(100000).default(4000),
  timeout: z.number().int().min(1000).default(300000), // 5 minutes
  retries: z.number().int().min(0).max(5).default(3),
});

export const DSPyConfigSchema = z.object({
  models: z.array(AIModelConfigSchema),
  defaultModel: z.string(),
  optimizationConfig: z.object({
    metric: z.enum(['accuracy', 'f1', 'precision', 'recall']).default('accuracy'),
    maxEvals: z.number().int().min(1).default(100),
    timeout: z.number().int().min(60000).default(3600000), // 1 hour
  }),
  cacheEnabled: z.boolean().default(true),
  cacheSize: z.number().int().min(100).default(10000),
});

export const LoRAConfigSchema = z.object({
  rank: z.number().int().min(1).max(256).default(16),
  alpha: z.number().min(0.1).max(1000).default(32),
  dropout: z.number().min(0).max(1).default(0.1),
  targetModules: z.array(z.string()).default(['q_proj', 'v_proj']),
  bias: z.enum(['none', 'all', 'lora_only']).default('none'),
  taskType: z.enum(['CAUSAL_LM', 'SEQ_2_SEQ_LM']).default('CAUSAL_LM'),
});

// Business configuration schemas
export const BusinessRulesConfigSchema = z.object({
  riskThresholds: z.object({
    low: z.number().min(0).max(1).default(0.3),
    medium: z.number().min(0).max(1).default(0.6),
    high: z.number().min(0).max(1).default(0.8),
  }),
  complianceRules: z.object({
    gdpr: z.object({
      enabled: z.boolean().default(true),
      strictMode: z.boolean().default(false),
      requiredClauses: z.array(z.string()).default([]),
    }),
    ccpa: z.object({
      enabled: z.boolean().default(true),
      strictMode: z.boolean().default(false),
      requiredClauses: z.array(z.string()).default([]),
    }),
    coppa: z.object({
      enabled: z.boolean().default(false),
      strictMode: z.boolean().default(true),
      requiredClauses: z.array(z.string()).default([]),
    }),
  }),
  analysisSettings: z.object({
    maxDocumentSize: z.number().int().min(1024).default(10485760), // 10MB
    timeoutMs: z.number().int().min(1000).default(60000),
    batchSize: z.number().int().min(1).max(100).default(10),
  }),
});

export const AgentConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum([
    'analysis',
    'compliance',
    'billing',
    'notification',
    'content-marketing',
    'customer-success',
    'sales',
    'devops',
    'fullstack',
    'design-system',
  ]),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
  maxConcurrency: z.number().int().min(1).max(100).default(10),
  timeout: z.number().int().min(1000).default(300000),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    retryDelay: z.number().int().min(100).default(1000),
    exponentialBackoff: z.boolean().default(true),
  }),
  configuration: z.record(z.any()).default({}),
});

// Integration schemas
export const IntegrationConfigSchema = z.object({
  stripe: z.object({
    publicKey: z.string().optional(),
    secretKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    apiVersion: z.string().default('2023-10-16'),
    maxNetworkRetries: z.number().int().min(0).max(10).default(3),
  }).optional(),
  sendgrid: z.object({
    apiKey: z.string().optional(),
    fromEmail: z.string().email().optional(),
    templates: z.record(z.string()).default({}),
  }).optional(),
  analytics: z.object({
    enabled: z.boolean().default(true),
    provider: z.enum(['internal', 'google-analytics', 'mixpanel']).default('internal'),
    apiKey: z.string().optional(),
    trackingId: z.string().optional(),
  }).optional(),
});

// Feature flags schema
export const FeatureFlagRolloutConfigSchema = z.object({
  percentage: z.number().min(0).max(100).default(0),
  userGroups: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const FeatureFlagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(false),
  rollout: FeatureFlagRolloutConfigSchema.optional(),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    weight: z.number().min(0).max(100),
    configuration: z.record(z.any()).default({}),
  })).default([]),
  dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

// Main configuration schema
export const ConfigurationSchema = z.object({
  // Environment
  nodeEnv: NodeEnvSchema.default('development'),
  logLevel: LogLevelSchema.default('info'),
  
  // Core services
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  auth: AuthConfigSchema,
  api: ApiConfigSchema,
  
  // AI/ML
  dspy: DSPyConfigSchema,
  lora: LoRAConfigSchema,
  
  // Business
  businessRules: BusinessRulesConfigSchema,
  agents: z.array(AgentConfigSchema).default([]),
  
  // Integrations
  integrations: IntegrationConfigSchema,
  
  // Feature flags
  featureFlags: z.array(FeatureFlagSchema).default([]),
  
  // Monitoring
  monitoring: z.object({
    metricsEnabled: z.boolean().default(true),
    healthCheckInterval: z.number().int().min(1000).default(30000),
    prometheusPort: z.number().int().min(1).max(65535).default(9090),
    tracingEnabled: z.boolean().default(true),
  }),
  
  // Security
  security: z.object({
    encryptionKey: z.string().min(32),
    allowedOrigins: z.array(z.string()).default(['*']),
    maxRequestSize: z.number().int().min(1024).default(10485760),
    rateLimitGlobal: z.object({
      windowMs: z.number().int().min(1000).default(60000),
      max: z.number().int().min(1).default(1000),
    }),
  }),
});

// Configuration update schemas
export const ConfigurationUpdateSchema = ConfigurationSchema.partial();

export const FeatureFlagUpdateSchema = FeatureFlagSchema.partial().extend({
  id: z.string().min(1), // ID is required for updates
});

// Export types
export type Configuration = z.infer<typeof ConfigurationSchema>;
export type ConfigurationUpdate = z.infer<typeof ConfigurationUpdateSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagUpdate = z.infer<typeof FeatureFlagUpdateSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type BusinessRulesConfig = z.infer<typeof BusinessRulesConfigSchema>;
export type DSPyConfig = z.infer<typeof DSPyConfigSchema>;
export type LoRAConfig = z.infer<typeof LoRAConfigSchema>;