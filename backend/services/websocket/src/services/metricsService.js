"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const logger = (0, logger_1.createServiceLogger)('metrics-service');
class MetricsService {
    counters = new Map();
    counterLabels = new Map();
    gauges = new Map();
    gaugeLabels = new Map();
    histograms = new Map();
    histogramLabels = new Map();
    initialized = false;
    metricsInterval = null;
    constructor() { }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.loadPersistedMetrics();
            this.startMetricsCollection();
            this.startCleanupJob();
            this.initialized = true;
            logger.info('Metrics service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize metrics service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
                this.metricsInterval = null;
            }
            await this.persistMetrics();
            this.counters.clear();
            this.counterLabels.clear();
            this.gauges.clear();
            this.gaugeLabels.clear();
            this.histograms.clear();
            this.histogramLabels.clear();
            this.initialized = false;
            logger.info('Metrics service shut down successfully');
        }
        catch (error) {
            logger.error('Error during metrics service shutdown', { error });
        }
    }
    incrementCounter(name, labels = {}, value = 1) {
        try {
            const key = this.generateMetricKey(name, labels);
            const current = this.counters.get(key) || 0;
            this.counters.set(key, current + value);
            this.counterLabels.set(key, labels);
            this.updateCachedMetric('counter', key, current + value, labels);
        }
        catch (error) {
            logger.error('Error incrementing counter', { error, name, labels, value });
        }
    }
    getCounter(name, labels = {}) {
        const key = this.generateMetricKey(name, labels);
        return this.counters.get(key) || 0;
    }
    resetCounter(name, labels = {}) {
        const key = this.generateMetricKey(name, labels);
        this.counters.set(key, 0);
        this.updateCachedMetric('counter', key, 0, labels);
    }
    recordGauge(name, value, labels = {}) {
        try {
            const key = this.generateMetricKey(name, labels);
            this.gauges.set(key, value);
            this.gaugeLabels.set(key, labels);
            this.updateCachedMetric('gauge', key, value, labels);
        }
        catch (error) {
            logger.error('Error recording gauge', { error, name, value, labels });
        }
    }
    getGauge(name, labels = {}) {
        const key = this.generateMetricKey(name, labels);
        return this.gauges.get(key) || 0;
    }
    incrementGauge(name, labels = {}, value = 1) {
        const key = this.generateMetricKey(name, labels);
        const current = this.gauges.get(key) || 0;
        this.recordGauge(name, current + value, labels);
    }
    decrementGauge(name, labels = {}, value = 1) {
        const key = this.generateMetricKey(name, labels);
        const current = this.gauges.get(key) || 0;
        this.recordGauge(name, current - value, labels);
    }
    recordHistogram(name, value, labels = {}) {
        try {
            const key = this.generateMetricKey(name, labels);
            const values = this.histograms.get(key) || [];
            values.push(value);
            if (values.length > 1000) {
                values.shift();
            }
            this.histograms.set(key, values);
            this.histogramLabels.set(key, labels);
        }
        catch (error) {
            logger.error('Error recording histogram', { error, name, value, labels });
        }
    }
    getHistogramStats(name, labels = {}) {
        const key = this.generateMetricKey(name, labels);
        const values = this.histograms.get(key) || [];
        if (values.length === 0) {
            return {
                count: 0,
                sum: 0,
                avg: 0,
                min: 0,
                max: 0,
                p50: 0,
                p95: 0,
                p99: 0,
            };
        }
        const sorted = [...values].sort((a, b) => a - b);
        const sum = values.reduce((acc, val) => acc + val, 0);
        return {
            count: values.length,
            sum,
            avg: sum / values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: this.percentile(sorted, 0.5),
            p95: this.percentile(sorted, 0.95),
            p99: this.percentile(sorted, 0.99),
        };
    }
    recordConnectionEvent(event, userId, teamId) {
        const labels = { event };
        if (teamId)
            labels.teamId = teamId;
        this.incrementCounter('websocket_connection_events_total', labels);
        if (event === 'connect') {
            this.incrementGauge('websocket_active_connections');
            if (userId) {
                this.recordGauge(`websocket_user_connections_${userId}`, 1);
            }
        }
        else {
            this.decrementGauge('websocket_active_connections');
            if (userId) {
                this.recordGauge(`websocket_user_connections_${userId}`, 0);
            }
        }
    }
    recordMessageEvent(type, messageType, userId, teamId) {
        const labels = { type, messageType };
        if (teamId)
            labels.teamId = teamId;
        this.incrementCounter('websocket_messages_total', labels);
        if (type === 'sent' || type === 'failed') {
            const processingTime = Date.now();
            this.recordHistogram('websocket_message_processing_duration_ms', processingTime, { messageType });
        }
    }
    recordAuthEvent(event, reason) {
        const labels = { event };
        if (reason)
            labels.reason = reason;
        this.incrementCounter('websocket_auth_events_total', labels);
    }
    recordRateLimitEvent(rule, action) {
        this.incrementCounter('websocket_rate_limit_events_total', { rule, action });
    }
    recordQueueStats(queueName, stats) {
        const labels = { queue: queueName };
        this.recordGauge('websocket_queue_waiting_jobs', stats.waiting, labels);
        this.recordGauge('websocket_queue_active_jobs', stats.active, labels);
        this.recordGauge('websocket_queue_completed_jobs', stats.completed, labels);
        this.recordGauge('websocket_queue_failed_jobs', stats.failed, labels);
    }
    recordSystemMetrics() {
        const memUsage = process.memoryUsage();
        this.recordGauge('websocket_memory_heap_used_bytes', memUsage.heapUsed);
        this.recordGauge('websocket_memory_heap_total_bytes', memUsage.heapTotal);
        this.recordGauge('websocket_memory_external_bytes', memUsage.external);
        this.recordGauge('websocket_memory_rss_bytes', memUsage.rss);
        this.recordGauge('websocket_uptime_seconds', process.uptime());
        const cpuUsage = process.cpuUsage();
        this.recordGauge('websocket_cpu_user_microseconds', cpuUsage.user);
        this.recordGauge('websocket_cpu_system_microseconds', cpuUsage.system);
    }
    getMetricsSnapshot() {
        const counters = [];
        const gauges = [];
        const histograms = [];
        for (const [key, value] of this.counters) {
            const labels = this.counterLabels.get(key) || {};
            const name = this.extractMetricName(key);
            counters.push({ name, value, labels });
        }
        for (const [key, value] of this.gauges) {
            const labels = this.gaugeLabels.get(key) || {};
            const name = this.extractMetricName(key);
            gauges.push({ name, value, labels });
        }
        for (const [key, values] of this.histograms) {
            const labels = this.histogramLabels.get(key) || {};
            const name = this.extractMetricName(key);
            const stats = this.getHistogramStats(name, labels);
            histograms.push({
                name,
                buckets: {
                    '0.1': values.filter(v => v <= 100).length,
                    '0.5': values.filter(v => v <= 500).length,
                    '1': values.filter(v => v <= 1000).length,
                    '5': values.filter(v => v <= 5000).length,
                    '10': values.filter(v => v <= 10000).length,
                    '+Inf': values.length,
                },
                count: stats.count,
                sum: stats.sum,
                labels,
            });
        }
        return {
            timestamp: new Date(),
            counters,
            gauges,
            histograms,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        };
    }
    getPrometheusMetrics() {
        const snapshot = this.getMetricsSnapshot();
        let output = '';
        for (const counter of snapshot.counters) {
            output += `# HELP ${counter.name} Counter metric\n`;
            output += `# TYPE ${counter.name} counter\n`;
            const labelsStr = this.formatLabels(counter.labels);
            output += `${counter.name}${labelsStr} ${counter.value}\n`;
        }
        for (const gauge of snapshot.gauges) {
            output += `# HELP ${gauge.name} Gauge metric\n`;
            output += `# TYPE ${gauge.name} gauge\n`;
            const labelsStr = this.formatLabels(gauge.labels);
            output += `${gauge.name}${labelsStr} ${gauge.value}\n`;
        }
        for (const histogram of snapshot.histograms) {
            output += `# HELP ${histogram.name} Histogram metric\n`;
            output += `# TYPE ${histogram.name} histogram\n`;
            const labelsStr = this.formatLabels(histogram.labels);
            for (const [bucket, count] of Object.entries(histogram.buckets)) {
                const bucketLabels = { ...histogram.labels, le: bucket };
                const bucketLabelsStr = this.formatLabels(bucketLabels);
                output += `${histogram.name}_bucket${bucketLabelsStr} ${count}\n`;
            }
            output += `${histogram.name}_count${labelsStr} ${histogram.count}\n`;
            output += `${histogram.name}_sum${labelsStr} ${histogram.sum}\n`;
        }
        return output;
    }
    async getHealthStatus() {
        try {
            return {
                healthy: this.initialized,
                details: {
                    initialized: this.initialized,
                    countersCount: this.counters.size,
                    gaugesCount: this.gauges.size,
                    histogramsCount: this.histograms.size,
                },
            };
        }
        catch (error) {
            logger.error('Error getting metrics health status', { error });
            return { healthy: false };
        }
    }
    generateMetricKey(name, labels) {
        const labelKeys = Object.keys(labels).sort();
        const labelString = labelKeys.map(key => `${key}=${labels[key]}`).join(',');
        return labelString ? `${name}{${labelString}}` : name;
    }
    extractMetricName(key) {
        const braceIndex = key.indexOf('{');
        return braceIndex > -1 ? key.substring(0, braceIndex) : key;
    }
    formatLabels(labels) {
        const keys = Object.keys(labels);
        if (keys.length === 0)
            return '';
        const pairs = keys.map(key => `${key}="${labels[key]}"`);
        return `{${pairs.join(',')}}`;
    }
    percentile(sortedArray, p) {
        if (sortedArray.length === 0)
            return 0;
        const index = (sortedArray.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) {
            return sortedArray[lower];
        }
        const weight = index - lower;
        return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    }
    async updateCachedMetric(type, key, value, labels) {
        try {
            const cacheKey = `metrics:${type}:${key}`;
            await cache_1.cache.set(cacheKey, { value, labels, timestamp: new Date() }, 3600);
        }
        catch (error) {
            logger.error('Error updating cached metric', { error, type, key });
        }
    }
    async loadPersistedMetrics() {
        try {
            const counterKeys = await cache_1.cache.keys('metrics:counter:*');
            for (const cacheKey of counterKeys) {
                const data = await cache_1.cache.get(cacheKey);
                if (data) {
                    const key = cacheKey.replace('metrics:counter:', '');
                    this.counters.set(key, data.value);
                    this.counterLabels.set(key, data.labels);
                }
            }
            const gaugeKeys = await cache_1.cache.keys('metrics:gauge:*');
            for (const cacheKey of gaugeKeys) {
                const data = await cache_1.cache.get(cacheKey);
                if (data) {
                    const key = cacheKey.replace('metrics:gauge:', '');
                    this.gauges.set(key, data.value);
                    this.gaugeLabels.set(key, data.labels);
                }
            }
            logger.debug('Persisted metrics loaded', {
                counters: this.counters.size,
                gauges: this.gauges.size,
            });
        }
        catch (error) {
            logger.error('Error loading persisted metrics', { error });
        }
    }
    async persistMetrics() {
        try {
            logger.debug('Metrics persisted to cache');
        }
        catch (error) {
            logger.error('Error persisting metrics', { error });
        }
    }
    startMetricsCollection() {
        this.metricsInterval = setInterval(() => {
            this.recordSystemMetrics();
        }, 30000);
        logger.info('Metrics collection started');
    }
    startCleanupJob() {
        setInterval(async () => {
            try {
                await this.cleanupOldMetrics();
            }
            catch (error) {
                logger.error('Error in metrics cleanup job', { error });
            }
        }, 60 * 60 * 1000);
    }
    async cleanupOldMetrics() {
        try {
            const keys = await cache_1.cache.keys('metrics:*');
            let cleanedCount = 0;
            for (const key of keys) {
                const ttl = await cache_1.cache.ttl(key);
                if (ttl <= 0) {
                    await cache_1.cache.del(key);
                    cleanedCount++;
                }
            }
            for (const [key, values] of this.histograms) {
                if (values.length > 1000) {
                    this.histograms.set(key, values.slice(-1000));
                }
            }
            if (cleanedCount > 0) {
                logger.info('Metrics cleanup completed', { cleanedKeys: cleanedCount });
            }
        }
        catch (error) {
            logger.error('Error during metrics cleanup', { error });
        }
    }
}
exports.MetricsService = MetricsService;
//# sourceMappingURL=metricsService.js.map