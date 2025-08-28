import Bull, { Queue, Job, JobOptions } from 'bull';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { cache } from '@fineprintai/shared-cache';
import { config } from '@fineprintai/shared-config';
import { WebSocketMessage } from '@fineprintai/shared-types';

const logger = createServiceLogger('message-queue-service');

export interface QueuedMessage extends WebSocketMessage {
  userId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  expiresAt?: Date;
  retries?: number;
  metadata?: {
    queuedAt: Date;
    attempts: number;
    lastAttempt?: Date;
    failureReason?: string;
  };
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface MessageDeliveryOptions {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  delay?: number; // milliseconds
  attempts?: number;
  backoff?: 'exponential' | 'fixed';
  removeOnComplete?: number;
  removeOnFail?: number;
  ttl?: number; // Time to live in milliseconds
}

export class MessageQueueService {
  private messageQueue: Queue<QueuedMessage>;
  private deliveryQueue: Queue<{ userId: string; messages: QueuedMessage[] }>;
  private deadLetterQueue: Queue<QueuedMessage>;
  private initialized = false;
  private readonly MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
  private readonly MAX_QUEUE_SIZE = 10000;
  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    // Initialize queues with Redis connection
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    this.messageQueue = new Bull('websocket-messages', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.deliveryQueue = new Bull('message-delivery', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    this.deadLetterQueue = new Bull('dead-letter-messages', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: false, // Keep all failed messages for analysis
      },
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Setup queue processors
      await this.setupQueueProcessors();

      // Setup queue event handlers
      this.setupQueueEventHandlers();

      // Start queue monitoring
      this.startQueueMonitoring();

      // Clean up old messages periodically
      this.startCleanupJob();

      this.initialized = true;
      logger.info('Message queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize message queue service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      logger.info('Shutting down message queue service...');

      // Wait for active jobs to complete
      await Promise.all([
        this.messageQueue.close(30000), // 30 seconds timeout
        this.deliveryQueue.close(30000),
        this.deadLetterQueue.close(30000),
      ]);

      this.initialized = false;
      logger.info('Message queue service shut down successfully');
    } catch (error) {
      logger.error('Error during message queue service shutdown', { error });
    }
  }

  public async queueMessage(
    userId: string, 
    message: WebSocketMessage, 
    options: MessageDeliveryOptions = {}
  ): Promise<string> {
    try {
      // Validate message size
      const messageSize = Buffer.byteLength(JSON.stringify(message));
      if (messageSize > this.MAX_MESSAGE_SIZE) {
        throw new Error(`Message size (${messageSize}) exceeds maximum allowed (${this.MAX_MESSAGE_SIZE})`);
      }

      // Check queue size for user
      const userQueueSize = await this.getUserQueueSize(userId);
      if (userQueueSize >= this.MAX_QUEUE_SIZE) {
        logger.warn('User queue size limit exceeded', { userId, queueSize: userQueueSize });
        
        // Remove oldest messages to make room
        await this.removeOldestMessages(userId, 100);
      }

      // Create queued message
      const queuedMessage: QueuedMessage = {
        ...message,
        userId,
        priority: options.priority || 'medium',
        expiresAt: options.ttl ? new Date(Date.now() + options.ttl) : new Date(Date.now() + this.DEFAULT_TTL),
        metadata: {
          queuedAt: new Date(),
          attempts: 0,
        },
      };

      // Convert priority to numeric value for Bull
      const priorityValue = this.getPriorityValue(options.priority || 'medium');

      // Queue the message
      const jobOptions: JobOptions = {
        priority: priorityValue,
        delay: options.delay || 0,
        attempts: options.attempts || 3,
        backoff: options.backoff || 'exponential',
        removeOnComplete: options.removeOnComplete || 100,
        removeOnFail: options.removeOnFail || 50,
      };

      const job = await this.messageQueue.add(queuedMessage, jobOptions);

      // Update user queue size cache
      await cache.increment(`user:queue_size:${userId}`);

      logger.debug('Message queued successfully', {
        userId,
        messageType: message.type,
        jobId: job.id,
        priority: options.priority,
        delay: options.delay,
      });

      return job.id?.toString() || '';
    } catch (error) {
      logger.error('Failed to queue message', { error, userId, messageType: message.type });
      throw error;
    }
  }

  public async queueBulkMessages(
    messages: Array<{ userId: string; message: WebSocketMessage; options?: MessageDeliveryOptions }>
  ): Promise<string[]> {
    try {
      const jobs = await Promise.all(
        messages.map(({ userId, message, options }) => 
          this.queueMessage(userId, message, options)
        )
      );

      logger.info('Bulk messages queued successfully', { count: messages.length });
      return jobs;
    } catch (error) {
      logger.error('Failed to queue bulk messages', { error, count: messages.length });
      throw error;
    }
  }

  public async getQueuedMessages(userId: string, limit: number = 100): Promise<QueuedMessage[]> {
    try {
      // Get messages from cache first (for recently queued messages)
      const cachedMessages = await cache.lrange(`user:messages:${userId}`, 0, limit - 1);
      
      if (cachedMessages.length > 0) {
        logger.debug('Retrieved queued messages from cache', { userId, count: cachedMessages.length });
        return cachedMessages;
      }

      // Fallback: get from queue (more expensive)
      const jobs = await this.messageQueue.getJobs(['waiting', 'delayed'], 0, limit);
      const userMessages = jobs
        .filter(job => job.data.userId === userId)
        .map(job => job.data)
        .slice(0, limit);

      logger.debug('Retrieved queued messages from queue', { userId, count: userMessages.length });
      return userMessages;
    } catch (error) {
      logger.error('Failed to get queued messages', { error, userId });
      return [];
    }
  }

  public async clearQueuedMessages(userId: string): Promise<number> {
    try {
      // Clear from cache
      const cacheKey = `user:messages:${userId}`;
      const cachedCount = await cache.del(cacheKey);

      // Clear from queue
      const jobs = await this.messageQueue.getJobs(['waiting', 'delayed']);
      const userJobs = jobs.filter(job => job.data.userId === userId);
      
      await Promise.all(userJobs.map(job => job.remove()));

      // Reset queue size counter
      await cache.del(`user:queue_size:${userId}`);

      const totalCleared = cachedCount + userJobs.length;
      logger.debug('Cleared queued messages', { userId, count: totalCleared });
      
      return totalCleared;
    } catch (error) {
      logger.error('Failed to clear queued messages', { error, userId });
      return 0;
    }
  }

  public async getUserQueueSize(userId: string): Promise<number> {
    try {
      // Get from cache first
      const cachedSize = await cache.get(`user:queue_size:${userId}`);
      if (cachedSize !== null) {
        return cachedSize;
      }

      // Calculate from queue
      const jobs = await this.messageQueue.getJobs(['waiting', 'delayed', 'active']);
      const userJobCount = jobs.filter(job => job.data.userId === userId).length;

      // Cache the result
      await cache.set(`user:queue_size:${userId}`, userJobCount, 300); // 5 minutes TTL

      return userJobCount;
    } catch (error) {
      logger.error('Failed to get user queue size', { error, userId });
      return 0;
    }
  }

  public async getQueueStats(): Promise<QueueStats[]> {
    try {
      const queues = [this.messageQueue, this.deliveryQueue, this.deadLetterQueue];
      const stats: QueueStats[] = [];

      for (const queue of queues) {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        const delayed = await queue.getDelayed();

        stats.push({
          name: queue.name,
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          paused: await queue.isPaused(),
        });
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get queue stats', { error });
      return [];
    }
  }

  public async getDetailedStats(): Promise<{
    queues: QueueStats[];
    users: Array<{
      userId: string;
      queueSize: number;
      oldestMessage?: Date;
      newestMessage?: Date;
    }>;
    totalMessages: number;
    messageTypes: Record<string, number>;
  }> {
    try {
      const queueStats = await this.getQueueStats();
      
      // Get user statistics
      const userStatsKeys = await cache.keys('user:queue_size:*');
      const users = [];
      
      for (const key of userStatsKeys) {
        const userId = key.replace('user:queue_size:', '');
        const queueSize = await cache.get(key) || 0;
        
        if (queueSize > 0) {
          const messages = await this.getQueuedMessages(userId, 1);
          users.push({
            userId,
            queueSize,
            oldestMessage: messages[0]?.metadata?.queuedAt,
            newestMessage: messages[messages.length - 1]?.metadata?.queuedAt,
          });
        }
      }

      // Get message type statistics
      const jobs = await this.messageQueue.getJobs(['waiting', 'delayed', 'active']);
      const messageTypes: Record<string, number> = {};
      
      for (const job of jobs) {
        const messageType = job.data.type;
        messageTypes[messageType] = (messageTypes[messageType] || 0) + 1;
      }

      return {
        queues: queueStats,
        users,
        totalMessages: jobs.length,
        messageTypes,
      };
    } catch (error) {
      logger.error('Failed to get detailed stats', { error });
      return {
        queues: [],
        users: [],
        totalMessages: 0,
        messageTypes: {},
      };
    }
  }

  public async getHealthStatus(): Promise<{ healthy: boolean; details?: any }> {
    try {
      const stats = await this.getQueueStats();
      const healthy = stats.every(stat => !stat.paused);

      return {
        healthy,
        details: {
          initialized: this.initialized,
          queues: stats,
        },
      };
    } catch (error) {
      logger.error('Error getting queue health status', { error });
      return { healthy: false };
    }
  }

  // Private methods

  private async setupQueueProcessors(): Promise<void> {
    // Message queue processor
    this.messageQueue.process('*', async (job: Job<QueuedMessage>) => {
      const message = job.data;
      
      try {
        // Update attempt count
        if (message.metadata) {
          message.metadata.attempts++;
          message.metadata.lastAttempt = new Date();
        }

        // Check if message has expired
        if (message.expiresAt && new Date() > message.expiresAt) {
          logger.debug('Message expired, moving to dead letter queue', {
            userId: message.userId,
            messageType: message.type,
            expiresAt: message.expiresAt,
          });
          
          await this.deadLetterQueue.add(message);
          return { status: 'expired' };
        }

        // Cache the message for immediate delivery when user comes online
        await cache.lpush(`user:messages:${message.userId}`, message);
        await cache.expire(`user:messages:${message.userId}`, 86400); // 24 hours

        logger.debug('Message processed and cached', {
          userId: message.userId,
          messageType: message.type,
          jobId: job.id,
        });

        return { status: 'cached' };
      } catch (error) {
        logger.error('Error processing message', { 
          error, 
          userId: message.userId, 
          messageType: message.type,
          jobId: job.id,
        });
        
        // Update failure metadata
        if (message.metadata) {
          message.metadata.failureReason = error.message;
        }
        
        throw error;
      }
    });

    // Delivery queue processor (handles batch delivery to online users)
    this.deliveryQueue.process(async (job: Job<{ userId: string; messages: QueuedMessage[] }>) => {
      const { userId, messages } = job.data;
      
      try {
        // This would be called by the WebSocket service when a user comes online
        // For now, we just log the delivery attempt
        logger.debug('Batch delivery processed', { userId, messageCount: messages.length });
        
        return { status: 'delivered', count: messages.length };
      } catch (error) {
        logger.error('Error in batch delivery', { error, userId, messageCount: messages.length });
        throw error;
      }
    });

    // Dead letter queue processor (for analysis and potential reprocessing)
    this.deadLetterQueue.process(async (job: Job<QueuedMessage>) => {
      const message = job.data;
      
      logger.info('Processing dead letter message', {
        userId: message.userId,
        messageType: message.type,
        originalTimestamp: message.timestamp,
        attempts: message.metadata?.attempts,
        failureReason: message.metadata?.failureReason,
      });

      // Here you could implement logic to:
      // 1. Send to external notification service
      // 2. Store in database for later analysis
      // 3. Attempt alternative delivery methods

      return { status: 'logged' };
    });

    logger.info('Queue processors setup completed');
  }

  private setupQueueEventHandlers(): void {
    // Message queue events
    this.messageQueue.on('completed', (job, result) => {
      logger.debug('Message job completed', { jobId: job.id, result });
    });

    this.messageQueue.on('failed', (job, err) => {
      logger.warn('Message job failed', { jobId: job.id, error: err.message });
    });

    this.messageQueue.on('stalled', (job) => {
      logger.warn('Message job stalled', { jobId: job.id });
    });

    // Delivery queue events
    this.deliveryQueue.on('completed', (job, result) => {
      logger.debug('Delivery job completed', { jobId: job.id, result });
    });

    this.deliveryQueue.on('failed', (job, err) => {
      logger.warn('Delivery job failed', { jobId: job.id, error: err.message });
    });

    // Dead letter queue events
    this.deadLetterQueue.on('completed', (job, result) => {
      logger.debug('Dead letter job processed', { jobId: job.id, result });
    });

    logger.info('Queue event handlers setup completed');
  }

  private startQueueMonitoring(): void {
    // Monitor queue health every 5 minutes
    setInterval(async () => {
      try {
        const stats = await this.getQueueStats();
        
        for (const stat of stats) {
          if (stat.failed > 100) {
            logger.warn('High failure rate detected', { queue: stat.name, failedJobs: stat.failed });
          }
          
          if (stat.waiting > 1000) {
            logger.warn('High queue backlog detected', { queue: stat.name, waitingJobs: stat.waiting });
          }
        }
      } catch (error) {
        logger.error('Error in queue monitoring', { error });
      }
    }, 5 * 60 * 1000); // 5 minutes

    logger.info('Queue monitoring started');
  }

  private startCleanupJob(): void {
    // Clean up expired messages every hour
    setInterval(async () => {
      try {
        await this.cleanupExpiredMessages();
      } catch (error) {
        logger.error('Error in cleanup job', { error });
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Cleanup job started');
  }

  private async cleanupExpiredMessages(): Promise<void> {
    try {
      const jobs = await this.messageQueue.getJobs(['waiting', 'delayed']);
      let cleanedCount = 0;

      for (const job of jobs) {
        const message = job.data;
        if (message.expiresAt && new Date() > message.expiresAt) {
          await job.remove();
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up expired messages', { count: cleanedCount });
      }
    } catch (error) {
      logger.error('Error cleaning up expired messages', { error });
    }
  }

  private async removeOldestMessages(userId: string, count: number): Promise<void> {
    try {
      const jobs = await this.messageQueue.getJobs(['waiting', 'delayed']);
      const userJobs = jobs
        .filter(job => job.data.userId === userId)
        .sort((a, b) => (a.data.metadata?.queuedAt?.getTime() || 0) - (b.data.metadata?.queuedAt?.getTime() || 0))
        .slice(0, count);

      await Promise.all(userJobs.map(job => job.remove()));

      // Update queue size counter
      await cache.decrement(`user:queue_size:${userId}`, count);

      logger.debug('Removed oldest messages', { userId, count: userJobs.length });
    } catch (error) {
      logger.error('Error removing oldest messages', { error, userId, count });
    }
  }

  private getPriorityValue(priority: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (priority) {
      case 'critical': return 1;
      case 'high': return 2;
      case 'medium': return 3;
      case 'low': return 4;
      default: return 3;
    }
  }
}