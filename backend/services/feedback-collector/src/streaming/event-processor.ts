/**
 * Real-time event stream processor
 */

import { Kafka, Consumer, Producer, EachMessagePayload } from 'kafkajs';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { Queue, Worker, Job } from 'bullmq';
import {
  ImplicitFeedbackEvent,
  ExplicitFeedbackEvent,
  FeedbackStreamEvent,
  FeedbackAlert
} from '../types';
import { Aggregator } from './aggregator';
import { BatchProcessor } from './batch-processor';

export class EventStreamProcessor {
  private kafka: Kafka;
  private implicitConsumer: Consumer;
  private explicitConsumer: Consumer;
  private producer: Producer;
  private redis: Redis;
  private logger: Logger;
  private aggregator: Aggregator;
  private batchProcessor: BatchProcessor;
  private processingQueue: Queue;
  private worker: Worker;
  private isProcessing: boolean = false;
  private eventBuffer: Map<string, FeedbackStreamEvent[]>;
  private windowSize: number = 60000; // 1 minute window
  private streamSubscribers: Set<(event: FeedbackStreamEvent) => void>;

  constructor(
    kafka: Kafka,
    redis: Redis,
    logger: Logger,
    aggregator: Aggregator,
    batchProcessor: BatchProcessor
  ) {
    this.kafka = kafka;
    this.redis = redis;
    this.logger = logger.child({ component: 'EventStreamProcessor' });
    this.aggregator = aggregator;
    this.batchProcessor = batchProcessor;
    this.eventBuffer = new Map();
    this.streamSubscribers = new Set();

    // Initialize Kafka consumers
    this.implicitConsumer = kafka.consumer({ 
      groupId: 'stream-processor-implicit',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
    
    this.explicitConsumer = kafka.consumer({ 
      groupId: 'stream-processor-explicit',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
    
    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });

    // Initialize BullMQ queue for processing
    this.processingQueue = new Queue('feedback-processing', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });

    // Initialize worker
    this.worker = new Worker(
      'feedback-processing',
      async (job: Job) => this.processJob(job),
      {
        connection: redis,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 1000 // 100 jobs per second
        }
      }
    );

    this.setupWorkerHandlers();
  }

  /**
   * Initialize the stream processor
   */
  async initialize(): Promise<void> {
    try {
      // Connect consumers and producer
      await this.implicitConsumer.connect();
      await this.explicitConsumer.connect();
      await this.producer.connect();

      // Subscribe to topics
      await this.implicitConsumer.subscribe({
        topic: 'implicit-feedback-events',
        fromBeginning: false
      });

      await this.explicitConsumer.subscribe({
        topic: 'explicit-feedback-events',
        fromBeginning: false
      });

      // Start consuming
      this.isProcessing = true;
      await Promise.all([
        this.startImplicitConsumer(),
        this.startExplicitConsumer()
      ]);

      // Start windowed aggregation
      this.startWindowedAggregation();

      // Start anomaly detection
      this.startAnomalyDetection();

      this.logger.info('Event stream processor initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize stream processor');
      throw error;
    }
  }

  /**
   * Start implicit event consumer
   */
  private async startImplicitConsumer(): Promise<void> {
    await this.implicitConsumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.processImplicitEvent(payload);
        } catch (error) {
          this.logger.error({ error, payload }, 'Failed to process implicit event');
        }
      }
    });
  }

  /**
   * Start explicit event consumer
   */
  private async startExplicitConsumer(): Promise<void> {
    await this.explicitConsumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.processExplicitEvent(payload);
        } catch (error) {
          this.logger.error({ error, payload }, 'Failed to process explicit event');
        }
      }
    });
  }

  /**
   * Process implicit feedback event
   */
  private async processImplicitEvent(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    
    if (!message.value) return;

    const event: ImplicitFeedbackEvent = JSON.parse(message.value.toString());
    
    // Add to processing queue
    await this.processingQueue.add('implicit', {
      event,
      partition,
      offset: message.offset,
      timestamp: message.timestamp
    });

    // Stream to real-time subscribers
    const streamEvent: FeedbackStreamEvent = {
      type: 'implicit',
      timestamp: new Date(),
      data: event
    };
    
    this.broadcastToSubscribers(streamEvent);

    // Add to buffer for windowed processing
    this.addToBuffer(event.modelType, streamEvent);

    // Update real-time metrics
    await this.updateRealtimeMetrics('implicit', event);

    // Check for patterns
    await this.detectPatterns(event);
  }

  /**
   * Process explicit feedback event
   */
  private async processExplicitEvent(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    
    if (!message.value) return;

    const event: ExplicitFeedbackEvent = JSON.parse(message.value.toString());
    
    // Add to processing queue
    await this.processingQueue.add('explicit', {
      event,
      partition,
      offset: message.offset,
      timestamp: message.timestamp
    });

    // Stream to real-time subscribers
    const streamEvent: FeedbackStreamEvent = {
      type: 'explicit',
      timestamp: new Date(),
      data: event
    };
    
    this.broadcastToSubscribers(streamEvent);

    // Add to buffer for windowed processing
    this.addToBuffer(event.modelType, streamEvent);

    // Update real-time metrics
    await this.updateRealtimeMetrics('explicit', event);

    // Check for urgent feedback
    await this.checkUrgentFeedback(event);
  }

  /**
   * Process job from queue
   */
  private async processJob(job: Job): Promise<void> {
    const { name, data } = job;
    
    switch (name) {
      case 'implicit':
        await this.handleImplicitJob(data);
        break;
      case 'explicit':
        await this.handleExplicitJob(data);
        break;
      case 'aggregate':
        await this.handleAggregateJob(data);
        break;
      case 'batch':
        await this.handleBatchJob(data);
        break;
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  /**
   * Handle implicit feedback job
   */
  private async handleImplicitJob(data: any): Promise<void> {
    const { event, partition, offset } = data;
    
    // Enrich event
    const enriched = await this.enrichEvent(event);
    
    // Store in time-series database
    await this.storeTimeSeries('implicit', enriched);
    
    // Update aggregations
    await this.aggregator.updateImplicitAggregates(enriched);
    
    // Commit offset
    await this.commitOffset('implicit', partition, offset);
  }

  /**
   * Handle explicit feedback job
   */
  private async handleExplicitJob(data: any): Promise<void> {
    const { event, partition, offset } = data;
    
    // Enrich event
    const enriched = await this.enrichEvent(event);
    
    // Store in time-series database
    await this.storeTimeSeries('explicit', enriched);
    
    // Update aggregations
    await this.aggregator.updateExplicitAggregates(enriched);
    
    // Send to improvement orchestrator if needed
    if (event.feedbackType === 'report' || event.sentiment < -0.5) {
      await this.sendToImprovementOrchestrator(event);
    }
    
    // Commit offset
    await this.commitOffset('explicit', partition, offset);
  }

  /**
   * Handle aggregate job
   */
  private async handleAggregateJob(data: any): Promise<void> {
    const { modelType, window } = data;
    
    // Get events from buffer
    const events = this.getBufferEvents(modelType, window);
    
    // Calculate aggregates
    const metrics = await this.aggregator.calculateWindowedMetrics(events, window);
    
    // Store aggregated metrics
    await this.storeAggregatedMetrics(modelType, metrics);
    
    // Broadcast metrics update
    const streamEvent: FeedbackStreamEvent = {
      type: 'metric',
      timestamp: new Date(),
      data: metrics
    };
    
    this.broadcastToSubscribers(streamEvent);
  }

  /**
   * Handle batch job
   */
  private async handleBatchJob(data: any): Promise<void> {
    const { batchId, events } = data;
    
    // Process batch
    const results = await this.batchProcessor.processBatch(batchId, events);
    
    // Store results
    await this.storeBatchResults(batchId, results);
  }

  /**
   * Add event to buffer
   */
  private addToBuffer(modelType: string, event: FeedbackStreamEvent): void {
    const key = `${modelType}:${Math.floor(Date.now() / this.windowSize)}`;
    
    if (!this.eventBuffer.has(key)) {
      this.eventBuffer.set(key, []);
    }
    
    this.eventBuffer.get(key)!.push(event);
    
    // Cleanup old buffers
    this.cleanupOldBuffers();
  }

  /**
   * Cleanup old buffers
   */
  private cleanupOldBuffers(): void {
    const cutoff = Date.now() - (this.windowSize * 5); // Keep 5 windows
    
    for (const [key, events] of this.eventBuffer.entries()) {
      const [modelType, windowStr] = key.split(':');
      const window = parseInt(windowStr) * this.windowSize;
      
      if (window < cutoff) {
        this.eventBuffer.delete(key);
      }
    }
  }

  /**
   * Get events from buffer
   */
  private getBufferEvents(modelType: string, window: number): FeedbackStreamEvent[] {
    const key = `${modelType}:${window}`;
    return this.eventBuffer.get(key) || [];
  }

  /**
   * Start windowed aggregation
   */
  private startWindowedAggregation(): void {
    setInterval(async () => {
      const currentWindow = Math.floor(Date.now() / this.windowSize);
      const previousWindow = currentWindow - 1;
      
      // Process previous window for all model types
      for (const modelType of ['marketing', 'sales', 'support', 'analytics']) {
        await this.processingQueue.add('aggregate', {
          modelType,
          window: previousWindow
        });
      }
    }, this.windowSize);
  }

  /**
   * Start anomaly detection
   */
  private startAnomalyDetection(): void {
    setInterval(async () => {
      await this.detectAnomalies();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Detect anomalies in stream
   */
  private async detectAnomalies(): Promise<void> {
    try {
      // Get recent metrics
      const metrics = await this.getRecentMetrics();
      
      // Check for anomalies
      for (const [modelType, data] of Object.entries(metrics)) {
        const anomalies = await this.checkForAnomalies(modelType, data);
        
        for (const anomaly of anomalies) {
          await this.triggerAlert(anomaly);
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to detect anomalies');
    }
  }

  /**
   * Check for anomalies in metrics
   */
  private async checkForAnomalies(modelType: string, data: any): Promise<FeedbackAlert[]> {
    const alerts: FeedbackAlert[] = [];
    
    // Check for sudden drops in engagement
    if (data.engagementDrop > 30) {
      alerts.push({
        alertId: `alert_${Date.now()}`,
        severity: 'warning',
        type: 'anomaly',
        title: 'Sudden drop in engagement',
        description: `Engagement for ${modelType} model dropped by ${data.engagementDrop}%`,
        modelType: modelType as any,
        metric: 'engagement',
        value: data.currentEngagement,
        threshold: data.expectedEngagement,
        context: data,
        timestamp: new Date()
      });
    }
    
    // Check for high error rate
    if (data.errorRate > 5) {
      alerts.push({
        alertId: `alert_${Date.now()}`,
        severity: 'error',
        type: 'threshold',
        title: 'High error rate detected',
        description: `Error rate for ${modelType} model is ${data.errorRate}%`,
        modelType: modelType as any,
        metric: 'error_rate',
        value: data.errorRate,
        threshold: 5,
        context: data,
        timestamp: new Date()
      });
    }
    
    // Check for negative sentiment trend
    if (data.sentimentTrend < -0.2) {
      alerts.push({
        alertId: `alert_${Date.now()}`,
        severity: 'warning',
        type: 'trend',
        title: 'Negative sentiment trend',
        description: `Sentiment for ${modelType} model trending negative`,
        modelType: modelType as any,
        metric: 'sentiment',
        value: data.currentSentiment,
        threshold: 0,
        context: data,
        timestamp: new Date()
      });
    }
    
    return alerts;
  }

  /**
   * Trigger alert
   */
  private async triggerAlert(alert: FeedbackAlert): Promise<void> {
    // Store alert
    await this.redis.lpush('alerts:feedback', JSON.stringify(alert));
    await this.redis.ltrim('alerts:feedback', 0, 999); // Keep last 1000
    
    // Broadcast to subscribers
    const streamEvent: FeedbackStreamEvent = {
      type: 'alert',
      timestamp: new Date(),
      data: alert
    };
    
    this.broadcastToSubscribers(streamEvent);
    
    // Send critical alerts to notification service
    if (alert.severity === 'critical' || alert.severity === 'error') {
      await this.sendCriticalAlert(alert);
    }
    
    this.logger.warn({ alert }, 'Alert triggered');
  }

  /**
   * Detect patterns in events
   */
  private async detectPatterns(event: ImplicitFeedbackEvent): Promise<void> {
    // Simple pattern detection - can be enhanced with ML
    const recentEvents = await this.getRecentEvents(event.sessionId);
    
    // Check for rage clicks
    const clickEvents = recentEvents.filter(e => e.eventType === 'click');
    if (clickEvents.length > 5) {
      const timeSpan = clickEvents[clickEvents.length - 1].timestamp.getTime() - 
                      clickEvents[0].timestamp.getTime();
      if (timeSpan < 2000) { // 5+ clicks in 2 seconds
        await this.recordPattern('rage_click', event);
      }
    }
    
    // Check for quick bounce
    if (event.eventType === 'exit' && event.metadata.timeOnPage < 5000) {
      await this.recordPattern('quick_bounce', event);
    }
    
    // Check for conversion funnel drop-off
    if (event.eventType === 'exit' && event.metadata.page.includes('checkout')) {
      await this.recordPattern('checkout_abandonment', event);
    }
  }

  /**
   * Check for urgent feedback
   */
  private async checkUrgentFeedback(event: ExplicitFeedbackEvent): Promise<void> {
    // Check if feedback needs immediate attention
    const isUrgent = 
      event.feedbackType === 'report' ||
      (event.sentiment && event.sentiment < -0.7) ||
      (event.rating && event.rating <= 2) ||
      (event.followUp?.priority === 'critical');
    
    if (isUrgent) {
      await this.handleUrgentFeedback(event);
    }
  }

  /**
   * Handle urgent feedback
   */
  private async handleUrgentFeedback(event: ExplicitFeedbackEvent): Promise<void> {
    // Create urgent alert
    const alert: FeedbackAlert = {
      alertId: `urgent_${event.feedbackId}`,
      severity: 'critical',
      type: 'pattern',
      title: 'Urgent feedback received',
      description: event.comment || 'Critical feedback requiring immediate attention',
      modelType: event.modelType,
      metric: 'feedback',
      value: event.rating || -1,
      threshold: 3,
      context: event,
      timestamp: new Date()
    };
    
    await this.triggerAlert(alert);
    
    // Send to support team
    await this.sendToSupport(event);
  }

  /**
   * Helper methods
   */
  private async enrichEvent(event: any): Promise<any> {
    // Add derived fields and additional context
    return {
      ...event,
      processedAt: new Date(),
      enriched: true
    };
  }

  private async storeTimeSeries(type: string, event: any): Promise<void> {
    const key = `timeseries:${type}:${event.modelType}`;
    await this.redis.zadd(
      key,
      Date.now(),
      JSON.stringify(event)
    );
    await this.redis.expire(key, 86400 * 7); // 7 days retention
  }

  private async commitOffset(topic: string, partition: number, offset: string): Promise<void> {
    // Kafka offset management
    const consumer = topic === 'implicit' ? this.implicitConsumer : this.explicitConsumer;
    await consumer.commitOffsets([{
      topic: `${topic}-feedback-events`,
      partition,
      offset: (parseInt(offset) + 1).toString()
    }]);
  }

  private async updateRealtimeMetrics(type: string, event: any): Promise<void> {
    const key = `metrics:realtime:${type}:${event.modelType}`;
    await this.redis.hincrby(key, 'count', 1);
    await this.redis.expire(key, 3600);
  }

  private async storeAggregatedMetrics(modelType: string, metrics: any): Promise<void> {
    const key = `metrics:aggregated:${modelType}`;
    await this.redis.hset(key, Date.now().toString(), JSON.stringify(metrics));
    await this.redis.expire(key, 86400 * 30); // 30 days
  }

  private async storeBatchResults(batchId: string, results: any): Promise<void> {
    await this.redis.setex(
      `batch:results:${batchId}`,
      86400,
      JSON.stringify(results)
    );
  }

  private async getRecentEvents(sessionId: string): Promise<any[]> {
    const events = await this.redis.lrange(`session:events:${sessionId}`, 0, 20);
    return events.map(e => JSON.parse(e));
  }

  private async recordPattern(pattern: string, event: any): Promise<void> {
    await this.redis.hincrby(`patterns:${pattern}`, event.modelType, 1);
    await this.redis.lpush(`patterns:${pattern}:events`, JSON.stringify(event));
    await this.redis.ltrim(`patterns:${pattern}:events`, 0, 99);
  }

  private async getRecentMetrics(): Promise<any> {
    const metrics: any = {};
    for (const modelType of ['marketing', 'sales', 'support', 'analytics']) {
      const key = `metrics:realtime:implicit:${modelType}`;
      metrics[modelType] = await this.redis.hgetall(key);
    }
    return metrics;
  }

  private async sendToImprovementOrchestrator(event: any): Promise<void> {
    // Send to improvement orchestrator service
    this.logger.info({ event }, 'Sending to improvement orchestrator');
  }

  private async sendCriticalAlert(alert: FeedbackAlert): Promise<void> {
    // Send to notification service
    this.logger.error({ alert }, 'Critical alert sent');
  }

  private async sendToSupport(event: ExplicitFeedbackEvent): Promise<void> {
    // Send to support ticketing system
    this.logger.info({ event }, 'Sent to support team');
  }

  /**
   * Subscribe to stream events
   */
  subscribeToStream(callback: (event: FeedbackStreamEvent) => void): void {
    this.streamSubscribers.add(callback);
  }

  /**
   * Unsubscribe from stream events
   */
  unsubscribeFromStream(callback: (event: FeedbackStreamEvent) => void): void {
    this.streamSubscribers.delete(callback);
  }

  /**
   * Broadcast event to subscribers
   */
  private broadcastToSubscribers(event: FeedbackStreamEvent): void {
    for (const subscriber of this.streamSubscribers) {
      try {
        subscriber(event);
      } catch (error) {
        this.logger.error({ error }, 'Failed to broadcast to subscriber');
      }
    }
  }

  /**
   * Setup worker handlers
   */
  private setupWorkerHandlers(): void {
    this.worker.on('completed', (job: Job) => {
      this.logger.debug({ jobId: job.id, name: job.name }, 'Job completed');
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      this.logger.error({ jobId: job?.id, error }, 'Job failed');
    });

    this.worker.on('error', (error: Error) => {
      this.logger.error({ error }, 'Worker error');
    });
  }

  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    this.isProcessing = false;
    
    await this.implicitConsumer.disconnect();
    await this.explicitConsumer.disconnect();
    await this.producer.disconnect();
    
    await this.processingQueue.close();
    await this.worker.close();
    
    this.logger.info('Event stream processor shut down');
  }
}