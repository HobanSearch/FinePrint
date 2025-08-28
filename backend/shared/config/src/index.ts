// Fine Print AI - Production-Ready Configuration Management System
// Comprehensive configuration service with hot-reload, feature flags, and encrypted secrets

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import Fastify, { FastifyInstance } from 'fastify';
import { ConfigurationService } from './services/configuration';
import { FeatureFlagsService } from './services/feature-flags';
import { SecretManagementService } from './services/secrets';
import { WebSocketService } from './services/websocket';
import { CacheService } from './services/cache';
import { configurationRoutes } from './routes';
import { Configuration, NodeEnvironment, ServiceRegistration } from './types';
import { ConfigurationSchema } from './schemas';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variable helpers
const getEnvString = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
};

const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${key} is required`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return num;
};

const getEnvBoolean = (key: string, defaultValue?: boolean): boolean => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${key} is required`);
  }
  return value.toLowerCase() === 'true';
};

const getEnvEnum = <T extends string>(key: string, validValues: T[], defaultValue?: T): T => {
  const value = process.env[key] as T;
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Environment variable ${key} is required`);
  }
  if (!validValues.includes(value)) {
    throw new Error(`Environment variable ${key} must be one of: ${validValues.join(', ')}`);
  }
  return value;
};

// Configuration Management System
export class ConfigurationManagementSystem {
  private fastify: FastifyInstance;
  private prisma: PrismaClient;
  private redis: Redis;
  private configService: ConfigurationService;
  private featureFlagsService: FeatureFlagsService;
  private secretsService: SecretManagementService;
  private webSocketService: WebSocketService;
  private cacheService: CacheService;
  private isInitialized = false;

  constructor(options: {
    databaseUrl: string;
    redisUrl: string;
    encryptionKey: string;
    apiPort?: number;
    wsPort?: number;
  }) {
    // Initialize Prisma client
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: options.databaseUrl,
        },
      },
    });

    // Initialize Redis client
    this.redis = new Redis(options.redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // Initialize services
    this.configService = new ConfigurationService(this.prisma, this.redis);
    this.featureFlagsService = new FeatureFlagsService(this.prisma, this.redis);
    this.secretsService = new SecretManagementService(this.prisma, options.encryptionKey);
    this.cacheService = new CacheService(this.redis, {
      keyPrefix: 'fineprint:config:',
      defaultTTL: 300,
    });
    this.webSocketService = new WebSocketService(
      this.configService,
      this.featureFlagsService,
      this.redis,
      {
        port: options.wsPort || 8080,
      }
    );

    // Initialize Fastify server
    this.fastify = Fastify({
      logger: {
        level: getEnvString('LOG_LEVEL', 'info'),
      },
    });

    // Register routes
    this.setupRoutes();
  }

  // Initialize the system
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Configuration management system is already initialized');
    }

    try {
      // Connect to databases
      await this.prisma.$connect();
      await this.redis.connect();

      console.log('✅ Database connections established');

      // Start cleanup processes
      this.startPeriodicCleanup();

      this.isInitialized = true;
      console.log('✅ Configuration Management System initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Configuration Management System:', error);
      throw error;
    }
  }

  // Start the API server
  async start(port?: number): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const serverPort = port || getEnvNumber('CONFIG_API_PORT', 3001);
    const address = await this.fastify.listen({
      port: serverPort,
      host: '0.0.0.0',
    });

    console.log(`🚀 Configuration Management API server started at ${address}`);
    return address;
  }

  // Stop the system
  async stop(): Promise<void> {
    console.log('🛑 Shutting down Configuration Management System...');

    try {
      // Close WebSocket server
      await this.webSocketService.shutdown();

      // Close Fastify server
      await this.fastify.close();

      // Close database connections
      await this.prisma.$disconnect();
      await this.redis.disconnect();

      this.isInitialized = false;
      console.log('✅ Configuration Management System shut down successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  // Get system health status
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    services: Record<string, any>;
    timestamp: Date;
  }> {
    const services: Record<string, any> = {};
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Check database
    const dbHealth = await this.configService.healthCheck();
    services.database = dbHealth;
    if (!dbHealth.healthy) overallStatus = 'unhealthy';

    // Check Redis
    const cacheHealth = await this.cacheService.healthCheck();
    services.cache = cacheHealth;
    if (!cacheHealth.healthy) overallStatus = overallStatus === 'healthy' ? 'degraded' : 'unhealthy';

    // Check WebSocket
    const wsStats = this.webSocketService.getConnectionStats();
    services.websocket = {
      healthy: true,
      connections: wsStats.totalConnections,
    };

    return {
      status: overallStatus,
      services,
      timestamp: new Date(),
    };
  }

  // Get service instances (for external use)
  getServices() {
    return {
      config: this.configService,
      featureFlags: this.featureFlagsService,
      secrets: this.secretsService,
      cache: this.cacheService,
      webSocket: this.webSocketService,
    };
  }

  // Private methods

  private setupRoutes(): void {
    // Register CORS
    this.fastify.register(require('@fastify/cors'), {
      origin: true,
      credentials: true,
    });

    // Register configuration routes
    this.fastify.register(async (fastify) => {
      await configurationRoutes(
        fastify,
        this.configService,
        this.featureFlagsService,
        this.secretsService
      );
    }, { prefix: '/api' });

    // Health check endpoint
    this.fastify.get('/health', async (request, reply) => {
      const health = await this.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      return reply.code(statusCode).send(health);
    });

    // Metrics endpoint
    this.fastify.get('/metrics', async (request, reply) => {
      const metrics = {
        cache: this.cacheService.getStats(),
        webSocket: this.webSocketService.getConnectionStats(),
        timestamp: new Date(),
      };
      return reply.send(metrics);
    });
  }

  private startPeriodicCleanup(): void {
    // Clean up expired secrets every hour
    setInterval(async () => {
      try {
        const deletedCount = await this.secretsService.cleanupExpiredSecrets();
        if (deletedCount > 0) {
          console.log(`🧹 Cleaned up ${deletedCount} expired secrets`);
        }
      } catch (error) {
        console.error('Failed to clean up expired secrets:', error);
      }
    }, 3600000); // 1 hour

    // Log system stats every 5 minutes
    setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        console.log(`📊 System status: ${health.status}, WebSocket connections: ${health.services.websocket?.connections || 0}`);
      } catch (error) {
        console.error('Failed to log system stats:', error);
      }
    }, 300000); // 5 minutes
  }
}

// Legacy config object for backward compatibility
export const config = {
  // Environment
  NODE_ENV: getEnvEnum('NODE_ENV', ['development', 'staging', 'production'], 'development'),
  LOG_LEVEL: getEnvEnum('LOG_LEVEL', ['debug', 'info', 'warn', 'error'], 'info'),
  
  // Server
  HOST: getEnvString('HOST', '0.0.0.0'),
  PORT: getEnvNumber('PORT', 3000),
  
  // Database
  DATABASE_URL: getEnvString('DATABASE_URL', 'postgresql://localhost:5432/fineprintai'),
  DATABASE_POOL_SIZE: getEnvNumber('DATABASE_POOL_SIZE', 20),
  
  // Redis
  REDIS_URL: getEnvString('REDIS_URL', 'redis://localhost:6379'),
  REDIS_HOST: getEnvString('REDIS_HOST', 'localhost'),
  REDIS_PORT: getEnvNumber('REDIS_PORT', 6379),
  REDIS_PASSWORD: getEnvString('REDIS_PASSWORD', ''),
  REDIS_MAX_RETRIES: getEnvNumber('REDIS_MAX_RETRIES', 3),
  
  // Vector Database
  QDRANT_URL: getEnvString('QDRANT_URL', 'http://localhost:6333'),
  QDRANT_API_KEY: getEnvString('QDRANT_API_KEY', ''),
  QDRANT_COLLECTION: getEnvString('QDRANT_COLLECTION', 'documents'),
  
  // AI/LLM
  OLLAMA_URL: getEnvString('OLLAMA_URL', 'http://localhost:11434'),
  OLLAMA_DEFAULT_MODEL: getEnvString('OLLAMA_DEFAULT_MODEL', 'mistral:7b'),
  OLLAMA_TIMEOUT: getEnvNumber('OLLAMA_TIMEOUT', 300000),
  
  // OpenAI (fallback)
  OPENAI_API_KEY: getEnvString('OPENAI_API_KEY', ''),
  OPENAI_MODEL: getEnvString('OPENAI_MODEL', 'gpt-4'),
  
  // Authentication
  JWT_SECRET: getEnvString('JWT_SECRET', 'your-secret-key-change-in-production'),
  JWT_EXPIRES_IN: getEnvString('JWT_EXPIRES_IN', '24h'),
  
  // Security
  BCRYPT_ROUNDS: getEnvNumber('BCRYPT_ROUNDS', 12),
  RATE_LIMIT_WINDOW: getEnvNumber('RATE_LIMIT_WINDOW', 900000), // 15 minutes
  RATE_LIMIT_MAX: getEnvNumber('RATE_LIMIT_MAX', 100),
  
  // Email
  SMTP_HOST: getEnvString('SMTP_HOST', ''),
  SMTP_PORT: getEnvNumber('SMTP_PORT', 587),
  SMTP_USER: getEnvString('SMTP_USER', ''),
  SMTP_PASS: getEnvString('SMTP_PASS', ''),
  FROM_EMAIL: getEnvString('FROM_EMAIL', 'noreply@fineprintai.com'),
  
  // Webhooks
  WEBHOOK_SECRET: getEnvString('WEBHOOK_SECRET', 'webhook-secret-change-in-production'),
  
  // Monitoring
  METRICS_ENABLED: getEnvBoolean('METRICS_ENABLED', true),
  HEALTH_CHECK_INTERVAL: getEnvNumber('HEALTH_CHECK_INTERVAL', 30000),
  
  // Configuration Management
  CONFIG_ENCRYPTION_KEY: getEnvString('CONFIG_ENCRYPTION_KEY', 'change-this-key-in-production-32-chars'),
  CONFIG_API_PORT: getEnvNumber('CONFIG_API_PORT', 3001),
  CONFIG_WS_PORT: getEnvNumber('CONFIG_WS_PORT', 8080),
  
  // Logging configuration
  logging: {
    level: getEnvEnum('LOG_LEVEL', ['debug', 'info', 'warn', 'error'], 'info'),
    pretty: getEnvBoolean('LOG_PRETTY', process.env.NODE_ENV !== 'production'),
    redact: ['password', 'token', 'secret', 'key', 'authorization']
  },
  
  // Database configuration
  database: {
    url: getEnvString('DATABASE_URL', 'postgresql://localhost:5432/fineprintai'),
    poolSize: getEnvNumber('DATABASE_POOL_SIZE', 20),
    ssl: getEnvBoolean('DATABASE_SSL', false)
  },
  
  // Redis configuration
  redis: {
    url: getEnvString('REDIS_URL', 'redis://localhost:6379'),
    host: getEnvString('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: getEnvString('REDIS_PASSWORD', ''),
    maxRetries: getEnvNumber('REDIS_MAX_RETRIES', 3),
    db: getEnvNumber('REDIS_DB', 0)
  },
  
  // Authentication configuration
  auth: {
    jwt: {
      secret: getEnvString('JWT_SECRET', 'your-secret-key-change-in-production'),
      algorithm: 'HS256' as const,
      accessExpiry: getEnvString('JWT_ACCESS_EXPIRY', '15m'),
      refreshExpiry: getEnvString('JWT_REFRESH_EXPIRY', '7d')
    },
    bcrypt: {
      rounds: getEnvNumber('BCRYPT_ROUNDS', 12)
    },
    rateLimit: {
      windowMs: getEnvNumber('RATE_LIMIT_WINDOW', 900000),
      max: getEnvNumber('RATE_LIMIT_MAX', 100)
    }
  },
  
  // API configuration
  api: {
    host: getEnvString('HOST', '0.0.0.0'),
    port: getEnvNumber('PORT', 3000),
    cors: {
      origin: getEnvString('CORS_ORIGIN', '*'),
      credentials: getEnvBoolean('CORS_CREDENTIALS', true)
    }
  }
};

// Type definitions for better TypeScript support
export type Config = typeof config;
export type NodeEnv = typeof config.NODE_ENV;
export type LogLevel = typeof config.LOG_LEVEL;

// Utility functions
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isStaging = () => config.NODE_ENV === 'staging';

// Validation function to ensure all required environment variables are set
export const validateConfig = (): void => {
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL', 
    'JWT_SECRET',
    'CONFIG_ENCRYPTION_KEY'
  ];
  
  const missing = requiredVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Create and export a default configuration management system instance
export const createConfigurationSystem = (options?: {
  databaseUrl?: string;
  redisUrl?: string;
  encryptionKey?: string;
  apiPort?: number;
  wsPort?: number;
}): ConfigurationManagementSystem => {
  return new ConfigurationManagementSystem({
    databaseUrl: options?.databaseUrl || config.DATABASE_URL,
    redisUrl: options?.redisUrl || config.REDIS_URL,
    encryptionKey: options?.encryptionKey || config.CONFIG_ENCRYPTION_KEY,
    apiPort: options?.apiPort || config.CONFIG_API_PORT,
    wsPort: options?.wsPort || config.CONFIG_WS_PORT,
  });
};

// Export all services and types
export { ConfigurationService } from './services/configuration';
export { FeatureFlagsService } from './services/feature-flags';
export { SecretManagementService } from './services/secrets';
export { WebSocketService } from './services/websocket';
export { CacheService } from './services/cache';
export * from './schemas';
export * from './types';

// Default export for backward compatibility
export default config;