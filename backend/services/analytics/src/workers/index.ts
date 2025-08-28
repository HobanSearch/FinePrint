/**
 * Fine Print AI - Analytics Workers
 * 
 * Background workers for analytics processing including:
 * - ETL job scheduling
 * - Data quality monitoring
 * - Metrics calculation
 * - Report generation
 * - Data archiving
 */

import Bull, { Queue, Job } from 'bull';
import cron from 'node-cron';
import { config } from '@/config';
import { analyticsLogger } from '@/utils/logger';
import { dataWarehouseService } from '@/services/data-warehouse';
import { productAnalyticsService } from '@/services/product-analytics';

// Queue definitions
interface AnalyticsQueues {
  etlQueue: Queue;
  metricsQueue: Queue;
  reportQueue: Queue;
  dataQualityQueue: Queue;
  archiveQueue: Queue;
}

let queues: AnalyticsQueues;

/**
 * Initialize analytics workers
 */
export async function setupAnalyticsWorkers(): Promise<void> {
  try {
    // Initialize queues
    queues = {
      etlQueue: new Bull('etl-jobs', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      }),
      
      metricsQueue: new Bull('metrics-calculation', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 25,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 5000
          }
        }
      }),
      
      reportQueue: new Bull('report-generation', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 100,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 10000
          }
        }
      }),
      
      dataQualityQueue: new Bull('data-quality', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 20,
          attempts: 1
        }
      }),
      
      archiveQueue: new Bull('data-archive', {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db
        },
        defaultJobOptions: {
          removeOnComplete: 2,
          removeOnFail: 10,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 30000
          }
        }
      })
    };

    // Setup queue processors
    await setupQueueProcessors();
    
    // Setup cron jobs
    setupCronJobs();
    
    // Setup queue monitoring
    setupQueueMonitoring();
    
    analyticsLogger.event('analytics_workers_initialized', {
      queueCount: Object.keys(queues).length
    });
  } catch (error) {
    analyticsLogger.error(error as Error, { context: 'setup_analytics_workers' });
    throw error;
  }
}

/**
 * Setup queue processors
 */
async function setupQueueProcessors(): Promise<void> {
  // ETL job processor
  queues.etlQueue.process('execute-etl-job', 5, async (job: Job) => {
    const { jobName } = job.data;
    
    try {
      analyticsLogger.event('etl_job_started', { jobName });
      
      await dataWarehouseService.executeETLJob(jobName);
      
      analyticsLogger.event('etl_job_completed', { jobName });
      
      return { success: true, jobName };
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'etl_job_processor',
        jobName
      });
      throw error;
    }
  });

  // Metrics calculation processor
  queues.metricsQueue.process('calculate-business-metrics', 2, async (job: Job) => {
    const { startDate, endDate, granularity } = job.data;
    
    try {
      analyticsLogger.event('metrics_calculation_started', {
        startDate,
        endDate,
        granularity
      });
      
      const metrics = await dataWarehouseService.getBusinessMetrics(
        new Date(startDate),
        new Date(endDate),
        granularity
      );
      
      // Store metrics for later retrieval
      await storeCalculatedMetrics(metrics);
      
      analyticsLogger.event('metrics_calculation_completed', {
        metricsCount: metrics.length
      });
      
      return { success: true, metricsCount: metrics.length };
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'metrics_calculation_processor'
      });
      throw error;
    }
  });

  // Report generation processor
  queues.reportQueue.process('generate-report', 1, async (job: Job) => {
    const { reportId, reportType, configuration } = job.data;
    
    try {
      analyticsLogger.event('report_generation_started', {
        reportId,
        reportType
      });
      
      // Generate report based on type and configuration
      const reportData = await generateReport(reportType, configuration);
      
      // Store or send report
      await processGeneratedReport(reportId, reportData, configuration);
      
      analyticsLogger.event('report_generation_completed', {
        reportId,
        reportType
      });
      
      return { success: true, reportId };
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'report_generation_processor',
        reportId
      });
      throw error;
    }
  });

  // Data quality processor
  queues.dataQualityQueue.process('run-quality-checks', 3, async (job: Job) => {
    try {
      analyticsLogger.event('data_quality_checks_started', {});
      
      const results = await dataWarehouseService.runDataQualityChecks();
      
      // Process quality check results
      await processDataQualityResults(results);
      
      analyticsLogger.event('data_quality_checks_completed', {
        checksCount: results.length,
        failedChecks: results.filter(r => !r.passed).length
      });
      
      return { success: true, results };
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'data_quality_processor'
      });
      throw error;
    }
  });

  // Data archive processor
  queues.archiveQueue.process('archive-old-data', 1, async (job: Job) => {
    const { tableName, retentionDays } = job.data;
    
    try {
      analyticsLogger.event('data_archive_started', {
        tableName,
        retentionDays
      });
      
      const archivedCount = await archiveOldData(tableName, retentionDays);
      
      analyticsLogger.event('data_archive_completed', {
        tableName,
        archivedCount
      });
      
      return { success: true, archivedCount };
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'data_archive_processor',
        tableName
      });
      throw error;
    }
  });
}

/**
 * Setup cron jobs
 */
function setupCronJobs(): void {
  // Daily ETL jobs
  cron.schedule('0 2 * * *', async () => {
    try {
      // Schedule daily ETL jobs
      await queues.etlQueue.add('execute-etl-job', {
        jobName: 'user_metrics_daily'
      });
      
      await queues.etlQueue.add('execute-etl-job', {
        jobName: 'revenue_metrics_daily'
      });
      
      analyticsLogger.event('daily_etl_jobs_scheduled', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'daily_etl_cron' });
    }
  });

  // Real-time analytics ETL (every 15 minutes)
  cron.schedule('*/15 * * * *', async () => {
    try {
      await queues.etlQueue.add('execute-etl-job', {
        jobName: 'document_analysis_metrics'
      });
      
      analyticsLogger.event('realtime_etl_job_scheduled', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'realtime_etl_cron' });
    }
  });

  // Business metrics calculation (hourly)
  cron.schedule('0 * * * *', async () => {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      await queues.metricsQueue.add('calculate-business-metrics', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity: 'hour'
      });
      
      analyticsLogger.event('hourly_metrics_calculation_scheduled', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'hourly_metrics_cron' });
    }
  });

  // Data quality checks (every 6 hours)
  cron.schedule('0 */6 * * *', async () => {
    try {
      await queues.dataQualityQueue.add('run-quality-checks', {});
      
      analyticsLogger.event('data_quality_checks_scheduled', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'data_quality_cron' });
    }
  });

  // Weekly reports (Mondays at 9 AM)
  if (config.reporting.enableAutomatedReports) {
    cron.schedule(config.reporting.reportSchedule, async () => {
      try {
        await queues.reportQueue.add('generate-report', {
          reportId: crypto.randomUUID(),
          reportType: 'executive_summary',
          configuration: {
            timeRange: {
              start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              end: new Date()
            },
            format: 'pdf',
            recipients: ['team@fineprintai.com']
          }
        });
        
        analyticsLogger.event('weekly_report_scheduled', {});
      } catch (error) {
        analyticsLogger.error(error as Error, { context: 'weekly_report_cron' });
      }
    });
  }

  // Data archiving (daily at 3 AM)
  cron.schedule('0 3 * * *', async () => {
    try {
      const tables = [
        { name: 'analytics_events', retentionDays: config.privacy.dataRetentionDays },
        { name: 'user_sessions', retentionDays: 90 },
        { name: 'audit_logs', retentionDays: 365 }
      ];
      
      for (const table of tables) {
        await queues.archiveQueue.add('archive-old-data', {
          tableName: table.name,
          retentionDays: table.retentionDays
        });
      }
      
      analyticsLogger.event('data_archiving_scheduled', {
        tableCount: tables.length
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'data_archiving_cron' });
    }
  });
}

/**
 * Setup queue monitoring
 */
function setupQueueMonitoring(): void {
  Object.entries(queues).forEach(([queueName, queue]) => {
    queue.on('completed', (job: Job, result: any) => {
      analyticsLogger.event('job_completed', {
        queueName,
        jobId: job.id,
        jobType: job.name,
        duration: Date.now() - job.timestamp,
        result
      });
    });

    queue.on('failed', (job: Job, error: Error) => {
      analyticsLogger.error(error, {
        context: 'job_failed',
        queueName,
        jobId: job.id,
        jobType: job.name,
        attempts: job.attemptsMade
      });
    });

    queue.on('stalled', (job: Job) => {
      analyticsLogger.event('job_stalled', {
        queueName,
        jobId: job.id,
        jobType: job.name
      });
    });
  });
}

// Helper functions

async function storeCalculatedMetrics(metrics: any[]): Promise<void> {
  // Store metrics in database or cache for API access
  // Implementation depends on storage strategy
}

async function generateReport(
  reportType: string,
  configuration: any
): Promise<any> {
  // Generate report based on type
  switch (reportType) {
    case 'executive_summary':
      return generateExecutiveSummaryReport(configuration);
    case 'user_engagement':
      return generateUserEngagementReport(configuration);
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

async function generateExecutiveSummaryReport(configuration: any): Promise<any> {
  // Generate executive summary report
  return {
    title: 'Executive Summary',
    period: configuration.timeRange,
    sections: [
      { name: 'Key Metrics', data: {} },
      { name: 'User Growth', data: {} },
      { name: 'Revenue', data: {} },
      { name: 'Product Usage', data: {} }
    ]
  };
}

async function generateUserEngagementReport(configuration: any): Promise<any> {
  // Generate user engagement report
  return {
    title: 'User Engagement Report',
    period: configuration.timeRange,
    sections: [
      { name: 'Active Users', data: {} },
      { name: 'Feature Usage', data: {} },
      { name: 'Session Analysis', data: {} }
    ]
  };
}

async function processGeneratedReport(
  reportId: string,
  reportData: any,
  configuration: any
): Promise<void> {
  // Process generated report (save, email, etc.)
  analyticsLogger.event('report_processed', {
    reportId,
    format: configuration.format,
    recipientCount: configuration.recipients?.length || 0
  });
}

async function processDataQualityResults(results: any[]): Promise<void> {
  // Process data quality results
  const failedChecks = results.filter(r => !r.passed);
  
  if (failedChecks.length > 0) {
    analyticsLogger.event('data_quality_issues_detected', {
      failedChecksCount: failedChecks.length,
      issues: failedChecks.map(check => ({
        checkId: check.checkId,
        score: check.score,
        issueCount: check.issues.length
      }))
    });
  }
}

async function archiveOldData(tableName: string, retentionDays: number): Promise<number> {
  // Archive old data based on retention policy
  // This is a placeholder - actual implementation would depend on archiving strategy
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  
  analyticsLogger.event('data_archived', {
    tableName,
    cutoffDate: cutoffDate.toISOString(),
    retentionDays
  });
  
  return 0; // Return number of archived records
}

/**
 * Get queue statistics
 */
export async function getQueueStatistics(): Promise<Record<string, any>> {
  const stats: Record<string, any> = {};
  
  for (const [queueName, queue] of Object.entries(queues)) {
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    stats[queueName] = {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }
  
  return stats;
}

/**
 * Shutdown analytics workers
 */
export async function shutdownAnalyticsWorkers(): Promise<void> {
  try {
    const shutdownPromises = Object.entries(queues).map(async ([queueName, queue]) => {
      await queue.close();
      analyticsLogger.event('queue_closed', { queueName });
    });
    
    await Promise.all(shutdownPromises);
    
    analyticsLogger.event('analytics_workers_shutdown', {});
  } catch (error) {
    analyticsLogger.error(error as Error, { context: 'shutdown_analytics_workers' });
  }
}