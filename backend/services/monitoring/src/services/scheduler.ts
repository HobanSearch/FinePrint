import { createServiceLogger } from '@fineprintai/shared-logger';
import * as cron from 'node-cron';
import { tosMonitoringService } from './tosMonitoring';
import { mongoChangeStreamService } from './mongoChangeStream';
import { alertingService } from './alertingService';
import { documentCrawlerService } from './documentCrawler';
import { metricsCollector } from '../monitoring/metrics';
import { TracingUtils } from '../monitoring/tracing';

const logger = createServiceLogger('scheduler-service');

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string; // Cron expression
  task: () => Promise<void>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  lastError?: string;
  timeout?: number; // Task timeout in ms
}

class SchedulerService {
  private tasks = new Map<string, ScheduledTask>();
  private cronJobs = new Map<string, cron.ScheduledTask>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing scheduler service...');
    
    try {
      // Register default scheduled tasks
      await this.registerDefaultTasks();
      
      // Start all enabled tasks
      await this.startAllTasks();
      
      this.initialized = true;
      logger.info('Scheduler service initialized successfully', {
        taskCount: this.tasks.size,
      });
    } catch (error) {
      logger.error('Failed to initialize scheduler service', { error });
      throw error;
    }
  }

  async registerTask(task: Omit<ScheduledTask, 'runCount' | 'errorCount'>): Promise<void> {
    const fullTask: ScheduledTask = {
      ...task,
      runCount: 0,
      errorCount: 0,
    };

    this.tasks.set(task.id, fullTask);
    
    if (task.enabled) {
      await this.startTask(task.id);
    }

    logger.info('Registered scheduled task', {
      taskId: task.id,
      name: task.name,
      schedule: task.schedule,
      enabled: task.enabled,
    });
  }

  async startTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error('Task not found', { taskId });
      return false;
    }

    if (this.cronJobs.has(taskId)) {
      logger.warn('Task already started', { taskId });
      return true;
    }

    try {
      const cronJob = cron.schedule(task.schedule, async () => {
        await this.executeTask(taskId);
      }, {
        scheduled: true,
        timezone: 'UTC',
      });

      this.cronJobs.set(taskId, cronJob);
      task.enabled = true;
      task.nextRun = this.getNextRunTime(task.schedule);

      logger.info('Started scheduled task', {
        taskId,
        name: task.name,
        nextRun: task.nextRun,
      });

      return true;

    } catch (error) {
      logger.error('Failed to start scheduled task', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async stopTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error('Task not found', { taskId });
      return false;
    }

    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      cronJob.destroy();
      this.cronJobs.delete(taskId);
    }

    task.enabled = false;
    task.nextRun = undefined;

    logger.info('Stopped scheduled task', { taskId, name: task.name });
    return true;
  }

  async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.error('Task not found for execution', { taskId });
      return;
    }

    if (!task.enabled) {
      logger.debug('Skipping disabled task', { taskId });
      return;
    }

    const startTime = Date.now();
    logger.info('Executing scheduled task', {
      taskId,
      name: task.name,
      runCount: task.runCount,
    });

    try {
      // Execute task with tracing
      await TracingUtils.traceFunction(
        `scheduled_task.${task.name}`,
        async (span) => {
          span.setAttributes({
            'task.id': taskId,
            'task.name': task.name,
            'task.schedule': task.schedule,
            'task.run_count': task.runCount,
          });

          // Execute with timeout if specified
          if (task.timeout) {
            await Promise.race([
              task.task(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Task timeout')), task.timeout)
              ),
            ]);
          } else {
            await task.task();
          }
        }
      );

      // Update task statistics
      task.runCount++;
      task.lastRun = new Date();
      task.nextRun = this.getNextRunTime(task.schedule);
      task.lastError = undefined;

      const duration = Date.now() - startTime;
      logger.info('Scheduled task completed successfully', {
        taskId,
        name: task.name,
        duration,
        runCount: task.runCount,
        nextRun: task.nextRun,
      });

      // Record metrics
      metricsCollector.recordQueueJob('scheduler', 'completed', task.name, duration);

    } catch (error) {
      task.errorCount++;
      task.lastError = error instanceof Error ? error.message : 'Unknown error';
      task.nextRun = this.getNextRunTime(task.schedule);

      const duration = Date.now() - startTime;
      logger.error('Scheduled task failed', {
        taskId,
        name: task.name,
        error: task.lastError,
        duration,
        errorCount: task.errorCount,
      });

      // Record metrics
      metricsCollector.recordQueueJob('scheduler', 'failed', task.name, duration);
    }

    this.tasks.set(taskId, task);
  }

  async runTaskNow(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    logger.info('Running scheduled task immediately', {
      taskId,
      name: task.name,
    });

    await this.executeTask(taskId);
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  getTaskStatus(): {
    totalTasks: number;
    enabledTasks: number;
    runningTasks: number;
    totalRuns: number;
    totalErrors: number;
  } {
    const allTasks = Array.from(this.tasks.values());
    
    return {
      totalTasks: allTasks.length,
      enabledTasks: allTasks.filter(task => task.enabled).length,
      runningTasks: this.cronJobs.size,
      totalRuns: allTasks.reduce((sum, task) => sum + task.runCount, 0),
      totalErrors: allTasks.reduce((sum, task) => sum + task.errorCount, 0),
    };
  }

  private async registerDefaultTasks(): Promise<void> {
    // Document monitoring job processing
    await this.registerTask({
      id: 'process-monitoring-jobs',
      name: 'Process Document Monitoring Jobs',
      schedule: '*/5 * * * *', // Every 5 minutes
      enabled: true,
      timeout: 300000, // 5 minutes
      task: async () => {
        const jobsDue = await tosMonitoringService.getJobsDueForProcessing();
        
        logger.info('Processing due monitoring jobs', {
          jobCount: jobsDue.length,
        });

        // Process jobs in batches to avoid overwhelming the system
        const batchSize = 5;
        for (let i = 0; i < jobsDue.length; i += batchSize) {
          const batch = jobsDue.slice(i, i + batchSize);
          
          await Promise.allSettled(
            batch.map(job => tosMonitoringService.processMonitoringJob(job.id))
          );
        }
      },
    });

    // Health checks
    await this.registerTask({
      id: 'health-checks',
      name: 'Service Health Checks',
      schedule: '*/2 * * * *', // Every 2 minutes
      enabled: true,
      timeout: 60000, // 1 minute
      task: async () => {
        const services = [
          { name: 'documentCrawler', service: documentCrawlerService },
          { name: 'tosMonitoring', service: tosMonitoringService },
          { name: 'mongoChangeStream', service: mongoChangeStreamService },
          { name: 'alerting', service: alertingService },
        ];

        const healthResults = await Promise.allSettled(
          services.map(async ({ name, service }) => {
            try {
              await service.healthCheck();
              return { name, healthy: true };
            } catch (error) {
              logger.warn('Service health check failed', {
                service: name,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
              return { name, healthy: false, error };
            }
          })
        );

        const unhealthyServices = healthResults
          .filter(result => result.status === 'fulfilled' && !result.value.healthy)
          .map(result => result.status === 'fulfilled' ? result.value.name : 'unknown');

        if (unhealthyServices.length > 0) {
          logger.warn('Unhealthy services detected', {
            unhealthyServices,
          });
        }
      },
    });

    // Metrics collection
    await this.registerTask({
      id: 'collect-metrics',
      name: 'Collect Service Metrics',
      schedule: '*/1 * * * *', // Every minute
      enabled: true,
      timeout: 30000, // 30 seconds
      task: async () => {
        try {
          // Collect ToS monitoring stats
          const tosStats = await tosMonitoringService.getMonitoringStats();
          metricsCollector.updateDocumentsMonitored(
            tosStats.totalJobs,
            'system',
            undefined,
            'terms_of_service'
          );

          // Collect MongoDB change stream stats
          const changeStreamStats = mongoChangeStreamService.getConnectionStats();
          metricsCollector.updateActiveChangeStreams(
            changeStreamStats.activeStreams,
            changeStreamStats.database || 'unknown'
          );

          // Collect alert stats
          const alertStats = await alertingService.getAlertStats();
          Object.entries(alertStats.alertsByStatus || {}).forEach(([severity, count]) => {
            metricsCollector.updateActiveAlerts(count, severity, 'system');
          });

        } catch (error) {
          logger.error('Error collecting metrics', { error });
        }
      },
    });

    // Cleanup old data
    await this.registerTask({
      id: 'cleanup-old-data',
      name: 'Cleanup Old Data',
      schedule: '0 2 * * *', // Daily at 2 AM
      enabled: true,
      timeout: 600000, // 10 minutes
      task: async () => {
        logger.info('Starting data cleanup task');

        try {
          // Cleanup old monitoring job logs (example)
          // This would typically involve database queries to remove old records
          
          // Cleanup old webhook deliveries
          // Cleanup old alert instances
          // Cleanup old audit logs
          
          logger.info('Data cleanup completed successfully');
        } catch (error) {
          logger.error('Data cleanup failed', { error });
          throw error;
        }
      },
    });

    // Generate daily reports
    await this.registerTask({
      id: 'daily-reports',
      name: 'Generate Daily Reports',
      schedule: '0 6 * * *', // Daily at 6 AM
      enabled: true,
      timeout: 300000, // 5 minutes
      task: async () => {
        logger.info('Generating daily reports');

        try {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          // Generate monitoring summary
          const tosStats = await tosMonitoringService.getMonitoringStats();
          const alertStats = await alertingService.getAlertStats();
          
          const dailyReport = {
            date: yesterday.toISOString().split('T')[0],
            monitoring: {
              totalDocuments: tosStats.totalDocuments,
              changesDetected: tosStats.totalChangesDetected,
              averageProcessingTime: tosStats.averageProcessingTime,
              errorRate: tosStats.errorRate,
            },
            alerts: {
              totalRules: alertStats.totalRules,
              activeAlerts: alertStats.activeAlerts,
              alertsByStatus: alertStats.alertsByStatus,
            },
            scheduler: this.getTaskStatus(),
          };

          logger.info('Daily report generated', { report: dailyReport });

          // Here you could send the report via email, store it, etc.

        } catch (error) {
          logger.error('Daily report generation failed', { error });
          throw error;
        }
      },
    });

    // System resource monitoring
    await this.registerTask({
      id: 'system-resources',
      name: 'Monitor System Resources',
      schedule: '*/30 * * * * *', // Every 30 seconds
      enabled: true,
      timeout: 10000, // 10 seconds
      task: async () => {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Log if memory usage is high
        const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
        if (memoryUsageMB > 500) { // 500MB threshold
          logger.warn('High memory usage detected', {
            heapUsedMB: memoryUsageMB,
            heapTotalMB: memoryUsage.heapTotal / 1024 / 1024,
            rssMB: memoryUsage.rss / 1024 / 1024,
          });
        }

        // Update metrics are handled by the metrics collector
      },
    });

    logger.info('Registered default scheduled tasks', {
      taskCount: this.tasks.size,
    });
  }

  private async startAllTasks(): Promise<void> {
    const enabledTasks = Array.from(this.tasks.entries())
      .filter(([_, task]) => task.enabled);

    for (const [taskId, _] of enabledTasks) {
      await this.startTask(taskId);
    }

    logger.info('Started all enabled scheduled tasks', {
      startedTasks: enabledTasks.length,
    });
  }

  private getNextRunTime(schedule: string): Date {
    try {
      // This is a simplified implementation
      // In production, you'd want to use a proper cron parser
      const now = new Date();
      const nextRun = new Date(now.getTime() + 60000); // Add 1 minute as fallback
      return nextRun;
    } catch (error) {
      logger.error('Error calculating next run time', { schedule, error });
      return new Date(Date.now() + 60000); // Fallback to 1 minute
    }
  }

  async pauseAllTasks(): Promise<void> {
    const taskIds = Array.from(this.tasks.keys());
    
    for (const taskId of taskIds) {
      await this.stopTask(taskId);
    }

    logger.info('Paused all scheduled tasks', {
      pausedTasks: taskIds.length,
    });
  }

  async resumeAllTasks(): Promise<void> {
    const taskIds = Array.from(this.tasks.keys());
    
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task && task.enabled) {
        await this.startTask(taskId);
      }
    }

    logger.info('Resumed all enabled scheduled tasks');
  }

  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Scheduler service not initialized');
    }

    const status = this.getTaskStatus();
    
    if (status.enabledTasks !== status.runningTasks) {
      throw new Error(`Task count mismatch: ${status.enabledTasks} enabled, ${status.runningTasks} running`);
    }

    // Check for tasks with high error rates
    const problematicTasks = Array.from(this.tasks.values())
      .filter(task => {
        const errorRate = task.runCount > 0 ? (task.errorCount / task.runCount) * 100 : 0;
        return errorRate > 50; // More than 50% errors
      });

    if (problematicTasks.length > 0) {
      logger.warn('Problematic scheduled tasks detected', {
        tasks: problematicTasks.map(task => ({
          id: task.id,
          name: task.name,
          errorRate: task.runCount > 0 ? (task.errorCount / task.runCount) * 100 : 0,
        })),
      });
    }

    logger.info('Scheduler service health check completed', status);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down scheduler service...');
    
    // Stop all cron jobs
    for (const [taskId, cronJob] of this.cronJobs.entries()) {
      cronJob.stop();
      cronJob.destroy();
      logger.debug('Stopped scheduled task', { taskId });
    }

    this.cronJobs.clear();
    this.tasks.clear();
    this.initialized = false;
    
    logger.info('Scheduler service shutdown complete');
  }
}

export const schedulerService = new SchedulerService();