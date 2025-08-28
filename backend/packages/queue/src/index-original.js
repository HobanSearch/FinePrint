"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addExportJob = exports.addCleanupJob = exports.addActionJob = exports.addWebhookJob = exports.addEmailJob = exports.addNotificationJob = exports.addMonitoringJob = exports.addAnalysisJob = exports.notificationQueue = exports.monitoringQueue = exports.analysisQueue = exports.queueManager = exports.QueueManager = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("@fineprintai/config");
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('queue');
class QueueManager {
    connection;
    queues = new Map();
    workers = new Map();
    queueEvents = new Map();
    constructor() {
        this.connection = new ioredis_1.default(config_1.config.redis.url, {
            maxRetriesPerRequest: config_1.config.redis.maxRetriesPerRequest,
            retryDelayOnFailover: config_1.config.redis.retryDelayOnFailover,
            enableReadyCheck: config_1.config.redis.enableReadyCheck,
            lazyConnect: true,
        });
        this.connection.on('connect', () => {
            logger.info('Queue Redis connection established');
        });
        this.connection.on('error', (error) => {
            logger.error('Queue Redis connection error', { error });
        });
    }
    createQueue(name, options) {
        if (this.queues.has(name)) {
            return this.queues.get(name);
        }
        const queue = new bullmq_1.Queue(name, {
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
        const queueEvents = new bullmq_1.QueueEvents(name, { connection: this.connection });
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
    createWorker(queueName, processor, options) {
        if (this.workers.has(queueName)) {
            return this.workers.get(queueName);
        }
        const worker = new bullmq_1.Worker(queueName, async (job) => {
            const startTime = Date.now();
            logger.jobStart(job.id, job.name, job.data);
            try {
                const result = await processor(job);
                const duration = Date.now() - startTime;
                logger.jobComplete(job.id, job.name, duration, result);
                return result;
            }
            catch (error) {
                const duration = Date.now() - startTime;
                logger.jobFailed(job.id, job.name, error, duration);
                throw error;
            }
        }, {
            connection: this.connection,
            concurrency: options?.concurrency || 1,
            limiter: options?.limiter,
        });
        worker.on('completed', (job) => {
            logger.debug(`Worker completed job ${job.id} in queue ${queueName}`);
        });
        worker.on('failed', (job, err) => {
            logger.error(`Worker failed job ${job?.id} in queue ${queueName}`, { error: err.message });
        });
        worker.on('error', (err) => {
            logger.error(`Worker error in queue ${queueName}`, { error: err.message });
        });
        this.workers.set(queueName, worker);
        logger.info(`Worker created for queue '${queueName}' with concurrency ${options?.concurrency || 1}`);
        return worker;
    }
    async addJob(queueName, jobName, data, options) {
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
    async getJob(queueName, jobId) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        return await queue.getJob(jobId);
    }
    async getQueueStats(queueName) {
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
    async getJobStatus(queueName, jobId) {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return null;
        }
        const state = await job.getState();
        const progress = job.progress;
        return {
            id: job.id,
            name: job.name,
            data: job.data,
            progress,
            status: state,
            createdAt: new Date(job.timestamp),
            startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
            finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
            error: job.failedReason,
            result: job.returnvalue,
            attempts: job.attemptsMade,
            maxAttempts: job.opts.attempts || 1,
        };
    }
    async removeJob(queueName, jobId) {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return false;
        }
        await job.remove();
        logger.debug(`Job ${jobId} removed from queue ${queueName}`);
        return true;
    }
    async retryJob(queueName, jobId) {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return false;
        }
        await job.retry();
        logger.debug(`Job ${jobId} retried in queue ${queueName}`);
        return true;
    }
    async pauseQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        await queue.pause();
        logger.info(`Queue '${queueName}' paused`);
    }
    async resumeQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        await queue.resume();
        logger.info(`Queue '${queueName}' resumed`);
    }
    async cleanQueue(queueName, grace = 0, limit = 100, type = 'completed') {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        const jobs = await queue.clean(grace, limit, type);
        logger.info(`Cleaned ${jobs.length} ${type} jobs from queue '${queueName}'`);
        return jobs;
    }
    async obliterateQueue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        await queue.obliterate();
        logger.warn(`Queue '${queueName}' obliterated`);
    }
    async closeAll() {
        for (const [name, worker] of this.workers) {
            await worker.close();
            logger.info(`Worker '${name}' closed`);
        }
        for (const [name, queueEvents] of this.queueEvents) {
            await queueEvents.close();
            logger.info(`Queue events '${name}' closed`);
        }
        for (const [name, queue] of this.queues) {
            await queue.close();
            logger.info(`Queue '${name}' closed`);
        }
        await this.connection.disconnect();
        logger.info('Queue manager closed');
    }
    getQueue(name) {
        return this.queues.get(name);
    }
    getWorker(name) {
        return this.workers.get(name);
    }
    getAllQueueNames() {
        return Array.from(this.queues.keys());
    }
}
exports.QueueManager = QueueManager;
exports.queueManager = new QueueManager();
exports.analysisQueue = exports.queueManager.createQueue('analysis', config_1.config.queues.analysis);
exports.monitoringQueue = exports.queueManager.createQueue('monitoring', config_1.config.queues.monitoring);
exports.notificationQueue = exports.queueManager.createQueue('notification', config_1.config.queues.notification);
const addAnalysisJob = (data, options) => exports.queueManager.addJob('analysis', 'analyze-document', data, options);
exports.addAnalysisJob = addAnalysisJob;
const addMonitoringJob = (data, options) => exports.queueManager.addJob('monitoring', 'monitor-document', data, options);
exports.addMonitoringJob = addMonitoringJob;
const addNotificationJob = (data, options) => exports.queueManager.addJob('notification', 'send-notification', data, options);
exports.addNotificationJob = addNotificationJob;
const addEmailJob = (data, options) => exports.queueManager.addJob('notification', 'send-email', data, options);
exports.addEmailJob = addEmailJob;
const addWebhookJob = (data, options) => exports.queueManager.addJob('notification', 'send-webhook', data, options);
exports.addWebhookJob = addWebhookJob;
const addActionJob = (data, options) => exports.queueManager.addJob('action', 'execute-action', data, options);
exports.addActionJob = addActionJob;
const addCleanupJob = (data, options) => exports.queueManager.addJob('cleanup', 'cleanup-data', data, options);
exports.addCleanupJob = addCleanupJob;
const addExportJob = (data, options) => exports.queueManager.addJob('export', 'export-data', data, options);
exports.addExportJob = addExportJob;
exports.default = exports.queueManager;
//# sourceMappingURL=index-original.js.map