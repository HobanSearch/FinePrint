import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { UserFeedback, ImplicitFeedback, FeedbackResponse } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class FeedbackCollector extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private feedbackQueue: Queue;
  private implicitQueue: Queue;
  private worker: Worker | null = null;
  private implicitWorker: Worker | null = null;
  private batchSize = 100;
  private batchInterval = 60000; // 1 minute
  private feedbackBuffer: Map<string, any[]> = new Map();
  private metricsCache: Map<string, any> = new Map();

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    config?: {
      batchSize?: number;
      batchInterval?: number;
      maxRetries?: number;
    }
  ) {
    super();
    this.prisma = prisma;
    this.redis = redis;
    this.batchSize = config?.batchSize || this.batchSize;
    this.batchInterval = config?.batchInterval || this.batchInterval;

    // Initialize queues
    this.feedbackQueue = new Queue('feedback-processing', {
      connection: redis,
      defaultJobOptions: {
        attempts: config?.maxRetries || 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 100,
        },
        removeOnFail: {
          age: 86400, // 24 hours
        },
      },
    });

    this.implicitQueue = new Queue('implicit-feedback', {
      connection: redis,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 1000,
        },
      },
    });

    this.initializeWorkers();
    this.startBatchProcessor();
  }

  private initializeWorkers(): void {
    // Explicit feedback worker
    this.worker = new Worker(
      'feedback-processing',
      async (job) => {
        const { feedback, type } = job.data;
        return await this.processFeedback(feedback, type);
      },
      {
        connection: this.redis,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 1000, // 100 jobs per second
        },
      }
    );

    // Implicit feedback worker
    this.implicitWorker = new Worker(
      'implicit-feedback',
      async (job) => {
        const { feedback } = job.data;
        return await this.processImplicitFeedback(feedback);
      },
      {
        connection: this.redis,
        concurrency: 20,
        limiter: {
          max: 200,
          duration: 1000, // 200 jobs per second
        },
      }
    );

    // Error handlers
    this.worker.on('failed', (job, err) => {
      logger.error('Feedback processing failed', {
        jobId: job?.id,
        error: err.message,
        data: job?.data,
      });
      this.emit('feedback:failed', { job, error: err });
    });

    this.implicitWorker.on('failed', (job, err) => {
      logger.error('Implicit feedback processing failed', {
        jobId: job?.id,
        error: err.message,
      });
    });
  }

  private startBatchProcessor(): void {
    setInterval(() => {
      this.processBatches();
    }, this.batchInterval);
  }

  async collectUserFeedback(feedback: UserFeedback): Promise<FeedbackResponse> {
    try {
      // Validate and sanitize feedback
      const sanitized = this.sanitizeFeedback(feedback);
      
      // Check for duplicate feedback
      const isDuplicate = await this.checkDuplicate(sanitized);
      if (isDuplicate) {
        return {
          id: this.generateFeedbackId(sanitized),
          status: 'rejected',
          message: 'Duplicate feedback detected',
        };
      }

      // Add to processing queue
      const job = await this.feedbackQueue.add('user-feedback', {
        feedback: sanitized,
        type: 'explicit',
      });

      // Track metrics
      await this.updateMetrics('user_feedback', feedback.feedbackType);

      // Emit event for real-time processing
      this.emit('feedback:received', sanitized);

      return {
        id: job.id as string,
        status: 'accepted',
      };
    } catch (error) {
      logger.error('Failed to collect user feedback', { error, feedback });
      throw error;
    }
  }

  async collectImplicitFeedback(feedback: ImplicitFeedback): Promise<void> {
    try {
      // Calculate confidence score if not provided
      if (!feedback.confidence) {
        feedback.confidence = this.calculateConfidence(feedback);
      }

      // Add to implicit queue with lower priority
      await this.implicitQueue.add('implicit', {
        feedback,
      }, {
        priority: 10,
      });

      // Update metrics
      await this.updateMetrics('implicit_feedback', feedback.eventType);

      // Buffer for batch processing
      this.bufferFeedback(feedback);
    } catch (error) {
      logger.error('Failed to collect implicit feedback', { error });
    }
  }

  private async processFeedback(feedback: any, type: string): Promise<void> {
    try {
      // Store in database
      const stored = await this.prisma.userFeedback.create({
        data: {
          ...feedback,
          processed: false,
        },
      });

      // Check if we should trigger immediate retraining
      const shouldRetrain = await this.checkRetrainingTrigger(feedback);
      if (shouldRetrain) {
        this.emit('retrain:trigger', {
          reason: 'feedback_threshold',
          modelId: feedback.modelId,
          priority: 'high',
        });
      }

      // Update model confidence tracking
      await this.updateModelConfidence(feedback);

      // Pattern detection for common issues
      await this.detectErrorPatterns(feedback);

      logger.info('Feedback processed successfully', { id: stored.id });
    } catch (error) {
      logger.error('Failed to process feedback', { error, feedback });
      throw error;
    }
  }

  private async processImplicitFeedback(feedback: ImplicitFeedback): Promise<void> {
    try {
      // Store in database
      await this.prisma.implicitFeedback.create({
        data: {
          ...feedback,
          processed: false,
        },
      });

      // Aggregate implicit signals
      await this.aggregateImplicitSignals(feedback);

      // Update user behavior model
      await this.updateUserBehaviorModel(feedback);
    } catch (error) {
      logger.error('Failed to process implicit feedback', { error });
      throw error;
    }
  }

  private sanitizeFeedback(feedback: UserFeedback): UserFeedback {
    // Remove PII if present
    if (feedback.comment) {
      feedback.comment = this.removePII(feedback.comment);
    }

    // Validate correction format
    if (feedback.correction) {
      feedback.correction = this.validateCorrection(feedback.correction);
    }

    return feedback;
  }

  private removePII(text: string): string {
    // Remove emails
    text = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');
    
    // Remove phone numbers
    text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    
    // Remove SSN-like patterns
    text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
    
    // Remove credit card numbers
    text = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CC]');
    
    return text;
  }

  private validateCorrection(correction: any): any {
    // Ensure correction has required fields
    if (!correction.original || !correction.corrected) {
      throw new Error('Invalid correction format');
    }
    
    return {
      original: correction.original,
      corrected: correction.corrected,
      confidence: correction.confidence || 1.0,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDuplicate(feedback: UserFeedback): Promise<boolean> {
    const feedbackId = this.generateFeedbackId(feedback);
    const exists = await this.redis.get(`feedback:${feedbackId}`);
    
    if (!exists) {
      // Set with TTL of 1 hour to prevent duplicates
      await this.redis.setex(`feedback:${feedbackId}`, 3600, '1');
      return false;
    }
    
    return true;
  }

  private generateFeedbackId(feedback: UserFeedback): string {
    const data = `${feedback.userId}:${feedback.documentId}:${feedback.modelId}:${feedback.feedbackType}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private calculateConfidence(feedback: ImplicitFeedback): number {
    let confidence = 0.5; // Base confidence

    // Adjust based on event type
    switch (feedback.eventType) {
      case 'task_completion':
        confidence = 0.9;
        break;
      case 'click_through':
        confidence = 0.7;
        break;
      case 'dwell_time':
        const dwellTime = feedback.eventData.duration as number || 0;
        confidence = Math.min(0.9, 0.3 + (dwellTime / 60000) * 0.6); // Max at 1 minute
        break;
      case 'scroll_depth':
        const depth = feedback.eventData.depth as number || 0;
        confidence = depth / 100;
        break;
    }

    return confidence;
  }

  private bufferFeedback(feedback: ImplicitFeedback): void {
    const key = `${feedback.userId}:${feedback.documentId}`;
    
    if (!this.feedbackBuffer.has(key)) {
      this.feedbackBuffer.set(key, []);
    }
    
    this.feedbackBuffer.get(key)!.push(feedback);
    
    // Process if buffer is full
    if (this.feedbackBuffer.get(key)!.length >= this.batchSize) {
      this.processBatch(key);
    }
  }

  private async processBatches(): Promise<void> {
    for (const [key, feedbacks] of this.feedbackBuffer.entries()) {
      if (feedbacks.length > 0) {
        await this.processBatch(key);
      }
    }
  }

  private async processBatch(key: string): Promise<void> {
    const feedbacks = this.feedbackBuffer.get(key);
    if (!feedbacks || feedbacks.length === 0) return;

    try {
      // Create training batch
      const batch = await this.prisma.trainingBatch.create({
        data: {
          status: 'PENDING',
          size: feedbacks.length,
        },
      });

      // Process feedbacks in batch
      await this.prisma.$transaction(
        feedbacks.map((f) =>
          this.prisma.implicitFeedback.update({
            where: { id: f.id },
            data: { processed: true },
          })
        )
      );

      // Clear buffer
      this.feedbackBuffer.delete(key);

      // Emit batch ready event
      this.emit('batch:ready', {
        batchId: batch.id,
        size: feedbacks.length,
      });
    } catch (error) {
      logger.error('Failed to process batch', { error, key });
    }
  }

  private async checkRetrainingTrigger(feedback: UserFeedback): Promise<boolean> {
    // Check negative feedback threshold
    if (feedback.feedbackType === 'THUMBS_DOWN' || feedback.feedbackType === 'FLAG') {
      const recentNegative = await this.prisma.userFeedback.count({
        where: {
          modelId: feedback.modelId,
          feedbackType: {
            in: ['THUMBS_DOWN', 'FLAG'],
          },
          timestamp: {
            gte: new Date(Date.now() - 3600000), // Last hour
          },
        },
      });

      if (recentNegative >= 10) {
        return true;
      }
    }

    // Check correction threshold
    if (feedback.feedbackType === 'CORRECTION') {
      const recentCorrections = await this.prisma.userFeedback.count({
        where: {
          modelId: feedback.modelId,
          feedbackType: 'CORRECTION',
          timestamp: {
            gte: new Date(Date.now() - 3600000),
          },
        },
      });

      if (recentCorrections >= 5) {
        return true;
      }
    }

    return false;
  }

  private async updateModelConfidence(feedback: UserFeedback): Promise<void> {
    const key = `model:confidence:${feedback.modelId}`;
    
    // Get current confidence
    const current = await this.redis.get(key);
    let confidence = current ? parseFloat(current) : 1.0;
    
    // Adjust based on feedback
    switch (feedback.feedbackType) {
      case 'THUMBS_UP':
        confidence = Math.min(1.0, confidence + 0.01);
        break;
      case 'THUMBS_DOWN':
        confidence = Math.max(0.0, confidence - 0.05);
        break;
      case 'CORRECTION':
        confidence = Math.max(0.0, confidence - 0.1);
        break;
      case 'FLAG':
        confidence = Math.max(0.0, confidence - 0.2);
        break;
    }
    
    await this.redis.setex(key, 3600, confidence.toString());
    
    // Alert if confidence drops too low
    if (confidence < 0.5) {
      this.emit('alert:low_confidence', {
        modelId: feedback.modelId,
        confidence,
      });
    }
  }

  private async detectErrorPatterns(feedback: UserFeedback): Promise<void> {
    if (feedback.feedbackType !== 'CORRECTION') return;

    const key = `pattern:${feedback.modelId}:${feedback.correction?.original}`;
    
    // Increment pattern counter
    await this.redis.incr(key);
    await this.redis.expire(key, 86400); // 24 hours
    
    // Check if pattern is frequent
    const count = await this.redis.get(key);
    if (count && parseInt(count) >= 3) {
      this.emit('pattern:detected', {
        modelId: feedback.modelId,
        pattern: feedback.correction?.original,
        count: parseInt(count),
      });
    }
  }

  private async aggregateImplicitSignals(feedback: ImplicitFeedback): Promise<void> {
    const key = `implicit:${feedback.userId}:${feedback.documentId}`;
    const signals = await this.redis.hgetall(key);
    
    // Update aggregated signals
    signals[feedback.eventType] = (
      parseFloat(signals[feedback.eventType] || '0') + 
      (feedback.confidence || 0.5)
    ).toString();
    
    await this.redis.hmset(key, signals);
    await this.redis.expire(key, 86400);
    
    // Calculate overall signal strength
    const totalSignal = Object.values(signals).reduce(
      (sum, val) => sum + parseFloat(val),
      0
    );
    
    // Trigger action if signal is strong enough
    if (totalSignal >= 3.0) {
      this.emit('implicit:strong_signal', {
        userId: feedback.userId,
        documentId: feedback.documentId,
        signals,
        strength: totalSignal,
      });
    }
  }

  private async updateUserBehaviorModel(feedback: ImplicitFeedback): Promise<void> {
    const key = `behavior:${feedback.userId}`;
    
    // Get user behavior profile
    const profile = await this.redis.hgetall(key);
    
    // Update behavior metrics
    profile.totalEvents = (parseInt(profile.totalEvents || '0') + 1).toString();
    profile[`${feedback.eventType}_count`] = (
      parseInt(profile[`${feedback.eventType}_count`] || '0') + 1
    ).toString();
    profile.lastActivity = new Date().toISOString();
    
    await this.redis.hmset(key, profile);
    await this.redis.expire(key, 604800); // 7 days
  }

  private async updateMetrics(type: string, subtype: string): Promise<void> {
    const now = new Date();
    const hourKey = `metrics:${type}:${subtype}:${now.getHours()}`;
    const dayKey = `metrics:${type}:${subtype}:${now.toISOString().split('T')[0]}`;
    
    // Increment counters
    await this.redis.incr(hourKey);
    await this.redis.incr(dayKey);
    
    // Set TTL
    await this.redis.expire(hourKey, 3600);
    await this.redis.expire(dayKey, 86400 * 7);
  }

  async getMetrics(modelId?: string): Promise<any> {
    const metrics: any = {
      total: {},
      byType: {},
      byModel: {},
      hourly: [],
    };

    // Get total feedback counts
    metrics.total.explicit = await this.prisma.userFeedback.count();
    metrics.total.implicit = await this.prisma.implicitFeedback.count();
    
    // Get feedback by type
    const feedbackTypes = await this.prisma.userFeedback.groupBy({
      by: ['feedbackType'],
      _count: true,
      where: modelId ? { modelId } : undefined,
    });
    
    metrics.byType = feedbackTypes.reduce((acc, item) => {
      acc[item.feedbackType] = item._count;
      return acc;
    }, {} as any);
    
    // Get hourly metrics from Redis
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 3600000);
      const hourKey = `metrics:user_feedback:*:${hour.getHours()}`;
      const keys = await this.redis.keys(hourKey);
      
      let count = 0;
      for (const key of keys) {
        const val = await this.redis.get(key);
        count += parseInt(val || '0');
      }
      
      metrics.hourly.push({
        hour: hour.getHours(),
        count,
      });
    }
    
    return metrics;
  }

  async shutdown(): Promise<void> {
    await this.worker?.close();
    await this.implicitWorker?.close();
    await this.feedbackQueue.close();
    await this.implicitQueue.close();
  }
}