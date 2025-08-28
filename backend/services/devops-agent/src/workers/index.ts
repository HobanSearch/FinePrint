/**
 * Background Workers and Job Processing
 * Handles asynchronous tasks and long-running operations
 */

import { Worker, Queue, QueueScheduler } from 'bullmq';
import Redis from 'ioredis';
import { createContextLogger } from '@/utils/logger';
import { config } from '@/config';
import { getServices } from '@/services';

const logger = createContextLogger('Workers');

// Job queues
export let infrastructureQueue: Queue;
export let pipelineQueue: Queue;
export let securityQueue: Queue;
export let monitoringQueue: Queue;
export let backupQueue: Queue;

// Queue schedulers
let infrastructureScheduler: QueueScheduler;
let pipelineScheduler: QueueScheduler;
let securityScheduler: QueueScheduler;
let monitoringScheduler: QueueScheduler;
let backupScheduler: QueueScheduler;

// Workers
let infrastructureWorker: Worker;
let pipelineWorker: Worker;
let securityWorker: Worker;
let monitoringWorker: Worker;
let backupWorker: Worker;

export async function startBackgroundJobs(): Promise<void> {
  logger.info('Starting background job processing...');

  try {
    // Create Redis connection for queues
    const redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
    });

    // Initialize queues
    infrastructureQueue = new Queue('infrastructure', { connection: redis });
    pipelineQueue = new Queue('pipeline', { connection: redis });
    securityQueue = new Queue('security', { connection: redis });
    monitoringQueue = new Queue('monitoring', { connection: redis });
    backupQueue = new Queue('backup', { connection: redis });

    // Initialize schedulers
    infrastructureScheduler = new QueueScheduler('infrastructure', { connection: redis });
    pipelineScheduler = new QueueScheduler('pipeline', { connection: redis });
    securityScheduler = new QueueScheduler('security', { connection: redis });
    monitoringScheduler = new QueueScheduler('monitoring', { connection: redis });
    backupScheduler = new QueueScheduler('backup', { connection: redis });

    // Initialize workers
    await startWorkers(redis);

    // Schedule recurring jobs
    await scheduleRecurringJobs();

    logger.info('Background job processing started successfully');

  } catch (error) {
    logger.error('Failed to start background job processing:', error);
    throw error;
  }
}

async function startWorkers(redis: Redis): Promise<void> {
  logger.info('Starting worker processes...');

  // Infrastructure worker
  infrastructureWorker = new Worker(
    'infrastructure',
    async (job) => {
      return await processInfrastructureJob(job);
    },
    {
      connection: redis,
      concurrency: config.performance.workerConcurrency,
    }
  );

  // Pipeline worker
  pipelineWorker = new Worker(
    'pipeline',
    async (job) => {
      return await processPipelineJob(job);
    },
    {
      connection: redis,
      concurrency: config.performance.workerConcurrency,
    }
  );

  // Security worker
  securityWorker = new Worker(
    'security',
    async (job) => {
      return await processSecurityJob(job);
    },
    {
      connection: redis,
      concurrency: config.performance.workerConcurrency,
    }
  );

  // Monitoring worker
  monitoringWorker = new Worker(
    'monitoring',
    async (job) => {
      return await processMonitoringJob(job);
    },
    {
      connection: redis,
      concurrency: config.performance.workerConcurrency,
    }
  );

  // Backup worker
  backupWorker = new Worker(
    'backup',
    async (job) => {
      return await processBackupJob(job);
    },
    {
      connection: redis,
      concurrency: config.performance.workerConcurrency,
    }
  );

  // Setup worker event handlers
  setupWorkerEventHandlers();

  logger.info('All worker processes started successfully');
}

function setupWorkerEventHandlers(): void {
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
        duration: Date.now() - job.processedOn!,
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

async function scheduleRecurringJobs(): Promise<void> {
  logger.info('Scheduling recurring jobs...');

  // Daily security scans
  await securityQueue.add(
    'daily-vulnerability-scan',
    { scanType: 'comprehensive', target: 'all' },
    {
      repeat: { cron: '0 2 * * *' }, // Daily at 2 AM
      removeOnComplete: 10,
      removeOnFail: 5,
    }
  );

  // Hourly infrastructure drift detection
  await infrastructureQueue.add(
    'drift-detection',
    { scope: 'all-deployments' },
    {
      repeat: { cron: '0 * * * *' }, // Every hour
      removeOnComplete: 24,
      removeOnFail: 5,
    }
  );

  // Daily backup operations
  await backupQueue.add(
    'daily-backup',
    { type: 'incremental', retention: '30d' },
    {
      repeat: { cron: '0 1 * * *' }, // Daily at 1 AM
      removeOnComplete: 7,
      removeOnFail: 3,
    }
  );

  // Weekly compliance assessments
  await securityQueue.add(
    'weekly-compliance-check',
    { frameworks: ['soc2', 'gdpr', 'hipaa'] },
    {
      repeat: { cron: '0 3 * * 0' }, // Weekly on Sunday at 3 AM
      removeOnComplete: 4,
      removeOnFail: 2,
    }
  );

  // Continuous monitoring tasks
  await monitoringQueue.add(
    'metrics-collection',
    { interval: '5m' },
    {
      repeat: { every: 5 * 60 * 1000 }, // Every 5 minutes
      removeOnComplete: 100,
      removeOnFail: 10,
    }
  );

  logger.info('Recurring jobs scheduled successfully');
}

// Job processors
async function processInfrastructureJob(job: any): Promise<any> {
  const { iacEngine } = getServices();
  logger.info(`Processing infrastructure job: ${job.name}`, job.data);

  switch (job.name) {
    case 'deploy-infrastructure':
      return await iacEngine.createDeployment(
        job.data.name,
        job.data.template,
        job.data.variables,
        job.data.options
      );

    case 'destroy-infrastructure':
      return await iacEngine.destroyDeployment(job.data.deploymentId);

    case 'drift-detection':
      const deployments = iacEngine.listDeployments();
      const results = [];
      
      for (const deployment of deployments) {
        try {
          const drift = await iacEngine.detectDrift(deployment.id);
          results.push({ deploymentId: deployment.id, drift });
        } catch (error) {
          logger.error(`Drift detection failed for ${deployment.id}:`, error);
        }
      }
      
      return results;

    default:
      throw new Error(`Unknown infrastructure job: ${job.name}`);
  }
}

async function processPipelineJob(job: any): Promise<any> {
  const { pipelineEngine } = getServices();
  logger.info(`Processing pipeline job: ${job.name}`, job.data);

  switch (job.name) {
    case 'execute-pipeline':
      return await pipelineEngine.executePipeline(
        job.data.pipelineId,
        job.data.trigger,
        job.data.environment
      );

    case 'create-pipeline':
      return await pipelineEngine.createPipeline(
        job.data.name,
        job.data.repository,
        job.data.configuration,
        job.data.options
      );

    default:
      throw new Error(`Unknown pipeline job: ${job.name}`);
  }
}

async function processSecurityJob(job: any): Promise<any> {
  const { securityEngine } = getServices();
  logger.info(`Processing security job: ${job.name}`, job.data);

  switch (job.name) {
    case 'security-scan':
      return await securityEngine.startSecurityScan(
        job.data.name,
        job.data.type,
        job.data.target,
        job.data.configuration
      );

    case 'daily-vulnerability-scan':
      // Run comprehensive security scans
      const scanResults = [];
      const scanTypes = ['sast', 'dast', 'dependency', 'container'];
      
      for (const scanType of scanTypes) {
        try {
          const scan = await securityEngine.startSecurityScan(
            `daily-${scanType}-scan-${Date.now()}`,
            scanType as any,
            job.data.target,
            job.data.configuration || {
              scope: ['*'],
              exclusions: [],
              rules: [],
              thresholds: [],
              notifications: [],
            }
          );
          scanResults.push(scan);
        } catch (error) {
          logger.error(`Daily ${scanType} scan failed:`, error);
        }
      }
      
      return scanResults;

    case 'weekly-compliance-check':
      const complianceResults = [];
      
      for (const framework of job.data.frameworks) {
        try {
          const assessment = await securityEngine.performComplianceAssessment(
            framework,
            'all'
          );
          complianceResults.push(assessment);
        } catch (error) {
          logger.error(`Compliance check failed for ${framework}:`, error);
        }
      }
      
      return complianceResults;

    default:
      throw new Error(`Unknown security job: ${job.name}`);
  }
}

async function processMonitoringJob(job: any): Promise<any> {
  const { observabilityEngine } = getServices();
  logger.info(`Processing monitoring job: ${job.name}`, job.data);

  switch (job.name) {
    case 'deploy-monitoring':
      return await observabilityEngine.deployMonitoringStack(
        job.data.name,
        job.data.cluster,
        job.data.namespace,
        job.data.configuration
      );

    case 'metrics-collection':
      // Collect metrics from all monitoring stacks
      const stacks = observabilityEngine.listMonitoringStacks();
      const metricsResults = [];
      
      for (const stack of stacks) {
        try {
          const metrics = await observabilityEngine.getMonitoringMetrics(stack.id);
          metricsResults.push({ stackId: stack.id, metrics });
        } catch (error) {
          logger.error(`Metrics collection failed for stack ${stack.id}:`, error);
        }
      }
      
      return metricsResults;

    default:
      throw new Error(`Unknown monitoring job: ${job.name}`);
  }
}

async function processBackupJob(job: any): Promise<any> {
  const { backupEngine } = getServices();
  logger.info(`Processing backup job: ${job.name}`, job.data);

  switch (job.name) {
    case 'create-backup':
      return await backupEngine.createBackup(
        job.data.name,
        job.data.targets,
        job.data.type,
        job.data.options
      );

    case 'daily-backup':
      // Perform daily backup operations
      return await backupEngine.createBackup(
        `daily-backup-${new Date().toISOString().split('T')[0]}`,
        ['databases', 'configurations', 'application-data'],
        job.data.type,
        {
          retention: job.data.retention,
          compression: true,
          encryption: true,
        }
      );

    case 'restore-backup':
      return await backupEngine.restoreBackup(
        job.data.backupId,
        job.data.target,
        job.data.options
      );

    default:
      throw new Error(`Unknown backup job: ${job.name}`);
  }
}

// Queue management functions
export async function addInfrastructureJob(name: string, data: any, options?: any): Promise<any> {
  return await infrastructureQueue.add(name, data, options);
}

export async function addPipelineJob(name: string, data: any, options?: any): Promise<any> {
  return await pipelineQueue.add(name, data, options);
}

export async function addSecurityJob(name: string, data: any, options?: any): Promise<any> {
  return await securityQueue.add(name, data, options);
}

export async function addMonitoringJob(name: string, data: any, options?: any): Promise<any> {
  return await monitoringQueue.add(name, data, options);
}

export async function addBackupJob(name: string, data: any, options?: any): Promise<any> {
  return await backupQueue.add(name, data, options);
}

// Cleanup function for graceful shutdown
export async function stopBackgroundJobs(): Promise<void> {
  logger.info('Stopping background job processing...');

  try {
    // Close workers
    await Promise.all([
      infrastructureWorker?.close(),
      pipelineWorker?.close(),
      securityWorker?.close(),
      monitoringWorker?.close(),
      backupWorker?.close(),
    ]);

    // Close schedulers
    await Promise.all([
      infrastructureScheduler?.close(),
      pipelineScheduler?.close(),
      securityScheduler?.close(),
      monitoringScheduler?.close(),
      backupScheduler?.close(),
    ]);

    // Close queues
    await Promise.all([
      infrastructureQueue?.close(),
      pipelineQueue?.close(),
      securityQueue?.close(),
      monitoringQueue?.close(),
      backupQueue?.close(),
    ]);

    logger.info('Background job processing stopped successfully');

  } catch (error) {
    logger.error('Error stopping background jobs:', error);
    throw error;
  }
}