"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAnalyticsWorkers = setupAnalyticsWorkers;
exports.getQueueStatistics = getQueueStatistics;
exports.shutdownAnalyticsWorkers = shutdownAnalyticsWorkers;
const bull_1 = __importDefault(require("bull"));
const node_cron_1 = __importDefault(require("node-cron"));
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const data_warehouse_1 = require("@/services/data-warehouse");
let queues;
async function setupAnalyticsWorkers() {
    try {
        queues = {
            etlQueue: new bull_1.default('etl-jobs', {
                redis: {
                    host: config_1.config.redis.host,
                    port: config_1.config.redis.port,
                    password: config_1.config.redis.password,
                    db: config_1.config.redis.db
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
            metricsQueue: new bull_1.default('metrics-calculation', {
                redis: {
                    host: config_1.config.redis.host,
                    port: config_1.config.redis.port,
                    password: config_1.config.redis.password,
                    db: config_1.config.redis.db
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
            reportQueue: new bull_1.default('report-generation', {
                redis: {
                    host: config_1.config.redis.host,
                    port: config_1.config.redis.port,
                    password: config_1.config.redis.password,
                    db: config_1.config.redis.db
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
            dataQualityQueue: new bull_1.default('data-quality', {
                redis: {
                    host: config_1.config.redis.host,
                    port: config_1.config.redis.port,
                    password: config_1.config.redis.password,
                    db: config_1.config.redis.db
                },
                defaultJobOptions: {
                    removeOnComplete: 5,
                    removeOnFail: 20,
                    attempts: 1
                }
            }),
            archiveQueue: new bull_1.default('data-archive', {
                redis: {
                    host: config_1.config.redis.host,
                    port: config_1.config.redis.port,
                    password: config_1.config.redis.password,
                    db: config_1.config.redis.db
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
        await setupQueueProcessors();
        setupCronJobs();
        setupQueueMonitoring();
        logger_1.analyticsLogger.event('analytics_workers_initialized', {
            queueCount: Object.keys(queues).length
        });
    }
    catch (error) {
        logger_1.analyticsLogger.error(error, { context: 'setup_analytics_workers' });
        throw error;
    }
}
async function setupQueueProcessors() {
    queues.etlQueue.process('execute-etl-job', 5, async (job) => {
        const { jobName } = job.data;
        try {
            logger_1.analyticsLogger.event('etl_job_started', { jobName });
            await data_warehouse_1.dataWarehouseService.executeETLJob(jobName);
            logger_1.analyticsLogger.event('etl_job_completed', { jobName });
            return { success: true, jobName };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'etl_job_processor',
                jobName
            });
            throw error;
        }
    });
    queues.metricsQueue.process('calculate-business-metrics', 2, async (job) => {
        const { startDate, endDate, granularity } = job.data;
        try {
            logger_1.analyticsLogger.event('metrics_calculation_started', {
                startDate,
                endDate,
                granularity
            });
            const metrics = await data_warehouse_1.dataWarehouseService.getBusinessMetrics(new Date(startDate), new Date(endDate), granularity);
            await storeCalculatedMetrics(metrics);
            logger_1.analyticsLogger.event('metrics_calculation_completed', {
                metricsCount: metrics.length
            });
            return { success: true, metricsCount: metrics.length };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'metrics_calculation_processor'
            });
            throw error;
        }
    });
    queues.reportQueue.process('generate-report', 1, async (job) => {
        const { reportId, reportType, configuration } = job.data;
        try {
            logger_1.analyticsLogger.event('report_generation_started', {
                reportId,
                reportType
            });
            const reportData = await generateReport(reportType, configuration);
            await processGeneratedReport(reportId, reportData, configuration);
            logger_1.analyticsLogger.event('report_generation_completed', {
                reportId,
                reportType
            });
            return { success: true, reportId };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'report_generation_processor',
                reportId
            });
            throw error;
        }
    });
    queues.dataQualityQueue.process('run-quality-checks', 3, async (job) => {
        try {
            logger_1.analyticsLogger.event('data_quality_checks_started', {});
            const results = await data_warehouse_1.dataWarehouseService.runDataQualityChecks();
            await processDataQualityResults(results);
            logger_1.analyticsLogger.event('data_quality_checks_completed', {
                checksCount: results.length,
                failedChecks: results.filter(r => !r.passed).length
            });
            return { success: true, results };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'data_quality_processor'
            });
            throw error;
        }
    });
    queues.archiveQueue.process('archive-old-data', 1, async (job) => {
        const { tableName, retentionDays } = job.data;
        try {
            logger_1.analyticsLogger.event('data_archive_started', {
                tableName,
                retentionDays
            });
            const archivedCount = await archiveOldData(tableName, retentionDays);
            logger_1.analyticsLogger.event('data_archive_completed', {
                tableName,
                archivedCount
            });
            return { success: true, archivedCount };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'data_archive_processor',
                tableName
            });
            throw error;
        }
    });
}
function setupCronJobs() {
    node_cron_1.default.schedule('0 2 * * *', async () => {
        try {
            await queues.etlQueue.add('execute-etl-job', {
                jobName: 'user_metrics_daily'
            });
            await queues.etlQueue.add('execute-etl-job', {
                jobName: 'revenue_metrics_daily'
            });
            logger_1.analyticsLogger.event('daily_etl_jobs_scheduled', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'daily_etl_cron' });
        }
    });
    node_cron_1.default.schedule('*/15 * * * *', async () => {
        try {
            await queues.etlQueue.add('execute-etl-job', {
                jobName: 'document_analysis_metrics'
            });
            logger_1.analyticsLogger.event('realtime_etl_job_scheduled', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'realtime_etl_cron' });
        }
    });
    node_cron_1.default.schedule('0 * * * *', async () => {
        try {
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
            await queues.metricsQueue.add('calculate-business-metrics', {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                granularity: 'hour'
            });
            logger_1.analyticsLogger.event('hourly_metrics_calculation_scheduled', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'hourly_metrics_cron' });
        }
    });
    node_cron_1.default.schedule('0 */6 * * *', async () => {
        try {
            await queues.dataQualityQueue.add('run-quality-checks', {});
            logger_1.analyticsLogger.event('data_quality_checks_scheduled', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'data_quality_cron' });
        }
    });
    if (config_1.config.reporting.enableAutomatedReports) {
        node_cron_1.default.schedule(config_1.config.reporting.reportSchedule, async () => {
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
                logger_1.analyticsLogger.event('weekly_report_scheduled', {});
            }
            catch (error) {
                logger_1.analyticsLogger.error(error, { context: 'weekly_report_cron' });
            }
        });
    }
    node_cron_1.default.schedule('0 3 * * *', async () => {
        try {
            const tables = [
                { name: 'analytics_events', retentionDays: config_1.config.privacy.dataRetentionDays },
                { name: 'user_sessions', retentionDays: 90 },
                { name: 'audit_logs', retentionDays: 365 }
            ];
            for (const table of tables) {
                await queues.archiveQueue.add('archive-old-data', {
                    tableName: table.name,
                    retentionDays: table.retentionDays
                });
            }
            logger_1.analyticsLogger.event('data_archiving_scheduled', {
                tableCount: tables.length
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'data_archiving_cron' });
        }
    });
}
function setupQueueMonitoring() {
    Object.entries(queues).forEach(([queueName, queue]) => {
        queue.on('completed', (job, result) => {
            logger_1.analyticsLogger.event('job_completed', {
                queueName,
                jobId: job.id,
                jobType: job.name,
                duration: Date.now() - job.timestamp,
                result
            });
        });
        queue.on('failed', (job, error) => {
            logger_1.analyticsLogger.error(error, {
                context: 'job_failed',
                queueName,
                jobId: job.id,
                jobType: job.name,
                attempts: job.attemptsMade
            });
        });
        queue.on('stalled', (job) => {
            logger_1.analyticsLogger.event('job_stalled', {
                queueName,
                jobId: job.id,
                jobType: job.name
            });
        });
    });
}
async function storeCalculatedMetrics(metrics) {
}
async function generateReport(reportType, configuration) {
    switch (reportType) {
        case 'executive_summary':
            return generateExecutiveSummaryReport(configuration);
        case 'user_engagement':
            return generateUserEngagementReport(configuration);
        default:
            throw new Error(`Unknown report type: ${reportType}`);
    }
}
async function generateExecutiveSummaryReport(configuration) {
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
async function generateUserEngagementReport(configuration) {
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
async function processGeneratedReport(reportId, reportData, configuration) {
    logger_1.analyticsLogger.event('report_processed', {
        reportId,
        format: configuration.format,
        recipientCount: configuration.recipients?.length || 0
    });
}
async function processDataQualityResults(results) {
    const failedChecks = results.filter(r => !r.passed);
    if (failedChecks.length > 0) {
        logger_1.analyticsLogger.event('data_quality_issues_detected', {
            failedChecksCount: failedChecks.length,
            issues: failedChecks.map(check => ({
                checkId: check.checkId,
                score: check.score,
                issueCount: check.issues.length
            }))
        });
    }
}
async function archiveOldData(tableName, retentionDays) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    logger_1.analyticsLogger.event('data_archived', {
        tableName,
        cutoffDate: cutoffDate.toISOString(),
        retentionDays
    });
    return 0;
}
async function getQueueStatistics() {
    const stats = {};
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
async function shutdownAnalyticsWorkers() {
    try {
        const shutdownPromises = Object.entries(queues).map(async ([queueName, queue]) => {
            await queue.close();
            logger_1.analyticsLogger.event('queue_closed', { queueName });
        });
        await Promise.all(shutdownPromises);
        logger_1.analyticsLogger.event('analytics_workers_shutdown', {});
    }
    catch (error) {
        logger_1.analyticsLogger.error(error, { context: 'shutdown_analytics_workers' });
    }
}
//# sourceMappingURL=index.js.map