/**
 * Configuration for Design System Service
 */

import { z } from 'zod'

const configSchema = z.object({
  // Server configuration
  port: z.coerce.number().default(3005),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // CORS configuration
  corsOrigins: z.array(z.string()).default([
    'http://localhost:3000',
    'http://localhost:5173',
    'https://app.fineprint.ai',
  ]),
  
  // Rate limiting
  rateLimit: z.object({
    max: z.number().default(1000),
    timeWindow: z.string().default('1 minute'),
  }),
  
  // Database configuration
  database: z.object({
    url: z.string().default('postgresql://postgres:password@localhost:5432/fineprint_design'),
    maxConnections: z.number().default(20),
    connectionTimeout: z.number().default(60000),
  }),
  
  // Redis configuration
  redis: z.object({
    url: z.string().default('redis://localhost:6379'),
    keyPrefix: z.string().default('fineprint:design:'),
    ttl: z.number().default(3600),
  }),
  
  // AI/ML configuration
  ai: z.object({
    ollamaUrl: z.string().default('http://localhost:11434'),
    defaultModel: z.string().default('mistral:7b'),
    maxTokens: z.number().default(4096),
    temperature: z.number().default(0.3),
  }),
  
  // Figma integration
  figma: z.object({
    accessToken: z.string().optional(),
    webhookSecret: z.string().optional(),
    apiUrl: z.string().default('https://api.figma.com/v1'),
  }),
  
  // Component generation
  componentGeneration: z.object({
    outputDir: z.string().default('./generated'),
    supportedFrameworks: z.array(z.string()).default(['react', 'vue', 'angular', 'react-native']),
    enableTypescript: z.boolean().default(true),
    enableStorybook: z.boolean().default(true),
    enableTests: z.boolean().default(true),
  }),
  
  // Accessibility configuration
  accessibility: z.object({
    wcagLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
    enableAutomaticFixes: z.boolean().default(true),
    colorContrastThreshold: z.number().default(4.5),
    focusIndicatorMinWidth: z.number().default(2),
  }),
  
  // Analytics configuration
  analytics: z.object({
    enableRealtime: z.boolean().default(true),
    retentionDays: z.number().default(90),
    samplingRate: z.number().default(1.0),
    enableHeatmaps: z.boolean().default(true),
  }),
  
  // A/B Testing configuration
  abTesting: z.object({
    maxVariants: z.number().default(5),
    minSampleSize: z.number().default(100),
    confidenceLevel: z.number().default(0.95),
    enableAutoWinner: z.boolean().default(true),
  }),
  
  // Performance monitoring
  performance: z.object({
    enableMetrics: z.boolean().default(true),
    metricsInterval: z.number().default(60000),
    enableTracing: z.boolean().default(true),
  }),
  
  // Security configuration
  security: z.object({
    apiKeys: z.array(z.string()).default([]),
    enableApiKeyAuth: z.boolean().default(false),
    jwtSecret: z.string().optional(),
    enableJwtAuth: z.boolean().default(false),
  }),
})

const env = {
  // Server
  port: process.env.DESIGN_SYSTEM_PORT,
  host: process.env.DESIGN_SYSTEM_HOST,
  logLevel: process.env.LOG_LEVEL,
  
  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(','),
  
  // Rate limiting
  rateLimit: {
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : undefined,
    timeWindow: process.env.RATE_LIMIT_WINDOW,
  },
  
  // Database
  database: {
    url: process.env.DATABASE_URL,
    maxConnections: process.env.DB_MAX_CONNECTIONS ? parseInt(process.env.DB_MAX_CONNECTIONS) : undefined,
    connectionTimeout: process.env.DB_CONNECTION_TIMEOUT ? parseInt(process.env.DB_CONNECTION_TIMEOUT) : undefined,
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL,
    keyPrefix: process.env.REDIS_KEY_PREFIX,
    ttl: process.env.REDIS_TTL ? parseInt(process.env.REDIS_TTL) : undefined,
  },
  
  // AI/ML
  ai: {
    ollamaUrl: process.env.OLLAMA_URL,
    defaultModel: process.env.OLLAMA_DEFAULT_MODEL,
    maxTokens: process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS) : undefined,
    temperature: process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : undefined,
  },
  
  // Figma
  figma: {
    accessToken: process.env.FIGMA_ACCESS_TOKEN,
    webhookSecret: process.env.FIGMA_WEBHOOK_SECRET,
    apiUrl: process.env.FIGMA_API_URL,
  },
  
  // Component generation
  componentGeneration: {
    outputDir: process.env.COMPONENT_OUTPUT_DIR,
    supportedFrameworks: process.env.SUPPORTED_FRAMEWORKS?.split(','),
    enableTypescript: process.env.ENABLE_TYPESCRIPT === 'true',
    enableStorybook: process.env.ENABLE_STORYBOOK === 'true',
    enableTests: process.env.ENABLE_TESTS === 'true',
  },
  
  // Accessibility
  accessibility: {
    wcagLevel: process.env.WCAG_LEVEL as 'A' | 'AA' | 'AAA' | undefined,
    enableAutomaticFixes: process.env.ENABLE_AUTO_ACCESSIBILITY_FIXES === 'true',
    colorContrastThreshold: process.env.COLOR_CONTRAST_THRESHOLD ? parseFloat(process.env.COLOR_CONTRAST_THRESHOLD) : undefined,
    focusIndicatorMinWidth: process.env.FOCUS_INDICATOR_MIN_WIDTH ? parseInt(process.env.FOCUS_INDICATOR_MIN_WIDTH) : undefined,
  },
  
  // Analytics
  analytics: {
    enableRealtime: process.env.ENABLE_REALTIME_ANALYTICS === 'true',
    retentionDays: process.env.ANALYTICS_RETENTION_DAYS ? parseInt(process.env.ANALYTICS_RETENTION_DAYS) : undefined,
    samplingRate: process.env.ANALYTICS_SAMPLING_RATE ? parseFloat(process.env.ANALYTICS_SAMPLING_RATE) : undefined,
    enableHeatmaps: process.env.ENABLE_HEATMAPS === 'true',
  },
  
  // A/B Testing
  abTesting: {
    maxVariants: process.env.AB_TEST_MAX_VARIANTS ? parseInt(process.env.AB_TEST_MAX_VARIANTS) : undefined,
    minSampleSize: process.env.AB_TEST_MIN_SAMPLE_SIZE ? parseInt(process.env.AB_TEST_MIN_SAMPLE_SIZE) : undefined,
    confidenceLevel: process.env.AB_TEST_CONFIDENCE_LEVEL ? parseFloat(process.env.AB_TEST_CONFIDENCE_LEVEL) : undefined,
    enableAutoWinner: process.env.AB_TEST_ENABLE_AUTO_WINNER === 'true',
  },
  
  // Performance
  performance: {
    enableMetrics: process.env.ENABLE_PERFORMANCE_METRICS === 'true',
    metricsInterval: process.env.PERFORMANCE_METRICS_INTERVAL ? parseInt(process.env.PERFORMANCE_METRICS_INTERVAL) : undefined,
    enableTracing: process.env.ENABLE_PERFORMANCE_TRACING === 'true',
  },
  
  // Security
  security: {
    apiKeys: process.env.API_KEYS?.split(','),
    enableApiKeyAuth: process.env.ENABLE_API_KEY_AUTH === 'true',
    jwtSecret: process.env.JWT_SECRET,
    enableJwtAuth: process.env.ENABLE_JWT_AUTH === 'true',
  },
}

export const config = configSchema.parse(env)

export const isDevelopment = process.env.NODE_ENV === 'development'
export const isProduction = process.env.NODE_ENV === 'production'
export const isTest = process.env.NODE_ENV === 'test'

export type Config = typeof config