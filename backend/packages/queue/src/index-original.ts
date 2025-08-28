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
  ExportJobData
} from '@fineprintai/shared-types';

const logger = createServiceLogger('queue');

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

// Create singleton queue manager
export const queueManager = new QueueManager();

// Pre-configured queues with proper types
export const analysisQueue = queueManager.createQueue('analysis', config.queues.analysis);
export const monitoringQueue = queueManager.createQueue('monitoring', config.queues.monitoring);
export const notificationQueue = queueManager.createQueue('notification', config.queues.notification);

// High-level queue functions with proper typing
export const addAnalysisJob = (data: AnalysisJobData, options?: JobOptions) =>
  queueManager.addJob('analysis', 'analyze-document', data, options);

export const addMonitoringJob = (data: MonitoringJobData, options?: JobOptions) =>
  queueManager.addJob('monitoring', 'monitor-document', data, options);

export const addNotificationJob = (data: NotificationJobData, options?: JobOptions) =>
  queueManager.addJob('notification', 'send-notification', data, options);

export const addEmailJob = (data: EmailJobData, options?: JobOptions) =>
  queueManager.addJob('notification', 'send-email', data, options);

export const addWebhookJob = (data: WebhookJobData, options?: JobOptions) =>
  queueManager.addJob('notification', 'send-webhook', data, options);

export const addActionJob = (data: ActionJobData, options?: JobOptions) =>
  queueManager.addJob('action', 'execute-action', data, options);

export const addCleanupJob = (data: CleanupJobData, options?: JobOptions) =>
  queueManager.addJob('cleanup', 'cleanup-data', data, options);

export const addExportJob = (data: ExportJobData, options?: JobOptions) =>
  queueManager.addJob('export', 'export-data', data, options);

export default queueManager;