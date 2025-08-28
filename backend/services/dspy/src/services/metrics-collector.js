"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = exports.DSPyMetricEntry = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const zod_1 = require("zod");
const logger = (0, logger_1.createServiceLogger)('metrics-collector');
exports.DSPyMetricEntry = zod_1.z.object({
    timestamp: zod_1.z.string(),
    module_name: zod_1.z.string(),
    module_version: zod_1.z.string(),
    operation: zod_1.z.enum(['predict', 'compile', 'optimize']),
    input_size: zod_1.z.number(),
    output_size: zod_1.z.number(),
    latency_ms: zod_1.z.number(),
    success: zod_1.z.boolean(),
    error_type: zod_1.z.string().optional(),
    accuracy_score: zod_1.z.number().min(0).max(1).optional(),
    confidence_score: zod_1.z.number().min(0).max(1).optional(),
    token_usage: zod_1.z.number().optional(),
    model_used: zod_1.z.string().optional(),
    optimization_type: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
class MetricsCollector {
    cache;
    metrics = [];
    alerts = [];
    thresholds = {
        latency_ms: 5000,
        error_rate: 0.1,
        accuracy_drop: 0.2,
        token_usage_per_request: 10000,
    };
    constructor() {
        this.cache = new cache_1.CacheService();
        this.initializeMetricsCollection();
    }
    async initializeMetricsCollection() {
        try {
            await this.loadMetricsFromCache();
            setInterval(() => this.performHousekeeping(), 60000);
            setInterval(() => this.checkPerformanceAlerts(), 30000);
            logger.info('Metrics collector initialized', {
                existingMetrics: this.metrics.length,
                thresholds: this.thresholds,
            });
        }
        catch (error) {
            logger.error('Failed to initialize metrics collector', { error });
        }
    }
    async recordMetric(metric) {
        try {
            const timestampedMetric = {
                ...metric,
                timestamp: new Date().toISOString(),
            };
            const validatedMetric = exports.DSPyMetricEntry.parse(timestampedMetric);
            this.metrics.push(validatedMetric);
            if (this.metrics.length > 10000) {
                this.metrics = this.metrics.slice(-10000);
            }
            await this.cacheMetric(validatedMetric);
            await this.updateRealTimeMetrics(validatedMetric);
            logger.debug('DSPy metric recorded', {
                module: validatedMetric.module_name,
                operation: validatedMetric.operation,
                latency: validatedMetric.latency_ms,
                success: validatedMetric.success,
            });
        }
        catch (error) {
            logger.error('Failed to record DSPy metric', { error, metric });
        }
    }
    async cacheMetric(metric) {
        const cacheKey = `dspy_metric:${Date.now()}:${Math.random().toString(36).substr(2, 5)}`;
        await this.cache.set(cacheKey, JSON.stringify(metric), 86400);
    }
    async loadMetricsFromCache() {
        try {
            logger.debug('Metrics loaded from cache', { count: this.metrics.length });
        }
        catch (error) {
            logger.warn('Failed to load metrics from cache', { error });
        }
    }
    async updateRealTimeMetrics(metric) {
        const hour = new Date().toISOString().substr(0, 13);
        const cacheKey = `dspy_realtime:${hour}`;
        try {
            const existing = await this.cache.get(cacheKey);
            let hourlyData = existing ? JSON.parse(existing) : {
                operations: 0,
                successes: 0,
                total_latency: 0,
                total_accuracy: 0,
                accuracy_count: 0,
            };
            hourlyData.operations += 1;
            if (metric.success)
                hourlyData.successes += 1;
            hourlyData.total_latency += metric.latency_ms;
            if (metric.accuracy_score !== undefined) {
                hourlyData.total_accuracy += metric.accuracy_score;
                hourlyData.accuracy_count += 1;
            }
            await this.cache.set(cacheKey, JSON.stringify(hourlyData), 3600);
        }
        catch (error) {
            logger.warn('Failed to update real-time metrics', { error });
        }
    }
    async getMetricsSummary(timeRange) {
        try {
            let metricsToAnalyze = this.metrics;
            if (timeRange) {
                const startTime = new Date(timeRange.start);
                const endTime = new Date(timeRange.end);
                metricsToAnalyze = this.metrics.filter(m => {
                    const metricTime = new Date(m.timestamp);
                    return metricTime >= startTime && metricTime <= endTime;
                });
            }
            if (metricsToAnalyze.length === 0) {
                return this.getEmptyMetricsSummary();
            }
            const totalOperations = metricsToAnalyze.length;
            const successfulOperations = metricsToAnalyze.filter(m => m.success).length;
            const successRate = successfulOperations / totalOperations;
            const totalLatency = metricsToAnalyze.reduce((sum, m) => sum + m.latency_ms, 0);
            const averageLatency = totalLatency / totalOperations;
            const accuracyMetrics = metricsToAnalyze.filter(m => m.accuracy_score !== undefined);
            const averageAccuracy = accuracyMetrics.length > 0
                ? accuracyMetrics.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / accuracyMetrics.length
                : 0;
            const confidenceMetrics = metricsToAnalyze.filter(m => m.confidence_score !== undefined);
            const averageConfidence = confidenceMetrics.length > 0
                ? confidenceMetrics.reduce((sum, m) => sum + (m.confidence_score || 0), 0) / confidenceMetrics.length
                : 0;
            const totalTokenUsage = metricsToAnalyze.reduce((sum, m) => sum + (m.token_usage || 0), 0);
            const operationsByType = {};
            metricsToAnalyze.forEach(m => {
                operationsByType[m.operation] = (operationsByType[m.operation] || 0) + 1;
            });
            const modulesByUsage = {};
            metricsToAnalyze.forEach(m => {
                modulesByUsage[m.module_name] = (modulesByUsage[m.module_name] || 0) + 1;
            });
            const errorDistribution = {};
            metricsToAnalyze.filter(m => !m.success && m.error_type).forEach(m => {
                const errorType = m.error_type || 'unknown';
                errorDistribution[errorType] = (errorDistribution[errorType] || 0) + 1;
            });
            const performanceTrends = await this.calculatePerformanceTrends(metricsToAnalyze);
            return {
                total_operations: totalOperations,
                success_rate: successRate,
                average_latency_ms: averageLatency,
                average_accuracy: averageAccuracy,
                average_confidence: averageConfidence,
                total_token_usage: totalTokenUsage,
                operations_by_type: operationsByType,
                modules_by_usage: modulesByUsage,
                error_distribution: errorDistribution,
                performance_trends: performanceTrends,
            };
        }
        catch (error) {
            logger.error('Failed to generate metrics summary', { error });
            return this.getEmptyMetricsSummary();
        }
    }
    getEmptyMetricsSummary() {
        return {
            total_operations: 0,
            success_rate: 0,
            average_latency_ms: 0,
            average_accuracy: 0,
            average_confidence: 0,
            total_token_usage: 0,
            operations_by_type: {},
            modules_by_usage: {},
            error_distribution: {},
            performance_trends: {
                hourly: [],
                daily: [],
                weekly: [],
            },
        };
    }
    async calculatePerformanceTrends(metrics) {
        const hourlyGroups = this.groupMetricsByHour(metrics);
        const dailyGroups = this.groupMetricsByDay(metrics);
        const weeklyGroups = this.groupMetricsByWeek(metrics);
        return {
            hourly: this.calculateDataPoints(hourlyGroups),
            daily: this.calculateDataPoints(dailyGroups),
            weekly: this.calculateDataPoints(weeklyGroups),
        };
    }
    groupMetricsByHour(metrics) {
        const groups = new Map();
        metrics.forEach(metric => {
            const hour = metric.timestamp.substr(0, 13);
            if (!groups.has(hour)) {
                groups.set(hour, []);
            }
            groups.get(hour).push(metric);
        });
        return groups;
    }
    groupMetricsByDay(metrics) {
        const groups = new Map();
        metrics.forEach(metric => {
            const day = metric.timestamp.substr(0, 10);
            if (!groups.has(day)) {
                groups.set(day, []);
            }
            groups.get(day).push(metric);
        });
        return groups;
    }
    groupMetricsByWeek(metrics) {
        const groups = new Map();
        metrics.forEach(metric => {
            const date = new Date(metric.timestamp);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().substr(0, 10);
            if (!groups.has(weekKey)) {
                groups.set(weekKey, []);
            }
            groups.get(weekKey).push(metric);
        });
        return groups;
    }
    calculateDataPoints(groups) {
        const dataPoints = [];
        groups.forEach((metrics, timestamp) => {
            const operations = metrics.length;
            const successes = metrics.filter(m => m.success).length;
            const successRate = operations > 0 ? successes / operations : 0;
            const totalLatency = metrics.reduce((sum, m) => sum + m.latency_ms, 0);
            const averageLatency = operations > 0 ? totalLatency / operations : 0;
            const accuracyMetrics = metrics.filter(m => m.accuracy_score !== undefined);
            const averageAccuracy = accuracyMetrics.length > 0
                ? accuracyMetrics.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / accuracyMetrics.length
                : 0;
            dataPoints.push({
                timestamp,
                operations,
                success_rate: successRate,
                average_latency: averageLatency,
                average_accuracy: averageAccuracy,
            });
        });
        return dataPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }
    async checkPerformanceAlerts() {
        try {
            const recentMetrics = this.getRecentMetrics(300000);
            if (recentMetrics.length === 0)
                return;
            await this.checkLatencyAlerts(recentMetrics);
            await this.checkErrorRateAlerts(recentMetrics);
            await this.checkAccuracyAlerts(recentMetrics);
            await this.checkTokenUsageAlerts(recentMetrics);
        }
        catch (error) {
            logger.error('Failed to check performance alerts', { error });
        }
    }
    getRecentMetrics(durationMs) {
        const cutoffTime = new Date(Date.now() - durationMs);
        return this.metrics.filter(m => new Date(m.timestamp) >= cutoffTime);
    }
    async checkLatencyAlerts(metrics) {
        const averageLatency = metrics.reduce((sum, m) => sum + m.latency_ms, 0) / metrics.length;
        if (averageLatency > this.thresholds.latency_ms) {
            await this.createAlert({
                type: 'latency_spike',
                severity: averageLatency > this.thresholds.latency_ms * 2 ? 'high' : 'medium',
                message: `Average latency is ${averageLatency.toFixed(0)}ms, above threshold of ${this.thresholds.latency_ms}ms`,
                threshold: this.thresholds.latency_ms,
                current_value: averageLatency,
            });
        }
    }
    async checkErrorRateAlerts(metrics) {
        const errorRate = 1 - (metrics.filter(m => m.success).length / metrics.length);
        if (errorRate > this.thresholds.error_rate) {
            await this.createAlert({
                type: 'error_rate_high',
                severity: errorRate > this.thresholds.error_rate * 2 ? 'critical' : 'high',
                message: `Error rate is ${(errorRate * 100).toFixed(1)}%, above threshold of ${(this.thresholds.error_rate * 100).toFixed(1)}%`,
                threshold: this.thresholds.error_rate,
                current_value: errorRate,
            });
        }
    }
    async checkAccuracyAlerts(metrics) {
        const accuracyMetrics = metrics.filter(m => m.accuracy_score !== undefined);
        if (accuracyMetrics.length === 0)
            return;
        const currentAccuracy = accuracyMetrics.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / accuracyMetrics.length;
        const historicalAccuracy = 0.85;
        const accuracyDrop = (historicalAccuracy - currentAccuracy) / historicalAccuracy;
        if (accuracyDrop > this.thresholds.accuracy_drop) {
            await this.createAlert({
                type: 'accuracy_drop',
                severity: accuracyDrop > this.thresholds.accuracy_drop * 2 ? 'critical' : 'high',
                message: `Accuracy dropped by ${(accuracyDrop * 100).toFixed(1)}%, current: ${(currentAccuracy * 100).toFixed(1)}%`,
                threshold: this.thresholds.accuracy_drop,
                current_value: accuracyDrop,
            });
        }
    }
    async checkTokenUsageAlerts(metrics) {
        const tokenMetrics = metrics.filter(m => m.token_usage !== undefined);
        if (tokenMetrics.length === 0)
            return;
        const averageTokenUsage = tokenMetrics.reduce((sum, m) => sum + (m.token_usage || 0), 0) / tokenMetrics.length;
        if (averageTokenUsage > this.thresholds.token_usage_per_request) {
            await this.createAlert({
                type: 'token_usage_high',
                severity: averageTokenUsage > this.thresholds.token_usage_per_request * 2 ? 'high' : 'medium',
                message: `Average token usage is ${averageTokenUsage.toFixed(0)} tokens per request, above threshold of ${this.thresholds.token_usage_per_request}`,
                threshold: this.thresholds.token_usage_per_request,
                current_value: averageTokenUsage,
            });
        }
    }
    async createAlert(alertData) {
        const alert = {
            ...alertData,
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString(),
            resolved: false,
        };
        const existingAlert = this.alerts.find(a => a.type === alert.type &&
            a.module_name === alert.module_name &&
            !a.resolved &&
            (Date.now() - new Date(a.timestamp).getTime()) < 600000);
        if (!existingAlert) {
            this.alerts.push(alert);
            if (this.alerts.length > 1000) {
                this.alerts = this.alerts.slice(-1000);
            }
            logger.warn('DSPy performance alert created', {
                alertId: alert.id,
                type: alert.type,
                severity: alert.severity,
                message: alert.message,
            });
            await this.cache.set(`dspy_alert:${alert.id}`, JSON.stringify(alert), 86400);
        }
    }
    getActiveAlerts() {
        return this.alerts.filter(a => !a.resolved);
    }
    getAllAlerts(limit = 100) {
        return this.alerts
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
    }
    async resolveAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (!alert) {
            return false;
        }
        alert.resolved = true;
        await this.cache.set(`dspy_alert:${alertId}`, JSON.stringify(alert), 86400);
        logger.info('DSPy alert resolved', { alertId, type: alert.type });
        return true;
    }
    async performHousekeeping() {
        try {
            const cutoffTime = new Date(Date.now() - 86400000);
            const initialCount = this.metrics.length;
            this.metrics = this.metrics.filter(m => new Date(m.timestamp) >= cutoffTime);
            if (this.metrics.length < initialCount) {
                logger.debug('Cleaned up old metrics', {
                    removed: initialCount - this.metrics.length,
                    remaining: this.metrics.length,
                });
            }
            const alertCutoffTime = new Date(Date.now() - 604800000);
            const initialAlertCount = this.alerts.length;
            this.alerts = this.alerts.filter(a => !a.resolved || new Date(a.timestamp) >= alertCutoffTime);
            if (this.alerts.length < initialAlertCount) {
                logger.debug('Cleaned up old alerts', {
                    removed: initialAlertCount - this.alerts.length,
                    remaining: this.alerts.length,
                });
            }
        }
        catch (error) {
            logger.error('Housekeeping failed', { error });
        }
    }
    updateThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        logger.info('Performance thresholds updated', { thresholds: this.thresholds });
    }
    getThresholds() {
        return { ...this.thresholds };
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=metrics-collector.js.map