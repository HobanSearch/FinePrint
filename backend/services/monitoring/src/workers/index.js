"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMonitoringJob = addMonitoringJob;
exports.addWebhookJob = addWebhookJob;
exports.addAlertJob = addAlertJob;
exports.addAnalysisJob = addAnalysisJob;
exports.getQueueStats = getQueueStats;
exports.pauseAllQueues = pauseAllQueues;
exports.resumeAllQueues = resumeAllQueues;
exports.setupWorkers = setupWorkers;
exports.shutdownWorkers = shutdownWorkers;
exports.healthCheckWorkers = healthCheckWorkers;
const logger_1 = require("@fineprintai/shared-logger");
const config_1 = require("@fineprintai/shared-config");
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const tosMonitoring_1 = require("../services/tosMonitoring");
const documentCrawler_1 = require("../services/documentCrawler");
const webhookService_1 = require("../services/webhookService");
const alertingService_1 = require("../services/alertingService");
const changeDetection_1 = require("../services/changeDetection");
const tracing_1 = require("../monitoring/tracing");
const metrics_1 = require("../monitoring/metrics");
const logger = (0, logger_1.createServiceLogger)('workers');
const queueConfig = {
    connection: new ioredis_1.Redis(config_1.config.redis.url),
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
    },
};
const monitoringQueue = new bullmq_1.Queue('monitoring', queueConfig);
const webhookQueue = new bullmq_1.Queue('webhooks', queueConfig);
const alertQueue = new bullmq_1.Queue('alerts', queueConfig);
const analysisQueue = new bullmq_1.Queue('analysis', queueConfig);
let workers = [];
async function processMonitoringJob(job) {
    const { jobId, type } = job.data;
    return tracing_1.TracingUtils.traceQueueJob('monitoring', type, job.id, async (span) => {
        span.setAttributes({
            'job.monitoring_id': jobId,
            'job.type': type,
        });
        switch (type) {
            case 'process_monitoring_job':
                await tosMonitoring_1.tosMonitoringService.processMonitoringJob(jobId);
                break;
            case 'crawl_document':
                const { url, options, userId } = job.data;
                const result = await documentCrawler_1.documentCrawlerService.crawlDocument(url, options);
                metrics_1.metricsCollector.recordDocumentCrawl(result.success ? 'success' : 'failure', Date.now() - job.timestamp, userId);
                return result;
            default:
                throw new Error(`Unknown monitoring job type: ${type}`);
        }
    });
}
async function processWebhookJob(job) {
    const { webhookId, eventType, payload } = job.data;
    return tracing_1.TracingUtils.traceQueueJob('webhooks', eventType, job.id, async (span) => {
        span.setAttributes({
            'webhook.id': webhookId,
            'webhook.event_type': eventType,
        });
        await webhookService_1.webhookService.triggerDocumentChangeWebhook(payload);
        metrics_1.metricsCollector.recordWebhookDelivery('success', Date.now() - job.timestamp, webhookId, eventType);
    });
}
async function processAlertJob(job) {
    const { alertType, payload } = job.data;
    return tracing_1.TracingUtils.traceQueueJob('alerts', alertType, job.id, async (span) => {
        span.setAttributes({
            'alert.type': alertType,
            'alert.severity': payload.severity,
        });
        switch (alertType) {
            case 'document_change':
                await alertingService_1.alertingService.processDocumentChange(payload);
                break;
            case 'monitoring_error':
                await alertingService_1.alertingService.processMonitoringError(payload);
                break;
            default:
                throw new Error(`Unknown alert job type: ${alertType}`);
        }
        metrics_1.metricsCollector.recordAlertTriggered(payload.severity, payload.ruleId || 'system', payload.userId);
    });
}
async function processAnalysisJob(job) {
    const { documentId, oldContent, newContent, documentType } = job.data;
    return tracing_1.TracingUtils.traceQueueJob('analysis', 'change_detection', job.id, async (span) => {
        span.setAttributes({
            'document.id': documentId,
            'document.type': documentType,
        });
        const analysis = await changeDetection_1.changeDetectionEngine.analyzeChanges({
            oldContent,
            newContent,
            documentType,
        });
        metrics_1.metricsCollector.recordChangeAnalysis(analysis.changeType, Date.now() - job.timestamp, documentType);
        return analysis;
    });
}
function createMonitoringWorker() {
    const worker = new bullmq_1.Worker('monitoring', processMonitoringJob, {
        connection: queueConfig.connection,
        concurrency: config_1.config.queues.monitoring.concurrency,
        maxStalledCount: 3,
        stalledInterval: 30000,
    });
    worker.on('completed', (job) => {
        logger.info('Monitoring job completed', {
            jobId: job.id,
            jobType: job.data.type,
            duration: Date.now() - job.timestamp,
        });
        metrics_1.metricsCollector.recordQueueJob('monitoring', 'completed', job.data.type, Date.now() - job.timestamp);
    });
    worker.on('failed', (job, error) => {
        logger.error('Monitoring job failed', {
            jobId: job?.id,
            jobType: job?.data?.type,
            error: error.message,
            attempts: job?.attemptsMade,
        });
        if (job) {
            metrics_1.metricsCollector.recordQueueJob('monitoring', 'failed', job.data.type, Date.now() - job.timestamp);
        }
    });
    worker.on('stalled', (jobId) => {
        logger.warn('Monitoring job stalled', { jobId });
    });
    return worker;
}
function createWebhookWorker() {
    const worker = new bullmq_1.Worker('webhooks', processWebhookJob, {
        connection: queueConfig.connection,
        concurrency: config_1.config.queues.notification.concurrency,
        maxStalledCount: 2,
        stalledInterval: 60000,
    });
    worker.on('completed', (job) => {
        logger.info('Webhook job completed', {
            jobId: job.id,
            webhookId: job.data.webhookId,
            eventType: job.data.eventType,
            duration: Date.now() - job.timestamp,
        });
        metrics_1.metricsCollector.recordQueueJob('webhooks', 'completed', job.data.eventType, Date.now() - job.timestamp);
    });
    worker.on('failed', (job, error) => {
        logger.error('Webhook job failed', {
            jobId: job?.id,
            webhookId: job?.data?.webhookId,
            eventType: job?.data?.eventType,
            error: error.message,
            attempts: job?.attemptsMade,
        });
        if (job) {
            metrics_1.metricsCollector.recordQueueJob('webhooks', 'failed', job.data.eventType, Date.now() - job.timestamp);
        }
    });
    return worker;
}
function createAlertWorker() {
    const worker = new bullmq_1.Worker('alerts', processAlertJob, {
        connection: queueConfig.connection,
        concurrency: Math.ceil(config_1.config.queues.notification.concurrency / 2),
        maxStalledCount: 2,
        stalledInterval: 30000,
    });
    worker.on('completed', (job) => {
        logger.info('Alert job completed', {
            jobId: job.id,
            alertType: job.data.alertType,
            severity: job.data.payload?.severity,
            duration: Date.now() - job.timestamp,
        });
        metrics_1.metricsCollector.recordQueueJob('alerts', 'completed', job.data.alertType, Date.now() - job.timestamp);
    });
    worker.on('failed', (job, error) => {
        logger.error('Alert job failed', {
            jobId: job?.id,
            alertType: job?.data?.alertType,
            error: error.message,
            attempts: job?.attemptsMade,
        });
        if (job) {
            metrics_1.metricsCollector.recordQueueJob('alerts', 'failed', job.data.alertType, Date.now() - job.timestamp);
        }
    });
    return worker;
}
function createAnalysisWorker() {
    const worker = new bullmq_1.Worker('analysis', processAnalysisJob, {
        connection: queueConfig.connection,
        concurrency: config_1.config.queues.analysis.concurrency,
        maxStalledCount: 2,
        stalledInterval: 60000,
    });
    worker.on('completed', (job) => {
        logger.info('Analysis job completed', {
            jobId: job.id,
            documentId: job.data.documentId,
            documentType: job.data.documentType,
            duration: Date.now() - job.timestamp,
        });
        metrics_1.metricsCollector.recordQueueJob('analysis', 'completed', 'change_detection', Date.now() - job.timestamp);
    });
    worker.on('failed', (job, error) => {
        logger.error('Analysis job failed', {
            jobId: job?.id,
            documentId: job?.data?.documentId,
            error: error.message,
            attempts: job?.attemptsMade,
        });
        if (job) {
            metrics_1.metricsCollector.recordQueueJob('analysis', 'failed', 'change_detection', Date.now() - job.timestamp);
        }
    });
    return worker;
}
async function addMonitoringJob(type, data, options = {}) {
    const job = await monitoringQueue.add(type, {
        type,
        ...data,
    }, {
        delay: options.delay,
        priority: options.priority,
        attempts: options.attempts || 3,
    });
    logger.debug('Added monitoring job to queue', {
        jobId: job.id,
        type,
        delay: options.delay,
    });
    metrics_1.metricsCollector.updateActiveQueueJobs('monitoring', await monitoringQueue.count());
    return job;
}
async function addWebhookJob(webhookId, eventType, payload, options = {}) {
    const job = await webhookQueue.add('webhook_delivery', {
        webhookId,
        eventType,
        payload,
    }, {
        delay: options.delay,
        priority: options.priority || 5,
        attempts: 5,
    });
    logger.debug('Added webhook job to queue', {
        jobId: job.id,
        webhookId,
        eventType,
    });
    metrics_1.metricsCollector.updateActiveQueueJobs('webhooks', await webhookQueue.count());
    return job;
}
async function addAlertJob(alertType, payload, options = {}) {
    const job = await alertQueue.add('alert_processing', {
        alertType,
        payload,
    }, {
        priority: options.priority || 3,
        attempts: 2,
    });
    logger.debug('Added alert job to queue', {
        jobId: job.id,
        alertType,
        severity: payload.severity,
    });
    metrics_1.metricsCollector.updateActiveQueueJobs('alerts', await alertQueue.count());
    return job;
}
async function addAnalysisJob(documentId, oldContent, newContent, documentType, options = {}) {
    const job = await analysisQueue.add('change_analysis', {
        documentId,
        oldContent,
        newContent,
        documentType,
    }, {
        priority: options.priority || 5,
        attempts: 2,
    });
    logger.debug('Added analysis job to queue', {
        jobId: job.id,
        documentId,
        documentType,
    });
    metrics_1.metricsCollector.updateActiveQueueJobs('analysis', await analysisQueue.count());
    return job;
}
async function getQueueStats() {
    const [monitoringStats, webhookStats, alertStats, analysisStats] = await Promise.all([
        monitoringQueue.getJobCounts(),
        webhookQueue.getJobCounts(),
        alertQueue.getJobCounts(),
        analysisQueue.getJobCounts(),
    ]);
    return {
        monitoring: monitoringStats,
        webhooks: webhookStats,
        alerts: alertStats,
        analysis: analysisStats,
    };
}
async function pauseAllQueues() {
    await Promise.all([
        monitoringQueue.pause(),
        webhookQueue.pause(),
        alertQueue.pause(),
        analysisQueue.pause(),
    ]);
    logger.info('All queues paused');
}
async function resumeAllQueues() {
    await Promise.all([
        monitoringQueue.resume(),
        webhookQueue.resume(),
        alertQueue.resume(),
        analysisQueue.resume(),
    ]);
    logger.info('All queues resumed');
}
async function setupWorkers() {
    logger.info('Setting up queue workers...');
    try {
        const monitoringWorker = createMonitoringWorker();
        const webhookWorker = createWebhookWorker();
        const alertWorker = createAlertWorker();
        const analysisWorker = createAnalysisWorker();
        workers = [monitoringWorker, webhookWorker, alertWorker, analysisWorker];
        workers.forEach((worker, index) => {
            const workerNames = ['monitoring', 'webhook', 'alert', 'analysis'];
            const workerName = workerNames[index];
            worker.on('error', (error) => {
                logger.error(`${workerName} worker error`, { error: error.message });
                metrics_1.metricsCollector.recordError('worker', 'worker_error', 'high');
            });
            worker.on('ioredis:close', () => {
                logger.warn(`${workerName} worker Redis connection closed`);
            });
            worker.on('ioredis:reconnecting', () => {
                logger.info(`${workerName} worker Redis reconnecting`);
            });
        });
        logger.info('Queue workers setup completed', {
            workerCount: workers.length,
        });
        setInterval(async () => {
            try {
                const stats = await getQueueStats();
                metrics_1.metricsCollector.updateActiveQueueJobs('monitoring', stats.monitoring.active || 0);
                metrics_1.metricsCollector.updateActiveQueueJobs('webhooks', stats.webhooks.active || 0);
                metrics_1.metricsCollector.updateActiveQueueJobs('alerts', stats.alerts.active || 0);
                metrics_1.metricsCollector.updateActiveQueueJobs('analysis', stats.analysis.active || 0);
            }
            catch (error) {
                logger.error('Error collecting queue metrics', { error });
            }
        }, 30000);
    }
    catch (error) {
        logger.error('Failed to setup queue workers', { error });
        throw error;
    }
}
async function shutdownWorkers() {
    logger.info('Shutting down queue workers...');
    try {
        await Promise.all(workers.map(worker => worker.close()));
        await Promise.all([
            monitoringQueue.close(),
            webhookQueue.close(),
            alertQueue.close(),
            analysisQueue.close(),
        ]);
        await queueConfig.connection.disconnect();
        workers = [];
        logger.info('Queue workers shutdown completed');
    }
    catch (error) {
        logger.error('Error shutting down queue workers', { error });
        throw error;
    }
}
async function healthCheckWorkers() {
    const workerStatuses = workers.map((worker, index) => {
        const workerNames = ['monitoring', 'webhook', 'alert', 'analysis'];
        return {
            name: workerNames[index],
            status: worker.isRunning() ? 'running' : 'stopped',
        };
    });
    const allRunning = workerStatuses.every(w => w.status === 'running');
    const queueStats = await getQueueStats();
    return {
        healthy: allRunning,
        workers: workerStatuses,
        queues: queueStats,
    };
}
//# sourceMappingURL=index.js.map