/**
 * Webhook Processor Service
 * Handles incoming webhooks from external services
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../logger';
import { StripeService } from './stripe-service';
import { SendGridService } from './sendgrid-service';
import crypto from 'crypto';
import Redis from 'ioredis';

const logger = createServiceLogger('webhook-processor');

export interface WebhookEvent {
  id: string;
  source: 'stripe' | 'sendgrid' | 'social' | 'custom';
  type: string;
  payload: any;
  signature?: string;
  timestamp: Date;
  processed: boolean;
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

export interface WebhookConfig {
  source: string;
  secret?: string;
  validationMethod: 'signature' | 'token' | 'none';
  retryAttempts: number;
  retryDelay: number; // milliseconds
  timeout: number; // milliseconds
}

export class WebhookProcessor extends EventEmitter {
  private stripeService: StripeService;
  private sendGridService: SendGridService;
  private redis: Redis;
  private initialized: boolean = false;
  private processingQueue: Map<string, WebhookEvent> = new Map();
  private retryInterval?: NodeJS.Timeout;

  // Webhook configurations
  private configs: Map<string, WebhookConfig> = new Map([
    ['stripe', {
      source: 'stripe',
      secret: process.env.STRIPE_WEBHOOK_SECRET,
      validationMethod: 'signature',
      retryAttempts: 3,
      retryDelay: 5000,
      timeout: 30000,
    }],
    ['sendgrid', {
      source: 'sendgrid',
      secret: process.env.SENDGRID_WEBHOOK_SECRET,
      validationMethod: 'signature',
      retryAttempts: 3,
      retryDelay: 5000,
      timeout: 30000,
    }],
  ]);

  constructor(
    stripeService: StripeService,
    sendGridService: SendGridService
  ) {
    super();
    this.stripeService = stripeService;
    this.sendGridService = sendGridService;

    // Initialize Redis for webhook deduplication
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 9, // Dedicated DB for webhooks
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Webhook Processor...');

      // Test Redis connection
      await this.redis.ping();

      // Start retry processor
      this.startRetryProcessor();

      this.initialized = true;
      logger.info('Webhook Processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Webhook Processor', { error });
      throw error;
    }
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(
    source: 'stripe' | 'sendgrid' | 'social' | 'custom',
    headers: Record<string, string>,
    body: any,
    rawBody?: string | Buffer
  ): Promise<void> {
    try {
      // Create webhook event
      const event: WebhookEvent = {
        id: this.generateEventId(source, body),
        source,
        type: this.extractEventType(source, body),
        payload: body,
        signature: this.extractSignature(source, headers),
        timestamp: new Date(),
        processed: false,
        attempts: 0,
      };

      // Check for duplicate
      const isDuplicate = await this.checkDuplicate(event.id);
      if (isDuplicate) {
        logger.warn('Duplicate webhook detected', { eventId: event.id });
        return;
      }

      // Validate webhook
      const config = this.configs.get(source);
      if (config?.validationMethod === 'signature') {
        await this.validateSignature(source, headers, rawBody || body, config);
      }

      // Store event
      await this.storeEvent(event);

      // Process based on source
      try {
        await this.processEvent(event);
        event.processed = true;
      } catch (error) {
        logger.error('Failed to process webhook', { error, eventId: event.id });
        event.error = (error as Error).message;
        
        // Add to retry queue if not at max attempts
        if (event.attempts < (config?.retryAttempts || 3)) {
          this.processingQueue.set(event.id, event);
        }
      }

      // Update event status
      await this.updateEvent(event);

      this.emit('webhook:processed', event);
    } catch (error) {
      logger.error('Webhook processing failed', { error, source });
      throw error;
    }
  }

  /**
   * Register custom webhook handler
   */
  registerHandler(
    source: string,
    config: WebhookConfig,
    handler: (event: WebhookEvent) => Promise<void>
  ): void {
    this.configs.set(source, config);
    
    this.on(`webhook:${source}`, async (event: WebhookEvent) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Custom webhook handler failed', { error, source });
        throw error;
      }
    });

    logger.info('Custom webhook handler registered', { source });
  }

  /**
   * Get webhook events
   */
  async getWebhookEvents(
    filters: {
      source?: string;
      type?: string;
      processed?: boolean;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<WebhookEvent[]> {
    try {
      const pattern = filters.source 
        ? `webhook:${filters.source}:*`
        : 'webhook:*';

      const keys = await this.redis.keys(pattern);
      const events: WebhookEvent[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const event = JSON.parse(data) as WebhookEvent;
          event.timestamp = new Date(event.timestamp);
          event.lastAttempt = event.lastAttempt 
            ? new Date(event.lastAttempt) 
            : undefined;

          // Apply filters
          if (filters.type && event.type !== filters.type) continue;
          if (filters.processed !== undefined && event.processed !== filters.processed) continue;
          if (filters.startDate && event.timestamp < filters.startDate) continue;
          if (filters.endDate && event.timestamp > filters.endDate) continue;

          events.push(event);
        }
      }

      // Sort by timestamp descending
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply limit
      if (filters.limit) {
        return events.slice(0, filters.limit);
      }

      return events;
    } catch (error) {
      logger.error('Failed to get webhook events', { error, filters });
      throw error;
    }
  }

  /**
   * Retry failed webhook
   */
  async retryWebhook(eventId: string): Promise<void> {
    try {
      const event = await this.getEvent(eventId);
      if (!event) {
        throw new Error('Webhook event not found');
      }

      if (event.processed) {
        throw new Error('Webhook already processed');
      }

      event.attempts++;
      event.lastAttempt = new Date();

      await this.processEvent(event);
      event.processed = true;
      event.error = undefined;

      await this.updateEvent(event);

      logger.info('Webhook retry successful', { eventId });
    } catch (error) {
      logger.error('Webhook retry failed', { error, eventId });
      throw error;
    }
  }

  // Private helper methods

  private generateEventId(source: string, body: any): string {
    // Try to use platform-specific ID first
    let platformId: string | undefined;
    
    switch (source) {
      case 'stripe':
        platformId = body.id;
        break;
      case 'sendgrid':
        platformId = body.sg_event_id || body.sg_message_id;
        break;
      default:
        platformId = body.id || body.eventId;
    }

    if (platformId) {
      return `${source}_${platformId}`;
    }

    // Generate unique ID
    const content = JSON.stringify(body);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `${source}_${Date.now()}_${hash.substring(0, 8)}`;
  }

  private extractEventType(source: string, body: any): string {
    switch (source) {
      case 'stripe':
        return body.type || 'unknown';
      case 'sendgrid':
        return body.event || 'unknown';
      default:
        return body.type || body.event || 'unknown';
    }
  }

  private extractSignature(source: string, headers: Record<string, string>): string | undefined {
    switch (source) {
      case 'stripe':
        return headers['stripe-signature'];
      case 'sendgrid':
        return headers['x-twilio-email-event-webhook-signature'];
      default:
        return headers['x-webhook-signature'];
    }
  }

  private async checkDuplicate(eventId: string): Promise<boolean> {
    const exists = await this.redis.exists(`webhook:processed:${eventId}`);
    if (exists) {
      return true;
    }

    // Mark as processed (with 24 hour expiry to prevent memory bloat)
    await this.redis.setex(`webhook:processed:${eventId}`, 86400, '1');
    return false;
  }

  private async validateSignature(
    source: string,
    headers: Record<string, string>,
    payload: string | Buffer,
    config: WebhookConfig
  ): Promise<void> {
    if (!config.secret) {
      logger.warn('Webhook secret not configured', { source });
      return;
    }

    switch (source) {
      case 'stripe':
        // Stripe validation is handled by the service
        return;

      case 'sendgrid':
        const signature = headers['x-twilio-email-event-webhook-signature'];
        const timestamp = headers['x-twilio-email-event-webhook-timestamp'];
        
        if (!signature || !timestamp) {
          throw new Error('Missing SendGrid webhook signature headers');
        }

        const payloadStr = typeof payload === 'string' 
          ? payload 
          : JSON.stringify(payload);
        
        const expectedSignature = crypto
          .createHmac('sha256', config.secret)
          .update(timestamp + payloadStr)
          .digest('base64');

        if (signature !== expectedSignature) {
          throw new Error('Invalid SendGrid webhook signature');
        }
        break;

      default:
        // Generic HMAC validation
        const webhookSignature = headers['x-webhook-signature'];
        if (!webhookSignature) {
          throw new Error('Missing webhook signature');
        }

        const expectedSig = crypto
          .createHmac('sha256', config.secret)
          .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
          .digest('hex');

        if (webhookSignature !== expectedSig) {
          throw new Error('Invalid webhook signature');
        }
    }
  }

  private async storeEvent(event: WebhookEvent): Promise<void> {
    const key = `webhook:${event.source}:${event.id}`;
    await this.redis.setex(
      key,
      86400 * 7, // 7 days
      JSON.stringify(event)
    );
  }

  private async updateEvent(event: WebhookEvent): Promise<void> {
    const key = `webhook:${event.source}:${event.id}`;
    await this.redis.setex(
      key,
      86400 * 7, // 7 days
      JSON.stringify(event)
    );
  }

  private async getEvent(eventId: string): Promise<WebhookEvent | null> {
    // Search across all sources
    const sources = ['stripe', 'sendgrid', 'social', 'custom'];
    
    for (const source of sources) {
      const key = `webhook:${source}:${eventId}`;
      const data = await this.redis.get(key);
      
      if (data) {
        const event = JSON.parse(data) as WebhookEvent;
        event.timestamp = new Date(event.timestamp);
        event.lastAttempt = event.lastAttempt 
          ? new Date(event.lastAttempt) 
          : undefined;
        return event;
      }
    }

    return null;
  }

  private async processEvent(event: WebhookEvent): Promise<void> {
    logger.info('Processing webhook event', {
      eventId: event.id,
      source: event.source,
      type: event.type,
    });

    switch (event.source) {
      case 'stripe':
        await this.stripeService.handleWebhook(
          event.signature!,
          JSON.stringify(event.payload)
        );
        break;

      case 'sendgrid':
        await this.sendGridService.handleWebhook(
          Array.isArray(event.payload) ? event.payload : [event.payload]
        );
        break;

      default:
        // Emit event for custom handlers
        this.emit(`webhook:${event.source}`, event);
    }
  }

  private startRetryProcessor(): void {
    // Process retry queue every minute
    this.retryInterval = setInterval(async () => {
      const now = Date.now();
      
      for (const [eventId, event] of this.processingQueue.entries()) {
        const config = this.configs.get(event.source);
        if (!config) continue;

        const lastAttemptTime = event.lastAttempt?.getTime() || event.timestamp.getTime();
        const timeSinceLastAttempt = now - lastAttemptTime;

        if (timeSinceLastAttempt >= config.retryDelay) {
          try {
            await this.retryWebhook(eventId);
            this.processingQueue.delete(eventId);
          } catch (error) {
            logger.error('Retry processor error', { error, eventId });
            
            // Remove from queue if max attempts reached
            if (event.attempts >= config.retryAttempts) {
              this.processingQueue.delete(eventId);
            }
          }
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Get webhook statistics
   */
  async getStatistics(
    source?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<{
    total: number;
    processed: number;
    failed: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    const events = await this.getWebhookEvents({
      source,
      startDate: timeRange?.start,
      endDate: timeRange?.end,
    });

    const stats = {
      total: events.length,
      processed: events.filter(e => e.processed).length,
      failed: events.filter(e => !e.processed && e.attempts > 0).length,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
    };

    for (const event of events) {
      // Count by type
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      
      // Count by source
      stats.bySource[event.source] = (stats.bySource[event.source] || 0) + 1;
    }

    return stats;
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    
    this.redis.disconnect();
    logger.info('Webhook Processor shutdown complete');
  }
}