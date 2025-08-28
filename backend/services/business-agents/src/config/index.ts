/**
 * Business Agents Service Configuration
 */

import { UserTier, RateLimitConfig, CacheConfig } from '../types';

export const config = {
  service: {
    name: 'business-agents',
    version: '1.0.0',
    port: parseInt(process.env.PORT || '3007', 10),
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    models: {
      marketing: process.env.MARKETING_MODEL || 'fine-print-marketing:latest',
      sales: process.env.SALES_MODEL || 'fine-print-sales:latest',
      support: process.env.SUPPORT_MODEL || 'fine-print-customer:latest',
      analytics: process.env.ANALYTICS_MODEL || 'fine-print-analytics:latest'
    },
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10),
    maxRetries: parseInt(process.env.OLLAMA_MAX_RETRIES || '3', 10),
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '4096', 10)
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'business-agents:',
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false
  },

  postgres: {
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/fineprint',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10)
    }
  },

  cache: {
    marketing: {
      ttl: 3600, // 1 hour
      maxSize: 100, // MB
      strategy: 'lru'
    } as CacheConfig,
    sales: {
      ttl: 1800, // 30 minutes
      maxSize: 50,
      strategy: 'lru'
    } as CacheConfig,
    support: {
      ttl: 900, // 15 minutes
      maxSize: 75,
      strategy: 'lfu'
    } as CacheConfig,
    analytics: {
      ttl: 7200, // 2 hours
      maxSize: 200,
      strategy: 'lru'
    } as CacheConfig
  },

  rateLimits: {
    [UserTier.FREE]: {
      requests: 10,
      window: '1h'
    },
    [UserTier.STARTER]: {
      requests: 100,
      window: '1h'
    },
    [UserTier.PROFESSIONAL]: {
      requests: 1000,
      window: '1h'
    },
    [UserTier.ENTERPRISE]: {
      requests: 10000,
      window: '1h'
    }
  } as RateLimitConfig,

  queue: {
    defaultJobOptions: {
      removeOnComplete: {
        age: 3600, // 1 hour
        count: 100
      },
      removeOnFail: {
        age: 86400, // 24 hours
        count: 500
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    }
  },

  digitalTwin: {
    baseUrl: process.env.DIGITAL_TWIN_URL || 'http://localhost:3008',
    timeout: 60000,
    maxTestIterations: 100
  },

  abTesting: {
    minSampleSize: 100,
    confidenceLevel: 0.95,
    defaultAllocation: {
      control: 50,
      variant: 50
    }
  },

  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    enableTracing: process.env.ENABLE_TRACING === 'true'
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
    enableHelmet: true
  },

  websocket: {
    path: '/ws/agents',
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '1000', 10),
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000', 10),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '5000', 10)
  }
};

export default config;