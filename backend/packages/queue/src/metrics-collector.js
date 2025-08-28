"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
const prom_client_1 = require("prom-client");
const logger_1 = require("@fineprintai/logger");
const types_1 = require("@fineprintai/types");
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const logger = (0, logger_1.createServiceLogger)('metrics-collector');
class MetricsCollector extends eventemitter3_1.default {
    config;
    queues = new Map();
    queueEvents = new Map();
    metricsCache = new Map();
    timeSeriesData = new Map();
    collectInterval = null;
    prometheusMetrics = {
        jobsTotal: new prom_client_1.Counter({
            name: 'fineprint_queue_jobs_total',
            help: 'Total number of jobs processed',
            labelNames: ['queue', 'status', 'subscription_tier', 'job_name'],
        }),
        jobDuration: new prom_client_1.Histogram({
            name: 'fineprint_queue_job_duration_seconds',
            help: 'Job processing duration in seconds',
            labelNames: ['queue', 'job_name', 'subscription_tier'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
        }),
        queueDepth: new prom_client_1.Gauge({
            name: 'fineprint_queue_depth',
            help: 'Current queue depth by status',
            labelNames: ['queue', 'status'],
        }),
        activeWorkers: new prom_client_1.Gauge({
            name: 'fineprint_queue_active_workers',
            help: 'Number of active workers',
            labelNames: ['queue'],
        }),
        jobWaitTime: new prom_client_1.Histogram({
            name: 'fineprint_queue_job_wait_time_seconds',
            help: 'Time jobs spend waiting in queue',
            labelNames: ['queue', 'subscription_tier'],
            buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
        }),
        errorRate: new prom_client_1.Gauge({
            name: 'fineprint_queue_error_rate',
            help: 'Error rate percentage',
            labelNames: ['queue'],
        }),
        throughput: new prom_client_1.Gauge({
            name: 'fineprint_queue_throughput_jobs_per_minute',
            help: 'Queue throughput in jobs per minute',
            labelNames: ['queue'],
        }),
        memoryUsage: new prom_client_1.Gauge({
            name: 'fineprint_queue_memory_usage_bytes',
            help: 'Memory usage of queue system',
            labelNames: ['queue'],
        }),
        workerUtilization: new prom_client_1.Gauge({
            name: 'fineprint_queue_worker_utilization',
            help: 'Worker utilization percentage',
            labelNames: ['queue'],
        }),
    };
    constructor(config = {}) {
        super();
        this.config = {
            collectInterval: config.collectInterval || 30000,
            retentionDays: config.retentionDays || 7,
            enablePrometheus: config.enablePrometheus ?? true,
            enableCustomMetrics: config.enableCustomMetrics ?? true,
        };
        if (this.config.enablePrometheus) {
            this.registerPrometheusMetrics();
        }
        this.startCollection();
        this.startCleanup();
        logger.info('Metrics Collector initialized', { config: this.config });
    }
    registerQueue(queueName, queue, queueEvents) {
        this.queues.set(queueName, queue);
        this.queueEvents.set(queueName, queueEvents);
        this.setupQueueEventListeners(queueName, queueEvents);
        logger.info(`Queue '${queueName}' registered for metrics collection`);
    }
    async getQueueMetrics(queueName) {
        const cached = this.metricsCache.get(queueName);
        if (cached && Date.now() - cached.lastUpdated.getTime() < this.config.collectInterval / 2) {
            return cached;
        }
        return await this.collectQueueMetrics(queueName);
    }
    getHistoricalMetrics(queueName, since, until) {
        const data = this.timeSeriesData.get(queueName) || [];
        return data.filter(entry => {
            if (since && entry.timestamp < since)
                return false;
            if (until && entry.timestamp > until)
                return false;
            return true;
        });
    }
    async getAggregatedMetrics() {
        const allMetrics = await Promise.all(Array.from(this.queues.keys()).map(queueName => this.getQueueMetrics(queueName)));
        const validMetrics = allMetrics.filter(m => m !== null);
        return {
            totalJobs: validMetrics.reduce((sum, m) => sum + m.totalJobs, 0),
            totalThroughput: validMetrics.reduce((sum, m) => sum + m.throughput, 0),
            avgErrorRate: validMetrics.length > 0
                ? validMetrics.reduce((sum, m) => sum + m.errorRate, 0) / validMetrics.length
                : 0,
            totalActiveWorkers: validMetrics.reduce((sum, m) => sum + m.activeJobs, 0),
            queueCount: validMetrics.length,
            healthyQueues: validMetrics.filter(m => m.errorRate < 5).length,
        };
    }
    async getPerformanceInsights(queueName) {
        const metrics = await this.getQueueMetrics(queueName);
        if (!metrics) {
            return {
                status: 'critical',
                insights: ['Queue not found or no metrics available'],
                recommendations: ['Check queue configuration and ensure it\'s properly registered'],
                score: 0,
            };
        }
        const insights = [];
        const recommendations = [];
        let score = 100;
        if (metrics.errorRate > 10) {
            insights.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
            recommendations.push('Investigate failed jobs and improve error handling');
            score -= 30;
        }
        else if (metrics.errorRate > 5) {
            insights.push(`Moderate error rate: ${metrics.errorRate.toFixed(1)}%`);
            recommendations.push('Monitor error patterns and consider improving retry strategies');
            score -= 15;
        }
        if (metrics.throughput < 1) {
            insights.push('Very low throughput: less than 1 job per minute');
            recommendations.push('Consider increasing worker concurrency or optimizing job processing');
            score -= 20;
        }
        if (metrics.waitingJobs > 1000) {
            insights.push(`High queue backlog: ${metrics.waitingJobs} waiting jobs`);
            recommendations.push('Scale up workers or optimize job processing time');
            score -= 25;
        }
        else if (metrics.waitingJobs > 100) {
            insights.push(`Moderate queue backlog: ${metrics.waitingJobs} waiting jobs`);
            recommendations.push('Monitor queue depth and consider scaling if trend continues');
            score -= 10;
        }
        if (metrics.avgProcessingTime > 60000) {
            insights.push(`Slow processing: average ${(metrics.avgProcessingTime / 1000).toFixed(1)}s per job`);
            recommendations.push('Profile job processing to identify bottlenecks');
            score -= 15;
        }
        if (metrics.workerUtilization > 90) {
            insights.push('High worker utilization: workers may be overloaded');
            recommendations.push('Consider adding more workers or optimizing job processing');
            score -= 10;
        }
        else if (metrics.workerUtilization < 20) {
            insights.push('Low worker utilization: workers may be underutilized');
            recommendations.push('Consider reducing worker count to optimize resource usage');
            score -= 5;
        }
        let status;
        if (score >= 80) {
            status = 'healthy';
        }
        else if (score >= 60) {
            status = 'warning';
        }
        else {
            status = 'critical';
        }
        if (insights.length === 0) {
            insights.push('Queue is performing well');
        }
        return { status, insights, recommendations, score: Math.max(0, score) };
    }
    exportMetrics(queueName, format = 'json', since, until) {
        if (format === 'prometheus') {
            return prom_client_1.register.metrics();
        }
        const data = queueName
            ? this.getHistoricalMetrics(queueName, since, until)
            : Array.from(this.timeSeriesData.entries()).flatMap(([name, data]) => data.map(entry => ({ queueName: name, ...entry })));
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        else {
            if (data.length === 0)
                return '';
            const sample = data[0];
            const headers = Object.keys(sample).join(',');
            const rows = data.map(entry => Object.values(entry)
                .map(value => `"${String(value).replace(/"/g, '""')}"`)
                .join(','));
            return [headers, ...rows].join('\n');
        }
    }
    async collectQueueMetrics(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue)
            return null;
        try {
            const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
                queue.getWaiting(),
                queue.getActive(),
                queue.getCompleted(),
                queue.getFailed(),
                queue.getDelayed(),
                queue.getPaused(),
            ]);
            const throughput = await this.calculateThroughput(queueName, completed);
            const avgProcessingTime = await this.calculateAvgProcessingTime(completed);
            const errorRate = this.calculateErrorRate(completed, failed);
            const { p95, p99 } = this.calculatePercentiles(completed);
            const avgWaitTime = await this.calculateAvgWaitTime(completed);
            const tierDistribution = this.calculateTierDistribution(completed);
            const workerUtilization = this.calculateWorkerUtilization(active.length, queueName);
            const metrics = {
                queueName,
                totalJobs: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length,
                completedJobs: completed.length,
                failedJobs: failed.length,
                waitingJobs: waiting.length,
                activeJobs: active.length,
                delayedJobs: delayed.length,
                pausedJobs: paused.length,
                throughput,
                avgProcessingTime,
                errorRate,
                lastUpdated: new Date(),
                jobsPerSecond: throughput / 60,
                avgWaitTime,
                p95ProcessingTime: p95,
                p99ProcessingTime: p99,
                memoryUsage: process.memoryUsage().heapUsed,
                cpuUsage: process.cpuUsage().user / 1000000,
                errorsByType: await this.getErrorsByType(failed),
                tierDistribution,
                workerUtilization,
            };
            if (this.config.enablePrometheus) {
                this.updatePrometheusMetrics(metrics);
            }
            this.metricsCache.set(queueName, metrics);
            this.storeTimeSeriesData(queueName, metrics);
            this.emit('metrics:collected', { queueName, metrics });
            return metrics;
        }
        catch (error) {
            logger.error(`Failed to collect metrics for queue ${queueName}`, { error });
            return null;
        }
    }
    async calculateThroughput(queueName, completedJobs) {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const recentJobs = completedJobs.filter(job => job.finishedOn && job.finishedOn > oneHourAgo);
        return recentJobs.length;
    }
    async calculateAvgProcessingTime(completedJobs) {
        if (completedJobs.length === 0)
            return 0;
        const processingTimes = completedJobs
            .filter(job => job.processedOn && job.finishedOn)
            .map(job => job.finishedOn - job.processedOn);
        return processingTimes.length > 0
            ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
            : 0;
    }
    calculateErrorRate(completedJobs, failedJobs) {
        const total = completedJobs.length + failedJobs.length;
        return total > 0 ? (failedJobs.length / total) * 100 : 0;
    }
    calculatePercentiles(completedJobs) {
        const processingTimes = completedJobs
            .filter(job => job.processedOn && job.finishedOn)
            .map(job => job.finishedOn - job.processedOn)
            .sort((a, b) => a - b);
        if (processingTimes.length === 0) {
            return { p95: 0, p99: 0 };
        }
        const p95Index = Math.floor(processingTimes.length * 0.95);
        const p99Index = Math.floor(processingTimes.length * 0.99);
        return {
            p95: processingTimes[p95Index] || 0,
            p99: processingTimes[p99Index] || 0,
        };
    }
    async calculateAvgWaitTime(completedJobs) {
        const waitTimes = completedJobs
            .filter(job => job.timestamp && job.processedOn)
            .map(job => job.processedOn - job.timestamp);
        return waitTimes.length > 0
            ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
            : 0;
    }
    calculateTierDistribution(completedJobs) {
        const distribution = {
            [types_1.SubscriptionTier.FREE]: 0,
            [types_1.SubscriptionTier.STARTER]: 0,
            [types_1.SubscriptionTier.PROFESSIONAL]: 0,
            [types_1.SubscriptionTier.TEAM]: 0,
            [types_1.SubscriptionTier.ENTERPRISE]: 0,
        };
        completedJobs.forEach(job => {
            const tier = job.data?.subscriptionTier || types_1.SubscriptionTier.FREE;
            if (tier in distribution) {
                distribution[tier]++;
            }
        });
        return distribution;
    }
    calculateWorkerUtilization(activeJobs, queueName) {
        const estimatedCapacity = Math.max(activeJobs, 1) * 1.2;
        return Math.min((activeJobs / estimatedCapacity) * 100, 100);
    }
    async getErrorsByType(failedJobs) {
        const errorTypes = {};
        failedJobs.forEach(job => {
            if (job.failedReason) {
                const errorType = job.failedReason.split(':')[0] || 'Unknown';
                errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
            }
        });
        return errorTypes;
    }
    updatePrometheusMetrics(metrics) {
        const { queueName } = metrics;
        this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'waiting' }, metrics.waitingJobs);
        this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'active' }, metrics.activeJobs);
        this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'failed' }, metrics.failedJobs);
        this.prometheusMetrics.queueDepth.set({ queue: queueName, status: 'delayed' }, metrics.delayedJobs);
        this.prometheusMetrics.errorRate.set({ queue: queueName }, metrics.errorRate);
        this.prometheusMetrics.throughput.set({ queue: queueName }, metrics.throughput / 60);
        this.prometheusMetrics.memoryUsage.set({ queue: queueName }, metrics.memoryUsage);
        this.prometheusMetrics.workerUtilization.set({ queue: queueName }, metrics.workerUtilization);
    }
    setupQueueEventListeners(queueName, queueEvents) {
        queueEvents.on('completed', ({ jobId, returnvalue }) => {
            this.emit('job:completed', { queueName, jobId, returnvalue });
        });
        queueEvents.on('failed', ({ jobId, failedReason }) => {
            this.emit('job:failed', { queueName, jobId, failedReason });
        });
        queueEvents.on('progress', ({ jobId, data }) => {
            this.emit('job:progress', { queueName, jobId, progress: data });
        });
    }
    storeTimeSeriesData(queueName, metrics) {
        if (!this.timeSeriesData.has(queueName)) {
            this.timeSeriesData.set(queueName, []);
        }
        const data = this.timeSeriesData.get(queueName);
        data.push({ timestamp: new Date(), metrics });
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
        const filteredData = data.filter(entry => entry.timestamp > cutoff);
        this.timeSeriesData.set(queueName, filteredData);
    }
    startCollection() {
        this.collectInterval = setInterval(async () => {
            for (const queueName of this.queues.keys()) {
                try {
                    await this.collectQueueMetrics(queueName);
                }
                catch (error) {
                    logger.error(`Metrics collection failed for queue ${queueName}`, { error });
                }
            }
        }, this.config.collectInterval);
        logger.info('Metrics collection started', { interval: this.config.collectInterval });
    }
    startCleanup() {
        setInterval(() => {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
            for (const [queueName, data] of this.timeSeriesData) {
                const filteredData = data.filter(entry => entry.timestamp > cutoff);
                this.timeSeriesData.set(queueName, filteredData);
            }
            logger.debug('Metrics cleanup completed');
        }, 60 * 60 * 1000);
    }
    registerPrometheusMetrics() {
        Object.values(this.prometheusMetrics).forEach(metric => {
            prom_client_1.register.registerMetric(metric);
        });
        logger.info('Prometheus metrics registered');
    }
    async close() {
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.collectInterval = null;
        }
        for (const queueEvents of this.queueEvents.values()) {
            queueEvents.removeAllListeners();
        }
        logger.info('Metrics Collector closed');
    }
}
exports.MetricsCollector = MetricsCollector;
exports.default = MetricsCollector;
//# sourceMappingURL=metrics-collector.js.map