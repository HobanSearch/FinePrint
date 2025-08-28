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
exports.performanceMonitor = exports.PerformanceMonitor = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const modelManager_1 = require("./modelManager");
const queueManager_1 = require("./queueManager");
const progressTracker_1 = require("./progressTracker");
const events_1 = require("events");
const os = __importStar(require("os"));
const logger = (0, logger_1.createServiceLogger)('performance-monitor');
class PerformanceMonitor extends events_1.EventEmitter {
    isRunning = false;
    metricsIntervalId;
    cacheStatsIntervalId;
    alertCheckIntervalId;
    systemMetricsHistory = [];
    analysisMetricsHistory = [];
    cacheMetricsHistory = [];
    alertConfigs = new Map();
    activeAlerts = new Map();
    alertCooldowns = new Map();
    requestCounts = new Map();
    responseTimeHistogram = new Map();
    errorCounts = new Map();
    cacheHits = 0;
    cacheMisses = 0;
    cacheRequests = 0;
    constructor() {
        super();
        this.initializeDefaultAlerts();
        this.setupCacheTracking();
    }
    async start() {
        if (this.isRunning) {
            logger.warn('Performance Monitor already running');
            return;
        }
        logger.info('Starting Performance Monitor');
        try {
            this.startSystemMetricsCollection();
            this.startAnalysisMetricsCollection();
            this.startCacheMetricsCollection();
            this.startAlertChecking();
            this.isRunning = true;
            logger.info('Performance Monitor started successfully');
        }
        catch (error) {
            logger.error('Failed to start Performance Monitor', { error: error.message });
            throw error;
        }
    }
    async stop() {
        if (!this.isRunning)
            return;
        logger.info('Stopping Performance Monitor');
        if (this.metricsIntervalId)
            clearInterval(this.metricsIntervalId);
        if (this.cacheStatsIntervalId)
            clearInterval(this.cacheStatsIntervalId);
        if (this.alertCheckIntervalId)
            clearInterval(this.alertCheckIntervalId);
        this.isRunning = false;
        logger.info('Performance Monitor stopped');
    }
    startSystemMetricsCollection() {
        this.metricsIntervalId = setInterval(async () => {
            try {
                const metrics = await this.collectSystemMetrics();
                this.systemMetricsHistory.push(metrics);
                if (this.systemMetricsHistory.length > 1440) {
                    this.systemMetricsHistory = this.systemMetricsHistory.slice(-1440);
                }
                this.emit('systemMetrics', metrics);
                this.checkSystemAlerts(metrics);
            }
            catch (error) {
                logger.error('Failed to collect system metrics', { error: error.message });
            }
        }, 60000);
        logger.info('System metrics collection started');
    }
    async collectSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const loadAverage = os.loadavg();
        const cpuUsage = Math.min(100, (loadAverage[0] / os.cpus().length) * 100);
        return {
            timestamp: new Date(),
            cpu: {
                usage: cpuUsage,
                loadAverage,
                cores: os.cpus().length
            },
            memory: {
                total: totalMemory,
                used: usedMemory,
                free: freeMemory,
                usage: (usedMemory / totalMemory) * 100,
                heapUsed: memoryUsage.heapUsed,
                heapTotal: memoryUsage.heapTotal
            },
            disk: {
                usage: 0
            },
            network: {
                connections: 0,
                activeWebSockets: progressTracker_1.progressTracker.getStats().totalConnections
            },
            process: {
                uptime: process.uptime(),
                pid: process.pid,
                version: process.version
            }
        };
    }
    startAnalysisMetricsCollection() {
        setInterval(async () => {
            try {
                const metrics = await this.collectAnalysisMetrics();
                this.analysisMetricsHistory.push(metrics);
                if (this.analysisMetricsHistory.length > 1440) {
                    this.analysisMetricsHistory = this.analysisMetricsHistory.slice(-1440);
                }
                this.emit('analysisMetrics', metrics);
                this.checkAnalysisAlerts(metrics);
            }
            catch (error) {
                logger.error('Failed to collect analysis metrics', { error: error.message });
            }
        }, 60000);
        logger.info('Analysis metrics collection started');
    }
    async collectAnalysisMetrics() {
        const queueStats = queueManager_1.queueManager.getStats();
        const modelStatus = modelManager_1.modelManager.getModelStatus();
        const modelPerformance = {};
        for (const [modelName, status] of Object.entries(modelStatus)) {
            const requestCount = this.requestCounts.get(modelName) || 0;
            const errorCount = this.errorCounts.get(modelName) || 0;
            const responseTimes = this.responseTimeHistogram.get(modelName) || [];
            modelPerformance[modelName] = {
                model: modelName,
                totalRequests: requestCount,
                successfulRequests: requestCount - errorCount,
                failedRequests: errorCount,
                averageResponseTime: responseTimes.length > 0
                    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
                    : 0,
                averageTokensPerSecond: status.performance?.avgTokensPerSecond || 0,
                memoryUsage: status.performance?.avgMemoryUsage || 0,
                accuracy: status.performance?.accuracy || 0,
                lastUsed: status.performance?.lastBenchmark || new Date(),
                errorRate: requestCount > 0 ? (errorCount / requestCount) * 100 : 0
            };
        }
        return {
            timestamp: new Date(),
            totalAnalyses: queueStats.totalJobs,
            completedAnalyses: queueStats.completedJobs,
            failedAnalyses: queueStats.failedJobs,
            averageProcessingTime: queueStats.averageProcessingTime,
            throughput: queueStats.queueThroughput,
            accuracyScore: this.calculateOverallAccuracy(modelPerformance),
            modelPerformance,
            queueMetrics: {
                totalJobs: queueStats.totalJobs,
                pendingJobs: queueStats.pendingJobs,
                processingJobs: queueStats.processingJobs,
                averageWaitTime: 0
            },
            errorRates: {
                extractionErrors: this.errorCounts.get('extraction') || 0,
                patternErrors: this.errorCounts.get('pattern') || 0,
                aiErrors: this.errorCounts.get('ai') || 0,
                embeddingErrors: this.errorCounts.get('embedding') || 0
            }
        };
    }
    startCacheMetricsCollection() {
        this.cacheStatsIntervalId = setInterval(async () => {
            try {
                const metrics = await this.collectCacheMetrics();
                this.cacheMetricsHistory.push(metrics);
                if (this.cacheMetricsHistory.length > 1440) {
                    this.cacheMetricsHistory = this.cacheMetricsHistory.slice(-1440);
                }
                this.emit('cacheMetrics', metrics);
            }
            catch (error) {
                logger.error('Failed to collect cache metrics', { error: error.message });
            }
        }, 300000);
        logger.info('Cache metrics collection started');
    }
    async collectCacheMetrics() {
        const totalRequests = this.cacheRequests;
        const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;
        const missRate = totalRequests > 0 ? (this.cacheMisses / totalRequests) * 100 : 0;
        return {
            timestamp: new Date(),
            hitRate,
            missRate,
            totalRequests,
            totalHits: this.cacheHits,
            totalMisses: this.cacheMisses,
            cacheSize: 0,
            evictions: 0,
            averageKeySize: 0,
            averageValueSize: 0,
            topKeys: []
        };
    }
    initializeDefaultAlerts() {
        const defaultAlerts = [
            {
                id: 'high_cpu_usage',
                name: 'High CPU Usage',
                metric: 'cpu.usage',
                threshold: 80,
                comparison: 'greater',
                severity: 'high',
                enabled: true,
                cooldownMinutes: 5,
                description: 'CPU usage exceeds 80%'
            },
            {
                id: 'high_memory_usage',
                name: 'High Memory Usage',
                metric: 'memory.usage',
                threshold: 85,
                comparison: 'greater',
                severity: 'high',
                enabled: true,
                cooldownMinutes: 5,
                description: 'Memory usage exceeds 85%'
            },
            {
                id: 'high_error_rate',
                name: 'High Error Rate',
                metric: 'analysis.errorRate',
                threshold: 10,
                comparison: 'greater',
                severity: 'critical',
                enabled: true,
                cooldownMinutes: 10,
                description: 'Analysis error rate exceeds 10%'
            },
            {
                id: 'low_throughput',
                name: 'Low Throughput',
                metric: 'analysis.throughput',
                threshold: 1,
                comparison: 'less',
                severity: 'medium',
                enabled: true,
                cooldownMinutes: 15,
                description: 'Analysis throughput below 1 per minute'
            },
            {
                id: 'queue_backlog',
                name: 'Queue Backlog',
                metric: 'queue.pendingJobs',
                threshold: 50,
                comparison: 'greater',
                severity: 'medium',
                enabled: true,
                cooldownMinutes: 10,
                description: 'Queue has more than 50 pending jobs'
            }
        ];
        defaultAlerts.forEach(alert => {
            this.alertConfigs.set(alert.id, alert);
        });
        logger.info('Default alerts initialized', { count: defaultAlerts.length });
    }
    startAlertChecking() {
        this.alertCheckIntervalId = setInterval(() => {
            try {
                this.checkAllAlerts();
            }
            catch (error) {
                logger.error('Alert checking failed', { error: error.message });
            }
        }, 30000);
        logger.info('Alert checking started');
    }
    checkAllAlerts() {
        const latestSystemMetrics = this.systemMetricsHistory[this.systemMetricsHistory.length - 1];
        const latestAnalysisMetrics = this.analysisMetricsHistory[this.analysisMetricsHistory.length - 1];
        if (latestSystemMetrics) {
            this.checkSystemAlerts(latestSystemMetrics);
        }
        if (latestAnalysisMetrics) {
            this.checkAnalysisAlerts(latestAnalysisMetrics);
        }
    }
    checkSystemAlerts(metrics) {
        this.checkAlert('high_cpu_usage', metrics.cpu.usage);
        this.checkAlert('high_memory_usage', metrics.memory.usage);
    }
    checkAnalysisAlerts(metrics) {
        const errorRate = metrics.totalAnalyses > 0
            ? (metrics.failedAnalyses / metrics.totalAnalyses) * 100
            : 0;
        this.checkAlert('high_error_rate', errorRate);
        this.checkAlert('low_throughput', metrics.throughput);
        this.checkAlert('queue_backlog', metrics.queueMetrics.pendingJobs);
    }
    checkAlert(configId, value) {
        const config = this.alertConfigs.get(configId);
        if (!config || !config.enabled)
            return;
        const cooldownEnd = this.alertCooldowns.get(configId);
        if (cooldownEnd && cooldownEnd > new Date()) {
            return;
        }
        const shouldAlert = this.evaluateAlertCondition(config, value);
        const existingAlert = this.activeAlerts.get(configId);
        if (shouldAlert && !existingAlert) {
            const alert = {
                id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                configId,
                timestamp: new Date(),
                severity: config.severity,
                metric: config.metric,
                value,
                threshold: config.threshold,
                message: `${config.name}: ${config.description} (value: ${value}, threshold: ${config.threshold})`,
                resolved: false
            };
            this.activeAlerts.set(configId, alert);
            const cooldownEnd = new Date();
            cooldownEnd.setMinutes(cooldownEnd.getMinutes() + config.cooldownMinutes);
            this.alertCooldowns.set(configId, cooldownEnd);
            logger.warn('Alert triggered', {
                alertId: alert.id,
                configId,
                severity: alert.severity,
                metric: config.metric,
                value,
                threshold: config.threshold
            });
            this.emit('alert', alert);
        }
        else if (!shouldAlert && existingAlert && !existingAlert.resolved) {
            existingAlert.resolved = true;
            existingAlert.resolvedAt = new Date();
            logger.info('Alert resolved', {
                alertId: existingAlert.id,
                configId,
                duration: existingAlert.resolvedAt.getTime() - existingAlert.timestamp.getTime()
            });
            this.emit('alertResolved', existingAlert);
            this.activeAlerts.delete(configId);
        }
    }
    evaluateAlertCondition(config, value) {
        switch (config.comparison) {
            case 'greater':
                return value > config.threshold;
            case 'less':
                return value < config.threshold;
            case 'equal':
                return value === config.threshold;
            default:
                return false;
        }
    }
    trackRequest(operation, modelName) {
        if (modelName) {
            const count = this.requestCounts.get(modelName) || 0;
            this.requestCounts.set(modelName, count + 1);
        }
    }
    trackResponse(operation, responseTime, modelName) {
        if (modelName) {
            if (!this.responseTimeHistogram.has(modelName)) {
                this.responseTimeHistogram.set(modelName, []);
            }
            const times = this.responseTimeHistogram.get(modelName);
            times.push(responseTime);
            if (times.length > 1000) {
                times.splice(0, times.length - 1000);
            }
        }
    }
    trackError(operation, error, modelName) {
        if (modelName) {
            const count = this.errorCounts.get(modelName) || 0;
            this.errorCounts.set(modelName, count + 1);
        }
        const operationCount = this.errorCounts.get(operation) || 0;
        this.errorCounts.set(operation, operationCount + 1);
    }
    setupCacheTracking() {
        setInterval(() => {
        }, 10000);
    }
    getCurrentSystemMetrics() {
        return this.systemMetricsHistory[this.systemMetricsHistory.length - 1] || null;
    }
    getCurrentAnalysisMetrics() {
        return this.analysisMetricsHistory[this.analysisMetricsHistory.length - 1] || null;
    }
    getCurrentCacheMetrics() {
        return this.cacheMetricsHistory[this.cacheMetricsHistory.length - 1] || null;
    }
    getSystemMetricsHistory(hours = 1) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);
        return this.systemMetricsHistory.filter(m => m.timestamp >= cutoff);
    }
    getAnalysisMetricsHistory(hours = 1) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);
        return this.analysisMetricsHistory.filter(m => m.timestamp >= cutoff);
    }
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
    }
    getAllAlerts(hours = 24) {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - hours);
        return Array.from(this.activeAlerts.values()).filter(a => a.timestamp >= cutoff);
    }
    addAlertConfig(config) {
        this.alertConfigs.set(config.id, config);
        logger.info('Alert config added', { configId: config.id, name: config.name });
    }
    removeAlertConfig(configId) {
        this.alertConfigs.delete(configId);
        this.activeAlerts.delete(configId);
        logger.info('Alert config removed', { configId });
    }
    getHealthStatus() {
        const checks = {};
        let overallStatus = 'healthy';
        const systemMetrics = this.getCurrentSystemMetrics();
        const analysisMetrics = this.getCurrentAnalysisMetrics();
        const activeAlerts = this.getActiveAlerts();
        if (systemMetrics) {
            if (systemMetrics.cpu.usage > 90) {
                checks.cpu = { status: 'fail', message: `CPU usage critical: ${systemMetrics.cpu.usage.toFixed(1)}%` };
                overallStatus = 'critical';
            }
            else if (systemMetrics.cpu.usage > 80) {
                checks.cpu = { status: 'warn', message: `CPU usage high: ${systemMetrics.cpu.usage.toFixed(1)}%` };
                if (overallStatus === 'healthy')
                    overallStatus = 'warning';
            }
            else {
                checks.cpu = { status: 'pass', message: `CPU usage normal: ${systemMetrics.cpu.usage.toFixed(1)}%` };
            }
            if (systemMetrics.memory.usage > 90) {
                checks.memory = { status: 'fail', message: `Memory usage critical: ${systemMetrics.memory.usage.toFixed(1)}%` };
                overallStatus = 'critical';
            }
            else if (systemMetrics.memory.usage > 85) {
                checks.memory = { status: 'warn', message: `Memory usage high: ${systemMetrics.memory.usage.toFixed(1)}%` };
                if (overallStatus === 'healthy')
                    overallStatus = 'warning';
            }
            else {
                checks.memory = { status: 'pass', message: `Memory usage normal: ${systemMetrics.memory.usage.toFixed(1)}%` };
            }
        }
        if (analysisMetrics) {
            const errorRate = analysisMetrics.totalAnalyses > 0
                ? (analysisMetrics.failedAnalyses / analysisMetrics.totalAnalyses) * 100
                : 0;
            if (errorRate > 20) {
                checks.errorRate = { status: 'fail', message: `Error rate critical: ${errorRate.toFixed(1)}%` };
                overallStatus = 'critical';
            }
            else if (errorRate > 10) {
                checks.errorRate = { status: 'warn', message: `Error rate high: ${errorRate.toFixed(1)}%` };
                if (overallStatus === 'healthy')
                    overallStatus = 'warning';
            }
            else {
                checks.errorRate = { status: 'pass', message: `Error rate normal: ${errorRate.toFixed(1)}%` };
            }
        }
        const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
        const highAlerts = activeAlerts.filter(a => a.severity === 'high').length;
        if (criticalAlerts > 0) {
            checks.alerts = { status: 'fail', message: `${criticalAlerts} critical alert(s) active` };
            overallStatus = 'critical';
        }
        else if (highAlerts > 0) {
            checks.alerts = { status: 'warn', message: `${highAlerts} high-severity alert(s) active` };
            if (overallStatus === 'healthy')
                overallStatus = 'warning';
        }
        else {
            checks.alerts = { status: 'pass', message: 'No critical alerts' };
        }
        return { status: overallStatus, checks };
    }
    calculateOverallAccuracy(modelPerformance) {
        const models = Object.values(modelPerformance);
        if (models.length === 0)
            return 0;
        const totalRequests = models.reduce((sum, m) => sum + m.totalRequests, 0);
        if (totalRequests === 0)
            return 0;
        const weightedAccuracy = models.reduce((sum, m) => {
            return sum + (m.accuracy * m.totalRequests);
        }, 0);
        return weightedAccuracy / totalRequests;
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
exports.performanceMonitor = new PerformanceMonitor();
//# sourceMappingURL=performanceMonitor.js.map