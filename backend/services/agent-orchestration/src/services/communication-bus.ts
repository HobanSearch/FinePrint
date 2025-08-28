import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';

import { Logger } from '../utils/logger';
import { config } from '../config';
import {
  Message,
  MessageType,
  MessagePriority,
  DeliveryGuarantee,
  MessageRoute,
  MessageQueue,
  MessageBus,
  MessageHandler,
  CommunicationProtocol,
  MessageMetrics,
  MessageChannel,
} from '../types/communication';

const logger = Logger.child({ component: 'communication-bus' });
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CommunicationBus extends EventEmitter implements MessageBus {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private subscribers: Map<string, Set<MessageHandler>> = new Map();
  private routes: Map<string, MessageRoute> = new Map();
  private channels: Map<string, MessageChannel> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private messageMetrics: Map<string, MessageMetrics> = new Map();
  private encryptionKey: Buffer;
  private protocol: CommunicationProtocol;

  constructor() {
    super();
    this.setMaxListeners(10000); // Support many subscribers
    
    this.encryptionKey = crypto.randomBytes(32);
    this.protocol = {
      name: 'Fineprint Agent Communication Protocol',
      version: '1.0.0',
      transport: 'websocket',
      serialization: 'json',
      compression: config.communication.compressionEnabled ? 'gzip' : undefined,
      encryption: config.communication.enableEncryption ? {
        algorithm: 'aes-256-gcm',
        keyRotation: 86400000, // 24 hours
      } : undefined,
      authentication: {
        type: 'jwt',
        config: {
          secret: config.jwt.secret,
          expiresIn: config.jwt.expiresIn,
        },
      },
      rateLimit: {
        maxRequests: 1000,
        windowMs: 60000, // 1 minute
      },
    };
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Communication Bus...');

      // Initialize Redis connection
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        maxRetriesPerRequest: config.redis.maxRetries,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
        lazyConnect: true,
      });

      await this.redis.connect();

      // Initialize default queues
      await this.createQueue('default', { type: 'priority' });
      await this.createQueue('broadcast', { type: 'fifo' });
      await this.createQueue('requests', { type: 'priority' });
      await this.createQueue('responses', { type: 'fifo' });
      await this.createQueue('events', { type: 'fifo' });
      await this.createQueue('notifications', { type: 'priority' });

      // Setup message routes
      await this.setupDefaultRoutes();

      // Setup channels
      await this.setupDefaultChannels();

      // Start metrics collection
      this.startMetricsCollection();

      logger.info('Communication Bus initialized successfully', {
        queues: this.queues.size,
        routes: this.routes.size,
        channels: this.channels.size,
        protocol: this.protocol.name,
      });
    } catch (error) {
      logger.error('Failed to initialize Communication Bus', { error: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Communication Bus...');

    // Close all workers
    for (const [name, worker] of this.workers.entries()) {
      await worker.close();
      logger.debug('Stopped worker', { name });
    }
    this.workers.clear();

    // Close all queues
    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      logger.debug('Closed queue', { name });
    }
    this.queues.clear();

    // Reject pending requests
    for (const [id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Communication bus shutting down'));
    }
    this.pendingRequests.clear();

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    logger.info('Communication Bus stopped');
  }

  // Message Bus Implementation
  async publish(message: Message): Promise<void> {
    try {
      // Validate message
      this.validateMessage(message);

      // Apply message routes
      const routedMessage = await this.applyRoutes(message);

      // Encrypt if enabled
      const processedMessage = await this.processMessage(routedMessage);

      // Record metrics
      this.recordMessageMetric(processedMessage, 'sent');

      // Determine target queue
      const queueName = this.getQueueForMessage(processedMessage);
      const queue = this.queues.get(queueName);

      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      // Add to queue with priority and delay
      await queue.add(
        'process_message',
        processedMessage,
        {
          priority: this.getPriorityScore(processedMessage.priority),
          delay: processedMessage.metadata?.delay || 0,
          removeOnComplete: config.queue.defaultJobOptions.removeOnComplete,
          removeOnFail: config.queue.defaultJobOptions.removeOnFail,
          attempts: processedMessage.retryPolicy?.maxRetries || config.queue.defaultJobOptions.attempts,
          backoff: {
            type: processedMessage.retryPolicy ? 'exponential' : config.queue.defaultJobOptions.backoff.type,
            delay: processedMessage.retryPolicy?.initialDelay || config.queue.defaultJobOptions.backoff.delay,
          },
        }
      );

      this.emit('message:published', { message: processedMessage, queue: queueName });

      logger.debug('Message published', {
        messageId: message.id,
        type: message.type,
        subject: message.subject,
        from: message.from,
        to: message.to,
        queue: queueName,
      });
    } catch (error) {
      logger.error('Failed to publish message', {
        messageId: message.id,
        error: error.message,
      });
      throw error;
    }
  }

  async subscribe(pattern: string, handler: MessageHandler): Promise<void> {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }

    this.subscribers.get(pattern)!.add(handler);

    // Start worker for this pattern if not exists
    const workerKey = `subscriber:${pattern}`;
    if (!this.workers.has(workerKey)) {
      await this.createSubscriberWorker(pattern);
    }

    logger.debug('Subscribed to pattern', { pattern, handlerCount: this.subscribers.get(pattern)!.size });
  }

  async unsubscribe(pattern: string, handler: MessageHandler): Promise<void> {
    const handlers = this.subscribers.get(pattern);
    if (handlers) {
      handlers.delete(handler);
      
      if (handlers.size === 0) {
        this.subscribers.delete(pattern);
        
        // Stop worker if no more handlers
        const workerKey = `subscriber:${pattern}`;
        const worker = this.workers.get(workerKey);
        if (worker) {
          await worker.close();
          this.workers.delete(workerKey);
        }
      }
    }

    logger.debug('Unsubscribed from pattern', { pattern });
  }

  async request(message: Message, timeout: number = 30000): Promise<Message> {
    return new Promise(async (resolve, reject) => {
      const requestId = message.id || uuidv4();
      const correlationId = message.correlationId || uuidv4();

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(correlationId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      try {
        // Prepare request message
        const requestMessage: Message = {
          ...message,
          id: requestId,
          type: MessageType.REQUEST,
          correlationId,
          replyTo: 'orchestration:responses',
          timestamp: new Date(),
        };

        // Publish request
        await this.publish(requestMessage);

        logger.debug('Request sent', {
          requestId,
          correlationId,
          subject: message.subject,
          to: message.to,
        });
      } catch (error) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(correlationId);
        reject(error);
      }
    });
  }

  async broadcast(message: Omit<Message, 'to'>): Promise<void> {
    const broadcastMessage: Message = {
      ...message,
      to: ['*'], // Broadcast to all
      type: MessageType.BROADCAST,
      timestamp: new Date(),
    };

    await this.publish(broadcastMessage);

    logger.debug('Message broadcasted', {
      messageId: message.id,
      subject: message.subject,
      from: message.from,
    });
  }

  // Queue Management
  async createQueue(name: string, options: Partial<MessageQueue> = {}): Promise<void> {
    const queueOptions = {
      name,
      type: options.type || 'fifo',
      maxSize: options.maxSize || 10000,
      retention: options.retention || config.communication.messageRetention,
      deadLetterQueue: options.deadLetterQueue,
      consumers: options.consumers || [],
      metrics: {
        messageCount: 0,
        visibleMessages: 0,
        inflightMessages: 0,
        deadLetterMessages: 0,
        throughput: 0,
        averageProcessingTime: 0,
        errorRate: 0,
      },
    };

    const queue = new Queue(name, {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
      },
      defaultJobOptions: config.queue.defaultJobOptions,
    });

    this.queues.set(name, queue);

    // Create default worker for the queue
    await this.createQueueWorker(name);

    logger.info('Queue created', { name, type: queueOptions.type });
  }

  private async createQueueWorker(queueName: string): Promise<void> {
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const message: Message = job.data;
        
        try {
          await this.processIncomingMessage(message);
          
          // Update metrics
          this.recordMessageMetric(message, 'processed');
          
          return { success: true, messageId: message.id };
        } catch (error) {
          logger.error('Failed to process message', {
            messageId: message.id,
            queueName,
            error: error.message,
          });
          
          this.recordMessageMetric(message, 'failed', error.message);
          throw error;
        }
      },
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        },
        concurrency: config.queue.concurrency,
      }
    );

    worker.on('completed', (job) => {
      logger.debug('Job completed', { jobId: job.id, queue: queueName });
    });

    worker.on('failed', (job, error) => {
      logger.warn('Job failed', {
        jobId: job?.id,
        queue: queueName,
        error: error.message,
      });
    });

    this.workers.set(queueName, worker);
  }

  private async createSubscriberWorker(pattern: string): Promise<void> {
    const workerKey = `subscriber:${pattern}`;
    const queueName = 'default'; // Use default queue for pattern matching

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const message: Message = job.data;
        
        // Check if message matches pattern
        if (this.matchesPattern(message.subject, pattern)) {
          const handlers = this.subscribers.get(pattern);
          if (handlers) {
            // Execute all handlers for this pattern
            const promises = Array.from(handlers).map(async handler => {
              try {
                const result = await handler(message);
                
                // If handler returns a message, it's a response
                if (result && message.type === MessageType.REQUEST) {
                  const response: Message = {
                    ...result,
                    type: MessageType.RESPONSE,
                    correlationId: message.correlationId,
                    timestamp: new Date(),
                  };
                  
                  if (message.replyTo) {
                    await this.publish(response);
                  }
                }
              } catch (error) {
                logger.error('Message handler failed', {
                  pattern,
                  messageId: message.id,
                  error: error.message,
                });
              }
            });

            await Promise.allSettled(promises);
          }
        }
      },
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        },
        concurrency: 1, // Process messages sequentially for subscribers
      }
    );

    this.workers.set(workerKey, worker);
  }

  // Message Processing
  private async processIncomingMessage(message: Message): Promise<void> {
    try {
      // Decrypt message if encrypted
      const decryptedMessage = await this.decryptMessage(message);

      // Handle different message types
      switch (decryptedMessage.type) {
        case MessageType.RESPONSE:
          await this.handleResponse(decryptedMessage);
          break;
        case MessageType.EVENT:
          await this.handleEvent(decryptedMessage);
          break;
        case MessageType.NOTIFICATION:
          await this.handleNotification(decryptedMessage);
          break;
        case MessageType.BROADCAST:
          await this.handleBroadcast(decryptedMessage);
          break;
        default:
          // For REQUEST and other types, let subscribers handle them
          this.emit('message:received', { message: decryptedMessage });
      }

      this.recordMessageMetric(decryptedMessage, 'delivered');
    } catch (error) {
      logger.error('Failed to process incoming message', {
        messageId: message.id,
        error: error.message,
      });
      throw error;
    }
  }

  private async handleResponse(message: Message): Promise<void> {
    if (message.correlationId) {
      const pendingRequest = this.pendingRequests.get(message.correlationId);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(message.correlationId);
        pendingRequest.resolve(message);
      }
    }
  }

  private async handleEvent(message: Message): Promise<void> {
    this.emit('event:received', { message });
    
    // Notify subscribers
    for (const [pattern, handlers] of this.subscribers.entries()) {
      if (this.matchesPattern(message.subject, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(message);
          } catch (error) {
            logger.error('Event handler failed', {
              pattern,
              messageId: message.id,
              error: error.message,
            });
          }
        }
      }
    }
  }

  private async handleNotification(message: Message): Promise<void> {
    this.emit('notification:received', { message });
  }

  private async handleBroadcast(message: Message): Promise<void> {
    this.emit('broadcast:received', { message });
    
    // Notify all subscribers
    for (const [pattern, handlers] of this.subscribers.entries()) {
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error('Broadcast handler failed', {
            pattern,
            messageId: message.id,
            error: error.message,
          });
        }
      }
    }
  }

  // Message Processing Utilities
  private async processMessage(message: Message): Promise<Message> {
    let processed = { ...message };

    // Compress if enabled
    if (config.communication.compressionEnabled) {
      processed = await this.compressMessage(processed);
    }

    // Encrypt if enabled
    if (config.communication.enableEncryption) {
      processed = await this.encryptMessage(processed);
    }

    return processed;
  }

  private async compressMessage(message: Message): Promise<Message> {
    const payload = JSON.stringify(message.payload);
    const compressed = await gzip(payload);
    
    return {
      ...message,
      payload: { __compressed: compressed.toString('base64') },
      metadata: {
        ...message.metadata,
        compressed: true,
        originalSize: payload.length,
        compressedSize: compressed.length,
      },
    };
  }

  private async encryptMessage(message: Message): Promise<Message> {
    const payload = JSON.stringify(message.payload);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      ...message,
      payload: {
        __encrypted: encrypted,
        __iv: iv.toString('hex'),
        __authTag: authTag.toString('hex'),
      },
      metadata: {
        ...message.metadata,
        encrypted: true,
      },
    };
  }

  private async decryptMessage(message: Message): Promise<Message> {
    if (!message.metadata?.encrypted) {
      return message;
    }

    try {
      const { __encrypted, __iv, __authTag } = message.payload as any;
      
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAuthTag(Buffer.from(__authTag, 'hex'));
      
      let decrypted = decipher.update(__encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const payload = JSON.parse(decrypted);

      return { ...message, payload };
    } catch (error) {
      logger.error('Failed to decrypt message', {
        messageId: message.id,
        error: error.message,
      });
      throw new Error('Message decryption failed');
    }
  }

  // Route Management
  private async applyRoutes(message: Message): Promise<Message> {
    let processedMessage = { ...message };

    for (const route of this.routes.values()) {
      if (route.enabled && this.matchesRoute(message, route)) {
        // Apply transformations
        if (route.transform) {
          processedMessage = await this.applyTransformation(processedMessage, route.transform);
        }

        // Apply filters
        if (route.filter && !this.passesFilter(processedMessage, route.filter)) {
          throw new Error(`Message filtered by route ${route.id}`);
        }
      }
    }

    return processedMessage;
  }

  private matchesRoute(message: Message, route: MessageRoute): boolean {
    const subjectMatches = this.matchesPattern(message.subject, route.pattern);
    const fromMatches = !route.fromPattern || this.matchesPattern(message.from, route.fromPattern);
    const toMatches = !route.toPattern || (
      Array.isArray(message.to) 
        ? message.to.some(to => this.matchesPattern(to, route.toPattern!))
        : this.matchesPattern(message.to as string, route.toPattern)
    );

    return subjectMatches && fromMatches && toMatches;
  }

  private async applyTransformation(message: Message, transform: any): Promise<Message> {
    // Simple transformation - in production, implement proper transformation engine
    return message;
  }

  private passesFilter(message: Message, filter: any): boolean {
    // Simple filter - in production, implement proper filter engine
    return true;
  }

  // Utility Methods
  private validateMessage(message: Message): void {
    if (!message.id) message.id = uuidv4();
    if (!message.timestamp) message.timestamp = new Date();
    if (!message.priority) message.priority = MessagePriority.NORMAL;
    
    if (!message.from || !message.to || !message.subject) {
      throw new Error('Message missing required fields: from, to, subject');
    }

    if (message.ttl && message.ttl < 1000) {
      throw new Error('Message TTL must be at least 1000ms');
    }
  }

  private matchesPattern(text: string, pattern: string): boolean {
    // Simple glob-like pattern matching
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(text);
  }

  private getQueueForMessage(message: Message): string {
    switch (message.type) {
      case MessageType.REQUEST:
        return 'requests';
      case MessageType.RESPONSE:
        return 'responses';
      case MessageType.EVENT:
        return 'events';
      case MessageType.NOTIFICATION:
        return 'notifications';
      case MessageType.BROADCAST:
        return 'broadcast';
      default:
        return 'default';
    }
  }

  private getPriorityScore(priority: MessagePriority): number {
    // BullMQ uses higher numbers for higher priority
    switch (priority) {
      case MessagePriority.CRITICAL: return 100;
      case MessagePriority.HIGH: return 80;
      case MessagePriority.NORMAL: return 50;
      case MessagePriority.LOW: return 20;
      default: return 50;
    }
  }

  private recordMessageMetric(message: Message, status: string, error?: string): void {
    const metric: MessageMetrics = {
      messageId: message.id,
      from: message.from,
      to: Array.isArray(message.to) ? message.to.join(',') : message.to,
      type: message.type,
      subject: message.subject,
      size: JSON.stringify(message).length,
      sentAt: message.timestamp,
      retryCount: 0,
      status: status as any,
      error,
    };

    if (status === 'delivered') {
      metric.receivedAt = new Date();
    } else if (status === 'processed') {
      metric.processedAt = new Date();
      if (metric.receivedAt) {
        metric.processingTime = metric.processedAt.getTime() - metric.receivedAt.getTime();
      }
    }

    this.messageMetrics.set(message.id, metric);
    this.emit('metric:recorded', { metric });
  }

  private async setupDefaultRoutes(): Promise<void> {
    // Setup default message routes
    logger.debug('Setting up default message routes...');
  }

  private async setupDefaultChannels(): Promise<void> {
    // Setup default communication channels
    logger.debug('Setting up default communication channels...');
  }

  private startMetricsCollection(): void {
    // Collect and emit metrics periodically
    setInterval(() => {
      const metrics = {
        totalMessages: this.messageMetrics.size,
        queueSizes: new Map<string, number>(),
        throughput: this.calculateThroughput(),
        errorRate: this.calculateErrorRate(),
      };

      this.emit('metrics:collected', { metrics });
    }, config.monitoring.metricsCollectionInterval);
  }

  private calculateThroughput(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentMessages = Array.from(this.messageMetrics.values())
      .filter(metric => metric.sentAt.getTime() > oneMinuteAgo);
    
    return recentMessages.length;
  }

  private calculateErrorRate(): number {
    const totalMessages = this.messageMetrics.size;
    if (totalMessages === 0) return 0;
    
    const failedMessages = Array.from(this.messageMetrics.values())
      .filter(metric => metric.status === 'failed').length;
    
    return (failedMessages / totalMessages) * 100;
  }

  // Public getters
  getQueues(): Map<string, Queue> {
    return this.queues;
  }

  getRoutes(): Map<string, MessageRoute> {
    return this.routes;
  }

  getChannels(): Map<string, MessageChannel> {
    return this.channels;
  }

  getMetrics(): Map<string, MessageMetrics> {
    return this.messageMetrics;
  }

  getProtocol(): CommunicationProtocol {
    return this.protocol;
  }
}