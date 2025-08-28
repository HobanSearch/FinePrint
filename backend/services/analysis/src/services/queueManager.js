"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueManager = exports.QueueManager = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const enhancedAnalysis_1 = require("./enhancedAnalysis");
const modelManager_1 = require("./modelManager");
const events_1 = require("events");
const logger = (0, logger_1.createServiceLogger)('queue-manager');
class QueueManager extends events_1.EventEmitter {
    jobs = new Map();
    queues = {
        urgent: [],
        high: [],
        normal: [],
        low: []
    };
    processing = new Set();
    maxConcurrentJobs;
    processingIntervalId;
    statsIntervalId;
    isProcessing = false;
    completedJobsLastHour = Array(60).fill(0);
    currentMinute = new Date().getMinutes();
    constructor(maxConcurrentJobs = 5) {
        super();
        this.maxConcurrentJobs = maxConcurrentJobs;
        logger.info('Queue Manager initialized', {
            maxConcurrentJobs: this.maxConcurrentJobs
        });
    }
    async initialize() {
        logger.info('Starting Queue Manager');
        try {
            this.startProcessingLoop();
            this.startStatsCollection();
            this.startCleanupTask();
            logger.info('Queue Manager started successfully');
        }
        catch (error) {
            logger.error('Failed to start Queue Manager', { error: error.message });
            throw error;
        }
    }
    async shutdown() {
        logger.info('Shutting down Queue Manager');
        this.isProcessing = false;
        if (this.processingIntervalId) {
            clearInterval(this.processingIntervalId);
        }
        if (this.statsIntervalId) {
            clearInterval(this.statsIntervalId);
        }
        const shutdownTimeout = 30000;
        const startTime = Date.now();
        while (this.processing.size > 0 && Date.now() - startTime < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger.info('Waiting for jobs to complete', { remainingJobs: this.processing.size });
        }
        if (this.processing.size > 0) {
            logger.warn('Force shutting down with jobs still processing', {
                jobCount: this.processing.size
            });
        }
        logger.info('Queue Manager shut down');
    }
    async addJob(analysisId, documentId, userId, request, priority = 'normal') {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const job = {
            id: jobId,
            analysisId,
            documentId,
            userId,
            request,
            priority,
            createdAt: new Date(),
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
            estimatedDuration: this.estimateJobDuration(request)
        };
        this.jobs.set(jobId, job);
        this.queues[priority].push(jobId);
        logger.info('Job added to queue', {
            jobId,
            analysisId,
            documentId,
            userId,
            priority,
            queueSize: this.getTotalQueueSize(),
            estimatedDuration: job.estimatedDuration
        });
        this.emit('jobAdded', job);
        if (this.processing.size < this.maxConcurrentJobs) {
            setImmediate(() => this.processNext());
        }
        return jobId;
    }
    async addBatchJobs(batchRequest) {
        const batchId = batchRequest.batchId || `batch_${Date.now()}`;
        const jobIds = [];
        logger.info('Adding batch jobs', {
            batchId,
            jobCount: batchRequest.jobs.length,
            maxConcurrency: batchRequest.maxConcurrency
        });
        for (const jobRequest of batchRequest.jobs) {
            const jobId = await this.addJob(jobRequest.analysisId, jobRequest.documentId, jobRequest.userId, jobRequest.request, jobRequest.priority || 'normal');
            jobIds.push(jobId);
            const job = this.jobs.get(jobId);
            if (job) {
                job.batchId = batchId;
            }
        }
        if (batchRequest.completionCallback) {
            this.trackBatchCompletion(batchId, jobIds, batchRequest.completionCallback);
        }
        this.emit('batchJobsAdded', { batchId, jobIds });
        return jobIds;
    }
    async cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            return false;
        }
        if (job.status === 'processing') {
            logger.warn('Cannot cancel job that is currently processing', { jobId });
            return false;
        }
        if (job.status === 'pending') {
            const queue = this.queues[job.priority];
            const index = queue.indexOf(jobId);
            if (index > -1) {
                queue.splice(index, 1);
            }
        }
        job.status = 'cancelled';
        job.completedAt = new Date();
        logger.info('Job cancelled', { jobId, analysisId: job.analysisId });
        this.emit('jobCancelled', job);
        return true;
    }
    getJob(jobId) {
        return this.jobs.get(jobId);
    }
    getJobsByUser(userId) {
        return Array.from(this.jobs.values()).filter(job => job.userId === userId);
    }
    getJobsByAnalysis(analysisId) {
        return Array.from(this.jobs.values()).filter(job => job.analysisId === analysisId);
    }
    getQueueStats() {
        const allJobs = Array.from(this.jobs.values());
        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        const recentJobs = allJobs.filter(job => job.createdAt.getTime() > oneHourAgo);
        const totalJobs = allJobs.length;
        const pendingJobs = allJobs.filter(job => job.status === 'pending').length;
        const processingJobs = allJobs.filter(job => job.status === 'processing').length;
        const completedJobs = allJobs.filter(job => job.status === 'completed').length;
        const failedJobs = allJobs.filter(job => job.status === 'failed').length;
        const completedWithDuration = allJobs.filter(job => job.status === 'completed' && job.actualDuration);
        const averageProcessingTime = completedWithDuration.length > 0
            ? completedWithDuration.reduce((sum, job) => sum + (job.actualDuration || 0), 0) / completedWithDuration.length
            : 0;
        const completedLastHour = this.completedJobsLastHour.reduce((sum, count) => sum + count, 0);
        const queueThroughput = completedLastHour;
        const modelUtilization = this.calculateModelUtilization();
        const currentLoad = Math.min(1, processingJobs / this.maxConcurrentJobs);
        return {
            totalJobs,
            pendingJobs,
            processingJobs,
            completedJobs,
            failedJobs,
            averageProcessingTime,
            queueThroughput,
            modelUtilization,
            currentLoad
        };
    }
    startProcessingLoop() {
        this.isProcessing = true;
        this.processingIntervalId = setInterval(() => {
            if (this.isProcessing && this.processing.size < this.maxConcurrentJobs) {
                this.processNext();
            }
        }, 1000);
    }
    async processNext() {
        if (this.processing.size >= this.maxConcurrentJobs) {
            return;
        }
        const jobId = this.getNextJobId();
        if (!jobId) {
            return;
        }
        const job = this.jobs.get(jobId);
        if (!job || job.status !== 'pending') {
            return;
        }
        job.status = 'processing';
        job.startedAt = new Date();
        this.processing.add(jobId);
        logger.info('Starting job processing', {
            jobId,
            analysisId: job.analysisId,
            priority: job.priority,
            attempt: job.attempts + 1
        });
        this.emit('jobStarted', job);
        try {
            const progressCallback = (progress) => {
                this.emit('jobProgress', { jobId, ...progress });
            };
            const startTime = Date.now();
            const result = await enhancedAnalysis_1.enhancedAnalysisEngine.analyzeDocumentWithProgress(job.request, progressCallback);
            const processingTime = Date.now() - startTime;
            job.status = 'completed';
            job.completedAt = new Date();
            job.result = result;
            job.actualDuration = processingTime;
            logger.info('Job completed successfully', {
                jobId,
                analysisId: job.analysisId,
                processingTime,
                overallScore: result.overallRiskScore
            });
            this.emit('jobCompleted', job);
            this.updateThroughputStats();
        }
        catch (error) {
            logger.error('Job processing failed', {
                jobId,
                analysisId: job.analysisId,
                error: error.message,
                attempt: job.attempts + 1
            });
            job.attempts++;
            job.error = error.message;
            if (job.attempts >= job.maxAttempts) {
                job.status = 'failed';
                job.completedAt = new Date();
                logger.error('Job failed permanently', {
                    jobId,
                    analysisId: job.analysisId,
                    totalAttempts: job.attempts
                });
                this.emit('jobFailed', job);
            }
            else {
                job.status = 'pending';
                setTimeout(() => {
                    this.queues[job.priority].push(jobId);
                    logger.info('Job queued for retry', {
                        jobId,
                        analysisId: job.analysisId,
                        attempt: job.attempts + 1
                    });
                }, Math.pow(2, job.attempts) * 1000);
            }
        }
        finally {
            this.processing.delete(jobId);
            if (job.assignedModel) {
                modelManager_1.modelManager.releaseModel(job.assignedModel);
                job.assignedModel = undefined;
            }
        }
    }
    getNextJobId() {
        const priorityOrder = ['urgent', 'high', 'normal', 'low'];
        for (const priority of priorityOrder) {
            const queue = this.queues[priority];
            if (queue.length > 0) {
                return queue.shift();
            }
        }
        return null;
    }
    getTotalQueueSize() {
        return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
    }
    estimateJobDuration(request) {
        let baseTime = 5000;
        if (request.content) {
            baseTime += Math.min(10000, request.content.length / 100);
        }
        else if (request.fileBuffer) {
            baseTime += Math.min(15000, request.fileBuffer.length / 1000);
        }
        else if (request.url) {
            baseTime += 10000;
        }
        if (request.options?.includeEmbeddings) {
            baseTime += 5000;
        }
        if (request.options?.includeSimilarDocuments) {
            baseTime += 3000;
        }
        if (request.options?.modelPreference === 'accuracy') {
            baseTime *= 1.5;
        }
        return Math.round(baseTime);
    }
    trackBatchCompletion(batchId, jobIds, callback) {
        const checkCompletion = () => {
            const jobs = jobIds.map(id => this.jobs.get(id)).filter(Boolean);
            const completedJobs = jobs.filter(job => job.status === 'completed' || job.status === 'failed');
            if (completedJobs.length === jobIds.length) {
                const results = jobs
                    .filter(job => job.status === 'completed' && job.result)
                    .map(job => job.result);
                logger.info('Batch completed', {
                    batchId,
                    totalJobs: jobIds.length,
                    successfulJobs: results.length,
                    failedJobs: completedJobs.length - results.length
                });
                callback(results);
                this.emit('batchCompleted', { batchId, jobIds, results });
            }
        };
        const checkInterval = setInterval(checkCompletion, 5000);
        const completionHandler = (job) => {
            if (jobIds.includes(job.id)) {
                checkCompletion();
                if (jobIds.every(id => {
                    const j = this.jobs.get(id);
                    return j && (j.status === 'completed' || j.status === 'failed');
                })) {
                    clearInterval(checkInterval);
                    this.off('jobCompleted', completionHandler);
                    this.off('jobFailed', completionHandler);
                }
            }
        };
        this.on('jobCompleted', completionHandler);
        this.on('jobFailed', completionHandler);
    }
    calculateModelUtilization() {
        const utilization = {};
        const modelStatus = modelManager_1.modelManager.getModelStatus();
        for (const [model, status] of Object.entries(modelStatus)) {
            utilization[model] = status.busy ? 1.0 : 0.0;
        }
        return utilization;
    }
    updateThroughputStats() {
        const currentMinute = new Date().getMinutes();
        if (currentMinute !== this.currentMinute) {
            this.currentMinute = currentMinute;
            this.completedJobsLastHour[currentMinute] = 1;
        }
        else {
            this.completedJobsLastHour[currentMinute]++;
        }
    }
    startStatsCollection() {
        this.statsIntervalId = setInterval(() => {
            const stats = this.getQueueStats();
            logger.debug('Queue statistics', stats);
            this.emit('statsUpdate', stats);
            if (stats.currentLoad > 0.8) {
                logger.warn('High queue load detected', {
                    currentLoad: stats.currentLoad,
                    pendingJobs: stats.pendingJobs,
                    processingJobs: stats.processingJobs
                });
            }
        }, 30000);
    }
    startCleanupTask() {
        setInterval(() => {
            this.cleanupOldJobs();
        }, 60 * 60 * 1000);
    }
    cleanupOldJobs() {
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
        let cleanedCount = 0;
        for (const [jobId, job] of this.jobs.entries()) {
            if ((job.status === 'completed' || job.status === 'failed') &&
                job.completedAt &&
                job.completedAt.getTime() < cutoffTime) {
                this.jobs.delete(jobId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            logger.info('Cleaned up old jobs', { cleanedCount });
            this.emit('jobsCleanedUp', { cleanedCount });
        }
    }
    async getDetailedStats() {
        const stats = this.getQueueStats();
        const modelStats = modelManager_1.modelManager.getModelStatus();
        return {
            ...stats,
            models: modelStats,
            queueSizes: {
                urgent: this.queues.urgent.length,
                high: this.queues.high.length,
                normal: this.queues.normal.length,
                low: this.queues.low.length
            },
            systemCapacity: {
                maxConcurrentJobs: this.maxConcurrentJobs,
                currentlyProcessing: this.processing.size,
                availableSlots: this.maxConcurrentJobs - this.processing.size
            }
        };
    }
    async adjustCapacity(newMaxConcurrency) {
        if (newMaxConcurrency < 1) {
            throw new Error('Max concurrency must be at least 1');
        }
        logger.info('Adjusting queue capacity', {
            oldCapacity: this.maxConcurrentJobs,
            newCapacity: newMaxConcurrency
        });
        this.maxConcurrentJobs = newMaxConcurrency;
        if (newMaxConcurrency > this.processing.size) {
            setImmediate(() => this.processNext());
        }
    }
}
exports.QueueManager = QueueManager;
exports.queueManager = new QueueManager();
//# sourceMappingURL=queueManager.js.map