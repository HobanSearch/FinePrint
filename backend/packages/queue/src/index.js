"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScheduledJobs = exports.scheduleJob = exports.getJobStatus = exports.cancelJob = exports.getAllMetrics = exports.getAllHealthChecks = exports.performHealthCheck = exports.getQueueMetrics = exports.bulkAddJobs = exports.addExportJob = exports.addCleanupJob = exports.addActionJob = exports.addWebhookJob = exports.addEmailJob = exports.addNotificationJob = exports.addMonitoringJob = exports.addAnalysisJob = exports.exportQueue = exports.cleanupQueue = exports.actionQueue = exports.notificationQueue = exports.monitoringQueue = exports.analysisQueue = exports.enhancedQueueManager = exports.queueManager = exports.QueueManager = exports.JobScheduler = exports.WorkerScaler = exports.MetricsCollector = exports.DeadLetterHandler = exports.priorityManager = exports.EnhancedQueueManager = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("@fineprintai/config");
const logger_1 = require("@fineprintai/logger");
var enhanced_queue_manager_1 = require("./enhanced-queue-manager");
Object.defineProperty(exports, "EnhancedQueueManager", { enumerable: true, get: function () { return enhanced_queue_manager_1.EnhancedQueueManager; } });
__exportStar(require("./priority-manager"), exports);
__exportStar(require("./dead-letter-handler"), exports);
__exportStar(require("./metrics-collector"), exports);
__exportStar(require("./worker-scaler"), exports);
__exportStar(require("./job-scheduler"), exports);
var priority_manager_1 = require("./priority-manager");
Object.defineProperty(exports, "priorityManager", { enumerable: true, get: function () { return priority_manager_1.priorityManager; } });
var dead_letter_handler_1 = require("./dead-letter-handler");
Object.defineProperty(exports, "DeadLetterHandler", { enumerable: true, get: function () { return __importDefault(dead_letter_handler_1).default; } });
var metrics_collector_1 = require("./metrics-collector");
Object.defineProperty(exports, "MetricsCollector", { enumerable: true, get: function () { return __importDefault(metrics_collector_1).default; } });
var worker_scaler_1 = require("./worker-scaler");
Object.defineProperty(exports, "WorkerScaler", { enumerable: true, get: function () { return __importDefault(worker_scaler_1).default; } });
var job_scheduler_1 = require("./job-scheduler");
Object.defineProperty(exports, "JobScheduler", { enumerable: true, get: function () { return __importDefault(job_scheduler_1).default; } });
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
const enhanced_queue_manager_2 = require("./enhanced-queue-manager");
exports.enhancedQueueManager = new enhanced_queue_manager_2.EnhancedQueueManager();
exports.analysisQueue = exports.enhancedQueueManager.createQueue('analysis', {
    ...config_1.config.queues?.analysis,
    deadLetterQueue: { enabled: true, maxAttempts: 5, retentionDays: 7, alertThreshold: 50 },
    workerScaling: { minWorkers: 2, maxWorkers: 10, scaleUpThreshold: 20, scaleDownThreshold: 5, scaleUpDelay: 30000, scaleDownDelay: 60000 }
});
exports.monitoringQueue = exports.enhancedQueueManager.createQueue('monitoring', {
    ...config_1.config.queues?.monitoring,
    deadLetterQueue: { enabled: true, maxAttempts: 3, retentionDays: 3, alertThreshold: 25 },
    workerScaling: { minWorkers: 1, maxWorkers: 5, scaleUpThreshold: 15, scaleDownThreshold: 3, scaleUpDelay: 45000, scaleDownDelay: 90000 }
});
exports.notificationQueue = exports.enhancedQueueManager.createQueue('notification', {
    ...config_1.config.queues?.notification,
    deadLetterQueue: { enabled: true, maxAttempts: 4, retentionDays: 5, alertThreshold: 30 },
    workerScaling: { minWorkers: 2, maxWorkers: 8, scaleUpThreshold: 25, scaleDownThreshold: 5, scaleUpDelay: 20000, scaleDownDelay: 60000 }
});
exports.actionQueue = exports.enhancedQueueManager.createQueue('action', {
    ...config_1.config.queues?.action,
    deadLetterQueue: { enabled: true, maxAttempts: 3, retentionDays: 7, alertThreshold: 20 },
    workerScaling: { minWorkers: 1, maxWorkers: 4, scaleUpThreshold: 10, scaleDownThreshold: 2, scaleUpDelay: 60000, scaleDownDelay: 120000 }
});
exports.cleanupQueue = exports.enhancedQueueManager.createQueue('cleanup', {
    ...config_1.config.queues?.cleanup,
    deadLetterQueue: { enabled: true, maxAttempts: 2, retentionDays: 1, alertThreshold: 10 },
    workerScaling: { minWorkers: 1, maxWorkers: 2, scaleUpThreshold: 5, scaleDownThreshold: 1, scaleUpDelay: 120000, scaleDownDelay: 300000 }
});
exports.exportQueue = exports.enhancedQueueManager.createQueue('export', {
    ...config_1.config.queues?.export,
    deadLetterQueue: { enabled: true, maxAttempts: 3, retentionDays: 14, alertThreshold: 15 },
    workerScaling: { minWorkers: 1, maxWorkers: 3, scaleUpThreshold: 5, scaleDownThreshold: 1, scaleUpDelay: 60000, scaleDownDelay: 180000 }
});
const addAnalysisJob = (data, options) => exports.enhancedQueueManager.addJob('analysis', 'analyze-document', data, options);
exports.addAnalysisJob = addAnalysisJob;
const addMonitoringJob = (data, options) => exports.enhancedQueueManager.addJob('monitoring', 'monitor-document', data, options);
exports.addMonitoringJob = addMonitoringJob;
const addNotificationJob = (data, options) => exports.enhancedQueueManager.addJob('notification', 'send-notification', data, options);
exports.addNotificationJob = addNotificationJob;
const addEmailJob = (data, options) => exports.enhancedQueueManager.addJob('notification', 'send-email', data, options);
exports.addEmailJob = addEmailJob;
const addWebhookJob = (data, options) => exports.enhancedQueueManager.addJob('notification', 'send-webhook', data, options);
exports.addWebhookJob = addWebhookJob;
const addActionJob = (data, options) => exports.enhancedQueueManager.addJob('action', 'execute-action', data, options);
exports.addActionJob = addActionJob;
const addCleanupJob = (data, options) => exports.enhancedQueueManager.addJob('cleanup', 'cleanup-data', data, options);
exports.addCleanupJob = addCleanupJob;
const addExportJob = (data, options) => exports.enhancedQueueManager.addJob('export', 'export-data', data, options);
exports.addExportJob = addExportJob;
const bulkAddJobs = (queueName, operation) => exports.enhancedQueueManager.bulkAddJobs(queueName, operation);
exports.bulkAddJobs = bulkAddJobs;
const getQueueMetrics = (queueName) => exports.enhancedQueueManager.getQueueMetrics(queueName);
exports.getQueueMetrics = getQueueMetrics;
const performHealthCheck = (queueName) => exports.enhancedQueueManager.performHealthCheck(queueName);
exports.performHealthCheck = performHealthCheck;
const getAllHealthChecks = () => exports.enhancedQueueManager.getAllHealthChecks();
exports.getAllHealthChecks = getAllHealthChecks;
const getAllMetrics = () => exports.enhancedQueueManager.getAllMetrics();
exports.getAllMetrics = getAllMetrics;
const cancelJob = (queueName, jobId, reason) => exports.enhancedQueueManager.cancelJob(queueName, jobId, reason);
exports.cancelJob = cancelJob;
const getJobStatus = (queueName, jobId) => exports.enhancedQueueManager.getJobStatus(queueName, jobId);
exports.getJobStatus = getJobStatus;
const scheduleJob = (config) => exports.enhancedQueueManager.scheduleJob(config);
exports.scheduleJob = scheduleJob;
const getScheduledJobs = () => exports.enhancedQueueManager.getScheduledJobs();
exports.getScheduledJobs = getScheduledJobs;
exports.default = exports.enhancedQueueManager;
//# sourceMappingURL=index.js.map