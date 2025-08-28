import { createServiceLogger } from '@fineprintai/shared-logger';
import { config } from '@fineprintai/shared-config';
import { Worker, Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { tosMonitoringService } from '../services/tosMonitoring';
import { documentCrawlerService } from '../services/documentCrawler';
import { webhookService } from '../services/webhookService';
import { alertingService } from '../services/alertingService';
import { changeDetectionEngine } from '../services/changeDetection';
import { TracingUtils } from '../monitoring/tracing';
import { metricsCollector } from '../monitoring/metrics';

const logger = createServiceLogger('workers');

// Queue configurations
const queueConfig = {
  connection: new Redis(config.redis.url),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
};

// Job queues
const monitoringQueue = new Queue('monitoring', queueConfig);
const webhookQueue = new Queue('webhooks', queueConfig);
const alertQueue = new Queue('alerts', queueConfig);
const analysisQueue = new Queue('analysis', queueConfig);

// Worker instances
let workers: Worker[] = [];

// Job processors
async function processMonitoringJob(job: Job) {
  const { jobId, type } = job.data;
  
  return TracingUtils.traceQueueJob(
    'monitoring',
    type,
    job.id!,
    async (span) => {
      span.setAttributes({
        'job.monitoring_id': jobId,
        'job.type': type,
      });

      switch (type) {
        case 'process_monitoring_job':
          await tosMonitoringService.processMonitoringJob(jobId);
          break;
        
        case 'crawl_document':
          const { url, options, userId } = job.data;
          const result = await documentCrawlerService.crawlDocument(url, options);
          
          metricsCollector.recordDocumentCrawl(
            result.success ? 'success' : 'failure',
            Date.now() - job.timestamp,
            userId
          );
          
          return result;
        
        default:
          throw new Error(`Unknown monitoring job type: ${type}`);
      }
    }
  );
}

async function processWebhookJob(job: Job) {
  const { webhookId, eventType, payload } = job.data;
  
  return TracingUtils.traceQueueJob(
    'webhooks',
    eventType,
    job.id!,
    async (span) => {
      span.setAttributes({
        'webhook.id': webhookId,
        'webhook.event_type': eventType,
      });

      // The webhook service will handle the actual delivery with retries
      await webhookService.triggerDocumentChangeWebhook(payload);
      
      metricsCollector.recordWebhookDelivery(
        'success',
        Date.now() - job.timestamp,
        webhookId,
        eventType
      );
    }
  );
}

async function processAlertJob(job: Job) {
  const { alertType, payload } = job.data;
  
  return TracingUtils.traceQueueJob(
    'alerts',
    alertType,
    job.id!,
    async (span) => {
      span.setAttributes({
        'alert.type': alertType,
        'alert.severity': payload.severity,
      });

      switch (alertType) {
        case 'document_change':
          await alertingService.processDocumentChange(payload);
          break;
        
        case 'monitoring_error':
          await alertingService.processMonitoringError(payload);
          break;
        
        default:
          throw new Error(`Unknown alert job type: ${alertType}`);
      }

      metricsCollector.recordAlertTriggered(
        payload.severity,
        payload.ruleId || 'system',
        payload.userId
      );
    }
  );
}

async function processAnalysisJob(job: Job) {
  const { documentId, oldContent, newContent, documentType } = job.data;
  
  return TracingUtils.traceQueueJob(
    'analysis',
    'change_detection',
    job.id!,
    async (span) => {
      span.setAttributes({
        'document.id': documentId,
        'document.type': documentType,
      });

      const analysis = await changeDetectionEngine.analyzeChanges({
        oldContent,
        newContent,
        documentType,
      });

      metricsCollector.recordChangeAnalysis(
        analysis.changeType,
        Date.now() - job.timestamp,
        documentType
      );

      return analysis;
    }
  );
}

// Worker setup functions
function createMonitoringWorker(): Worker {
  const worker = new Worker('monitoring', processMonitoringJob, {
    connection: queueConfig.connection,
    concurrency: config.queues.monitoring.concurrency,
    maxStalledCount: 3,
    stalledInterval: 30000,
  });

  worker.on('completed', (job) => {
    logger.info('Monitoring job completed', {
      jobId: job.id,
      jobType: job.data.type,
      duration: Date.now() - job.timestamp,
    });

    metricsCollector.recordQueueJob(
      'monitoring',
      'completed',
      job.data.type,
      Date.now() - job.timestamp
    );
  });

  worker.on('failed', (job, error) => {
    logger.error('Monitoring job failed', {
      jobId: job?.id,
      jobType: job?.data?.type,
      error: error.message,
      attempts: job?.attemptsMade,
    });

    if (job) {
      metricsCollector.recordQueueJob(
        'monitoring',
        'failed',
        job.data.type,
        Date.now() - job.timestamp
      );
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Monitoring job stalled', { jobId });
  });

  return worker;
}

function createWebhookWorker(): Worker {
  const worker = new Worker('webhooks', processWebhookJob, {
    connection: queueConfig.connection,
    concurrency: config.queues.notification.concurrency,
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

    metricsCollector.recordQueueJob(
      'webhooks',
      'completed',
      job.data.eventType,
      Date.now() - job.timestamp
    );
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
      metricsCollector.recordQueueJob(
        'webhooks',
        'failed',
        job.data.eventType,
        Date.now() - job.timestamp
      );
    }
  });

  return worker;
}

function createAlertWorker(): Worker {
  const worker = new Worker('alerts', processAlertJob, {
    connection: queueConfig.connection,
    concurrency: Math.ceil(config.queues.notification.concurrency / 2),
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

    metricsCollector.recordQueueJob(
      'alerts',
      'completed',
      job.data.alertType,
      Date.now() - job.timestamp
    );
  });

  worker.on('failed', (job, error) => {
    logger.error('Alert job failed', {
      jobId: job?.id,
      alertType: job?.data?.alertType,
      error: error.message,
      attempts: job?.attemptsMade,
    });

    if (job) {
      metricsCollector.recordQueueJob(
        'alerts',
        'failed',
        job.data.alertType,
        Date.now() - job.timestamp
      );
    }
  });

  return worker;
}

function createAnalysisWorker(): Worker {
  const worker = new Worker('analysis', processAnalysisJob, {
    connection: queueConfig.connection,
    concurrency: config.queues.analysis.concurrency,
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

    metricsCollector.recordQueueJob(
      'analysis',
      'completed',
      'change_detection',
      Date.now() - job.timestamp
    );
  });

  worker.on('failed', (job, error) => {
    logger.error('Analysis job failed', {
      jobId: job?.id,
      documentId: job?.data?.documentId,
      error: error.message,
      attempts: job?.attemptsMade,
    });

    if (job) {
      metricsCollector.recordQueueJob(
        'analysis',
        'failed',
        'change_detection',
        Date.now() - job.timestamp
      );
    }
  });

  return worker;
}

// Queue job adding functions
export async function addMonitoringJob(
  type: string,
  data: any,
  options: {
    delay?: number;
    priority?: number;
    attempts?: number;
  } = {}
): Promise<Job> {
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

  metricsCollector.updateActiveQueueJobs('monitoring', await monitoringQueue.count());
  return job;
}

export async function addWebhookJob(
  webhookId: string,
  eventType: string,
  payload: any,
  options: {
    delay?: number;
    priority?: number;
  } = {}
): Promise<Job> {
  const job = await webhookQueue.add('webhook_delivery', {
    webhookId,
    eventType,
    payload,
  }, {
    delay: options.delay,
    priority: options.priority || 5,
    attempts: 5, // More attempts for webhooks
  });

  logger.debug('Added webhook job to queue', {
    jobId: job.id,
    webhookId,
    eventType,
  });

  metricsCollector.updateActiveQueueJobs('webhooks', await webhookQueue.count());
  return job;
}

export async function addAlertJob(
  alertType: string,
  payload: any,
  options: {
    priority?: number;
  } = {}
): Promise<Job> {
  const job = await alertQueue.add('alert_processing', {
    alertType,
    payload,
  }, {
    priority: options.priority || 3, // Higher priority for alerts
    attempts: 2, // Fewer attempts for alerts to avoid spam
  });

  logger.debug('Added alert job to queue', {
    jobId: job.id,
    alertType,
    severity: payload.severity,
  });

  metricsCollector.updateActiveQueueJobs('alerts', await alertQueue.count());
  return job;
}

export async function addAnalysisJob(
  documentId: string,
  oldContent: string,
  newContent: string,
  documentType: string,
  options: {
    priority?: number;
  } = {}
): Promise<Job> {
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

  metricsCollector.updateActiveQueueJobs('analysis', await analysisQueue.count());
  return job;
}

// Queue management functions
export async function getQueueStats(): Promise<{
  monitoring: any;
  webhooks: any;
  alerts: any;
  analysis: any;
}> {
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

export async function pauseAllQueues(): Promise<void> {
  await Promise.all([
    monitoringQueue.pause(),
    webhookQueue.pause(),
    alertQueue.pause(),
    analysisQueue.pause(),
  ]);

  logger.info('All queues paused');
}

export async function resumeAllQueues(): Promise<void> {
  await Promise.all([
    monitoringQueue.resume(),
    webhookQueue.resume(),
    alertQueue.resume(),
    analysisQueue.resume(),
  ]);

  logger.info('All queues resumed');
}

export async function setupWorkers(): Promise<void> {
  logger.info('Setting up queue workers...');

  try {
    // Create workers
    const monitoringWorker = createMonitoringWorker();
    const webhookWorker = createWebhookWorker();
    const alertWorker = createAlertWorker();
    const analysisWorker = createAnalysisWorker();

    workers = [monitoringWorker, webhookWorker, alertWorker, analysisWorker];

    // Set up global error handlers
    workers.forEach((worker, index) => {
      const workerNames = ['monitoring', 'webhook', 'alert', 'analysis'];
      const workerName = workerNames[index];

      worker.on('error', (error) => {
        logger.error(`${workerName} worker error`, { error: error.message });
        metricsCollector.recordError('worker', 'worker_error', 'high');
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

    // Start collecting queue metrics
    setInterval(async () => {
      try {
        const stats = await getQueueStats();
        
        metricsCollector.updateActiveQueueJobs('monitoring', stats.monitoring.active || 0);
        metricsCollector.updateActiveQueueJobs('webhooks', stats.webhooks.active || 0);
        metricsCollector.updateActiveQueueJobs('alerts', stats.alerts.active || 0);
        metricsCollector.updateActiveQueueJobs('analysis', stats.analysis.active || 0);
      } catch (error) {
        logger.error('Error collecting queue metrics', { error });
      }
    }, 30000); // Every 30 seconds

  } catch (error) {
    logger.error('Failed to setup queue workers', { error });
    throw error;
  }
}

export async function shutdownWorkers(): Promise<void> {
  logger.info('Shutting down queue workers...');

  try {
    // Close all workers
    await Promise.all(workers.map(worker => worker.close()));

    // Close queues
    await Promise.all([
      monitoringQueue.close(),
      webhookQueue.close(),
      alertQueue.close(),
      analysisQueue.close(),
    ]);

    // Disconnect Redis
    await queueConfig.connection.disconnect();

    workers = [];
    logger.info('Queue workers shutdown completed');

  } catch (error) {
    logger.error('Error shutting down queue workers', { error });
    throw error;
  }
}

// Health check for workers
export async function healthCheckWorkers(): Promise<{
  healthy: boolean;
  workers: { name: string; status: string }[];
  queues: any;
}> {
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