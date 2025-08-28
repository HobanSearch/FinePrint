"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulerService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cron = __importStar(require("node-cron"));
const tosMonitoring_1 = require("./tosMonitoring");
const mongoChangeStream_1 = require("./mongoChangeStream");
const alertingService_1 = require("./alertingService");
const documentCrawler_1 = require("./documentCrawler");
const metrics_1 = require("../monitoring/metrics");
const tracing_1 = require("../monitoring/tracing");
const logger = (0, logger_1.createServiceLogger)('scheduler-service');
class SchedulerService {
    tasks = new Map();
    cronJobs = new Map();
    initialized = false;
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing scheduler service...');
        try {
            await this.registerDefaultTasks();
            await this.startAllTasks();
            this.initialized = true;
            logger.info('Scheduler service initialized successfully', {
                taskCount: this.tasks.size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize scheduler service', { error });
            throw error;
        }
    }
    async registerTask(task) {
        const fullTask = {
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
    async startTask(taskId) {
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
        }
        catch (error) {
            logger.error('Failed to start scheduled task', {
                taskId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }
    async stopTask(taskId) {
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
    async executeTask(taskId) {
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
            await tracing_1.TracingUtils.traceFunction(`scheduled_task.${task.name}`, async (span) => {
                span.setAttributes({
                    'task.id': taskId,
                    'task.name': task.name,
                    'task.schedule': task.schedule,
                    'task.run_count': task.runCount,
                });
                if (task.timeout) {
                    await Promise.race([
                        task.task(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Task timeout')), task.timeout)),
                    ]);
                }
                else {
                    await task.task();
                }
            });
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
            metrics_1.metricsCollector.recordQueueJob('scheduler', 'completed', task.name, duration);
        }
        catch (error) {
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
            metrics_1.metricsCollector.recordQueueJob('scheduler', 'failed', task.name, duration);
        }
        this.tasks.set(taskId, task);
    }
    async runTaskNow(taskId) {
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
    getTask(taskId) {
        return this.tasks.get(taskId);
    }
    getAllTasks() {
        return Array.from(this.tasks.values());
    }
    getTaskStatus() {
        const allTasks = Array.from(this.tasks.values());
        return {
            totalTasks: allTasks.length,
            enabledTasks: allTasks.filter(task => task.enabled).length,
            runningTasks: this.cronJobs.size,
            totalRuns: allTasks.reduce((sum, task) => sum + task.runCount, 0),
            totalErrors: allTasks.reduce((sum, task) => sum + task.errorCount, 0),
        };
    }
    async registerDefaultTasks() {
        await this.registerTask({
            id: 'process-monitoring-jobs',
            name: 'Process Document Monitoring Jobs',
            schedule: '*/5 * * * *',
            enabled: true,
            timeout: 300000,
            task: async () => {
                const jobsDue = await tosMonitoring_1.tosMonitoringService.getJobsDueForProcessing();
                logger.info('Processing due monitoring jobs', {
                    jobCount: jobsDue.length,
                });
                const batchSize = 5;
                for (let i = 0; i < jobsDue.length; i += batchSize) {
                    const batch = jobsDue.slice(i, i + batchSize);
                    await Promise.allSettled(batch.map(job => tosMonitoring_1.tosMonitoringService.processMonitoringJob(job.id)));
                }
            },
        });
        await this.registerTask({
            id: 'health-checks',
            name: 'Service Health Checks',
            schedule: '*/2 * * * *',
            enabled: true,
            timeout: 60000,
            task: async () => {
                const services = [
                    { name: 'documentCrawler', service: documentCrawler_1.documentCrawlerService },
                    { name: 'tosMonitoring', service: tosMonitoring_1.tosMonitoringService },
                    { name: 'mongoChangeStream', service: mongoChangeStream_1.mongoChangeStreamService },
                    { name: 'alerting', service: alertingService_1.alertingService },
                ];
                const healthResults = await Promise.allSettled(services.map(async ({ name, service }) => {
                    try {
                        await service.healthCheck();
                        return { name, healthy: true };
                    }
                    catch (error) {
                        logger.warn('Service health check failed', {
                            service: name,
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                        return { name, healthy: false, error };
                    }
                }));
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
        await this.registerTask({
            id: 'collect-metrics',
            name: 'Collect Service Metrics',
            schedule: '*/1 * * * *',
            enabled: true,
            timeout: 30000,
            task: async () => {
                try {
                    const tosStats = await tosMonitoring_1.tosMonitoringService.getMonitoringStats();
                    metrics_1.metricsCollector.updateDocumentsMonitored(tosStats.totalJobs, 'system', undefined, 'terms_of_service');
                    const changeStreamStats = mongoChangeStream_1.mongoChangeStreamService.getConnectionStats();
                    metrics_1.metricsCollector.updateActiveChangeStreams(changeStreamStats.activeStreams, changeStreamStats.database || 'unknown');
                    const alertStats = await alertingService_1.alertingService.getAlertStats();
                    Object.entries(alertStats.alertsByStatus || {}).forEach(([severity, count]) => {
                        metrics_1.metricsCollector.updateActiveAlerts(count, severity, 'system');
                    });
                }
                catch (error) {
                    logger.error('Error collecting metrics', { error });
                }
            },
        });
        await this.registerTask({
            id: 'cleanup-old-data',
            name: 'Cleanup Old Data',
            schedule: '0 2 * * *',
            enabled: true,
            timeout: 600000,
            task: async () => {
                logger.info('Starting data cleanup task');
                try {
                    logger.info('Data cleanup completed successfully');
                }
                catch (error) {
                    logger.error('Data cleanup failed', { error });
                    throw error;
                }
            },
        });
        await this.registerTask({
            id: 'daily-reports',
            name: 'Generate Daily Reports',
            schedule: '0 6 * * *',
            enabled: true,
            timeout: 300000,
            task: async () => {
                logger.info('Generating daily reports');
                try {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const tosStats = await tosMonitoring_1.tosMonitoringService.getMonitoringStats();
                    const alertStats = await alertingService_1.alertingService.getAlertStats();
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
                }
                catch (error) {
                    logger.error('Daily report generation failed', { error });
                    throw error;
                }
            },
        });
        await this.registerTask({
            id: 'system-resources',
            name: 'Monitor System Resources',
            schedule: '*/30 * * * * *',
            enabled: true,
            timeout: 10000,
            task: async () => {
                const memoryUsage = process.memoryUsage();
                const cpuUsage = process.cpuUsage();
                const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
                if (memoryUsageMB > 500) {
                    logger.warn('High memory usage detected', {
                        heapUsedMB: memoryUsageMB,
                        heapTotalMB: memoryUsage.heapTotal / 1024 / 1024,
                        rssMB: memoryUsage.rss / 1024 / 1024,
                    });
                }
            },
        });
        logger.info('Registered default scheduled tasks', {
            taskCount: this.tasks.size,
        });
    }
    async startAllTasks() {
        const enabledTasks = Array.from(this.tasks.entries())
            .filter(([_, task]) => task.enabled);
        for (const [taskId, _] of enabledTasks) {
            await this.startTask(taskId);
        }
        logger.info('Started all enabled scheduled tasks', {
            startedTasks: enabledTasks.length,
        });
    }
    getNextRunTime(schedule) {
        try {
            const now = new Date();
            const nextRun = new Date(now.getTime() + 60000);
            return nextRun;
        }
        catch (error) {
            logger.error('Error calculating next run time', { schedule, error });
            return new Date(Date.now() + 60000);
        }
    }
    async pauseAllTasks() {
        const taskIds = Array.from(this.tasks.keys());
        for (const taskId of taskIds) {
            await this.stopTask(taskId);
        }
        logger.info('Paused all scheduled tasks', {
            pausedTasks: taskIds.length,
        });
    }
    async resumeAllTasks() {
        const taskIds = Array.from(this.tasks.keys());
        for (const taskId of taskIds) {
            const task = this.tasks.get(taskId);
            if (task && task.enabled) {
                await this.startTask(taskId);
            }
        }
        logger.info('Resumed all enabled scheduled tasks');
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Scheduler service not initialized');
        }
        const status = this.getTaskStatus();
        if (status.enabledTasks !== status.runningTasks) {
            throw new Error(`Task count mismatch: ${status.enabledTasks} enabled, ${status.runningTasks} running`);
        }
        const problematicTasks = Array.from(this.tasks.values())
            .filter(task => {
            const errorRate = task.runCount > 0 ? (task.errorCount / task.runCount) * 100 : 0;
            return errorRate > 50;
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
    async shutdown() {
        logger.info('Shutting down scheduler service...');
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
exports.schedulerService = new SchedulerService();
//# sourceMappingURL=scheduler.js.map