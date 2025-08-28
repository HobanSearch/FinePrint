/**
 * Fine Print AI - Shared Memory Service
 * Main entry point for the distributed memory system
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { MemoryService, MemoryServiceConfig } from './services/memory-service';
import { memoryRoutes } from './routes';
import { Logger } from './utils/logger';
import { Metrics } from './utils/metrics';

// Re-export types for external use
export * from './types';
export * from './services/memory-service';
export * from './services/storage/storage-manager';

interface MemoryServerConfig {
  port: number;
  host: string;
  memory: MemoryServiceConfig;
  security: {
    enableCors: boolean;
    enableHelmet: boolean;
    enableRateLimit: boolean;
    rateLimitMax: number;
    rateLimitTimeWindow: string;
  };
  websocket: {
    enabled: boolean;
    heartbeatInterval: number;
  };
}

export class MemoryServer {
  private fastify: FastifyInstance;
  private memoryService: MemoryService;
  private logger: Logger;
  private metrics: Metrics;
  private config: MemoryServerConfig;

  constructor(config: MemoryServerConfig) {
    this.config = config;
    this.logger = Logger.getInstance('MemoryServer');
    this.metrics = Metrics.getInstance();

    // Initialize Fastify
    this.fastify = Fastify({
      logger: false, // Use custom logger
      trustProxy: true,
    });

    // Initialize memory service
    this.memoryService = new MemoryService(config.memory);
  }

  async initialize(): Promise<void> {
    try {
      // Register security plugins
      if (this.config.security.enableCors) {
        await this.fastify.register(cors, {
          origin: true,
          credentials: true,
        });
      }

      if (this.config.security.enableHelmet) {
        await this.fastify.register(helmet);
      }

      if (this.config.security.enableRateLimit) {
        await this.fastify.register(rateLimit, {
          max: this.config.security.rateLimitMax,
          timeWindow: this.config.security.rateLimitTimeWindow,
        });
      }

      // Register WebSocket support
      if (this.config.websocket.enabled) {
        await this.fastify.register(websocket);
        this.setupWebSocketHandlers();
      }

      // Register memory service as decorator
      this.fastify.decorate('memoryService', this.memoryService);

      // Register routes
      await this.fastify.register(memoryRoutes, { prefix: '/api/v1' });

      // Global error handler
      this.fastify.setErrorHandler((error, request, reply) => {
        this.logger.error('Unhandled error:', error);
        this.metrics.increment('server.errors');
        
        reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An internal server error occurred',
          },
        });
      });

      // Global hooks
      this.fastify.addHook('onRequest', async (request, reply) => {
        const startTime = Date.now();
        request.startTime = startTime;
        this.metrics.increment('server.requests');
      });

      this.fastify.addHook('onResponse', async (request, reply) => {
        const responseTime = Date.now() - (request.startTime || Date.now());
        this.metrics.histogram('server.response_time', responseTime);
      });

      this.logger.info('Memory server initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize memory server:', error);
      throw error;
    }
  }

  private setupWebSocketHandlers(): void {
    this.fastify.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection, request) => {
        const logger = Logger.getInstance('WebSocket');
        
        connection.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            logger.debug('Received WebSocket message:', data);
            
            // Handle different message types
            switch (data.type) {
              case 'subscribe':
                // Subscribe to memory updates for specific agent
                break;
              case 'unsubscribe':
                // Unsubscribe from updates
                break;
              case 'ping':
                connection.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;
            }
          } catch (error) {
            logger.error('WebSocket message error:', error);
          }
        });

        connection.on('close', () => {
          logger.debug('WebSocket connection closed');
        });

        // Send heartbeat
        const heartbeat = setInterval(() => {
          if (connection.readyState === connection.OPEN) {
            connection.ping();
          } else {
            clearInterval(heartbeat);
          }
        }, this.config.websocket.heartbeatInterval);
      });
    });
  }

  async start(): Promise<void> {
    try {
      await this.initialize();
      
      await this.fastify.listen({
        port: this.config.port,
        host: this.config.host,
      });

      this.logger.info(`Memory server started on ${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.logger.error('Failed to start memory server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.logger.info('Shutting down memory server...');
      
      await this.memoryService.shutdown();
      await this.fastify.close();
      
      this.logger.info('Memory server shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  get server(): FastifyInstance {
    return this.fastify;
  }

  get service(): MemoryService {
    return this.memoryService;
  }
}

// Default configuration
export const defaultConfig: MemoryServerConfig = {
  port: parseInt(process.env.MEMORY_SERVICE_PORT || '3001'),
  host: process.env.MEMORY_SERVICE_HOST || '0.0.0.0',
  memory: {
    storage: {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        ttl: parseInt(process.env.REDIS_TTL || '3600'),
        maxMemorySize: parseInt(process.env.REDIS_MAX_MEMORY || '1073741824'),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'memory:',
        compressionEnabled: process.env.REDIS_COMPRESSION === 'true',
      },
      postgresql: {
        databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/fineprint_memory',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
        queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
        enableVectorSearch: process.env.ENABLE_VECTOR_SEARCH !== 'false',
        vectorDimensions: parseInt(process.env.VECTOR_DIMENSIONS || '384'),
      },
      s3: {
        bucket: process.env.S3_BUCKET || 'fineprint-memory-cold',
        region: process.env.S3_REGION || 'us-east-1',
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        compressionLevel: parseInt(process.env.S3_COMPRESSION_LEVEL || '6'),
        keyPrefix: process.env.S3_KEY_PREFIX || 'memories/',
        lifecycleRules: {
          transitionToIA: parseInt(process.env.S3_TRANSITION_IA_DAYS || '30'),
          transitionToGlacier: parseInt(process.env.S3_TRANSITION_GLACIER_DAYS || '90'),
          expiration: parseInt(process.env.S3_EXPIRATION_DAYS || '2555'), // 7 years
        },
      },
      tierMigration: {
        hotToWarmDays: parseInt(process.env.HOT_TO_WARM_DAYS || '7'),
        warmToColdDays: parseInt(process.env.WARM_TO_COLD_DAYS || '30'),
        batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '100'),
        migrationSchedule: process.env.MIGRATION_SCHEDULE || '0 2 * * *', // Daily at 2 AM
      },
    },
    consolidation: {
      enabled: process.env.CONSOLIDATION_ENABLED !== 'false',
      threshold: parseFloat(process.env.CONSOLIDATION_THRESHOLD || '0.8'),
      schedule: process.env.CONSOLIDATION_SCHEDULE || '0 3 * * *', // Daily at 3 AM
    },
    lifecycle: {
      enabled: process.env.LIFECYCLE_ENABLED !== 'false',
      cleanupSchedule: process.env.LIFECYCLE_SCHEDULE || '0 4 * * *', // Daily at 4 AM
      retentionPolicies: {}, // Would be loaded from config
    },
    sharing: {
      enabled: process.env.SHARING_ENABLED !== 'false',
      defaultPermissions: {
        canRead: true,
        canWrite: false,
        canDelete: false,
        canShare: false,
      },
    },
    security: {
      encryptionEnabled: process.env.ENCRYPTION_ENABLED === 'true',
      accessLogging: process.env.ACCESS_LOGGING !== 'false',
      auditTrail: process.env.AUDIT_TRAIL !== 'false',
    },
  },
  security: {
    enableCors: process.env.ENABLE_CORS !== 'false',
    enableHelmet: process.env.ENABLE_HELMET !== 'false',
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
    rateLimitTimeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },
  websocket: {
    enabled: process.env.WEBSOCKET_ENABLED !== 'false',
    heartbeatInterval: parseInt(process.env.WEBSOCKET_HEARTBEAT || '30000'),
  },
};

// CLI runner
if (require.main === module) {
  const server = new MemoryServer(defaultConfig);
  
  server.start().catch(error => {
    console.error('Failed to start memory server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}