/**
 * Queue Manager - BullMQ-based request queuing with priority handling
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import {
  QueueJob,
  JobStatus,
  RequestContext,
  RequestPriority,
  UserTier,
  ModelConfig
} from '../types';
import { ModelRegistry } from '../registry/model-registry';
import { LoadBalancer } from '../balancer/load-balancer';
import { CostOptimizer } from '../optimizer/cost-optimizer';

const logger = pino({ name: 'queue-manager' });

interface QueueConfig {
  name: string;
  concurrency: number;
  priority: number;
}

export class QueueManager {
  private queues: Map<string, Queue>;
  private workers: Map<string, Worker>;
  private queueEvents: Map<string, QueueEvents>;
  private registry: ModelRegistry;
  private loadBalancer: LoadBalancer;
  private costOptimizer: CostOptimizer;
  private redis: Redis;

  constructor(
    registry: ModelRegistry,
    loadBalancer: LoadBalancer,
    costOptimizer: CostOptimizer,
    redis: Redis
  ) {
    this.registry = registry;
    this.loadBalancer = loadBalancer;
    this.costOptimizer = costOptimizer;
    this.redis = redis;
    this.queues = new Map();
    this.workers = new Map();
    this.queueEvents = new Map();
    this.initializeQueues();
  }

  /**
   * Initialize queues for each model
   */
  private initializeQueues(): void {
    const models = this.registry.getAllModels();

    for (const model of models) {
      const queueName = `model:${model.id}`;
      
      // Create queue
      const queue = new Queue(queueName, {
        connection: this.redis.duplicate(),
        defaultJobOptions: {
          removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 100 // Keep max 100 completed jobs
          },
          removeOnFail: {
            age: 86400, // Keep failed jobs for 24 hours
            count: 500 // Keep max 500 failed jobs
          },
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      this.queues.set(model.id, queue);

      // Create worker
      const worker = new Worker(
        queueName,
        async (job: Job) => this.processJob(job, model),
        {
          connection: this.redis.duplicate(),
          concurrency: model.maxConcurrency,
          limiter: {
            max: model.maxConcurrency,
            duration: 1000 // Per second
          }
        }
      );

      // Set up worker event handlers
      worker.on('completed', (job: Job) => {
        logger.info({
          jobId: job.id,
          modelId: model.id,
          duration: Date.now() - job.timestamp
        }, 'Job completed');
      });

      worker.on('failed', (job: Job | undefined, err: Error) => {
        logger.error({
          jobId: job?.id,
          modelId: model.id,
          error: err.message
        }, 'Job failed');
      });

      worker.on('error', (err: Error) => {
        logger.error({
          modelId: model.id,
          error: err.message
        }, 'Worker error');
      });

      this.workers.set(model.id, worker);

      // Create queue events listener
      const queueEvents = new QueueEvents(queueName, {
        connection: this.redis.duplicate()
      });

      queueEvents.on('waiting', ({ jobId }) => {
        logger.debug({ jobId, modelId: model.id }, 'Job waiting');
      });

      queueEvents.on('progress', ({ jobId, data }) => {
        logger.debug({ jobId, modelId: model.id, progress: data }, 'Job progress');
      });

      this.queueEvents.set(model.id, queueEvents);
    }

    logger.info(`Initialized ${models.length} queues`);
  }

  /**
   * Add job to queue
   */
  public async addJob(
    context: RequestContext,
    modelId: string,
    payload: any
  ): Promise<QueueJob> {
    const queue = this.queues.get(modelId);
    if (!queue) {
      throw new Error(`Queue not found for model ${modelId}`);
    }

    // Calculate job priority
    const priority = this.calculateJobPriority(context);

    // Create job
    const job = await queue.add(
      'process',
      {
        context,
        payload,
        modelId,
        timestamp: Date.now()
      },
      {
        priority,
        delay: this.calculateDelay(context),
        timeout: this.getTimeout(modelId)
      }
    );

    // Create QueueJob object
    const queueJob: QueueJob = {
      id: job.id as string,
      requestContext: context,
      modelId,
      status: JobStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date()
    };

    // Store job metadata
    await this.redis.hset(
      `jobs:${job.id}`,
      'status', JobStatus.PENDING,
      'modelId', modelId,
      'userId', context.userId,
      'createdAt', new Date().toISOString()
    );

    // Update active jobs counter
    await this.redis.hincrby(`models:active:${modelId}`, 'queued', 1);

    logger.info({
      jobId: job.id,
      modelId,
      priority,
      userId: context.userId
    }, 'Job added to queue');

    return queueJob;
  }

  /**
   * Process job
   */
  private async processJob(job: Job, model: ModelConfig): Promise<any> {
    const startTime = Date.now();
    const { context, payload, modelId } = job.data;

    try {
      // Update job status
      await this.updateJobStatus(job.id as string, JobStatus.PROCESSING);
      
      // Update active jobs counter
      await this.redis.hincrby(`models:active:${modelId}`, 'queued', -1);
      await this.redis.hincrby(`models:active:${modelId}`, 'processing', 1);

      // Report progress
      await job.updateProgress(10);

      // Simulate model processing (in production, make actual API call)
      const result = await this.callModel(model, payload, job);

      // Update progress
      await job.updateProgress(90);

      // Track metrics
      const responseTime = Date.now() - startTime;
      await this.registry.updateModelMetrics(
        modelId,
        responseTime,
        true,
        model.costPerRequest
      );

      // Track cost
      await this.costOptimizer.trackCost(
        context.userId,
        context.userTier,
        modelId,
        model.costPerRequest,
        false
      );

      // Cache result
      await this.loadBalancer.cacheResult(context, result, modelId);

      // Update job status
      await this.updateJobStatus(job.id as string, JobStatus.COMPLETED);

      // Update active jobs counter
      await this.redis.hincrby(`models:active:${modelId}`, 'processing', -1);

      // Complete progress
      await job.updateProgress(100);

      return result;
    } catch (error) {
      // Track failed metrics
      await this.registry.updateModelMetrics(
        modelId,
        Date.now() - startTime,
        false,
        0
      );

      // Update job status
      await this.updateJobStatus(job.id as string, JobStatus.FAILED);

      // Update active jobs counter
      await this.redis.hincrby(`models:active:${modelId}`, 'processing', -1);

      throw error;
    }
  }

  /**
   * Call model API
   */
  private async callModel(
    model: ModelConfig,
    payload: any,
    job: Job
  ): Promise<any> {
    // Report progress
    await job.updateProgress(30);

    // In production, make actual API call to model endpoint
    // For now, simulate processing with delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    await job.updateProgress(70);

    // Return mock result
    return {
      modelId: model.id,
      modelName: model.name,
      response: {
        analysis: 'Document analysis complete',
        patterns: ['pattern1', 'pattern2'],
        risks: ['risk1', 'risk2'],
        recommendations: ['recommendation1', 'recommendation2']
      },
      metadata: {
        processingTime: 2000,
        modelVersion: '1.0.0',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate job priority
   */
  private calculateJobPriority(context: RequestContext): number {
    let priority = 0;

    // User tier priority
    switch (context.userTier) {
      case UserTier.ENTERPRISE:
        priority += 1000;
        break;
      case UserTier.PREMIUM:
        priority += 500;
        break;
      case UserTier.FREE:
        priority += 0;
        break;
    }

    // Request priority
    switch (context.priority) {
      case RequestPriority.URGENT:
        priority += 400;
        break;
      case RequestPriority.HIGH:
        priority += 300;
        break;
      case RequestPriority.MEDIUM:
        priority += 200;
        break;
      case RequestPriority.LOW:
        priority += 100;
        break;
    }

    return priority;
  }

  /**
   * Calculate job delay
   */
  private calculateDelay(context: RequestContext): number {
    // No delay for urgent requests
    if (context.priority === RequestPriority.URGENT) {
      return 0;
    }

    // No delay for premium/enterprise users
    if (context.userTier !== UserTier.FREE) {
      return 0;
    }

    // Add small delay for free tier non-urgent requests
    return 1000; // 1 second
  }

  /**
   * Get timeout for model
   */
  private getTimeout(modelId: string): number {
    const model = this.registry.getModel(modelId);
    return model?.timeout || 120000; // Default 2 minutes
  }

  /**
   * Update job status
   */
  private async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
    await this.redis.hset(
      `jobs:${jobId}`,
      'status', status,
      'updatedAt', new Date().toISOString()
    );

    if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
      await this.redis.hset(
        `jobs:${jobId}`,
        'completedAt', new Date().toISOString()
      );
    }
  }

  /**
   * Get job status
   */
  public async getJobStatus(jobId: string): Promise<QueueJob | null> {
    const jobData = await this.redis.hgetall(`jobs:${jobId}`);
    
    if (!jobData.status) {
      return null;
    }

    // Find the job in the appropriate queue
    for (const [modelId, queue] of this.queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const progress = job.progress;
        
        return {
          id: jobId,
          requestContext: job.data.context,
          modelId,
          status: jobData.status as JobStatus,
          attempts: job.attemptsMade,
          maxAttempts: job.opts.attempts || 3,
          result: job.returnvalue,
          error: job.failedReason,
          createdAt: new Date(jobData.createdAt),
          startedAt: jobData.startedAt ? new Date(jobData.startedAt) : undefined,
          completedAt: jobData.completedAt ? new Date(jobData.completedAt) : undefined
        };
      }
    }

    return null;
  }

  /**
   * Cancel job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    for (const [modelId, queue] of this.queues) {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
        await this.updateJobStatus(jobId, JobStatus.CANCELLED);
        
        // Update counters
        const state = await job.getState();
        if (state === 'waiting') {
          await this.redis.hincrby(`models:active:${modelId}`, 'queued', -1);
        } else if (state === 'active') {
          await this.redis.hincrby(`models:active:${modelId}`, 'processing', -1);
        }
        
        logger.info({ jobId, modelId }, 'Job cancelled');
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<any> {
    const stats: Record<string, any> = {};

    for (const [modelId, queue] of this.queues) {
      const waiting = await queue.getWaitingCount();
      const active = await queue.getActiveCount();
      const completed = await queue.getCompletedCount();
      const failed = await queue.getFailedCount();
      const delayed = await queue.getDelayedCount();

      stats[modelId] = {
        name: queue.name,
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed
      };
    }

    return stats;
  }

  /**
   * Get queue metrics
   */
  public async getQueueMetrics(modelId: string): Promise<any> {
    const queue = this.queues.get(modelId);
    if (!queue) {
      return null;
    }

    const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed']);
    
    const metrics = {
      avgWaitTime: 0,
      avgProcessingTime: 0,
      successRate: 0,
      throughput: 0
    };

    let totalWaitTime = 0;
    let totalProcessingTime = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const job of jobs) {
      if (job.finishedOn && job.processedOn) {
        totalProcessingTime += job.finishedOn - job.processedOn;
        completedCount++;
      }
      if (job.processedOn && job.timestamp) {
        totalWaitTime += job.processedOn - job.timestamp;
      }
      if (job.failedReason) {
        failedCount++;
      }
    }

    if (jobs.length > 0) {
      metrics.avgWaitTime = totalWaitTime / jobs.length;
      metrics.avgProcessingTime = totalProcessingTime / Math.max(completedCount, 1);
      metrics.successRate = completedCount / (completedCount + failedCount);
      
      // Calculate throughput (jobs per minute)
      const timeRange = 60000; // 1 minute
      const recentJobs = jobs.filter(j => 
        j.finishedOn && (Date.now() - j.finishedOn) < timeRange
      );
      metrics.throughput = recentJobs.length;
    }

    return metrics;
  }

  /**
   * Clean old jobs
   */
  public async cleanOldJobs(): Promise<void> {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

    for (const [modelId, queue] of this.queues) {
      const jobs = await queue.getJobs(['completed', 'failed']);
      
      for (const job of jobs) {
        if (job.finishedOn && job.finishedOn < cutoffTime) {
          await job.remove();
        }
      }
    }

    logger.info('Cleaned old jobs');
  }

  /**
   * Pause queue
   */
  public async pauseQueue(modelId: string): Promise<void> {
    const queue = this.queues.get(modelId);
    if (queue) {
      await queue.pause();
      logger.info({ modelId }, 'Queue paused');
    }
  }

  /**
   * Resume queue
   */
  public async resumeQueue(modelId: string): Promise<void> {
    const queue = this.queues.get(modelId);
    if (queue) {
      await queue.resume();
      logger.info({ modelId }, 'Queue resumed');
    }
  }

  /**
   * Cleanup resources
   */
  public async destroy(): Promise<void> {
    // Close all workers
    for (const worker of this.workers.values()) {
      await worker.close();
    }

    // Close all queue events
    for (const queueEvents of this.queueEvents.values()) {
      await queueEvents.close();
    }

    // Close all queues
    for (const queue of this.queues.values()) {
      await queue.close();
    }

    logger.info('Queue manager destroyed');
  }
}