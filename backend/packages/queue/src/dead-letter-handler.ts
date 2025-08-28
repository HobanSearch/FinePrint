import { Queue, Job } from 'bullmq';
import Redis from 'ioredis';
import { createServiceLogger } from '@fineprintai/logger';
import { DeadLetterQueueConfig } from '@fineprintai/shared-types';

const logger = createServiceLogger('dead-letter-handler');

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  jobData: any;
  error: string;
  stackTrace?: string;
  failedAt: Date;
  attempts: number;
  subscriptionTier?: string;
  userId?: string;
  teamId?: string;
}

export interface DeadLetterStats {
  totalJobs: number;
  jobsByQueue: Record<string, number>;
  jobsByError: Record<string, number>;
  jobsByTier: Record<string, number>;
  oldestJob?: Date;
  newestJob?: Date;
}

/**
 * Handles dead letter queue operations and recovery strategies
 */
export class DeadLetterHandler {
  private connection: Redis;
  private deadLetterQueues: Map<string, Queue> = new Map();
  private configs: Map<string, DeadLetterQueueConfig> = new Map();
  private alertThresholds: Map<string, number> = new Map();
  private lastAlertTimes: Map<string, Date> = new Map();

  constructor(connection: Redis) {
    this.connection = connection;
    this.startCleanupScheduler();
    logger.info('Dead Letter Handler initialized');
  }

  /**
   * Create a dead letter queue for the specified queue
   */
  public createDeadLetterQueue(
    originalQueueName: string,
    config: DeadLetterQueueConfig
  ): Queue {
    const dlqName = `${originalQueueName}-dlq`;
    
    if (this.deadLetterQueues.has(dlqName)) {
      return this.deadLetterQueues.get(dlqName)!;
    }

    const dlq = new Queue(dlqName, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 1000, // Keep more DLQ jobs for analysis
        removeOnFail: 500,
        attempts: 1, // DLQ jobs don't retry
      },
    });

    this.deadLetterQueues.set(dlqName, dlq);
    this.configs.set(originalQueueName, config);
    this.alertThresholds.set(originalQueueName, config.alertThreshold);

    logger.info(`Dead letter queue '${dlqName}' created`, { config });
    return dlq;
  }

  /**
   * Move a failed job to the dead letter queue
   */
  public async moveToDeadLetter(
    originalQueueName: string,
    job: Job,
    error: Error,
    attempts: number
  ): Promise<boolean> {
    const dlqName = `${originalQueueName}-dlq`;
    const dlq = this.deadLetterQueues.get(dlqName);

    if (!dlq) {
      logger.error(`Dead letter queue not found for ${originalQueueName}`);
      return false;
    }

    const deadLetterData: DeadLetterJobData = {
      originalQueue: originalQueueName,
      originalJobId: job.id!,
      jobData: job.data,
      error: error.message,
      stackTrace: error.stack,
      failedAt: new Date(),
      attempts,
      subscriptionTier: (job.data as any)?.subscriptionTier,
      userId: (job.data as any)?.userId,
      teamId: (job.data as any)?.teamId,
    };

    try {
      await dlq.add('dead-letter-job', deadLetterData, {
        priority: 1,
        removeOnComplete: false,
      });

      logger.warn(`Job ${job.id} moved to dead letter queue`, {
        originalQueue: originalQueueName,
        error: error.message,
        attempts,
      });

      // Check if we need to send alerts
      await this.checkAlertThreshold(originalQueueName);

      return true;
    } catch (dlqError) {
      logger.error('Failed to move job to dead letter queue', {
        originalQueue: originalQueueName,
        jobId: job.id,
        error: dlqError,
      });
      return false;
    }
  }

  /**
   * Retry jobs from dead letter queue
   */
  public async retryDeadLetterJobs(
    originalQueueName: string,
    filter?: {
      jobIds?: string[];
      errorPattern?: RegExp;
      olderThan?: Date;
      subscriptionTier?: string;
      maxJobs?: number;
    }
  ): Promise<{ succeeded: number; failed: number; errors: string[] }> {
    const dlqName = `${originalQueueName}-dlq`;
    const dlq = this.deadLetterQueues.get(dlqName);

    if (!dlq) {
      throw new Error(`Dead letter queue not found for ${originalQueueName}`);
    }

    const jobs = await dlq.getJobs(['completed'], 0, filter?.maxJobs || 100);
    const results = { succeeded: 0, failed: 0, errors: [] as string[] };

    for (const job of jobs) {
      const jobData = job.data as DeadLetterJobData;

      // Apply filters
      if (filter?.jobIds && !filter.jobIds.includes(jobData.originalJobId)) {
        continue;
      }

      if (filter?.errorPattern && !filter.errorPattern.test(jobData.error)) {
        continue;
      }

      if (filter?.olderThan && jobData.failedAt > filter.olderThan) {
        continue;
      }

      if (filter?.subscriptionTier && jobData.subscriptionTier !== filter.subscriptionTier) {
        continue;
      }

      try {
        // Create original queue if it doesn't exist
        const originalQueue = new Queue(originalQueueName, {
          connection: this.connection,
        });

        // Re-add the job to the original queue
        await originalQueue.add(
          `retry-${jobData.originalJobId}`,
          jobData.jobData,
          {
            priority: 1,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000, // Start with higher delay for retries
            },
          }
        );

        // Remove from dead letter queue
        await job.remove();
        results.succeeded++;

        logger.info(`Job ${jobData.originalJobId} retried from dead letter queue`, {
          originalQueue: originalQueueName,
        });
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to retry job ${jobData.originalJobId}: ${(error as Error).message}`);
        logger.error(`Failed to retry job from dead letter queue`, {
          jobId: jobData.originalJobId,
          error,
        });
      }
    }

    logger.info(`Dead letter retry operation completed`, {
      originalQueue: originalQueueName,
      succeeded: results.succeeded,
      failed: results.failed,
    });

    return results;
  }

  /**
   * Get dead letter queue statistics
   */
  public async getDeadLetterStats(originalQueueName?: string): Promise<DeadLetterStats> {
    const stats: DeadLetterStats = {
      totalJobs: 0,
      jobsByQueue: {},
      jobsByError: {},
      jobsByTier: {},
    };

    const queuesToCheck = originalQueueName
      ? [originalQueueName]
      : Array.from(this.configs.keys());

    for (const queueName of queuesToCheck) {
      const dlqName = `${queueName}-dlq`;
      const dlq = this.deadLetterQueues.get(dlqName);

      if (!dlq) continue;

      const jobs = await dlq.getJobs(['completed'], 0, -1);
      stats.totalJobs += jobs.length;

      if (jobs.length > 0) {
        stats.jobsByQueue[queueName] = jobs.length;

        for (const job of jobs) {
          const jobData = job.data as DeadLetterJobData;

          // Count by error type
          const errorKey = jobData.error.split(':')[0]; // Use first part of error message
          stats.jobsByError[errorKey] = (stats.jobsByError[errorKey] || 0) + 1;

          // Count by subscription tier
          if (jobData.subscriptionTier) {
            stats.jobsByTier[jobData.subscriptionTier] = (stats.jobsByTier[jobData.subscriptionTier] || 0) + 1;
          }

          // Track oldest and newest jobs
          if (!stats.oldestJob || jobData.failedAt < stats.oldestJob) {
            stats.oldestJob = jobData.failedAt;
          }
          if (!stats.newestJob || jobData.failedAt > stats.newestJob) {
            stats.newestJob = jobData.failedAt;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Clean up old dead letter jobs
   */
  public async cleanupDeadLetterJobs(
    originalQueueName: string,
    olderThanDays: number = 7
  ): Promise<number> {
    const dlqName = `${originalQueueName}-dlq`;
    const dlq = this.deadLetterQueues.get(dlqName);

    if (!dlq) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const jobs = await dlq.getJobs(['completed'], 0, -1);
    let cleanedCount = 0;

    for (const job of jobs) {
      const jobData = job.data as DeadLetterJobData;
      if (jobData.failedAt < cutoffDate) {
        await job.remove();
        cleanedCount++;
      }
    }

    logger.info(`Cleaned ${cleanedCount} old dead letter jobs`, {
      originalQueue: originalQueueName,
      olderThanDays,
    });

    return cleanedCount;
  }

  /**
   * Export dead letter jobs for analysis
   */
  public async exportDeadLetterJobs(
    originalQueueName: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const dlqName = `${originalQueueName}-dlq`;
    const dlq = this.deadLetterQueues.get(dlqName);

    if (!dlq) {
      throw new Error(`Dead letter queue not found for ${originalQueueName}`);
    }

    const jobs = await dlq.getJobs(['completed'], 0, -1);
    const jobsData = jobs.map(job => job.data as DeadLetterJobData);

    if (format === 'json') {
      return JSON.stringify(jobsData, null, 2);
    } else {
      // CSV format
      if (jobsData.length === 0) return '';

      const headers = Object.keys(jobsData[0]).join(',');
      const rows = jobsData.map(job =>
        Object.values(job)
          .map(value => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      );

      return [headers, ...rows].join('\n');
    }
  }

  /**
   * Get dead letter jobs by various filters
   */
  public async getDeadLetterJobs(
    originalQueueName: string,
    options: {
      limit?: number;
      offset?: number;
      errorPattern?: RegExp;
      subscriptionTier?: string;
      since?: Date;
      until?: Date;
    } = {}
  ): Promise<DeadLetterJobData[]> {
    const dlqName = `${originalQueueName}-dlq`;
    const dlq = this.deadLetterQueues.get(dlqName);

    if (!dlq) {
      return [];
    }

    const jobs = await dlq.getJobs(
      ['completed'],
      options.offset || 0,
      (options.offset || 0) + (options.limit || 50) - 1
    );

    return jobs
      .map(job => job.data as DeadLetterJobData)
      .filter(jobData => {
        if (options.errorPattern && !options.errorPattern.test(jobData.error)) {
          return false;
        }
        if (options.subscriptionTier && jobData.subscriptionTier !== options.subscriptionTier) {
          return false;
        }
        if (options.since && jobData.failedAt < options.since) {
          return false;
        }
        if (options.until && jobData.failedAt > options.until) {
          return false;
        }
        return true;
      });
  }

  /**
   * Check if alert threshold is exceeded and send alerts
   */
  private async checkAlertThreshold(originalQueueName: string): Promise<void> {
    const threshold = this.alertThresholds.get(originalQueueName);
    if (!threshold) return;

    const dlqName = `${originalQueueName}-dlq`;
    const dlq = this.deadLetterQueues.get(dlqName);
    if (!dlq) return;

    const jobs = await dlq.getJobs(['completed'], 0, -1);
    
    if (jobs.length >= threshold) {
      const lastAlert = this.lastAlertTimes.get(originalQueueName);
      const now = new Date();
      
      // Only send alert if it's been more than 1 hour since last alert
      if (!lastAlert || now.getTime() - lastAlert.getTime() > 3600000) {
        logger.error(`Dead letter queue alert threshold exceeded`, {
          originalQueue: originalQueueName,
          jobCount: jobs.length,
          threshold,
        });

        this.lastAlertTimes.set(originalQueueName, now);
        
        // Emit event for external alert systems
        process.emit('queue:dead-letter-alert' as any, {
          queueName: originalQueueName,
          jobCount: jobs.length,
          threshold,
        });
      }
    }
  }

  /**
   * Start cleanup scheduler for old dead letter jobs
   */
  private startCleanupScheduler(): void {
    // Run cleanup every 6 hours
    setInterval(async () => {
      for (const [queueName, config] of this.configs) {
        try {
          await this.cleanupDeadLetterJobs(queueName, config.retentionDays);
        } catch (error) {
          logger.error(`Dead letter cleanup failed for queue ${queueName}`, { error });
        }
      }
    }, 6 * 60 * 60 * 1000);
  }

  /**
   * Get all dead letter queues
   */
  public getDeadLetterQueues(): Map<string, Queue> {
    return this.deadLetterQueues;
  }

  /**
   * Close all dead letter queues
   */
  public async closeAll(): Promise<void> {
    for (const [name, dlq] of this.deadLetterQueues) {
      await dlq.close();
      logger.info(`Dead letter queue '${name}' closed`);
    }
    this.deadLetterQueues.clear();
  }
}

export default DeadLetterHandler;