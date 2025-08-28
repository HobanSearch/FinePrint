import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/logger';
import type { 
  JobOptions, 
  JobProgress, 
  QueueConfig, 
  QueueStats,
  JobStatus,
  AnalysisJobData,
  MonitoringJobData,
  NotificationJobData,
  EmailJobData,
  WebhookJobData,
  ActionJobData,
  CleanupJobData,
  ExportJobData,
  SubscriptionTier,
  BulkJobOperation,
  ScheduledJobConfig,
} from '@fineprintai/shared-types';

// Export enhanced queue manager and utilities
export { EnhancedQueueManager } from './enhanced-queue-manager';
export * from './priority-manager';
export * from './dead-letter-handler';
export * from './metrics-collector';
export * from './worker-scaler';
export * from './job-scheduler';

// Export utility instances
export { priorityManager } from './priority-manager';
export { default as DeadLetterHandler } from './dead-letter-handler';
export { default as MetricsCollector } from './metrics-collector';
export { default as WorkerScaler } from './worker-scaler';
export { default as JobScheduler } from './job-scheduler';

const logger = createServiceLogger('queue');

// Original QueueManager class (maintained for backward compatibility)
export class QueueManager {
  private connection: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor() {
    this.connection = new Redis(config.redis.url, {
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      retryDelayOnFailover: config.redis.retryDelayOnFailover,
      enableReadyCheck: config.redis.enableReadyCheck,
      lazyConnect: true,
    });

    this.connection.on('connect', () => {
      logger.info('Queue Redis connection established');
    });

    this.connection.on('error', (error) => {
      logger.error('Queue Redis connection error', { error });
    });
  }

  createQueue(name: string, options?: Partial<QueueConfig>): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...options?.defaultJobOptions,
      },
    });

    // Setup queue events
    const queueEvents = new QueueEvents(name, { connection: this.connection });
    
    queueEvents.on('completed', ({ jobId }) => {
      logger.info(`Job ${jobId} completed in queue ${name}`);
    });

    queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`Job ${jobId} failed in queue ${name}`, { failedReason });
    });

    queueEvents.on('stalled', ({ jobId }) => {
      logger.warn(`Job ${jobId} stalled in queue ${name}`);
    });

    this.queues.set(name, queue);
    this.queueEvents.set(name, queueEvents);

    logger.info(`Queue '${name}' created`);
    return queue;
  }

  createWorker<T = any>(
    queueName: string,
    processor: (job: Job<T>) => Promise<any>,
    options?: {
      concurrency?: number;
      limiter?: {
        max: number;
        duration: number;
      };
    }
  ): Worker<T> {
    if (this.workers.has(queueName)) {
      return this.workers.get(queueName)! as Worker<T>;
    }

    const worker = new Worker<T>(
      queueName,
      async (job: Job<T>) => {
        const startTime = Date.now();
        logger.jobStart(job.id!, job.name, job.data);

        try {
          const result = await processor(job);
          const duration = Date.now() - startTime;
          logger.jobComplete(job.id!, job.name, duration, result);
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.jobFailed(job.id!, job.name, error as Error, duration);
          throw error;
        }
      },
      {
        connection: this.connection,
        concurrency: options?.concurrency || 1,
        limiter: options?.limiter,
      }
    );

    worker.on('completed', (job) => {
      logger.debug(`Worker completed job ${job.id} in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Worker failed job ${job?.id} in queue ${queueName}`, { error: err.message });
    });

    worker.on('error', (err) => {
      logger.error(`Worker error in queue ${queueName}`, { error: err.message });
    });

    this.workers.set(queueName, worker as Worker<any>);
    logger.info(`Worker created for queue '${queueName}' with concurrency ${options?.concurrency || 1}`);
    
    return worker;
  }

  async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const job = await queue.add(jobName, data, {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts,
      backoff: options?.backoff,
      removeOnComplete: options?.removeOnComplete,
      removeOnFail: options?.removeOnFail,
      jobId: options?.jobId,
      repeat: options?.repeat,
    });

    logger.debug(`Job '${jobName}' added to queue '${queueName}'`, { 
      jobId: job.id,
      priority: options?.priority,
      delay: options?.delay 
    });

    return job;
  }

  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    return await queue.getJob(jobId);
  }

  async getQueueStats(queueName: string): Promise<QueueStats> {
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

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: paused.length,
    };
  }

  async getJobStatus(queueName: string, jobId: string): Promise<JobStatus | null> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress as JobProgress | null;

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
    };
  }

  async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    logger.debug(`Job ${jobId} removed from queue ${queueName}`);
    return true;
  }

  async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return false;
    }

    await job.retry();
    logger.debug(`Job ${jobId} retried in queue ${queueName}`);
    return true;
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.pause();
    logger.info(`Queue '${queueName}' paused`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.resume();
    logger.info(`Queue '${queueName}' resumed`);
  }

  async cleanQueue(
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

  async obliterateQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.obliterate();
    logger.warn(`Queue '${queueName}' obliterated`);
  }

  async closeAll(): Promise<void> {
    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`Worker '${name}' closed`);
    }

    // Close all queue events
    for (const [name, queueEvents] of this.queueEvents) {
      await queueEvents.close();
      logger.info(`Queue events '${name}' closed`);
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue '${name}' closed`);
    }

    // Close connection
    await this.connection.disconnect();
    logger.info('Queue manager closed');
  }

  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  getWorker(name: string): Worker | undefined {
    return this.workers.get(name);
  }

  getAllQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
}

// Create singleton queue manager (backward compatibility)
export const queueManager = new QueueManager();

// Create enhanced queue manager singleton
import { EnhancedQueueManager } from './enhanced-queue-manager';
export const enhancedQueueManager = new EnhancedQueueManager();

// Pre-configured queues with proper types using enhanced manager
export const analysisQueue = enhancedQueueManager.createQueue('analysis', {
  ...config.queues?.analysis,
  deadLetterQueue: { enabled: true, maxAttempts: 5, retentionDays: 7, alertThreshold: 50 },
  workerScaling: { minWorkers: 2, maxWorkers: 10, scaleUpThreshold: 20, scaleDownThreshold: 5, scaleUpDelay: 30000, scaleDownDelay: 60000 }
});

export const monitoringQueue = enhancedQueueManager.createQueue('monitoring', {
  ...config.queues?.monitoring,
  deadLetterQueue: { enabled: true, maxAttempts: 3, retentionDays: 3, alertThreshold: 25 },
  workerScaling: { minWorkers: 1, maxWorkers: 5, scaleUpThreshold: 15, scaleDownThreshold: 3, scaleUpDelay: 45000, scaleDownDelay: 90000 }
});

export const notificationQueue = enhancedQueueManager.createQueue('notification', {
  ...config.queues?.notification,
  deadLetterQueue: { enabled: true, maxAttempts: 4, retentionDays: 5, alertThreshold: 30 },
  workerScaling: { minWorkers: 2, maxWorkers: 8, scaleUpThreshold: 25, scaleDownThreshold: 5, scaleUpDelay: 20000, scaleDownDelay: 60000 }
});

export const actionQueue = enhancedQueueManager.createQueue('action', {
  ...config.queues?.action,
  deadLetterQueue: { enabled: true, maxAttempts: 3, retentionDays: 7, alertThreshold: 20 },
  workerScaling: { minWorkers: 1, maxWorkers: 4, scaleUpThreshold: 10, scaleDownThreshold: 2, scaleUpDelay: 60000, scaleDownDelay: 120000 }
});

export const cleanupQueue = enhancedQueueManager.createQueue('cleanup', {
  ...config.queues?.cleanup,
  deadLetterQueue: { enabled: true, maxAttempts: 2, retentionDays: 1, alertThreshold: 10 },
  workerScaling: { minWorkers: 1, maxWorkers: 2, scaleUpThreshold: 5, scaleDownThreshold: 1, scaleUpDelay: 120000, scaleDownDelay: 300000 }
});

export const exportQueue = enhancedQueueManager.createQueue('export', {
  ...config.queues?.export,
  deadLetterQueue: { enabled: true, maxAttempts: 3, retentionDays: 14, alertThreshold: 15 },
  workerScaling: { minWorkers: 1, maxWorkers: 3, scaleUpThreshold: 5, scaleDownThreshold: 1, scaleUpDelay: 60000, scaleDownDelay: 180000 }
});

// High-level queue functions with subscription tier support
export const addAnalysisJob = (data: AnalysisJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('analysis', 'analyze-document', data, options);

export const addMonitoringJob = (data: MonitoringJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('monitoring', 'monitor-document', data, options);

export const addNotificationJob = (data: NotificationJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('notification', 'send-notification', data, options);

export const addEmailJob = (data: EmailJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('notification', 'send-email', data, options);

export const addWebhookJob = (data: WebhookJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('notification', 'send-webhook', data, options);

export const addActionJob = (data: ActionJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('action', 'execute-action', data, options);

export const addCleanupJob = (data: CleanupJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('cleanup', 'cleanup-data', data, options);

export const addExportJob = (data: ExportJobData, options?: JobOptions) =>
  enhancedQueueManager.addJob('export', 'export-data', data, options);

// Bulk operations
export const bulkAddJobs = (queueName: string, operation: BulkJobOperation) =>
  enhancedQueueManager.bulkAddJobs(queueName, operation);

// Metrics and monitoring
export const getQueueMetrics = (queueName: string) =>
  enhancedQueueManager.getQueueMetrics(queueName);

export const performHealthCheck = (queueName: string) =>
  enhancedQueueManager.performHealthCheck(queueName);

export const getAllHealthChecks = () =>
  enhancedQueueManager.getAllHealthChecks();

export const getAllMetrics = () =>
  enhancedQueueManager.getAllMetrics();

// Job management
export const cancelJob = (queueName: string, jobId: string, reason?: string) =>
  enhancedQueueManager.cancelJob(queueName, jobId, reason);

export const getJobStatus = (queueName: string, jobId: string) =>
  enhancedQueueManager.getJobStatus(queueName, jobId);

// Scheduling
export const scheduleJob = (config: ScheduledJobConfig) =>
  enhancedQueueManager.scheduleJob(config);

export const getScheduledJobs = () =>
  enhancedQueueManager.getScheduledJobs();

// Default export (enhanced manager)
export default enhancedQueueManager;