"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedQueueManager = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const prom_client_1 = require("prom-client");
const uuid_1 = require("uuid");
const cron_parser_1 = __importDefault(require("cron-parser"));
const zod_1 = require("zod");
const config_1 = require("@fineprintai/config");
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('enhanced-queue-manager');
const jobDataSchema = zod_1.z.object({
    userId: zod_1.z.string().optional(),
    teamId: zod_1.z.string().optional(),
    subscriptionTier: zod_1.z.nativeEnum(SubscriptionTier).optional(),
});
const jobsTotal = new prom_client_1.Counter({
    name: 'queue_jobs_total',
    help: 'Total number of jobs processed',
    labelNames: ['queue', 'status', 'subscription_tier'],
});
const jobDuration = new prom_client_1.Histogram({
    name: 'queue_job_duration_seconds',
    help: 'Job processing duration in seconds',
    labelNames: ['queue', 'job_name', 'subscription_tier'],
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
});
const queueDepth = new prom_client_1.Gauge({
    name: 'queue_depth',
    help: 'Current queue depth',
    labelNames: ['queue', 'status'],
});
const activeWorkers = new prom_client_1.Gauge({
    name: 'queue_active_workers',
    help: 'Number of active workers',
    labelNames: ['queue'],
});
class EnhancedQueueManager extends eventemitter3_1.default {
    connection;
    queues = new Map();
    workers = new Map();
    queueEvents = new Map();
    deadLetterQueues = new Map();
    scheduledJobs = new Map();
    metricsCache = new Map();
    healthChecks = new Map();
    workerScalingConfigs = new Map();
    jobContexts = new Map();
    isShuttingDown = false;
    priorityConfig = {
        [SubscriptionTier.FREE]: 1,
        [SubscriptionTier.STARTER]: 5,
        [SubscriptionTier.PROFESSIONAL]: 10,
        [SubscriptionTier.TEAM]: 15,
        [SubscriptionTier.ENTERPRISE]: 20,
    };
    defaultDLQConfig = {
        enabled: true,
        maxAttempts: 5,
        retentionDays: 7,
        alertThreshold: 100,
    };
    constructor() {
        super();
        this.connection = new ioredis_1.default(config_1.config.redis.url, {
            maxRetriesPerRequest: config_1.config.redis.maxRetriesPerRequest,
            retryDelayOnFailover: config_1.config.redis.retryDelayOnFailover,
            enableReadyCheck: config_1.config.redis.enableReadyCheck,
            lazyConnect: true,
            keepAlive: 30000,
            commandTimeout: 5000,
            db: config_1.config.redis.queueDb || 1,
        });
        this.setupConnectionHandlers();
        this.startMetricsCollection();
        this.startHealthChecks();
        this.setupGracefulShutdown();
        logger.info('Enhanced Queue Manager initialized');
    }
    setupConnectionHandlers() {
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
    createQueue(name, options) {
        if (this.queues.has(name)) {
            return this.queues.get(name);
        }
        const queueOptions = {
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
        const queue = new bullmq_1.Queue(name, queueOptions);
        if (options?.deadLetterQueue?.enabled !== false) {
            const dlqConfig = { ...this.defaultDLQConfig, ...options?.deadLetterQueue };
            this.createDeadLetterQueue(name, dlqConfig);
        }
        if (options?.workerScaling) {
            this.workerScalingConfigs.set(name, options.workerScaling);
        }
        this.setupQueueEvents(name, queue);
        this.queues.set(name, queue);
        logger.info(`Enhanced queue '${name}' created with enterprise features`);
        return queue;
    }
    createWorker(queueName, processor, options) {
        const workerName = `${queueName}-worker-${(0, uuid_1.v4)()}`;
        const concurrency = options?.concurrency || 1;
        const worker = new bullmq_1.Worker(queueName, async (job, token) => {
            const context = this.createJobContext(job, queueName, workerName);
            this.jobContexts.set(job.id, context);
            const startTime = Date.now();
            logger.jobStart(job.id, job.name, job.data);
            let timeoutHandle;
            if (context.timeout) {
                timeoutHandle = setTimeout(() => {
                    logger.warn(`Job ${job.id} timed out after ${context.timeout}ms`);
                    job.moveToFailed(new Error(`Job timeout after ${context.timeout}ms`), token);
                }, context.timeout);
            }
            try {
                await job.updateProgress({ percentage: 0, stage: 'started', message: 'Job processing started' });
                const result = await processor(job, token);
                if (timeoutHandle)
                    clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;
                jobsTotal.inc({
                    queue: queueName,
                    status: 'completed',
                    subscription_tier: context.subscriptionTier
                });
                jobDuration.observe({ queue: queueName, job_name: job.name, subscription_tier: context.subscriptionTier }, duration / 1000);
                logger.jobComplete(job.id, job.name, duration, result);
                this.emit('job:completed', { jobId: job.id, queueName, duration, result });
                return result;
            }
            catch (error) {
                if (timeoutHandle)
                    clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;
                const jobError = error;
                jobsTotal.inc({
                    queue: queueName,
                    status: 'failed',
                    subscription_tier: context.subscriptionTier
                });
                await this.handleFailedJob(job, jobError, queueName);
                logger.jobFailed(job.id, job.name, jobError, duration);
                this.emit('job:failed', { jobId: job.id, queueName, error: jobError, duration });
                throw error;
            }
            finally {
                this.jobContexts.delete(job.id);
            }
        }, {
            connection: this.connection,
            concurrency,
            limiter: options?.limiter,
            autorun: true,
        });
        this.setupWorkerEvents(worker, queueName, workerName);
        if (!this.workers.has(queueName)) {
            this.workers.set(queueName, []);
        }
        this.workers.get(queueName).push(worker);
        if (options?.autoScale) {
            this.setupWorkerAutoScaling(queueName, options);
        }
        logger.info(`Enhanced worker '${workerName}' created for queue '${queueName}' with concurrency ${concurrency}`);
        return worker;
    }
    async addJob(queueName, jobName, data, options) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        try {
            jobDataSchema.parse(data);
        }
        catch (error) {
            logger.error('Invalid job data', { error, data });
            throw new Error('Invalid job data structure');
        }
        const subscriptionTier = data?.subscriptionTier || SubscriptionTier.FREE;
        const priority = options?.priority ?? this.priorityConfig[subscriptionTier];
        const jobOptions = {
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
    async bulkAddJobs(queueName, operation) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        const batchSize = operation.batchSize || 100;
        const results = [];
        if (operation.action === 'add') {
            for (let i = 0; i < operation.jobs.length; i += batchSize) {
                const batch = operation.jobs.slice(i, i + batchSize);
                const batchJobs = batch.map(jobSpec => ({
                    name: jobSpec.name,
                    data: jobSpec.data,
                    opts: {
                        ...jobSpec.options,
                        priority: jobSpec.options?.priority ?? this.priorityConfig[jobSpec.data?.subscriptionTier || SubscriptionTier.FREE],
                    },
                }));
                const jobs = await queue.addBulk(batchJobs);
                results.push(...jobs);
                if (i + batchSize < operation.jobs.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        logger.info(`Bulk operation '${operation.action}' completed for ${results.length} jobs in queue '${queueName}'`);
        this.emit('bulk:completed', { queueName, operation: operation.action, count: results.length });
        return results;
    }
    async scheduleJob(config) {
        try {
            cron_parser_1.default.parseExpression(config.cron, { tz: config.timezone });
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
        }
        catch (error) {
            logger.error(`Failed to schedule job '${config.name}'`, { error, config });
            throw new Error(`Invalid cron expression: ${config.cron}`);
        }
    }
    async cancelJob(queueName, jobId, reason) {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return false;
        }
        const state = await job.getState();
        if (state === 'active') {
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
    async getJobStatus(queueName, jobId) {
        const job = await this.getJob(queueName, jobId);
        if (!job) {
            return null;
        }
        const state = await job.getState();
        const progress = job.progress;
        const context = this.jobContexts.get(jobId);
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
            subscriptionTier: job.data?.subscriptionTier,
            userId: job.data?.userId,
            teamId: job.data?.teamId,
            workerName: context?.workerName,
            timeout: context?.timeout,
        };
    }
    async getQueueMetrics(queueName) {
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
        const throughput = await this.calculateThroughput(queueName);
        const avgProcessingTime = await this.calculateAvgProcessingTime(queueName);
        const errorRate = completed.length > 0 ? (failed.length / (completed.length + failed.length)) * 100 : 0;
        const metrics = {
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
        queueDepth.set({ queue: queueName, status: 'waiting' }, waiting.length);
        queueDepth.set({ queue: queueName, status: 'active' }, active.length);
        queueDepth.set({ queue: queueName, status: 'failed' }, failed.length);
        this.metricsCache.set(queueName, metrics);
        return metrics;
    }
    async performHealthCheck(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        const issues = [];
        let isHealthy = true;
        try {
            const pingResult = await this.connection.ping();
            if (pingResult !== 'PONG') {
                issues.push('Redis connection unhealthy');
                isHealthy = false;
            }
            const startTime = Date.now();
            await queue.getWaiting(0, 0);
            const latency = Date.now() - startTime;
            if (latency > 1000) {
                issues.push(`High queue latency: ${latency}ms`);
                if (latency > 5000)
                    isHealthy = false;
            }
            const failed = await queue.getFailed();
            if (failed.length > 1000) {
                issues.push(`High number of failed jobs: ${failed.length}`);
                if (failed.length > 5000)
                    isHealthy = false;
            }
            const workers = this.workers.get(queueName) || [];
            const activeWorkerCount = workers.filter(w => !w.closing).length;
            if (activeWorkerCount === 0) {
                issues.push('No active workers available');
                isHealthy = false;
            }
            const healthCheck = {
                queueName,
                isHealthy,
                lastCheck: new Date(),
                issues,
                metrics: {
                    memoryUsage: process.memoryUsage().heapUsed,
                    connectionCount: 1,
                    avgLatency: latency,
                },
            };
            this.healthChecks.set(queueName, healthCheck);
            this.emit('health:checked', healthCheck);
            return healthCheck;
        }
        catch (error) {
            const healthCheck = {
                queueName,
                isHealthy: false,
                lastCheck: new Date(),
                issues: [`Health check failed: ${error.message}`],
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
    createJobContext(job, queueName, workerName) {
        const data = job.data;
        return {
            jobId: job.id,
            queueName,
            workerName,
            startTime: new Date(),
            timeout: job.opts.delay,
            subscriptionTier: data?.subscriptionTier || SubscriptionTier.FREE,
            userId: data?.userId,
            teamId: data?.teamId,
        };
    }
    async handleFailedJob(job, error, queueName) {
        const dlq = this.deadLetterQueues.get(queueName);
        if (!dlq)
            return;
        const attemptsMade = job.attemptsMade;
        const maxAttempts = job.opts.attempts || 3;
        if (attemptsMade >= maxAttempts) {
            await dlq.add('failed-job', {
                originalQueue: queueName,
                originalJobId: job.id,
                jobData: job.data,
                error: error.message,
                failedAt: new Date(),
                attempts: attemptsMade,
            }, {
                priority: 1,
                removeOnComplete: false,
            });
            logger.warn(`Job ${job.id} moved to dead letter queue after ${attemptsMade} attempts`);
            this.emit('job:dead-letter', { jobId: job.id, queueName, error, attempts: attemptsMade });
        }
    }
    createDeadLetterQueue(queueName, config) {
        const dlqName = `${queueName}-dlq`;
        const dlq = new bullmq_1.Queue(dlqName, {
            connection: this.connection,
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 500,
            },
        });
        this.deadLetterQueues.set(queueName, dlq);
        logger.info(`Dead letter queue '${dlqName}' created`, { config });
    }
    setupQueueEvents(queueName, queue) {
        const queueEvents = new bullmq_1.QueueEvents(queueName, { connection: this.connection });
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
    setupWorkerEvents(worker, queueName, workerName) {
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
    setupWorkerAutoScaling(queueName, options) {
        const config = {
            minWorkers: options.minWorkers || 1,
            maxWorkers: options.maxWorkers || 10,
            scaleUpThreshold: 50,
            scaleDownThreshold: 10,
            scaleUpDelay: 30000,
            scaleDownDelay: 60000,
        };
        this.workerScalingConfigs.set(queueName, config);
        const scalingInterval = setInterval(async () => {
            if (this.isShuttingDown) {
                clearInterval(scalingInterval);
                return;
            }
            try {
                await this.checkWorkerScaling(queueName);
            }
            catch (error) {
                logger.error(`Worker scaling check failed for queue ${queueName}`, { error });
            }
        }, 30000);
    }
    async checkWorkerScaling(queueName) {
        const config = this.workerScalingConfigs.get(queueName);
        if (!config)
            return;
        const metrics = await this.getQueueMetrics(queueName);
        const currentWorkers = this.workers.get(queueName) || [];
        const activeWorkers = currentWorkers.filter(w => !w.closing).length;
        if (metrics.waitingJobs > config.scaleUpThreshold && activeWorkers < config.maxWorkers) {
            logger.info(`Scaling up workers for queue ${queueName}`, {
                currentWorkers: activeWorkers,
                maxWorkers: config.maxWorkers,
                queueDepth: metrics.waitingJobs,
            });
            this.emit('scaling:up', { queueName, currentWorkers: activeWorkers, targetWorkers: activeWorkers + 1 });
        }
        if (metrics.waitingJobs < config.scaleDownThreshold && activeWorkers > config.minWorkers) {
            logger.info(`Scaling down workers for queue ${queueName}`, {
                currentWorkers: activeWorkers,
                minWorkers: config.minWorkers,
                queueDepth: metrics.waitingJobs,
            });
            const workerToRemove = currentWorkers[currentWorkers.length - 1];
            if (workerToRemove) {
                await workerToRemove.close();
                currentWorkers.pop();
                this.emit('scaling:down', { queueName, currentWorkers: activeWorkers, targetWorkers: activeWorkers - 1 });
            }
        }
    }
    calculateNextRun(cron, timezone) {
        const interval = cron_parser_1.default.parseExpression(cron, { tz: timezone });
        return interval.next().toDate();
    }
    async calculateThroughput(queueName) {
        try {
            const queue = this.queues.get(queueName);
            if (!queue)
                return 0;
            const completed = await queue.getCompleted(0, 100);
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);
            const recentJobs = completed.filter(job => job.finishedOn && job.finishedOn > oneHourAgo);
            return (recentJobs.length / 60);
        }
        catch (error) {
            logger.error(`Failed to calculate throughput for queue ${queueName}`, { error });
            return 0;
        }
    }
    async calculateAvgProcessingTime(queueName) {
        try {
            const queue = this.queues.get(queueName);
            if (!queue)
                return 0;
            const completed = await queue.getCompleted(0, 50);
            if (completed.length === 0)
                return 0;
            const totalTime = completed.reduce((sum, job) => {
                if (job.processedOn && job.finishedOn) {
                    return sum + (job.finishedOn - job.processedOn);
                }
                return sum;
            }, 0);
            return totalTime / completed.length;
        }
        catch (error) {
            logger.error(`Failed to calculate avg processing time for queue ${queueName}`, { error });
            return 0;
        }
    }
    startMetricsCollection() {
        const metricsInterval = setInterval(async () => {
            if (this.isShuttingDown) {
                clearInterval(metricsInterval);
                return;
            }
            for (const queueName of this.queues.keys()) {
                try {
                    await this.getQueueMetrics(queueName);
                    const workers = this.workers.get(queueName) || [];
                    const activeWorkerCount = workers.filter(w => !w.closing).length;
                    activeWorkers.set({ queue: queueName }, activeWorkerCount);
                }
                catch (error) {
                    logger.error(`Failed to collect metrics for queue ${queueName}`, { error });
                }
            }
        }, 60000);
    }
    startHealthChecks() {
        const healthInterval = setInterval(async () => {
            if (this.isShuttingDown) {
                clearInterval(healthInterval);
                return;
            }
            for (const queueName of this.queues.keys()) {
                try {
                    await this.performHealthCheck(queueName);
                }
                catch (error) {
                    logger.error(`Health check failed for queue ${queueName}`, { error });
                }
            }
        }, 5 * 60 * 1000);
    }
    setupGracefulShutdown() {
        const shutdown = async () => {
            if (this.isShuttingDown)
                return;
            this.isShuttingDown = true;
            logger.info('Starting graceful shutdown of Enhanced Queue Manager');
            for (const queue of this.queues.values()) {
                await queue.pause();
            }
            const shutdownTimeout = setTimeout(() => {
                logger.warn('Shutdown timeout reached, forcing closure');
                process.exit(1);
            }, 30000);
            try {
                for (const [queueName, workers] of this.workers) {
                    for (const worker of workers) {
                        await worker.close();
                        logger.info(`Worker closed for queue ${queueName}`);
                    }
                }
                for (const [queueName, queueEvents] of this.queueEvents) {
                    await queueEvents.close();
                    logger.info(`Queue events closed for ${queueName}`);
                }
                for (const [queueName, queue] of this.queues) {
                    await queue.close();
                    logger.info(`Queue ${queueName} closed`);
                }
                for (const [queueName, dlq] of this.deadLetterQueues) {
                    await dlq.close();
                    logger.info(`Dead letter queue closed for ${queueName}`);
                }
                await this.connection.disconnect();
                logger.info('Redis connection closed');
                clearTimeout(shutdownTimeout);
                logger.info('Enhanced Queue Manager shutdown completed');
            }
            catch (error) {
                logger.error('Error during shutdown', { error });
                clearTimeout(shutdownTimeout);
                process.exit(1);
            }
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
    async getJob(queueName, jobId) {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue '${queueName}' not found`);
        }
        return await queue.getJob(jobId);
    }
    async removeJob(queueName, jobId) {
        const job = await this.getJob(queueName, jobId);
        if (!job)
            return false;
        await job.remove();
        logger.debug(`Job ${jobId} removed from queue ${queueName}`);
        return true;
    }
    async retryJob(queueName, jobId) {
        const job = await this.getJob(queueName, jobId);
        if (!job)
            return false;
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
    getQueue(name) {
        return this.queues.get(name);
    }
    getWorkers(name) {
        return this.workers.get(name);
    }
    getAllQueueNames() {
        return Array.from(this.queues.keys());
    }
    getAllHealthChecks() {
        return Array.from(this.healthChecks.values());
    }
    getAllMetrics() {
        return Array.from(this.metricsCache.values());
    }
    getScheduledJobs() {
        return Array.from(this.scheduledJobs.values());
    }
}
exports.EnhancedQueueManager = EnhancedQueueManager;
//# sourceMappingURL=enhanced-queue-manager.js.map