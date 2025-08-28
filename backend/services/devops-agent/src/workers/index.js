"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupQueue = exports.monitoringQueue = exports.securityQueue = exports.pipelineQueue = exports.infrastructureQueue = void 0;
exports.startBackgroundJobs = startBackgroundJobs;
exports.addInfrastructureJob = addInfrastructureJob;
exports.addPipelineJob = addPipelineJob;
exports.addSecurityJob = addSecurityJob;
exports.addMonitoringJob = addMonitoringJob;
exports.addBackupJob = addBackupJob;
exports.stopBackgroundJobs = stopBackgroundJobs;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const services_1 = require("@/services");
const logger = (0, logger_1.createContextLogger)('Workers');
let infrastructureScheduler;
let pipelineScheduler;
let securityScheduler;
let monitoringScheduler;
let backupScheduler;
let infrastructureWorker;
let pipelineWorker;
let securityWorker;
let monitoringWorker;
let backupWorker;
async function startBackgroundJobs() {
    logger.info('Starting background job processing...');
    try {
        const redis = new ioredis_1.default(config_1.config.redis.url, {
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
        });
        exports.infrastructureQueue = new bullmq_1.Queue('infrastructure', { connection: redis });
        exports.pipelineQueue = new bullmq_1.Queue('pipeline', { connection: redis });
        exports.securityQueue = new bullmq_1.Queue('security', { connection: redis });
        exports.monitoringQueue = new bullmq_1.Queue('monitoring', { connection: redis });
        exports.backupQueue = new bullmq_1.Queue('backup', { connection: redis });
        infrastructureScheduler = new bullmq_1.QueueScheduler('infrastructure', { connection: redis });
        pipelineScheduler = new bullmq_1.QueueScheduler('pipeline', { connection: redis });
        securityScheduler = new bullmq_1.QueueScheduler('security', { connection: redis });
        monitoringScheduler = new bullmq_1.QueueScheduler('monitoring', { connection: redis });
        backupScheduler = new bullmq_1.QueueScheduler('backup', { connection: redis });
        await startWorkers(redis);
        await scheduleRecurringJobs();
        logger.info('Background job processing started successfully');
    }
    catch (error) {
        logger.error('Failed to start background job processing:', error);
        throw error;
    }
}
async function startWorkers(redis) {
    logger.info('Starting worker processes...');
    infrastructureWorker = new bullmq_1.Worker('infrastructure', async (job) => {
        return await processInfrastructureJob(job);
    }, {
        connection: redis,
        concurrency: config_1.config.performance.workerConcurrency,
    });
    pipelineWorker = new bullmq_1.Worker('pipeline', async (job) => {
        return await processPipelineJob(job);
    }, {
        connection: redis,
        concurrency: config_1.config.performance.workerConcurrency,
    });
    securityWorker = new bullmq_1.Worker('security', async (job) => {
        return await processSecurityJob(job);
    }, {
        connection: redis,
        concurrency: config_1.config.performance.workerConcurrency,
    });
    monitoringWorker = new bullmq_1.Worker('monitoring', async (job) => {
        return await processMonitoringJob(job);
    }, {
        connection: redis,
        concurrency: config_1.config.performance.workerConcurrency,
    });
    backupWorker = new bullmq_1.Worker('backup', async (job) => {
        return await processBackupJob(job);
    }, {
        connection: redis,
        concurrency: config_1.config.performance.workerConcurrency,
    });
    setupWorkerEventHandlers();
    logger.info('All worker processes started successfully');
}
function setupWorkerEventHandlers() {
    const workers = [
        { name: 'infrastructure', worker: infrastructureWorker },
        { name: 'pipeline', worker: pipelineWorker },
        { name: 'security', worker: securityWorker },
        { name: 'monitoring', worker: monitoringWorker },
        { name: 'backup', worker: backupWorker },
    ];
    workers.forEach(({ name, worker }) => {
        worker.on('completed', (job) => {
            logger.info(`${name} job completed:`, {
                jobId: job.id,
                jobName: job.name,
                duration: Date.now() - job.processedOn,
            });
        });
        worker.on('failed', (job, err) => {
            logger.error(`${name} job failed:`, {
                jobId: job?.id,
                jobName: job?.name,
                error: err.message,
                stack: err.stack,
            });
        });
        worker.on('stalled', (jobId) => {
            logger.warn(`${name} job stalled:`, { jobId });
        });
        worker.on('error', (err) => {
            logger.error(`${name} worker error:`, err);
        });
    });
}
async function scheduleRecurringJobs() {
    logger.info('Scheduling recurring jobs...');
    await exports.securityQueue.add('daily-vulnerability-scan', { scanType: 'comprehensive', target: 'all' }, {
        repeat: { cron: '0 2 * * *' },
        removeOnComplete: 10,
        removeOnFail: 5,
    });
    await exports.infrastructureQueue.add('drift-detection', { scope: 'all-deployments' }, {
        repeat: { cron: '0 * * * *' },
        removeOnComplete: 24,
        removeOnFail: 5,
    });
    await exports.backupQueue.add('daily-backup', { type: 'incremental', retention: '30d' }, {
        repeat: { cron: '0 1 * * *' },
        removeOnComplete: 7,
        removeOnFail: 3,
    });
    await exports.securityQueue.add('weekly-compliance-check', { frameworks: ['soc2', 'gdpr', 'hipaa'] }, {
        repeat: { cron: '0 3 * * 0' },
        removeOnComplete: 4,
        removeOnFail: 2,
    });
    await exports.monitoringQueue.add('metrics-collection', { interval: '5m' }, {
        repeat: { every: 5 * 60 * 1000 },
        removeOnComplete: 100,
        removeOnFail: 10,
    });
    logger.info('Recurring jobs scheduled successfully');
}
async function processInfrastructureJob(job) {
    const { iacEngine } = (0, services_1.getServices)();
    logger.info(`Processing infrastructure job: ${job.name}`, job.data);
    switch (job.name) {
        case 'deploy-infrastructure':
            return await iacEngine.createDeployment(job.data.name, job.data.template, job.data.variables, job.data.options);
        case 'destroy-infrastructure':
            return await iacEngine.destroyDeployment(job.data.deploymentId);
        case 'drift-detection':
            const deployments = iacEngine.listDeployments();
            const results = [];
            for (const deployment of deployments) {
                try {
                    const drift = await iacEngine.detectDrift(deployment.id);
                    results.push({ deploymentId: deployment.id, drift });
                }
                catch (error) {
                    logger.error(`Drift detection failed for ${deployment.id}:`, error);
                }
            }
            return results;
        default:
            throw new Error(`Unknown infrastructure job: ${job.name}`);
    }
}
async function processPipelineJob(job) {
    const { pipelineEngine } = (0, services_1.getServices)();
    logger.info(`Processing pipeline job: ${job.name}`, job.data);
    switch (job.name) {
        case 'execute-pipeline':
            return await pipelineEngine.executePipeline(job.data.pipelineId, job.data.trigger, job.data.environment);
        case 'create-pipeline':
            return await pipelineEngine.createPipeline(job.data.name, job.data.repository, job.data.configuration, job.data.options);
        default:
            throw new Error(`Unknown pipeline job: ${job.name}`);
    }
}
async function processSecurityJob(job) {
    const { securityEngine } = (0, services_1.getServices)();
    logger.info(`Processing security job: ${job.name}`, job.data);
    switch (job.name) {
        case 'security-scan':
            return await securityEngine.startSecurityScan(job.data.name, job.data.type, job.data.target, job.data.configuration);
        case 'daily-vulnerability-scan':
            const scanResults = [];
            const scanTypes = ['sast', 'dast', 'dependency', 'container'];
            for (const scanType of scanTypes) {
                try {
                    const scan = await securityEngine.startSecurityScan(`daily-${scanType}-scan-${Date.now()}`, scanType, job.data.target, job.data.configuration || {
                        scope: ['*'],
                        exclusions: [],
                        rules: [],
                        thresholds: [],
                        notifications: [],
                    });
                    scanResults.push(scan);
                }
                catch (error) {
                    logger.error(`Daily ${scanType} scan failed:`, error);
                }
            }
            return scanResults;
        case 'weekly-compliance-check':
            const complianceResults = [];
            for (const framework of job.data.frameworks) {
                try {
                    const assessment = await securityEngine.performComplianceAssessment(framework, 'all');
                    complianceResults.push(assessment);
                }
                catch (error) {
                    logger.error(`Compliance check failed for ${framework}:`, error);
                }
            }
            return complianceResults;
        default:
            throw new Error(`Unknown security job: ${job.name}`);
    }
}
async function processMonitoringJob(job) {
    const { observabilityEngine } = (0, services_1.getServices)();
    logger.info(`Processing monitoring job: ${job.name}`, job.data);
    switch (job.name) {
        case 'deploy-monitoring':
            return await observabilityEngine.deployMonitoringStack(job.data.name, job.data.cluster, job.data.namespace, job.data.configuration);
        case 'metrics-collection':
            const stacks = observabilityEngine.listMonitoringStacks();
            const metricsResults = [];
            for (const stack of stacks) {
                try {
                    const metrics = await observabilityEngine.getMonitoringMetrics(stack.id);
                    metricsResults.push({ stackId: stack.id, metrics });
                }
                catch (error) {
                    logger.error(`Metrics collection failed for stack ${stack.id}:`, error);
                }
            }
            return metricsResults;
        default:
            throw new Error(`Unknown monitoring job: ${job.name}`);
    }
}
async function processBackupJob(job) {
    const { backupEngine } = (0, services_1.getServices)();
    logger.info(`Processing backup job: ${job.name}`, job.data);
    switch (job.name) {
        case 'create-backup':
            return await backupEngine.createBackup(job.data.name, job.data.targets, job.data.type, job.data.options);
        case 'daily-backup':
            return await backupEngine.createBackup(`daily-backup-${new Date().toISOString().split('T')[0]}`, ['databases', 'configurations', 'application-data'], job.data.type, {
                retention: job.data.retention,
                compression: true,
                encryption: true,
            });
        case 'restore-backup':
            return await backupEngine.restoreBackup(job.data.backupId, job.data.target, job.data.options);
        default:
            throw new Error(`Unknown backup job: ${job.name}`);
    }
}
async function addInfrastructureJob(name, data, options) {
    return await exports.infrastructureQueue.add(name, data, options);
}
async function addPipelineJob(name, data, options) {
    return await exports.pipelineQueue.add(name, data, options);
}
async function addSecurityJob(name, data, options) {
    return await exports.securityQueue.add(name, data, options);
}
async function addMonitoringJob(name, data, options) {
    return await exports.monitoringQueue.add(name, data, options);
}
async function addBackupJob(name, data, options) {
    return await exports.backupQueue.add(name, data, options);
}
async function stopBackgroundJobs() {
    logger.info('Stopping background job processing...');
    try {
        await Promise.all([
            infrastructureWorker?.close(),
            pipelineWorker?.close(),
            securityWorker?.close(),
            monitoringWorker?.close(),
            backupWorker?.close(),
        ]);
        await Promise.all([
            infrastructureScheduler?.close(),
            pipelineScheduler?.close(),
            securityScheduler?.close(),
            monitoringScheduler?.close(),
            backupScheduler?.close(),
        ]);
        await Promise.all([
            exports.infrastructureQueue?.close(),
            exports.pipelineQueue?.close(),
            exports.securityQueue?.close(),
            exports.monitoringQueue?.close(),
            exports.backupQueue?.close(),
        ]);
        logger.info('Background job processing stopped successfully');
    }
    catch (error) {
        logger.error('Error stopping background jobs:', error);
        throw error;
    }
}
//# sourceMappingURL=index.js.map