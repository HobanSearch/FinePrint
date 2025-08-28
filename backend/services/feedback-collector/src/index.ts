/**
 * Main feedback collector service
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import { Kafka } from 'kafkajs';
import pino from 'pino';
import * as Sentry from '@sentry/node';
import {
  ImplicitFeedbackEvent,
  ExplicitFeedbackEvent,
  AnalyticsQuery,
  ApiResponse,
  HealthStatus,
  WebSocketMessage,
  FeedbackStreamEvent,
  ConsentLevel,
  IssueType
} from './types';
import { ImplicitFeedbackCollector } from './collectors/implicit-collector';
import { ExplicitFeedbackCollector } from './collectors/explicit-collector';
import { EventValidator } from './collectors/event-validator';
import { PrivacyManager } from './privacy/consent-manager';
import { EventStreamProcessor } from './streaming/event-processor';
import { Aggregator } from './streaming/aggregator';
import { BatchProcessor } from './streaming/batch-processor';

// Configuration
const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: 'feedback-collector',
    connectionTimeout: 10000,
    retry: {
      retries: 5,
      initialRetryTime: 100
    }
  },
  clickhouse: {
    url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB || 'feedback',
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD
  },
  sentry: {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development'
  },
  rateLimit: {
    max: 1000,
    timeWindow: '1 minute'
  }
};

export class FeedbackCollectorService {
  private fastify: FastifyInstance;
  private redis: Redis;
  private kafka: Kafka;
  private logger: pino.Logger;
  private implicitCollector: ImplicitFeedbackCollector;
  private explicitCollector: ExplicitFeedbackCollector;
  private eventValidator: EventValidator;
  private privacyManager: PrivacyManager;
  private streamProcessor: EventStreamProcessor;
  private aggregator: Aggregator;
  private batchProcessor: BatchProcessor;
  private wsClients: Set<any> = new Set();

  constructor() {
    // Initialize logger
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    });

    // Initialize Sentry
    if (config.sentry.dsn) {
      Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.sentry.environment,
        tracesSampleRate: 0.1
      });
    }

    // Initialize Redis
    this.redis = new Redis(config.redis);
    this.redis.on('error', (err) => {
      this.logger.error({ err }, 'Redis connection error');
    });

    // Initialize Kafka
    this.kafka = new Kafka(config.kafka);

    // Initialize components
    this.eventValidator = new EventValidator(this.logger);
    this.privacyManager = new PrivacyManager(this.redis, this.logger);
    this.implicitCollector = new ImplicitFeedbackCollector(
      this.kafka,
      this.redis,
      this.logger,
      this.eventValidator,
      this.privacyManager
    );
    this.explicitCollector = new ExplicitFeedbackCollector(
      this.kafka,
      this.redis,
      this.logger,
      this.eventValidator,
      this.privacyManager
    );
    this.aggregator = new Aggregator(this.redis, this.logger);
    this.batchProcessor = new BatchProcessor(this.redis, this.logger, config.clickhouse);
    this.streamProcessor = new EventStreamProcessor(
      this.kafka,
      this.redis,
      this.logger,
      this.aggregator,
      this.batchProcessor
    );

    // Initialize Fastify
    this.fastify = Fastify({
      logger: this.logger,
      requestIdHeader: 'x-request-id',
      requestIdLogLabel: 'requestId',
      trustProxy: true
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.fastify.register(fastifyCors, {
      origin: (origin, cb) => {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
        cb(null, allowedOrigins.includes(origin || '') || !origin);
      },
      credentials: true
    });

    // Security headers
    this.fastify.register(fastifyHelmet, {
      contentSecurityPolicy: false
    });

    // Rate limiting
    this.fastify.register(fastifyRateLimit, config.rateLimit);

    // Error handler
    this.fastify.setErrorHandler((error, request, reply) => {
      this.logger.error({ error, request: request.raw }, 'Request error');
      
      if (config.sentry.dsn) {
        Sentry.captureException(error);
      }

      reply.status(error.statusCode || 500).send({
        success: false,
        error: {
          code: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Internal server error'
        }
      });
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check
    this.fastify.get('/health', async (request, reply) => {
      const health = await this.getHealthStatus();
      reply.status(health.status === 'healthy' ? 200 : 503).send(health);
    });

    // Implicit feedback endpoints
    this.fastify.post<{ Body: Partial<ImplicitFeedbackEvent> }>(
      '/feedback/implicit/event',
      async (request, reply) => {
        try {
          const eventId = await this.implicitCollector.collectEvent(request.body);
          const response: ApiResponse<{ eventId: string }> = {
            success: true,
            data: { eventId },
            metadata: {
              timestamp: new Date(),
              requestId: request.id,
              duration: reply.getResponseTime()
            }
          };
          reply.send(response);
        } catch (error) {
          throw error;
        }
      }
    );

    this.fastify.post<{ Body: Partial<ImplicitFeedbackEvent>[] }>(
      '/feedback/implicit/batch',
      async (request, reply) => {
        const eventIds = await this.implicitCollector.collectBatch(request.body);
        const response: ApiResponse<{ eventIds: string[] }> = {
          success: true,
          data: { eventIds },
          metadata: {
            timestamp: new Date(),
            requestId: request.id,
            duration: reply.getResponseTime()
          }
        };
        reply.send(response);
      }
    );

    // Explicit feedback endpoints
    this.fastify.post<{
      Body: {
        contentId: string;
        rating: number;
        modelType: string;
        userId?: string;
        comment?: string;
      }
    }>('/feedback/explicit/rating', async (request, reply) => {
      const { contentId, rating, modelType, userId, comment } = request.body;
      const feedbackId = await this.explicitCollector.collectRating(
        contentId,
        rating,
        modelType,
        userId,
        comment
      );
      const response: ApiResponse<{ feedbackId: string }> = {
        success: true,
        data: { feedbackId },
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.post<{
      Body: {
        contentId: string;
        thumbsUp: boolean;
        modelType: string;
        userId?: string;
      }
    }>('/feedback/explicit/thumbs', async (request, reply) => {
      const { contentId, thumbsUp, modelType, userId } = request.body;
      const feedbackId = await this.explicitCollector.collectThumbs(
        contentId,
        thumbsUp,
        modelType,
        userId
      );
      const response: ApiResponse<{ feedbackId: string }> = {
        success: true,
        data: { feedbackId },
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.post<{
      Body: {
        contentId: string;
        comment: string;
        modelType: string;
        userId?: string;
      }
    }>('/feedback/explicit/comment', async (request, reply) => {
      const { contentId, comment, modelType, userId } = request.body;
      const feedbackId = await this.explicitCollector.collectComment(
        contentId,
        comment,
        modelType,
        userId
      );
      const response: ApiResponse<{ feedbackId: string }> = {
        success: true,
        data: { feedbackId },
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.post<{
      Body: {
        contentId: string;
        issueType: IssueType;
        description: string;
        modelType: string;
        userId?: string;
        priority?: 'low' | 'medium' | 'high' | 'critical';
      }
    }>('/feedback/explicit/report', async (request, reply) => {
      const { contentId, issueType, description, modelType, userId, priority } = request.body;
      const feedbackId = await this.explicitCollector.reportIssue(
        contentId,
        issueType,
        description,
        modelType,
        userId,
        priority
      );
      const response: ApiResponse<{ feedbackId: string }> = {
        success: true,
        data: { feedbackId },
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    // Analytics endpoints
    this.fastify.get<{ Querystring: AnalyticsQuery }>(
      '/analytics/metrics',
      async (request, reply) => {
        const query = request.query;
        const metrics = await this.aggregator.getAggregatedMetrics(
          query.modelType!,
          query.period.start,
          query.period.end,
          query.granularity
        );
        const response: ApiResponse<any> = {
          success: true,
          data: metrics,
          metadata: {
            timestamp: new Date(),
            requestId: request.id,
            duration: reply.getResponseTime()
          }
        };
        reply.send(response);
      }
    );

    this.fastify.get<{
      Querystring: {
        modelType?: string;
        period?: string;
      }
    }>('/analytics/sentiment', async (request, reply) => {
      const { modelType = 'all', period = '7d' } = request.query;
      const sentiment = await this.getSentimentAnalysis(modelType, period);
      const response: ApiResponse<any> = {
        success: true,
        data: sentiment,
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.get<{
      Querystring: {
        eventType?: string;
        limit?: number;
      }
    }>('/analytics/patterns', async (request, reply) => {
      const { eventType = 'all', limit = 10 } = request.query;
      const patterns = await this.getPatterns(eventType, limit);
      const response: ApiResponse<any> = {
        success: true,
        data: patterns,
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.get<{
      Querystring: {
        threshold?: number;
      }
    }>('/analytics/anomalies', async (request, reply) => {
      const { threshold = 2.5 } = request.query;
      const anomalies = await this.getAnomalies(threshold);
      const response: ApiResponse<any> = {
        success: true,
        data: anomalies,
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    // Privacy endpoints
    this.fastify.post<{
      Body: {
        userId: string;
        consentLevels: ConsentLevel[];
        ipAddress?: string;
        userAgent?: string;
      }
    }>('/privacy/consent', async (request, reply) => {
      const { userId, consentLevels, ipAddress, userAgent } = request.body;
      const consent = await this.privacyManager.recordConsent(
        userId,
        consentLevels,
        ipAddress,
        userAgent
      );
      const response: ApiResponse<any> = {
        success: true,
        data: consent,
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.delete<{
      Params: { userId: string }
    }>('/privacy/consent/:userId', async (request, reply) => {
      await this.privacyManager.withdrawConsent(request.params.userId);
      const response: ApiResponse<any> = {
        success: true,
        data: { message: 'Consent withdrawn successfully' },
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.get<{
      Params: { userId: string }
    }>('/privacy/export/:userId', async (request, reply) => {
      const data = await this.privacyManager.exportUserData(request.params.userId);
      const response: ApiResponse<any> = {
        success: true,
        data,
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });

    this.fastify.delete<{
      Params: { userId: string }
    }>('/privacy/data/:userId', async (request, reply) => {
      await this.privacyManager.deleteUserData(request.params.userId);
      const response: ApiResponse<any> = {
        success: true,
        data: { message: 'User data deleted successfully' },
        metadata: {
          timestamp: new Date(),
          requestId: request.id,
          duration: reply.getResponseTime()
        }
      };
      reply.send(response);
    });
  }

  /**
   * Setup WebSocket for real-time feedback stream
   */
  private setupWebSocket(): void {
    this.fastify.register(fastifyWebsocket);

    this.fastify.register(async (fastify) => {
      fastify.get('/ws/feedback-stream', { websocket: true }, (connection, req) => {
        const socket = connection.socket;
        
        // Add client to set
        this.wsClients.add(socket);
        
        // Subscribe to stream
        const streamHandler = (event: FeedbackStreamEvent) => {
          if (socket.readyState === 1) { // WebSocket.OPEN
            socket.send(JSON.stringify(event));
          }
        };
        
        this.streamProcessor.subscribeToStream(streamHandler);
        
        // Handle messages from client
        socket.on('message', (message: string) => {
          try {
            const msg: WebSocketMessage = JSON.parse(message);
            this.handleWebSocketMessage(socket, msg);
          } catch (error) {
            this.logger.error({ error }, 'Invalid WebSocket message');
          }
        });
        
        // Handle disconnect
        socket.on('close', () => {
          this.wsClients.delete(socket);
          this.streamProcessor.unsubscribeFromStream(streamHandler);
        });
        
        // Send initial ping
        socket.send(JSON.stringify({
          type: 'ping',
          timestamp: new Date()
        }));
      });
    });
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(socket: any, message: WebSocketMessage): void {
    switch (message.type) {
      case 'subscribe':
        // Handle subscription to specific channels
        this.logger.info({ channel: message.channel }, 'WebSocket subscription');
        break;
      case 'unsubscribe':
        // Handle unsubscription
        this.logger.info({ channel: message.channel }, 'WebSocket unsubscription');
        break;
      case 'ping':
        // Respond with pong
        socket.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date()
        }));
        break;
      default:
        this.logger.warn({ type: message.type }, 'Unknown WebSocket message type');
    }
  }

  /**
   * Get health status
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    const health: HealthStatus = {
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      services: {
        database: false,
        redis: false,
        kafka: false,
        analytics: false
      },
      metrics: {
        eventsPerSecond: 0,
        activeConnections: this.wsClients.size,
        queueSize: 0,
        errorRate: 0
      }
    };

    try {
      // Check Redis
      await this.redis.ping();
      health.services.redis = true;

      // Check Kafka (simplified)
      health.services.kafka = true;

      // Get metrics
      const metrics = await this.redis.hgetall('metrics:realtime:health');
      if (metrics) {
        health.metrics.eventsPerSecond = parseFloat(metrics.eventsPerSecond || '0');
        health.metrics.queueSize = parseInt(metrics.queueSize || '0');
        health.metrics.errorRate = parseFloat(metrics.errorRate || '0');
      }

      // Determine overall status
      if (!health.services.redis || !health.services.kafka) {
        health.status = 'unhealthy';
      } else if (health.metrics.errorRate > 5) {
        health.status = 'degraded';
      }
    } catch (error) {
      this.logger.error({ error }, 'Health check failed');
      health.status = 'unhealthy';
    }

    return health;
  }

  /**
   * Get sentiment analysis
   */
  private async getSentimentAnalysis(modelType: string, period: string): Promise<any> {
    const key = `sentiment:${modelType}`;
    const sentiment = await this.redis.hgetall(key);
    return sentiment || { average: 0, positive: 0, negative: 0, neutral: 0 };
  }

  /**
   * Get patterns
   */
  private async getPatterns(eventType: string, limit: number): Promise<any[]> {
    const key = `patterns:${eventType}`;
    const patterns = await this.redis.get(key);
    return patterns ? JSON.parse(patterns).slice(0, limit) : [];
  }

  /**
   * Get anomalies
   */
  private async getAnomalies(threshold: number): Promise<any[]> {
    const alerts = await this.redis.lrange('alerts:feedback', 0, 99);
    return alerts
      .map(a => JSON.parse(a))
      .filter(a => a.type === 'anomaly');
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    try {
      // Initialize collectors
      await this.implicitCollector.initialize();
      await this.explicitCollector.initialize();
      
      // Initialize stream processor
      await this.streamProcessor.initialize();
      
      // Initialize batch processor
      await this.batchProcessor.initialize();
      
      // Start privacy tasks
      setInterval(() => {
        this.privacyManager.processDeletionQueue().catch(err =>
          this.logger.error({ err }, 'Failed to process deletion queue')
        );
      }, 3600000); // Every hour
      
      setInterval(() => {
        this.privacyManager.applyRetentionPolicies().catch(err =>
          this.logger.error({ err }, 'Failed to apply retention policies')
        );
      }, 86400000); // Every day
      
      // Start aggregator cleanup
      setInterval(() => {
        this.aggregator.cleanupOldBuckets();
      }, 300000); // Every 5 minutes
      
      // Start Fastify server
      await this.fastify.listen({
        port: config.port,
        host: config.host
      });
      
      this.logger.info(
        { port: config.port, host: config.host },
        'Feedback collector service started'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to start service');
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    try {
      // Close WebSocket connections
      for (const socket of this.wsClients) {
        socket.close();
      }
      
      // Shutdown collectors
      await this.implicitCollector.shutdown();
      await this.explicitCollector.shutdown();
      
      // Shutdown processors
      await this.streamProcessor.shutdown();
      await this.batchProcessor.shutdown();
      
      // Close connections
      await this.redis.quit();
      await this.fastify.close();
      
      this.logger.info('Feedback collector service stopped');
    } catch (error) {
      this.logger.error({ error }, 'Error during shutdown');
      throw error;
    }
  }
}

// Start service if run directly
if (require.main === module) {
  const service = new FeedbackCollectorService();
  
  // Handle graceful shutdown
  const shutdown = async () => {
    try {
      await service.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Start service
  service.start().catch((error) => {
    console.error('Failed to start service:', error);
    process.exit(1);
  });
}