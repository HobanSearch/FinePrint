import { Queue } from 'bullmq';
import cronParser from 'cron-parser';
import { createServiceLogger } from '@fineprintai/logger';
import { ScheduledJobConfig, JobOptions } from '@fineprintai/shared-types';
import EventEmitter from 'eventemitter3';

const logger = createServiceLogger('job-scheduler');

export interface ScheduledJobExecution {
  configName: string;
  executionId: string;
  scheduledFor: Date;
  executedAt: Date;
  success: boolean;
  jobId?: string;
  error?: string;
  duration?: number;
}

export interface SchedulerStats {
  totalJobs: number;
  activeJobs: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  nextExecution?: {
    configName: string;
    scheduledFor: Date;
  };
}

/**
 * Handles scheduled job execution with cron expressions and timezone support
 */
export class JobScheduler extends EventEmitter {
  private scheduledJobs: Map<string, ScheduledJobConfig> = new Map();
  private queues: Map<string, Queue> = new Map();
  private schedulerInterval: NodeJS.Timeout | null = null;
  private executionHistory: Map<string, ScheduledJobExecution[]> = new Map();
  private nextExecutions: Map<string, Date> = new Map();
  private isRunning = false;

  // Configuration
  private readonly checkInterval = 60000; // Check every minute
  private readonly maxHistoryPerJob = 100;
  private readonly maxMissedExecutions = 5;

  constructor() {
    super();
    this.startScheduler();
    logger.info('Job Scheduler initialized');
  }

  /**
   * Schedule a recurring job
   */
  public scheduleJob(config: ScheduledJobConfig, queue: Queue): void {
    try {
      // Validate cron expression
      cronParser.parseExpression(config.cron, { tz: config.timezone });

      // Calculate next run time
      const nextRun = this.calculateNextRun(config.cron, config.timezone);

      const fullConfig: ScheduledJobConfig = {
        ...config,
        enabled: config.enabled ?? true,
        nextRun,
        lastRun: config.lastRun,
      };

      this.scheduledJobs.set(config.name, fullConfig);
      this.queues.set(config.name, queue);
      this.nextExecutions.set(config.name, nextRun);
      this.executionHistory.set(config.name, []);

      logger.info(`Job scheduled: '${config.name}'`, {
        cron: config.cron,
        timezone: config.timezone,
        nextRun: nextRun.toISOString(),
        enabled: fullConfig.enabled,
      });

      this.emit('job:scheduled', { configName: config.name, config: fullConfig });
    } catch (error) {
      logger.error(`Failed to schedule job '${config.name}'`, {
        error: (error as Error).message,
        config,
      });
      throw new Error(`Invalid cron expression or configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Update an existing scheduled job
   */
  public updateScheduledJob(name: string, updates: Partial<ScheduledJobConfig>): boolean {
    const existingConfig = this.scheduledJobs.get(name);
    if (!existingConfig) {
      logger.error(`Scheduled job '${name}' not found`);
      return false;
    }

    try {
      const updatedConfig: ScheduledJobConfig = { ...existingConfig, ...updates };

      // Validate cron expression if it changed
      if (updates.cron && updates.cron !== existingConfig.cron) {
        cronParser.parseExpression(updates.cron, { tz: updatedConfig.timezone });
        updatedConfig.nextRun = this.calculateNextRun(updates.cron, updatedConfig.timezone);
        this.nextExecutions.set(name, updatedConfig.nextRun);
      }

      this.scheduledJobs.set(name, updatedConfig);

      logger.info(`Scheduled job updated: '${name}'`, { updates });
      this.emit('job:updated', { configName: name, config: updatedConfig });

      return true;
    } catch (error) {
      logger.error(`Failed to update scheduled job '${name}'`, {
        error: (error as Error).message,
        updates,
      });
      return false;
    }
  }

  /**
   * Enable or disable a scheduled job
   */
  public toggleScheduledJob(name: string, enabled: boolean): boolean {
    return this.updateScheduledJob(name, { enabled });
  }

  /**
   * Remove a scheduled job
   */
  public removeScheduledJob(name: string): boolean {
    const removed = this.scheduledJobs.delete(name);
    
    if (removed) {
      this.queues.delete(name);
      this.nextExecutions.delete(name);
      this.executionHistory.delete(name);
      
      logger.info(`Scheduled job removed: '${name}'`);
      this.emit('job:removed', { configName: name });
    }

    return removed;
  }

  /**
   * Execute a scheduled job immediately (manual trigger)
   */
  public async executeJobNow(name: string): Promise<string | null> {
    const config = this.scheduledJobs.get(name);
    const queue = this.queues.get(name);

    if (!config || !queue) {
      logger.error(`Scheduled job '${name}' not found`);
      return null;
    }

    return await this.executeScheduledJob(config, queue, true);
  }

  /**
   * Get all scheduled jobs
   */
  public getScheduledJobs(): ScheduledJobConfig[] {
    return Array.from(this.scheduledJobs.values());
  }

  /**
   * Get a specific scheduled job configuration
   */
  public getScheduledJob(name: string): ScheduledJobConfig | undefined {
    return this.scheduledJobs.get(name);
  }

  /**
   * Get execution history for a job
   */
  public getExecutionHistory(name: string, limit: number = 50): ScheduledJobExecution[] {
    const history = this.executionHistory.get(name) || [];
    return history.slice(-limit);
  }

  /**
   * Get scheduler statistics
   */
  public getSchedulerStats(): SchedulerStats {
    const allExecutions = Array.from(this.executionHistory.values()).flat();
    const activeJobs = Array.from(this.scheduledJobs.values()).filter(job => job.enabled).length;

    const successfulExecutions = allExecutions.filter(exec => exec.success).length;
    const failedExecutions = allExecutions.filter(exec => !exec.success).length;

    const executionsWithDuration = allExecutions.filter(exec => exec.duration !== undefined);
    const averageExecutionTime = executionsWithDuration.length > 0
      ? executionsWithDuration.reduce((sum, exec) => sum + (exec.duration || 0), 0) / executionsWithDuration.length
      : 0;

    // Find next execution
    let nextExecution: { configName: string; scheduledFor: Date } | undefined;
    const now = new Date();
    
    for (const [name, date] of this.nextExecutions) {
      const config = this.scheduledJobs.get(name);
      if (config?.enabled && date > now) {
        if (!nextExecution || date < nextExecution.scheduledFor) {
          nextExecution = { configName: name, scheduledFor: date };
        }
      }
    }

    return {
      totalJobs: this.scheduledJobs.size,
      activeJobs,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime: Math.round(averageExecutionTime),
      nextExecution,
    };
  }

  /**
   * Get upcoming executions within a time window
   */
  public getUpcomingExecutions(withinMinutes: number = 60): Array<{
    configName: string;
    scheduledFor: Date;
    config: ScheduledJobConfig;
  }> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinMinutes * 60 * 1000);
    const upcoming: Array<{ configName: string; scheduledFor: Date; config: ScheduledJobConfig }> = [];

    for (const [name, scheduledFor] of this.nextExecutions) {
      const config = this.scheduledJobs.get(name);
      if (config?.enabled && scheduledFor >= now && scheduledFor <= cutoff) {
        upcoming.push({ configName: name, scheduledFor, config });
      }
    }

    return upcoming.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  }

  /**
   * Validate cron expression
   */
  public static validateCronExpression(cron: string, timezone?: string): boolean {
    try {
      cronParser.parseExpression(cron, { tz: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get next few execution times for a cron expression
   */
  public static getNextExecutions(
    cron: string,
    count: number = 5,
    timezone?: string
  ): Date[] {
    try {
      const interval = cronParser.parseExpression(cron, { tz: timezone });
      const executions: Date[] = [];

      for (let i = 0; i < count; i++) {
        executions.push(interval.next().toDate());
      }

      return executions;
    } catch (error) {
      throw new Error(`Invalid cron expression: ${(error as Error).message}`);
    }
  }

  // Private methods

  private startScheduler(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.schedulerInterval = setInterval(() => {
      this.processScheduledJobs();
    }, this.checkInterval);

    logger.info('Job scheduler started', { checkInterval: this.checkInterval });
  }

  private async processScheduledJobs(): Promise<void> {
    const now = new Date();
    
    for (const [name, config] of this.scheduledJobs) {
      if (!config.enabled) continue;

      const nextExecution = this.nextExecutions.get(name);
      if (!nextExecution || nextExecution > now) continue;

      const queue = this.queues.get(name);
      if (!queue) {
        logger.error(`Queue not found for scheduled job '${name}'`);
        continue;
      }

      try {
        await this.executeScheduledJob(config, queue);
        
        // Calculate next execution time
        const nextRun = this.calculateNextRun(config.cron, config.timezone);
        this.nextExecutions.set(name, nextRun);
        
        // Update config
        const updatedConfig = { ...config, lastRun: now, nextRun };
        this.scheduledJobs.set(name, updatedConfig);
        
      } catch (error) {
        logger.error(`Failed to execute scheduled job '${name}'`, { error });
        
        // Record failed execution
        this.recordExecution(name, {
          configName: name,
          executionId: `${name}-${now.getTime()}`,
          scheduledFor: nextExecution,
          executedAt: now,
          success: false,
          error: (error as Error).message,
        });
        
        // Check for too many missed executions
        const recentFailures = this.getRecentFailures(name);
        if (recentFailures >= this.maxMissedExecutions) {
          logger.error(`Too many failed executions for job '${name}', disabling`, {
            failures: recentFailures,
          });
          this.updateScheduledJob(name, { enabled: false });
        }
      }
    }
  }

  private async executeScheduledJob(
    config: ScheduledJobConfig,
    queue: Queue,
    manual: boolean = false
  ): Promise<string> {
    const executionId = `${config.name}-${Date.now()}`;
    const executedAt = new Date();
    const scheduledFor = this.nextExecutions.get(config.name) || executedAt;

    logger.info(`Executing scheduled job '${config.name}'`, {
      executionId,
      manual,
      scheduledFor: scheduledFor.toISOString(),
    });

    const startTime = Date.now();

    try {
      // Add job to queue with appropriate options
      const jobOptions: JobOptions = {
        priority: 5, // Default priority for scheduled jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 50,
        removeOnFail: 25,
        // Add metadata to identify as scheduled job
        tags: ['scheduled', config.name],
      };

      const job = await queue.add(
        `scheduled-${config.name}`,
        {
          ...config.data,
          _scheduledJob: {
            configName: config.name,
            executionId,
            scheduledFor: scheduledFor.toISOString(),
            manual,
          },
        },
        jobOptions
      );

      const duration = Date.now() - startTime;

      // Record successful execution
      this.recordExecution(config.name, {
        configName: config.name,
        executionId,
        scheduledFor,
        executedAt,
        success: true,
        jobId: job.id,
        duration,
      });

      this.emit('job:executed', {
        configName: config.name,
        executionId,
        jobId: job.id,
        manual,
        duration,
      });

      logger.info(`Scheduled job executed successfully: '${config.name}'`, {
        executionId,
        jobId: job.id,
        duration,
      });

      return job.id!;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Record failed execution
      this.recordExecution(config.name, {
        configName: config.name,
        executionId,
        scheduledFor,
        executedAt,
        success: false,
        error: errorMessage,
        duration,
      });

      this.emit('job:failed', {
        configName: config.name,
        executionId,
        error: errorMessage,
        manual,
        duration,
      });

      throw error;
    }
  }

  private calculateNextRun(cron: string, timezone?: string): Date {
    const interval = cronParser.parseExpression(cron, { tz: timezone });
    return interval.next().toDate();
  }

  private recordExecution(name: string, execution: ScheduledJobExecution): void {
    if (!this.executionHistory.has(name)) {
      this.executionHistory.set(name, []);
    }

    const history = this.executionHistory.get(name)!;
    history.push(execution);

    // Keep only the most recent executions
    if (history.length > this.maxHistoryPerJob) {
      history.splice(0, history.length - this.maxHistoryPerJob);
    }
  }

  private getRecentFailures(name: string): number {
    const history = this.executionHistory.get(name) || [];
    const recentHistory = history.slice(-this.maxMissedExecutions);
    return recentHistory.filter(exec => !exec.success).length;
  }

  public stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isRunning = false;
    logger.info('Job scheduler stopped');
  }

  public async close(): Promise<void> {
    this.stop();
    this.removeAllListeners();
    logger.info('Job Scheduler closed');
  }
}

export default JobScheduler;