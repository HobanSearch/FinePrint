"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeadLetterHandler = void 0;
const bullmq_1 = require("bullmq");
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('dead-letter-handler');
class DeadLetterHandler {
    connection;
    deadLetterQueues = new Map();
    configs = new Map();
    alertThresholds = new Map();
    lastAlertTimes = new Map();
    constructor(connection) {
        this.connection = connection;
        this.startCleanupScheduler();
        logger.info('Dead Letter Handler initialized');
    }
    createDeadLetterQueue(originalQueueName, config) {
        const dlqName = `${originalQueueName}-dlq`;
        if (this.deadLetterQueues.has(dlqName)) {
            return this.deadLetterQueues.get(dlqName);
        }
        const dlq = new bullmq_1.Queue(dlqName, {
            connection: this.connection,
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 500,
                attempts: 1,
            },
        });
        this.deadLetterQueues.set(dlqName, dlq);
        this.configs.set(originalQueueName, config);
        this.alertThresholds.set(originalQueueName, config.alertThreshold);
        logger.info(`Dead letter queue '${dlqName}' created`, { config });
        return dlq;
    }
    async moveToDeadLetter(originalQueueName, job, error, attempts) {
        const dlqName = `${originalQueueName}-dlq`;
        const dlq = this.deadLetterQueues.get(dlqName);
        if (!dlq) {
            logger.error(`Dead letter queue not found for ${originalQueueName}`);
            return false;
        }
        const deadLetterData = {
            originalQueue: originalQueueName,
            originalJobId: job.id,
            jobData: job.data,
            error: error.message,
            stackTrace: error.stack,
            failedAt: new Date(),
            attempts,
            subscriptionTier: job.data?.subscriptionTier,
            userId: job.data?.userId,
            teamId: job.data?.teamId,
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
            await this.checkAlertThreshold(originalQueueName);
            return true;
        }
        catch (dlqError) {
            logger.error('Failed to move job to dead letter queue', {
                originalQueue: originalQueueName,
                jobId: job.id,
                error: dlqError,
            });
            return false;
        }
    }
    async retryDeadLetterJobs(originalQueueName, filter) {
        const dlqName = `${originalQueueName}-dlq`;
        const dlq = this.deadLetterQueues.get(dlqName);
        if (!dlq) {
            throw new Error(`Dead letter queue not found for ${originalQueueName}`);
        }
        const jobs = await dlq.getJobs(['completed'], 0, filter?.maxJobs || 100);
        const results = { succeeded: 0, failed: 0, errors: [] };
        for (const job of jobs) {
            const jobData = job.data;
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
                const originalQueue = new bullmq_1.Queue(originalQueueName, {
                    connection: this.connection,
                });
                await originalQueue.add(`retry-${jobData.originalJobId}`, jobData.jobData, {
                    priority: 1,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
                });
                await job.remove();
                results.succeeded++;
                logger.info(`Job ${jobData.originalJobId} retried from dead letter queue`, {
                    originalQueue: originalQueueName,
                });
            }
            catch (error) {
                results.failed++;
                results.errors.push(`Failed to retry job ${jobData.originalJobId}: ${error.message}`);
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
    async getDeadLetterStats(originalQueueName) {
        const stats = {
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
            if (!dlq)
                continue;
            const jobs = await dlq.getJobs(['completed'], 0, -1);
            stats.totalJobs += jobs.length;
            if (jobs.length > 0) {
                stats.jobsByQueue[queueName] = jobs.length;
                for (const job of jobs) {
                    const jobData = job.data;
                    const errorKey = jobData.error.split(':')[0];
                    stats.jobsByError[errorKey] = (stats.jobsByError[errorKey] || 0) + 1;
                    if (jobData.subscriptionTier) {
                        stats.jobsByTier[jobData.subscriptionTier] = (stats.jobsByTier[jobData.subscriptionTier] || 0) + 1;
                    }
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
    async cleanupDeadLetterJobs(originalQueueName, olderThanDays = 7) {
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
            const jobData = job.data;
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
    async exportDeadLetterJobs(originalQueueName, format = 'json') {
        const dlqName = `${originalQueueName}-dlq`;
        const dlq = this.deadLetterQueues.get(dlqName);
        if (!dlq) {
            throw new Error(`Dead letter queue not found for ${originalQueueName}`);
        }
        const jobs = await dlq.getJobs(['completed'], 0, -1);
        const jobsData = jobs.map(job => job.data);
        if (format === 'json') {
            return JSON.stringify(jobsData, null, 2);
        }
        else {
            if (jobsData.length === 0)
                return '';
            const headers = Object.keys(jobsData[0]).join(',');
            const rows = jobsData.map(job => Object.values(job)
                .map(value => `"${String(value).replace(/"/g, '""')}"`)
                .join(','));
            return [headers, ...rows].join('\n');
        }
    }
    async getDeadLetterJobs(originalQueueName, options = {}) {
        const dlqName = `${originalQueueName}-dlq`;
        const dlq = this.deadLetterQueues.get(dlqName);
        if (!dlq) {
            return [];
        }
        const jobs = await dlq.getJobs(['completed'], options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);
        return jobs
            .map(job => job.data)
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
    async checkAlertThreshold(originalQueueName) {
        const threshold = this.alertThresholds.get(originalQueueName);
        if (!threshold)
            return;
        const dlqName = `${originalQueueName}-dlq`;
        const dlq = this.deadLetterQueues.get(dlqName);
        if (!dlq)
            return;
        const jobs = await dlq.getJobs(['completed'], 0, -1);
        if (jobs.length >= threshold) {
            const lastAlert = this.lastAlertTimes.get(originalQueueName);
            const now = new Date();
            if (!lastAlert || now.getTime() - lastAlert.getTime() > 3600000) {
                logger.error(`Dead letter queue alert threshold exceeded`, {
                    originalQueue: originalQueueName,
                    jobCount: jobs.length,
                    threshold,
                });
                this.lastAlertTimes.set(originalQueueName, now);
                process.emit('queue:dead-letter-alert', {
                    queueName: originalQueueName,
                    jobCount: jobs.length,
                    threshold,
                });
            }
        }
    }
    startCleanupScheduler() {
        setInterval(async () => {
            for (const [queueName, config] of this.configs) {
                try {
                    await this.cleanupDeadLetterJobs(queueName, config.retentionDays);
                }
                catch (error) {
                    logger.error(`Dead letter cleanup failed for queue ${queueName}`, { error });
                }
            }
        }, 6 * 60 * 60 * 1000);
    }
    getDeadLetterQueues() {
        return this.deadLetterQueues;
    }
    async closeAll() {
        for (const [name, dlq] of this.deadLetterQueues) {
            await dlq.close();
            logger.info(`Dead letter queue '${name}' closed`);
        }
        this.deadLetterQueues.clear();
    }
}
exports.DeadLetterHandler = DeadLetterHandler;
exports.default = DeadLetterHandler;
//# sourceMappingURL=dead-letter-handler.js.map