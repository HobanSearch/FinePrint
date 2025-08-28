import { Queue, Worker, Job, QueueEvents, JobsOptions, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import EventEmitter from 'eventemitter3';
import { register, Gauge, Counter, Histogram } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';
import { throttle, debounce } from 'lodash';
import cronParser from 'cron-parser';
import { z } from 'zod';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/logger';
import type { 
  JobOptions, 
  JobProgress, 
  QueueConfig, 
  QueueStats,
  JobStatus,
  SubscriptionTier,
  PriorityConfig,
  QueueMetrics,
  DeadLetterQueueConfig,
  WorkerScalingConfig,
  BulkJobOperation,
  ScheduledJobConfig,
  QueueHealthCheck,
  JobExecutionContext,
  RetryStrategy,
  AnalysisJobData,
  MonitoringJobData,
  NotificationJobData,
  EmailJobData,
  WebhookJobData,
  ActionJobData,
  CleanupJobData,
  ExportJobData
} from '@fineprintai/shared-types';

const logger = createServiceLogger('enhanced-queue-manager');

// Validation schemas
const jobDataSchema = z.object({
  userId: z.string().optional(),
  teamId: z.string().optional(),
  subscriptionTier: z.nativeEnum(SubscriptionTier).optional(),
});

// Prometheus metrics
const jobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'Total number of jobs processed',
  labelNames: ['queue', 'status', 'subscription_tier'],
});

const jobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Job processing duration in seconds',
  labelNames: ['queue', 'job_name', 'subscription_tier'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
});

const queueDepth = new Gauge({
  name: 'queue_depth',
  help: 'Current queue depth',
  labelNames: ['queue', 'status'],
});

const activeWorkers = new Gauge({
  name: 'queue_active_workers',
  help: 'Number of active workers',
  labelNames: ['queue'],
});

export class EnhancedQueueManager extends EventEmitter {
  private connection: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker[]> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private deadLetterQueues: Map<string, Queue> = new Map();
  private scheduledJobs: Map<string, ScheduledJobConfig> = new Map();
  private metricsCache: Map<string, QueueMetrics> = new Map();
  private healthChecks: Map<string, QueueHealthCheck> = new Map();
  private workerScalingConfigs: Map<string, WorkerScalingConfig> = new Map();
  private jobContexts: Map<string, JobExecutionContext> = new Map();
  private isShuttingDown = false;

  // Priority configuration based on subscription tiers
  private readonly priorityConfig: PriorityConfig = {
    [SubscriptionTier.FREE]: 1,
    [SubscriptionTier.STARTER]: 5,
    [SubscriptionTier.PROFESSIONAL]: 10,
    [SubscriptionTier.TEAM]: 15,
    [SubscriptionTier.ENTERPRISE]: 20,
  };

  // Default dead letter queue configuration
  private readonly defaultDLQConfig: DeadLetterQueueConfig = {
    enabled: true,
    maxAttempts: 5,
    retentionDays: 7,
    alertThreshold: 100,
  };

  constructor() {
    super();
    this.connection = new Redis(config.redis.url, {
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      enableReadyCheck: config.redis.enableReadyCheck,
      lazyConnect: true,
      keepAlive: 30000,
      commandTimeout: 5000,
      db: config.redis.queueDb || 1,
    });

    this.setupConnectionHandlers();
    this.startMetricsCollection();
    this.startHealthChecks();
    this.setupGracefulShutdown();

    logger.info('Enhanced Queue Manager initialized');
  }

  private setupConnectionHandlers(): void {
    this.connection.on('connect', () => {
      logger.info('Enhanced Queue Redis connection established');
      this.emit('redis:connected');
    });

    this.connection.on('error', (error) => {
      logger.error('Enhanced Queue Redis connection error', { error: error.message });
      this.emit('redis:error', error);
    });

    this.connection.on('close', () => {
      logger.warn('Enhanced Queue Redis connection closed');
      this.emit('redis:disconnected');
    });

    this.connection.on('reconnecting', () => {
      logger.info('Enhanced Queue Redis reconnecting');
      this.emit('redis:reconnecting');
    });
  }

  /**
   * Create a queue with enterprise features
   */
  public createQueue(name: string, options?: Partial<QueueConfig & {
    deadLetterQueue?: DeadLetterQueueConfig;
    workerScaling?: WorkerScalingConfig;
  }>): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queueOptions: QueueOptions = {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: options?.defaultJobOptions?.removeOnComplete ?? 100,
        removeOnFail: options?.defaultJobOptions?.removeOnFail ?? 50,
        attempts: options?.defaultJobOptions?.attempts ?? 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...options?.defaultJobOptions,
      },
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 1,
        retryProcessDelay: 2000,
        ...options?.settings,
      },
    };

    const queue = new Queue(name, queueOptions);

    // Setup dead letter queue if enabled
    if (options?.deadLetterQueue?.enabled !== false) {
      const dlqConfig = { ...this.defaultDLQConfig, ...options?.deadLetterQueue };
      this.createDeadLetterQueue(name, dlqConfig);
    }

    // Setup worker scaling configuration
    if (options?.workerScaling) {
      this.workerScalingConfigs.set(name, options.workerScaling);
    }

    // Setup queue events with comprehensive monitoring
    this.setupQueueEvents(name, queue);

    this.queues.set(name, queue);
    logger.info(`Enhanced queue '${name}' created with enterprise features`);

    return queue;
  }

  /**
   * Create a worker with auto-scaling capabilities
   */
  public createWorker<T = any>(
    queueName: string,
    processor: (job: Job<T>, token?: string) => Promise<any>,
    options?: {
      concurrency?: number;
      limiter?: { max: number; duration: number };
      autoScale?: boolean;
      maxWorkers?: number;
      minWorkers?: number;
    }
  ): Worker<T> {
    const workerName = `${queueName}-worker-${uuidv4()}`;
    const concurrency = options?.concurrency || 1;

    const worker = new Worker<T>(
      queueName,
      async (job: Job<T>, token?: string) => {
        const context = this.createJobContext(job, queueName, workerName);
        this.jobContexts.set(job.id!, context);

        const startTime = Date.now();
        logger.jobStart(job.id!, job.name, job.data);

        // Set up job timeout if specified
        let timeoutHandle: NodeJS.Timeout | undefined;
        if (context.timeout) {
          timeoutHandle = setTimeout(() => {
            logger.warn(`Job ${job.id} timed out after ${context.timeout}ms`);
            job.moveToFailed(new Error(`Job timeout after ${context.timeout}ms`), token!);
          }, context.timeout);
        }

        try {
          // Update job progress
          await job.updateProgress({ percentage: 0, stage: 'started', message: 'Job processing started' });

          const result = await processor(job, token);
          
          if (timeoutHandle) clearTimeout(timeoutHandle);
          
          const duration = Date.now() - startTime;
          
          // Update metrics
          jobsTotal.inc({ 
            queue: queueName, 
            status: 'completed', 
            subscription_tier: context.subscriptionTier 
          });
          
          jobDuration.observe(
            { queue: queueName, job_name: job.name, subscription_tier: context.subscriptionTier },
            duration / 1000
          );

          logger.jobComplete(job.id!, job.name, duration, result);
          this.emit('job:completed', { jobId: job.id, queueName, duration, result });

          return result;
        } catch (error) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          
          const duration = Date.now() - startTime;
          const jobError = error as Error;

          // Update metrics
          jobsTotal.inc({ 
            queue: queueName, 
            status: 'failed', 
            subscription_tier: context.subscriptionTier 
          });

          // Handle dead letter queue
          await this.handleFailedJob(job, jobError, queueName);

          logger.jobFailed(job.id!, job.name, jobError, duration);
          this.emit('job:failed', { jobId: job.id, queueName, error: jobError, duration });

          throw error;
        } finally {
          this.jobContexts.delete(job.id!);
        }
      },
      {
        connection: this.connection,
        concurrency,
        limiter: options?.limiter,
        autorun: true,
      }
    );

    // Setup worker event handlers
    this.setupWorkerEvents(worker, queueName, workerName);

    // Initialize workers array if needed
    if (!this.workers.has(queueName)) {
      this.workers.set(queueName, []);
    }
    this.workers.get(queueName)!.push(worker as Worker<any>);

    // Setup auto-scaling if enabled
    if (options?.autoScale) {
      this.setupWorkerAutoScaling(queueName, options);
    }

    logger.info(`Enhanced worker '${workerName}' created for queue '${queueName}' with concurrency ${concurrency}`);
    
    return worker;
  }

  /**
   * Add job with subscription tier-based priority
   */
  public async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    // Validate job data
    try {
      jobDataSchema.parse(data);
    } catch (error) {
      logger.error('Invalid job data', { error, data });
      throw new Error('Invalid job data structure');
    }

    // Determine priority based on subscription tier
    const subscriptionTier = (data as any)?.subscriptionTier || SubscriptionTier.FREE;
    const priority = options?.priority ?? this.priorityConfig[subscriptionTier];

    const jobOptions: JobsOptions = {
      priority,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff || { type: 'exponential', delay: 2000 },
      removeOnComplete: options?.removeOnComplete ?? 100,
      removeOnFail: options?.removeOnFail ?? 50,
      jobId: options?.jobId,
      repeat: options?.repeat,
    };

    const job = await queue.add(jobName, data, jobOptions);

    // Update metrics
    jobsTotal.inc({ queue: queueName, status: 'added', subscription_tier: subscriptionTier });

    logger.debug(`Job '${jobName}' added to queue '${queueName}'`, {
      jobId: job.id,
      priority,
      subscriptionTier,
      delay: options?.delay,
    });

    this.emit('job:added', { jobId: job.id, queueName, jobName, priority, subscriptionTier });

    return job;
  }

  /**
   * Bulk job operations for high-throughput scenarios
   */
  public async bulkAddJobs(
    queueName: string,
    operation: BulkJobOperation
  ): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const batchSize = operation.batchSize || 100;
    const results: Job[] = [];

    if (operation.action === 'add') {
      // Process jobs in batches to avoid memory issues
      for (let i = 0; i < operation.jobs.length; i += batchSize) {
        const batch = operation.jobs.slice(i, i + batchSize);
        const batchJobs = batch.map(jobSpec => ({
          name: jobSpec.name,
          data: jobSpec.data,
          opts: {
            ...jobSpec.options,
            priority: jobSpec.options?.priority ?? this.priorityConfig[
              (jobSpec.data as any)?.subscriptionTier || SubscriptionTier.FREE
            ],
          },
        }));

        const jobs = await queue.addBulk(batchJobs);
        results.push(...jobs);

        // Throttle to prevent overwhelming the system
        if (i + batchSize < operation.jobs.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    logger.info(`Bulk operation '${operation.action}' completed for ${results.length} jobs in queue '${queueName}'`);
    this.emit('bulk:completed', { queueName, operation: operation.action, count: results.length });

    return results;
  }

  /**
   * Schedule recurring jobs with cron expressions
   */
  public async scheduleJob(config: ScheduledJobConfig): Promise<void> {
    try {
      // Validate cron expression
      cronParser.parseExpression(config.cron, { tz: config.timezone });

      // Store scheduled job configuration
      this.scheduledJobs.set(config.name, {
        ...config,
        enabled: config.enabled ?? true,
        nextRun: this.calculateNextRun(config.cron, config.timezone),
      });

      logger.info(`Scheduled job '${config.name}' registered`, {
        cron: config.cron,
        timezone: config.timezone,
        enabled: config.enabled,
      });

      this.emit('schedule:added', config);
    } catch (error) {
      logger.error(`Failed to schedule job '${config.name}'`, { error, config });
      throw new Error(`Invalid cron expression: ${config.cron}`);
    }
  }

  /**
   * Cancel a job with proper cleanup
   */
  public async cancelJob(queueName: string, jobId: string, reason?: string): Promise<boolean> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    
    if (state === 'active') {
      // For active jobs, we need to handle graceful cancellation
      const context = this.jobContexts.get(jobId);
      if (context) {
        logger.info(`Cancelling active job ${jobId}`, { reason, context });
        this.emit('job:cancelling', { jobId, queueName, reason });
      }
    }

    await job.remove();
    logger.info(`Job ${jobId} cancelled in queue ${queueName}`, { reason });
    this.emit('job:cancelled', { jobId, queueName, reason });

    return true;
  }

  /**
   * Get comprehensive job status with execution context
   */
  public async getJobStatus(queueName: string, jobId: string): Promise<JobStatus | null> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress as JobProgress | null;
    const context = this.jobContexts.get(jobId);

    return {
      id: job.id!,
      name: job.name,
      data: job.data,
      progress,
      status: state as JobStatus['status'],
      createdAt: new Date(job.timestamp),
      startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      error: job.failedReason,
      result: job.returnvalue,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || 1,
      // Enhanced fields
      subscriptionTier: (job.data as any)?.subscriptionTier,
      userId: (job.data as any)?.userId,
      teamId: (job.data as any)?.teamId,
      workerName: context?.workerName,
      timeout: context?.timeout,
    };
  }

  /**
   * Get real-time queue metrics
   */
  public async getQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const cached = this.metricsCache.get(queueName);
    if (cached && Date.now() - cached.lastUpdated.getTime() < 30000) {
      return cached;
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
      queue.getPaused(),
    ]);

    // Calculate throughput (jobs per minute over last hour)
    const throughput = await this.calculateThroughput(queueName);
    const avgProcessingTime = await this.calculateAvgProcessingTime(queueName);
    const errorRate = completed.length > 0 ? (failed.length / (completed.length + failed.length)) * 100 : 0;

    const metrics: QueueMetrics = {
      queueName,
      totalJobs: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length,
      completedJobs: completed.length,
      failedJobs: failed.length,
      waitingJobs: waiting.length,
      activeJobs: active.length,
      delayedJobs: delayed.length,
      pausedJobs: paused.length,
      throughput,
      avgProcessingTime,
      errorRate,
      lastUpdated: new Date(),
    };

    // Update Prometheus metrics
    queueDepth.set({ queue: queueName, status: 'waiting' }, waiting.length);
    queueDepth.set({ queue: queueName, status: 'active' }, active.length);
    queueDepth.set({ queue: queueName, status: 'failed' }, failed.length);

    this.metricsCache.set(queueName, metrics);
    return metrics;
  }

  /**
   * Perform health check on queue
   */
  public async performHealthCheck(queueName: string): Promise<QueueHealthCheck> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const issues: string[] = [];
    let isHealthy = true;

    try {
      // Check Redis connection
      const pingResult = await this.connection.ping();
      if (pingResult !== 'PONG') {
        issues.push('Redis connection unhealthy');
        isHealthy = false;
      }

      // Check queue responsiveness
      const startTime = Date.now();
      await queue.getWaiting(0, 0);
      const latency = Date.now() - startTime;

      if (latency > 1000) {
        issues.push(`High queue latency: ${latency}ms`);
        if (latency > 5000) isHealthy = false;
      }

      // Check for excessive failed jobs
      const failed = await queue.getFailed();
      if (failed.length > 1000) {
        issues.push(`High number of failed jobs: ${failed.length}`);
        if (failed.length > 5000) isHealthy = false;
      }

      // Check worker availability
      const workers = this.workers.get(queueName) || [];
      const activeWorkerCount = workers.filter(w => !w.closing).length;
      if (activeWorkerCount === 0) {
        issues.push('No active workers available');
        isHealthy = false;
      }

      const healthCheck: QueueHealthCheck = {
        queueName,
        isHealthy,
        lastCheck: new Date(),
        issues,
        metrics: {
          memoryUsage: process.memoryUsage().heapUsed,
          connectionCount: 1, // Simplified for now
          avgLatency: latency,
        },
      };

      this.healthChecks.set(queueName, healthCheck);
      this.emit('health:checked', healthCheck);

      return healthCheck;
    } catch (error) {
      const healthCheck: QueueHealthCheck = {
        queueName,
        isHealthy: false,
        lastCheck: new Date(),
        issues: [`Health check failed: ${(error as Error).message}`],
        metrics: {
          memoryUsage: process.memoryUsage().heapUsed,
          connectionCount: 0,
          avgLatency: -1,
        },
      };

      this.healthChecks.set(queueName, healthCheck);
      return healthCheck;
    }
  }

  // Private helper methods

  private createJobContext(job: Job, queueName: string, workerName: string): JobExecutionContext {
    const data = job.data as any;
    return {
      jobId: job.id!,
      queueName,
      workerName,
      startTime: new Date(),
      timeout: job.opts.delay,
      subscriptionTier: data?.subscriptionTier || SubscriptionTier.FREE,
      userId: data?.userId,
      teamId: data?.teamId,
    };
  }

  private async handleFailedJob(job: Job, error: Error, queueName: string): Promise<void> {
    const dlq = this.deadLetterQueues.get(queueName);
    if (!dlq) return;

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts || 3;

    if (attemptsMade >= maxAttempts) {
      // Move to dead letter queue
      await dlq.add('failed-job', {
        originalQueue: queueName,
        originalJobId: job.id,
        jobData: job.data,
        error: error.message,
        failedAt: new Date(),
        attempts: attemptsMade,
      }, {
        priority: 1,
        removeOnComplete: false, // Keep DLQ jobs for analysis
      });

      logger.warn(`Job ${job.id} moved to dead letter queue after ${attemptsMade} attempts`);
      this.emit('job:dead-letter', { jobId: job.id, queueName, error, attempts: attemptsMade });
    }
  }

  private createDeadLetterQueue(queueName: string, config: DeadLetterQueueConfig): void {
    const dlqName = `${queueName}-dlq`;
    const dlq = new Queue(dlqName, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 500,
      },
    });

    this.deadLetterQueues.set(queueName, dlq);
    logger.info(`Dead letter queue '${dlqName}' created`, { config });
  }

  private setupQueueEvents(queueName: string, queue: Queue): void {
    const queueEvents = new QueueEvents(queueName, { connection: this.connection });

    queueEvents.on('completed', ({ jobId }) => {
      logger.debug(`Job ${jobId} completed in queue ${queueName}`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`Job ${jobId} failed in queue ${queueName}`, { failedReason });
    });

    queueEvents.on('stalled', ({ jobId }) => {
      logger.warn(`Job ${jobId} stalled in queue ${queueName}`);
      this.emit('job:stalled', { jobId, queueName });
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      this.emit('job:progress', { jobId, queueName, progress: data });
    });

    this.queueEvents.set(queueName, queueEvents);
  }

  private setupWorkerEvents(worker: Worker, queueName: string, workerName: string): void {
    worker.on('completed', (job) => {
      logger.debug(`Worker ${workerName} completed job ${job.id} in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Worker ${workerName} failed job ${job?.id} in queue ${queueName}`, { 
        error: err.message 
      });
    });

    worker.on('error', (err) => {
      logger.error(`Worker ${workerName} error in queue ${queueName}`, { error: err.message });
      this.emit('worker:error', { workerName, queueName, error: err });
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`Worker ${workerName} stalled on job ${jobId} in queue ${queueName}`);
      this.emit('worker:stalled', { workerName, queueName, jobId });
    });
  }

  private setupWorkerAutoScaling(
    queueName: string, 
    options: { maxWorkers?: number; minWorkers?: number }
  ): void {
    const config: WorkerScalingConfig = {
      minWorkers: options.minWorkers || 1,
      maxWorkers: options.maxWorkers || 10,
      scaleUpThreshold: 50,
      scaleDownThreshold: 10,
      scaleUpDelay: 30000,
      scaleDownDelay: 60000,
    };

    this.workerScalingConfigs.set(queueName, config);

    // Check scaling needs every 30 seconds
    const scalingInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(scalingInterval);
        return;
      }

      try {
        await this.checkWorkerScaling(queueName);
      } catch (error) {
        logger.error(`Worker scaling check failed for queue ${queueName}`, { error });
      }
    }, 30000);
  }

  private async checkWorkerScaling(queueName: string): Promise<void> {
    const config = this.workerScalingConfigs.get(queueName);
    if (!config) return;

    const metrics = await this.getQueueMetrics(queueName);
    const currentWorkers = this.workers.get(queueName) || [];
    const activeWorkers = currentWorkers.filter(w => !w.closing).length;

    // Scale up if queue depth is high
    if (metrics.waitingJobs > config.scaleUpThreshold && activeWorkers < config.maxWorkers) {
      logger.info(`Scaling up workers for queue ${queueName}`, {
        currentWorkers: activeWorkers,
        maxWorkers: config.maxWorkers,
        queueDepth: metrics.waitingJobs,
      });

      // Add a new worker (simplified - in production you might use container orchestration)
      this.emit('scaling:up', { queueName, currentWorkers: activeWorkers, targetWorkers: activeWorkers + 1 });
    }

    // Scale down if queue depth is low
    if (metrics.waitingJobs < config.scaleDownThreshold && activeWorkers > config.minWorkers) {
      logger.info(`Scaling down workers for queue ${queueName}`, {
        currentWorkers: activeWorkers,
        minWorkers: config.minWorkers,
        queueDepth: metrics.waitingJobs,
      });

      // Remove a worker gracefully
      const workerToRemove = currentWorkers[currentWorkers.length - 1];
      if (workerToRemove) {
        await workerToRemove.close();
        currentWorkers.pop();
        this.emit('scaling:down', { queueName, currentWorkers: activeWorkers, targetWorkers: activeWorkers - 1 });
      }
    }
  }

  private calculateNextRun(cron: string, timezone?: string): Date {
    const interval = cronParser.parseExpression(cron, { tz: timezone });
    return interval.next().toDate();
  }

  private async calculateThroughput(queueName: string): Promise<number> {
    // Simplified throughput calculation
    // In production, you'd use time-series data
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return 0;

      const completed = await queue.getCompleted(0, 100);
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);

      const recentJobs = completed.filter(job => job.finishedOn && job.finishedOn > oneHourAgo);
      return (recentJobs.length / 60); // jobs per minute
    } catch (error) {
      logger.error(`Failed to calculate throughput for queue ${queueName}`, { error });
      return 0;
    }
  }

  private async calculateAvgProcessingTime(queueName: string): Promise<number> {
    // Simplified average processing time calculation
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return 0;

      const completed = await queue.getCompleted(0, 50);
      if (completed.length === 0) return 0;

      const totalTime = completed.reduce((sum, job) => {
        if (job.processedOn && job.finishedOn) {
          return sum + (job.finishedOn - job.processedOn);
        }
        return sum;
      }, 0);

      return totalTime / completed.length;
    } catch (error) {
      logger.error(`Failed to calculate avg processing time for queue ${queueName}`, { error });
      return 0;
    }
  }

  private startMetricsCollection(): void {
    // Update metrics every 60 seconds
    const metricsInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(metricsInterval);
        return;
      }

      for (const queueName of this.queues.keys()) {
        try {
          await this.getQueueMetrics(queueName);
          
          // Update active workers gauge
          const workers = this.workers.get(queueName) || [];
          const activeWorkerCount = workers.filter(w => !w.closing).length;
          activeWorkers.set({ queue: queueName }, activeWorkerCount);
        } catch (error) {
          logger.error(`Failed to collect metrics for queue ${queueName}`, { error });
        }
      }
    }, 60000);
  }

  private startHealthChecks(): void {
    // Perform health checks every 5 minutes
    const healthInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(healthInterval);
        return;
      }

      for (const queueName of this.queues.keys()) {
        try {
          await this.performHealthCheck(queueName);
        } catch (error) {
          logger.error(`Health check failed for queue ${queueName}`, { error });
        }
      }
    }, 5 * 60 * 1000);
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      logger.info('Starting graceful shutdown of Enhanced Queue Manager');

      // Stop accepting new jobs
      for (const queue of this.queues.values()) {
        await queue.pause();
      }

      // Wait for active jobs to complete (with timeout)
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Shutdown timeout reached, forcing closure');
        process.exit(1);
      }, 30000);

      try {
        // Close all workers
        for (const [queueName, workers] of this.workers) {
          for (const worker of workers) {
            await worker.close();
            logger.info(`Worker closed for queue ${queueName}`);
          }
        }

        // Close all queue events
        for (const [queueName, queueEvents] of this.queueEvents) {
          await queueEvents.close();
          logger.info(`Queue events closed for ${queueName}`);
        }

        // Close all queues
        for (const [queueName, queue] of this.queues) {
          await queue.close();
          logger.info(`Queue ${queueName} closed`);
        }

        // Close dead letter queues
        for (const [queueName, dlq] of this.deadLetterQueues) {
          await dlq.close();
          logger.info(`Dead letter queue closed for ${queueName}`);
        }

        // Close Redis connection
        await this.connection.disconnect();
        logger.info('Redis connection closed');

        clearTimeout(shutdownTimeout);
        logger.info('Enhanced Queue Manager shutdown completed');
      } catch (error) {
        logger.error('Error during shutdown', { error });
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  // Standard methods for compatibility

  public async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    return await queue.getJob(jobId);
  }

  public async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const job = await this.getJob(queueName, jobId);
    if (!job) return false;

    await job.remove();
    logger.debug(`Job ${jobId} removed from queue ${queueName}`);
    return true;
  }

  public async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const job = await this.getJob(queueName, jobId);
    if (!job) return false;

    await job.retry();
    logger.debug(`Job ${jobId} retried in queue ${queueName}`);
    return true;
  }

  public async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    await queue.pause();
    logger.info(`Queue '${queueName}' paused`);
  }

  public async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    await queue.resume();
    logger.info(`Queue '${queueName}' resumed`);
  }

  public async cleanQueue(
    queueName: string,
    grace: number = 0,
    limit: number = 100,
    type: 'completed' | 'waiting' | 'active' | 'delayed' | 'failed' = 'completed'
  ): Promise<string[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const jobs = await queue.clean(grace, limit, type);
    logger.info(`Cleaned ${jobs.length} ${type} jobs from queue '${queueName}'`);
    return jobs;
  }

  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  public getWorkers(name: string): Worker[] | undefined {
    return this.workers.get(name);
  }

  public getAllQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  public getAllHealthChecks(): QueueHealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  public getAllMetrics(): QueueMetrics[] {
    return Array.from(this.metricsCache.values());
  }

  public getScheduledJobs(): ScheduledJobConfig[] {
    return Array.from(this.scheduledJobs.values());
  }
}