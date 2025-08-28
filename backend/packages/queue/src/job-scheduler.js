"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobScheduler = void 0;
const cron_parser_1 = __importDefault(require("cron-parser"));
const logger_1 = require("@fineprintai/logger");
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const logger = (0, logger_1.createServiceLogger)('job-scheduler');
class JobScheduler extends eventemitter3_1.default {
    scheduledJobs = new Map();
    queues = new Map();
    schedulerInterval = null;
    executionHistory = new Map();
    nextExecutions = new Map();
    isRunning = false;
    checkInterval = 60000;
    maxHistoryPerJob = 100;
    maxMissedExecutions = 5;
    constructor() {
        super();
        this.startScheduler();
        logger.info('Job Scheduler initialized');
    }
    scheduleJob(config, queue) {
        try {
            cron_parser_1.default.parseExpression(config.cron, { tz: config.timezone });
            const nextRun = this.calculateNextRun(config.cron, config.timezone);
            const fullConfig = {
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
        }
        catch (error) {
            logger.error(`Failed to schedule job '${config.name}'`, {
                error: error.message,
                config,
            });
            throw new Error(`Invalid cron expression or configuration: ${error.message}`);
        }
    }
    updateScheduledJob(name, updates) {
        const existingConfig = this.scheduledJobs.get(name);
        if (!existingConfig) {
            logger.error(`Scheduled job '${name}' not found`);
            return false;
        }
        try {
            const updatedConfig = { ...existingConfig, ...updates };
            if (updates.cron && updates.cron !== existingConfig.cron) {
                cron_parser_1.default.parseExpression(updates.cron, { tz: updatedConfig.timezone });
                updatedConfig.nextRun = this.calculateNextRun(updates.cron, updatedConfig.timezone);
                this.nextExecutions.set(name, updatedConfig.nextRun);
            }
            this.scheduledJobs.set(name, updatedConfig);
            logger.info(`Scheduled job updated: '${name}'`, { updates });
            this.emit('job:updated', { configName: name, config: updatedConfig });
            return true;
        }
        catch (error) {
            logger.error(`Failed to update scheduled job '${name}'`, {
                error: error.message,
                updates,
            });
            return false;
        }
    }
    toggleScheduledJob(name, enabled) {
        return this.updateScheduledJob(name, { enabled });
    }
    removeScheduledJob(name) {
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
    async executeJobNow(name) {
        const config = this.scheduledJobs.get(name);
        const queue = this.queues.get(name);
        if (!config || !queue) {
            logger.error(`Scheduled job '${name}' not found`);
            return null;
        }
        return await this.executeScheduledJob(config, queue, true);
    }
    getScheduledJobs() {
        return Array.from(this.scheduledJobs.values());
    }
    getScheduledJob(name) {
        return this.scheduledJobs.get(name);
    }
    getExecutionHistory(name, limit = 50) {
        const history = this.executionHistory.get(name) || [];
        return history.slice(-limit);
    }
    getSchedulerStats() {
        const allExecutions = Array.from(this.executionHistory.values()).flat();
        const activeJobs = Array.from(this.scheduledJobs.values()).filter(job => job.enabled).length;
        const successfulExecutions = allExecutions.filter(exec => exec.success).length;
        const failedExecutions = allExecutions.filter(exec => !exec.success).length;
        const executionsWithDuration = allExecutions.filter(exec => exec.duration !== undefined);
        const averageExecutionTime = executionsWithDuration.length > 0
            ? executionsWithDuration.reduce((sum, exec) => sum + (exec.duration || 0), 0) / executionsWithDuration.length
            : 0;
        let nextExecution;
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
    getUpcomingExecutions(withinMinutes = 60) {
        const now = new Date();
        const cutoff = new Date(now.getTime() + withinMinutes * 60 * 1000);
        const upcoming = [];
        for (const [name, scheduledFor] of this.nextExecutions) {
            const config = this.scheduledJobs.get(name);
            if (config?.enabled && scheduledFor >= now && scheduledFor <= cutoff) {
                upcoming.push({ configName: name, scheduledFor, config });
            }
        }
        return upcoming.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
    }
    static validateCronExpression(cron, timezone) {
        try {
            cron_parser_1.default.parseExpression(cron, { tz: timezone });
            return true;
        }
        catch {
            return false;
        }
    }
    static getNextExecutions(cron, count = 5, timezone) {
        try {
            const interval = cron_parser_1.default.parseExpression(cron, { tz: timezone });
            const executions = [];
            for (let i = 0; i < count; i++) {
                executions.push(interval.next().toDate());
            }
            return executions;
        }
        catch (error) {
            throw new Error(`Invalid cron expression: ${error.message}`);
        }
    }
    startScheduler() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.schedulerInterval = setInterval(() => {
            this.processScheduledJobs();
        }, this.checkInterval);
        logger.info('Job scheduler started', { checkInterval: this.checkInterval });
    }
    async processScheduledJobs() {
        const now = new Date();
        for (const [name, config] of this.scheduledJobs) {
            if (!config.enabled)
                continue;
            const nextExecution = this.nextExecutions.get(name);
            if (!nextExecution || nextExecution > now)
                continue;
            const queue = this.queues.get(name);
            if (!queue) {
                logger.error(`Queue not found for scheduled job '${name}'`);
                continue;
            }
            try {
                await this.executeScheduledJob(config, queue);
                const nextRun = this.calculateNextRun(config.cron, config.timezone);
                this.nextExecutions.set(name, nextRun);
                const updatedConfig = { ...config, lastRun: now, nextRun };
                this.scheduledJobs.set(name, updatedConfig);
            }
            catch (error) {
                logger.error(`Failed to execute scheduled job '${name}'`, { error });
                this.recordExecution(name, {
                    configName: name,
                    executionId: `${name}-${now.getTime()}`,
                    scheduledFor: nextExecution,
                    executedAt: now,
                    success: false,
                    error: error.message,
                });
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
    async executeScheduledJob(config, queue, manual = false) {
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
            const jobOptions = {
                priority: 5,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: 50,
                removeOnFail: 25,
                tags: ['scheduled', config.name],
            };
            const job = await queue.add(`scheduled-${config.name}`, {
                ...config.data,
                _scheduledJob: {
                    configName: config.name,
                    executionId,
                    scheduledFor: scheduledFor.toISOString(),
                    manual,
                },
            }, jobOptions);
            const duration = Date.now() - startTime;
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
            return job.id;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error.message;
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
    calculateNextRun(cron, timezone) {
        const interval = cron_parser_1.default.parseExpression(cron, { tz: timezone });
        return interval.next().toDate();
    }
    recordExecution(name, execution) {
        if (!this.executionHistory.has(name)) {
            this.executionHistory.set(name, []);
        }
        const history = this.executionHistory.get(name);
        history.push(execution);
        if (history.length > this.maxHistoryPerJob) {
            history.splice(0, history.length - this.maxHistoryPerJob);
        }
    }
    getRecentFailures(name) {
        const history = this.executionHistory.get(name) || [];
        const recentHistory = history.slice(-this.maxMissedExecutions);
        return recentHistory.filter(exec => !exec.success).length;
    }
    stop() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
        this.isRunning = false;
        logger.info('Job scheduler stopped');
    }
    async close() {
        this.stop();
        this.removeAllListeners();
        logger.info('Job Scheduler closed');
    }
}
exports.JobScheduler = JobScheduler;
exports.default = JobScheduler;
//# sourceMappingURL=job-scheduler.js.map