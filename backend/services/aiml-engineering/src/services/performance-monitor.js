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
exports.PerformanceMonitor = exports.DataDriftConfigSchema = exports.PerformanceMetricSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const queue_1 = require("@fineprintai/queue");
const zod_1 = require("zod");
const events_1 = require("events");
const uuid_1 = require("uuid");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const logger = (0, logger_1.createServiceLogger)('performance-monitor');
exports.PerformanceMetricSchema = zod_1.z.object({
    model_id: zod_1.z.string(),
    model_name: zod_1.z.string(),
    model_version: zod_1.z.string(),
    timestamp: zod_1.z.string(),
    request_id: zod_1.z.string().optional(),
    metrics: zod_1.z.object({
        inference_time_ms: zod_1.z.number().min(0).optional(),
        queue_time_ms: zod_1.z.number().min(0).optional(),
        preprocessing_time_ms: zod_1.z.number().min(0).optional(),
        postprocessing_time_ms: zod_1.z.number().min(0).optional(),
        total_time_ms: zod_1.z.number().min(0).optional(),
        accuracy: zod_1.z.number().min(0).max(1).optional(),
        confidence_score: zod_1.z.number().min(0).max(1).optional(),
        prediction_quality: zod_1.z.number().min(0).max(1).optional(),
        cpu_usage_percent: zod_1.z.number().min(0).max(100).optional(),
        memory_usage_mb: zod_1.z.number().min(0).optional(),
        gpu_utilization_percent: zod_1.z.number().min(0).max(100).optional(),
        gpu_memory_usage_mb: zod_1.z.number().min(0).optional(),
        requests_per_second: zod_1.z.number().min(0).optional(),
        concurrent_requests: zod_1.z.number().min(0).optional(),
        queue_length: zod_1.z.number().min(0).optional(),
        error_rate: zod_1.z.number().min(0).max(1).optional(),
        timeout_rate: zod_1.z.number().min(0).max(1).optional(),
        custom: zod_1.z.record(zod_1.z.number()).optional(),
    }),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
exports.DataDriftConfigSchema = zod_1.z.object({
    model_id: zod_1.z.string(),
    drift_detection_method: zod_1.z.enum(['statistical', 'domain_classifier', 'autoencoder', 'ensemble']).default('statistical'),
    reference_window_size: zod_1.z.number().min(100).default(1000),
    detection_window_size: zod_1.z.number().min(50).default(500),
    sensitivity: zod_1.z.number().min(0).max(1).default(0.05),
    minimum_samples: zod_1.z.number().min(10).default(100),
    features_to_monitor: zod_1.z.array(zod_1.z.string()).optional(),
    alert_thresholds: zod_1.z.object({
        drift_score: zod_1.z.number().min(0).max(1).default(0.7),
        feature_drift_count: zod_1.z.number().min(1).default(3),
        consecutive_alerts: zod_1.z.number().min(1).default(2),
    }),
    monitoring_frequency: zod_1.z.enum(['real_time', 'hourly', 'daily', 'weekly']).default('hourly'),
});
class PerformanceMonitor extends events_1.EventEmitter {
    cache;
    queue;
    metricsBuffer = new Map();
    driftConfigs = new Map();
    activeAlerts = new Map();
    referenceData = new Map();
    metricsPath;
    monitoringInterval;
    isMonitoring = false;
    constructor() {
        super();
        this.cache = new cache_1.CacheService();
        this.queue = new queue_1.QueueService();
        this.metricsPath = path.join(process.cwd(), 'data', 'performance-metrics');
    }
    async initialize() {
        try {
            logger.info('Initializing Performance Monitor');
            await fs.ensureDir(this.metricsPath);
            await fs.ensureDir(path.join(this.metricsPath, 'daily'));
            await fs.ensureDir(path.join(this.metricsPath, 'alerts'));
            await this.initializeMonitoringQueue();
            await this.loadDriftConfigurations();
            await this.loadActiveAlerts();
            logger.info('Performance Monitor initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Performance Monitor', { error: error.message });
            throw error;
        }
    }
    async initializeMonitoringQueue() {
        await this.queue.createQueue('performance-monitoring', {
            defaultJobOptions: {
                removeOnComplete: 1000,
                removeOnFail: 100,
                attempts: 2,
            },
        });
        this.queue.process('performance-monitoring', 10, async (job) => {
            return await this.processPerformanceMetric(job.data);
        });
        await this.queue.createQueue('drift-detection', {
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: 1,
            },
        });
        this.queue.process('drift-detection', 2, async (job) => {
            return await this.processDriftDetection(job.data);
        });
    }
    async loadDriftConfigurations() {
        try {
            const configPath = path.join(this.metricsPath, 'drift-configs.json');
            if (await fs.pathExists(configPath)) {
                const configs = await fs.readJSON(configPath);
                Object.entries(configs).forEach(([modelId, config]) => {
                    this.driftConfigs.set(modelId, config);
                });
                logger.info(`Loaded ${this.driftConfigs.size} drift configurations`);
            }
        }
        catch (error) {
            logger.warn('Failed to load drift configurations', { error: error.message });
        }
    }
    async loadActiveAlerts() {
        try {
            const alertsPath = path.join(this.metricsPath, 'alerts', 'active-alerts.json');
            if (await fs.pathExists(alertsPath)) {
                const alerts = await fs.readJSON(alertsPath);
                Object.entries(alerts).forEach(([alertId, alert]) => {
                    this.activeAlerts.set(alertId, alert);
                });
                logger.info(`Loaded ${this.activeAlerts.size} active alerts`);
            }
        }
        catch (error) {
            logger.warn('Failed to load active alerts', { error: error.message });
        }
    }
    async logMetrics(metric) {
        try {
            const validatedMetric = exports.PerformanceMetricSchema.parse(metric);
            const modelMetrics = this.metricsBuffer.get(validatedMetric.model_id) || [];
            modelMetrics.push(validatedMetric);
            this.metricsBuffer.set(validatedMetric.model_id, modelMetrics);
            await this.queue.add('performance-monitoring', validatedMetric);
            this.emit('metric_logged', validatedMetric);
        }
        catch (error) {
            logger.error('Failed to log performance metric', { error: error.message, metric });
        }
    }
    async processPerformanceMetric(metric) {
        try {
            await this.storeMetric(metric);
            await this.checkPerformanceAnomalies(metric);
            await this.updatePerformanceAggregates(metric);
            await this.checkDriftDetectionTriggers(metric);
        }
        catch (error) {
            logger.error('Failed to process performance metric', { error: error.message });
        }
    }
    async storeMetric(metric) {
        const date = new Date(metric.timestamp).toISOString().split('T')[0];
        const metricsFile = path.join(this.metricsPath, 'daily', `${date}.jsonl`);
        await fs.appendFile(metricsFile, JSON.stringify(metric) + '\n');
        const cacheKey = `recent_metrics:${metric.model_id}`;
        const recentMetrics = await this.cache.get(cacheKey);
        const metrics = recentMetrics ? JSON.parse(recentMetrics) : [];
        metrics.push(metric);
        if (metrics.length > 1000) {
            metrics.shift();
        }
        await this.cache.set(cacheKey, JSON.stringify(metrics), 3600);
    }
    async checkPerformanceAnomalies(metric) {
        const modelId = metric.model_id;
        const recentMetrics = await this.getRecentMetrics(modelId, 100);
        if (recentMetrics.length < 10)
            return;
        if (metric.metrics.inference_time_ms !== undefined) {
            const recentLatencies = recentMetrics
                .map(m => m.metrics.inference_time_ms)
                .filter(l => l !== undefined);
            if (recentLatencies.length > 0) {
                const avgLatency = recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length;
                const threshold = avgLatency * 2;
                if (metric.metrics.inference_time_ms > threshold) {
                    await this.createAlert({
                        type: 'latency_spike',
                        model_id: modelId,
                        severity: 'high',
                        title: 'High Inference Latency Detected',
                        description: `Inference latency (${metric.metrics.inference_time_ms}ms) is significantly higher than average (${avgLatency.toFixed(2)}ms)`,
                        threshold_value: threshold,
                        current_value: metric.metrics.inference_time_ms,
                        recommendations: [
                            'Check model resource allocation',
                            'Monitor concurrent request load',
                            'Consider scaling inference workers',
                        ],
                    });
                }
            }
        }
        if (metric.metrics.error_rate !== undefined && metric.metrics.error_rate > 0.1) {
            await this.createAlert({
                type: 'error_spike',
                model_id: modelId,
                severity: 'critical',
                title: 'High Error Rate Detected',
                description: `Error rate (${(metric.metrics.error_rate * 100).toFixed(2)}%) is above acceptable threshold`,
                threshold_value: 0.1,
                current_value: metric.metrics.error_rate,
                recommendations: [
                    'Check model health and dependencies',
                    'Review recent model changes',
                    'Investigate infrastructure issues',
                ],
            });
        }
        if (metric.metrics.memory_usage_mb !== undefined) {
            const recentMemoryUsage = recentMetrics
                .map(m => m.metrics.memory_usage_mb)
                .filter(m => m !== undefined);
            if (recentMemoryUsage.length > 0) {
                const avgMemory = recentMemoryUsage.reduce((sum, m) => sum + m, 0) / recentMemoryUsage.length;
                const threshold = avgMemory * 1.5;
                if (metric.metrics.memory_usage_mb > threshold) {
                    await this.createAlert({
                        type: 'resource_anomaly',
                        model_id: modelId,
                        severity: 'medium',
                        title: 'High Memory Usage Detected',
                        description: `Memory usage (${metric.metrics.memory_usage_mb}MB) is significantly higher than average (${avgMemory.toFixed(2)}MB)`,
                        threshold_value: threshold,
                        current_value: metric.metrics.memory_usage_mb,
                        recommendations: [
                            'Monitor for memory leaks',
                            'Check batch size configuration',
                            'Consider memory optimization',
                        ],
                    });
                }
            }
        }
    }
    async updatePerformanceAggregates(metric) {
        const modelId = metric.model_id;
        const aggregateKey = `performance_aggregate:${modelId}`;
        try {
            const existingAggregate = await this.cache.get(aggregateKey);
            const aggregate = existingAggregate ? JSON.parse(existingAggregate) : {
                total_requests: 0,
                total_latency: 0,
                total_errors: 0,
                max_latency: 0,
                min_latency: Infinity,
                last_updated: metric.timestamp,
            };
            aggregate.total_requests++;
            if (metric.metrics.inference_time_ms !== undefined) {
                aggregate.total_latency += metric.metrics.inference_time_ms;
                aggregate.max_latency = Math.max(aggregate.max_latency, metric.metrics.inference_time_ms);
                aggregate.min_latency = Math.min(aggregate.min_latency, metric.metrics.inference_time_ms);
            }
            if (metric.metrics.error_rate !== undefined && metric.metrics.error_rate > 0) {
                aggregate.total_errors++;
            }
            aggregate.last_updated = metric.timestamp;
            await this.cache.set(aggregateKey, JSON.stringify(aggregate), 86400);
        }
        catch (error) {
            logger.warn('Failed to update performance aggregates', { error: error.message, modelId });
        }
    }
    async configureDriftDetection(config) {
        try {
            const validatedConfig = exports.DataDriftConfigSchema.parse(config);
            this.driftConfigs.set(validatedConfig.model_id, validatedConfig);
            await this.saveDriftConfigurations();
            logger.info('Drift detection configured', {
                modelId: validatedConfig.model_id,
                method: validatedConfig.drift_detection_method,
                sensitivity: validatedConfig.sensitivity,
            });
        }
        catch (error) {
            logger.error('Failed to configure drift detection', { error: error.message, config });
            throw error;
        }
    }
    async saveDriftConfigurations() {
        const configPath = path.join(this.metricsPath, 'drift-configs.json');
        const configs = Object.fromEntries(this.driftConfigs);
        await fs.writeJSON(configPath, configs, { spaces: 2 });
    }
    async checkDriftDetectionTriggers(metric) {
        const driftConfig = this.driftConfigs.get(metric.model_id);
        if (!driftConfig)
            return;
        const shouldTrigger = this.shouldTriggerDriftDetection(driftConfig);
        if (shouldTrigger) {
            await this.queue.add('drift-detection', {
                modelId: metric.model_id,
                config: driftConfig,
                triggerMetric: metric,
            });
        }
    }
    shouldTriggerDriftDetection(config) {
        const now = new Date();
        const lastCheck = new Date();
        const hoursSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
        switch (config.monitoring_frequency) {
            case 'real_time':
                return true;
            case 'hourly':
                return hoursSinceLastCheck >= 1;
            case 'daily':
                return hoursSinceLastCheck >= 24;
            case 'weekly':
                return hoursSinceLastCheck >= 168;
            default:
                return false;
        }
    }
    async processDriftDetection(jobData) {
        const { modelId, config, triggerMetric } = jobData;
        try {
            logger.info('Starting drift detection', { modelId, method: config.drift_detection_method });
            const referenceData = await this.getReferenceData(modelId, config.reference_window_size);
            const currentData = await this.getCurrentData(modelId, config.detection_window_size);
            if (referenceData.length < config.minimum_samples || currentData.length < config.minimum_samples) {
                logger.warn('Insufficient data for drift detection', {
                    modelId,
                    referenceSize: referenceData.length,
                    currentSize: currentData.length,
                    required: config.minimum_samples,
                });
                return {
                    id: (0, uuid_1.v4)(),
                    model_id: modelId,
                    timestamp: new Date().toISOString(),
                    drift_detected: false,
                    drift_score: 0,
                    method_used: config.drift_detection_method,
                    affected_features: [],
                    statistical_tests: [],
                    recommendations: ['Collect more data for reliable drift detection'],
                    severity: 'low',
                    metadata: { insufficient_data: true },
                };
            }
            const result = await this.detectDrift(config, referenceData, currentData);
            if (result.drift_detected) {
                await this.createDriftAlert(result);
            }
            await this.storeDriftResult(result);
            this.emit('drift_detection_completed', result);
            logger.info('Drift detection completed', {
                modelId,
                driftDetected: result.drift_detected,
                driftScore: result.drift_score,
                affectedFeatures: result.affected_features.length,
            });
            return result;
        }
        catch (error) {
            logger.error('Drift detection failed', { error: error.message, modelId });
            throw error;
        }
    }
    async detectDrift(config, referenceData, currentData) {
        const result = {
            id: (0, uuid_1.v4)(),
            model_id: config.model_id,
            timestamp: new Date().toISOString(),
            drift_detected: false,
            drift_score: 0,
            method_used: config.drift_detection_method,
            affected_features: [],
            statistical_tests: [],
            recommendations: [],
            severity: 'low',
            metadata: {},
        };
        try {
            switch (config.drift_detection_method) {
                case 'statistical':
                    return await this.statisticalDriftDetection(config, referenceData, currentData, result);
                case 'domain_classifier':
                    return await this.domainClassifierDriftDetection(config, referenceData, currentData, result);
                case 'autoencoder':
                    return await this.autoencoderDriftDetection(config, referenceData, currentData, result);
                case 'ensemble':
                    return await this.ensembleDriftDetection(config, referenceData, currentData, result);
                default:
                    throw new Error(`Unknown drift detection method: ${config.drift_detection_method}`);
            }
        }
        catch (error) {
            result.metadata.error = error.message;
            return result;
        }
    }
    async statisticalDriftDetection(config, referenceData, currentData, result) {
        const features = config.features_to_monitor || ['inference_time_ms', 'confidence_score'];
        for (const feature of features) {
            const refValues = referenceData
                .map(d => d.metrics?.[feature])
                .filter(v => v !== undefined);
            const curValues = currentData
                .map(d => d.metrics?.[feature])
                .filter(v => v !== undefined);
            if (refValues.length === 0 || curValues.length === 0)
                continue;
            const ksStatistic = this.kolmogorovSmirnovTest(refValues, curValues);
            const pValue = this.calculateKSPValue(ksStatistic, refValues.length, curValues.length);
            const driftDetected = pValue < config.sensitivity;
            const driftMagnitude = ksStatistic;
            result.statistical_tests.push({
                feature_name: feature,
                test_name: 'Kolmogorov-Smirnov',
                p_value: pValue,
                drift_detected: driftDetected,
                drift_magnitude: driftMagnitude,
            });
            if (driftDetected) {
                result.affected_features.push(feature);
            }
        }
        const driftTests = result.statistical_tests.filter(t => t.drift_detected);
        result.drift_detected = driftTests.length >= config.alert_thresholds.feature_drift_count;
        result.drift_score = driftTests.length > 0
            ? driftTests.reduce((sum, t) => sum + t.drift_magnitude, 0) / driftTests.length
            : 0;
        if (result.drift_score > 0.8)
            result.severity = 'critical';
        else if (result.drift_score > 0.6)
            result.severity = 'high';
        else if (result.drift_score > 0.4)
            result.severity = 'medium';
        else
            result.severity = 'low';
        if (result.drift_detected) {
            result.recommendations = [
                'Review recent changes to input data pipeline',
                'Consider retraining the model with recent data',
                'Investigate data quality issues',
                'Monitor model performance closely',
            ];
        }
        return result;
    }
    kolmogorovSmirnovTest(sample1, sample2) {
        const sorted1 = [...sample1].sort((a, b) => a - b);
        const sorted2 = [...sample2].sort((a, b) => a - b);
        const allValues = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b);
        let maxDiff = 0;
        for (const value of allValues) {
            const cdf1 = sorted1.filter(x => x <= value).length / sorted1.length;
            const cdf2 = sorted2.filter(x => x <= value).length / sorted2.length;
            const diff = Math.abs(cdf1 - cdf2);
            maxDiff = Math.max(maxDiff, diff);
        }
        return maxDiff;
    }
    calculateKSPValue(ksStatistic, n1, n2) {
        const n = (n1 * n2) / (n1 + n2);
        const lambda = ksStatistic * Math.sqrt(n);
        let pValue = 0;
        for (let k = 1; k <= 100; k++) {
            pValue += Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
        }
        return 2 * Math.max(0, Math.min(1, pValue));
    }
    async domainClassifierDriftDetection(config, referenceData, currentData, result) {
        result.metadata.method_note = 'Domain classifier drift detection not fully implemented';
        return result;
    }
    async autoencoderDriftDetection(config, referenceData, currentData, result) {
        result.metadata.method_note = 'Autoencoder drift detection not fully implemented';
        return result;
    }
    async ensembleDriftDetection(config, referenceData, currentData, result) {
        const methods = ['statistical'];
        const results = [];
        for (const method of methods) {
            const methodConfig = { ...config, drift_detection_method: method };
            const methodResult = await this.detectDrift(methodConfig, referenceData, currentData);
            results.push(methodResult);
        }
        const driftVotes = results.filter(r => r.drift_detected).length;
        result.drift_detected = driftVotes > results.length / 2;
        result.drift_score = results.reduce((sum, r) => sum + r.drift_score, 0) / results.length;
        const allAffectedFeatures = new Set();
        results.forEach(r => r.affected_features.forEach(f => allAffectedFeatures.add(f)));
        result.affected_features = Array.from(allAffectedFeatures);
        result.statistical_tests = results.flatMap(r => r.statistical_tests);
        return result;
    }
    async getReferenceData(modelId, windowSize) {
        const cacheKey = `reference_data:${modelId}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            const data = JSON.parse(cached);
            return data.slice(-windowSize);
        }
        return this.loadReferenceDataFromStorage(modelId, windowSize);
    }
    async getCurrentData(modelId, windowSize) {
        const recentMetrics = await this.getRecentMetrics(modelId, windowSize);
        return recentMetrics;
    }
    async loadReferenceDataFromStorage(modelId, windowSize) {
        const data = [];
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            for (let i = 0; i < 30; i++) {
                const date = new Date(thirtyDaysAgo);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const metricsFile = path.join(this.metricsPath, 'daily', `${dateStr}.jsonl`);
                if (await fs.pathExists(metricsFile)) {
                    const fileContent = await fs.readFile(metricsFile, 'utf-8');
                    const lines = fileContent.trim().split('\n');
                    for (const line of lines) {
                        try {
                            const metric = JSON.parse(line);
                            if (metric.model_id === modelId) {
                                data.push(metric);
                            }
                        }
                        catch (e) {
                        }
                    }
                }
            }
            const cacheKey = `reference_data:${modelId}`;
            await this.cache.set(cacheKey, JSON.stringify(data), 86400);
        }
        catch (error) {
            logger.warn('Failed to load reference data from storage', { error: error.message, modelId });
        }
        return data.slice(-windowSize);
    }
    async getRecentMetrics(modelId, limit) {
        const cacheKey = `recent_metrics:${modelId}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            const metrics = JSON.parse(cached);
            return metrics.slice(-limit);
        }
        const buffered = this.metricsBuffer.get(modelId) || [];
        return buffered.slice(-limit);
    }
    async createAlert(alertData) {
        const alert = {
            id: (0, uuid_1.v4)(),
            triggered_at: new Date().toISOString(),
            status: 'active',
            metadata: {},
            ...alertData,
        };
        this.activeAlerts.set(alert.id, alert);
        await this.saveActiveAlerts();
        this.emit('alert_created', alert);
        logger.warn('Performance alert created', {
            alertId: alert.id,
            type: alert.type,
            modelId: alert.model_id,
            severity: alert.severity,
        });
        return alert.id;
    }
    async createDriftAlert(driftResult) {
        await this.createAlert({
            type: 'data_drift',
            model_id: driftResult.model_id,
            severity: driftResult.severity,
            title: 'Data Drift Detected',
            description: `Data drift detected with score ${driftResult.drift_score.toFixed(3)}. Affected features: ${driftResult.affected_features.join(', ')}`,
            threshold_value: 0.5,
            current_value: driftResult.drift_score,
            recommendations: driftResult.recommendations,
            metadata: {
                drift_result_id: driftResult.id,
                method_used: driftResult.method_used,
                affected_features: driftResult.affected_features,
            },
        });
    }
    async saveActiveAlerts() {
        const alertsPath = path.join(this.metricsPath, 'alerts', 'active-alerts.json');
        const alerts = Object.fromEntries(this.activeAlerts);
        await fs.writeJSON(alertsPath, alerts, { spaces: 2 });
    }
    async storeDriftResult(result) {
        const resultsPath = path.join(this.metricsPath, 'drift-results.jsonl');
        await fs.appendFile(resultsPath, JSON.stringify(result) + '\n');
    }
    async startContinuousMonitoring() {
        if (this.isMonitoring) {
            logger.warn('Continuous monitoring already running');
            return;
        }
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.performPeriodicTasks();
            }
            catch (error) {
                logger.error('Periodic monitoring task failed', { error: error.message });
            }
        }, 60000);
        logger.info('Continuous monitoring started');
    }
    async stopContinuousMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.isMonitoring = false;
        logger.info('Continuous monitoring stopped');
    }
    async performPeriodicTasks() {
        await this.flushMetricsBuffer();
        await this.checkAlertAutoResolution();
        await this.cleanupOldData();
    }
    async flushMetricsBuffer() {
        for (const [modelId, metrics] of this.metricsBuffer.entries()) {
            if (metrics.length > 0) {
                for (const metric of metrics) {
                    await this.storeMetric(metric);
                }
                this.metricsBuffer.set(modelId, []);
            }
        }
    }
    async checkAlertAutoResolution() {
        const activeAlerts = Array.from(this.activeAlerts.values())
            .filter(alert => alert.status === 'active');
        for (const alert of activeAlerts) {
            const shouldResolve = await this.shouldAutoResolveAlert(alert);
            if (shouldResolve) {
                await this.resolveAlert(alert.id, 'Auto-resolved: conditions normalized');
            }
        }
    }
    async shouldAutoResolveAlert(alert) {
        const recentMetrics = await this.getRecentMetrics(alert.model_id, 10);
        if (recentMetrics.length === 0)
            return false;
        switch (alert.type) {
            case 'latency_spike':
                const recentLatencies = recentMetrics
                    .map(m => m.metrics.inference_time_ms)
                    .filter(l => l !== undefined);
                if (recentLatencies.length > 0) {
                    const avgLatency = recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length;
                    return avgLatency < alert.threshold_value;
                }
                break;
            case 'error_spike':
                const recentErrorRates = recentMetrics
                    .map(m => m.metrics.error_rate)
                    .filter(r => r !== undefined);
                if (recentErrorRates.length > 0) {
                    const avgErrorRate = recentErrorRates.reduce((sum, r) => sum + r, 0) / recentErrorRates.length;
                    return avgErrorRate < alert.threshold_value;
                }
                break;
        }
        return false;
    }
    async resolveAlert(alertId, resolution) {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) {
            throw new Error(`Alert ${alertId} not found`);
        }
        alert.status = 'resolved';
        alert.resolved_at = new Date().toISOString();
        alert.metadata.resolution = resolution;
        await this.saveActiveAlerts();
        this.emit('alert_resolved', alert);
        logger.info('Alert resolved', { alertId, resolution });
    }
    async cleanupOldData() {
        const dailyPath = path.join(this.metricsPath, 'daily');
        const files = await fs.readdir(dailyPath).catch(() => []);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);
        for (const file of files) {
            const fileDate = new Date(file.replace('.jsonl', ''));
            if (fileDate < cutoffDate) {
                await fs.remove(path.join(dailyPath, file)).catch(() => { });
            }
        }
    }
    async getModelDashboard(modelId, timeRange = '24h') {
        const model = await this.getModelInfo(modelId);
        const metrics = await this.getMetricsForTimeRange(modelId, timeRange);
        const alerts = Array.from(this.activeAlerts.values())
            .filter(alert => alert.model_id === modelId && alert.status === 'active');
        const summary = this.calculateSummaryMetrics(metrics);
        const trends = this.calculateTrends(metrics, timeRange);
        const driftStatus = await this.getDriftStatus(modelId);
        return {
            model_id: modelId,
            model_name: model?.name || 'Unknown',
            time_range: timeRange,
            summary,
            trends,
            alerts,
            drift_status: driftStatus,
        };
    }
    async getModelInfo(modelId) {
        return { name: 'Model ' + modelId };
    }
    async getMetricsForTimeRange(modelId, timeRange) {
        const metrics = [];
        const recentMetrics = await this.getRecentMetrics(modelId, 1000);
        const now = new Date();
        const timeRangeMs = this.parseTimeRange(timeRange);
        const cutoff = new Date(now.getTime() - timeRangeMs);
        return recentMetrics.filter(metric => new Date(metric.timestamp) >= cutoff);
    }
    parseTimeRange(timeRange) {
        const unit = timeRange.slice(-1);
        const value = parseInt(timeRange.slice(0, -1));
        switch (unit) {
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            case 'w': return value * 7 * 24 * 60 * 60 * 1000;
            default: return 24 * 60 * 60 * 1000;
        }
    }
    calculateSummaryMetrics(metrics) {
        if (metrics.length === 0) {
            return {
                total_requests: 0,
                avg_latency_ms: 0,
                p95_latency_ms: 0,
                p99_latency_ms: 0,
                error_rate: 0,
                throughput_rps: 0,
                uptime_percentage: 0,
            };
        }
        const latencies = metrics
            .map(m => m.metrics.inference_time_ms)
            .filter(l => l !== undefined)
            .sort((a, b) => a - b);
        const errorRates = metrics
            .map(m => m.metrics.error_rate)
            .filter(r => r !== undefined);
        const avgLatency = latencies.length > 0
            ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
            : 0;
        const p95Index = Math.floor(latencies.length * 0.95);
        const p99Index = Math.floor(latencies.length * 0.99);
        const avgErrorRate = errorRates.length > 0
            ? errorRates.reduce((sum, r) => sum + r, 0) / errorRates.length
            : 0;
        return {
            total_requests: metrics.length,
            avg_latency_ms: avgLatency,
            p95_latency_ms: latencies[p95Index] || 0,
            p99_latency_ms: latencies[p99Index] || 0,
            error_rate: avgErrorRate,
            throughput_rps: metrics.length / (24 * 60 * 60),
            uptime_percentage: (1 - avgErrorRate) * 100,
        };
    }
    calculateTrends(metrics, timeRange) {
        const buckets = this.groupMetricsByTimeBuckets(metrics, timeRange);
        return {
            latency_trend: buckets.map(bucket => ({
                timestamp: bucket.timestamp,
                value: bucket.avgLatency,
            })),
            throughput_trend: buckets.map(bucket => ({
                timestamp: bucket.timestamp,
                value: bucket.requestCount,
            })),
            error_trend: buckets.map(bucket => ({
                timestamp: bucket.timestamp,
                value: bucket.errorRate,
            })),
            resource_usage_trend: buckets.map(bucket => ({
                timestamp: bucket.timestamp,
                cpu: bucket.avgCpuUsage,
                memory: bucket.avgMemoryUsage,
                gpu: bucket.avgGpuUsage,
            })),
        };
    }
    groupMetricsByTimeBuckets(metrics, timeRange) {
        const bucketSize = this.parseTimeRange(timeRange) / 20;
        const buckets = [];
        if (metrics.length === 0)
            return buckets;
        const startTime = new Date(metrics[0].timestamp).getTime();
        const endTime = new Date(metrics[metrics.length - 1].timestamp).getTime();
        for (let time = startTime; time <= endTime; time += bucketSize) {
            const bucketMetrics = metrics.filter(m => {
                const metricTime = new Date(m.timestamp).getTime();
                return metricTime >= time && metricTime < time + bucketSize;
            });
            if (bucketMetrics.length > 0) {
                const latencies = bucketMetrics.map(m => m.metrics.inference_time_ms).filter(l => l !== undefined);
                const errorRates = bucketMetrics.map(m => m.metrics.error_rate).filter(r => r !== undefined);
                const cpuUsages = bucketMetrics.map(m => m.metrics.cpu_usage_percent).filter(c => c !== undefined);
                const memoryUsages = bucketMetrics.map(m => m.metrics.memory_usage_mb).filter(m => m !== undefined);
                const gpuUsages = bucketMetrics.map(m => m.metrics.gpu_utilization_percent).filter(g => g !== undefined);
                buckets.push({
                    timestamp: new Date(time).toISOString(),
                    requestCount: bucketMetrics.length,
                    avgLatency: latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0,
                    errorRate: errorRates.length > 0 ? errorRates.reduce((sum, r) => sum + r, 0) / errorRates.length : 0,
                    avgCpuUsage: cpuUsages.length > 0 ? cpuUsages.reduce((sum, c) => sum + c, 0) / cpuUsages.length : 0,
                    avgMemoryUsage: memoryUsages.length > 0 ? memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length : 0,
                    avgGpuUsage: gpuUsages.length > 0 ? gpuUsages.reduce((sum, g) => sum + g, 0) / gpuUsages.length : 0,
                });
            }
        }
        return buckets;
    }
    async getDriftStatus(modelId) {
        const driftConfig = this.driftConfigs.get(modelId);
        return {
            drift_detected: false,
            last_check: new Date().toISOString(),
            drift_score: 0,
            affected_features: [],
            monitoring_enabled: !!driftConfig,
        };
    }
    getServiceMetrics() {
        const totalAlerts = this.activeAlerts.size;
        const activeAlerts = Array.from(this.activeAlerts.values()).filter(a => a.status === 'active');
        const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
        return {
            models_monitored: this.metricsBuffer.size,
            drift_configs: this.driftConfigs.size,
            total_alerts: totalAlerts,
            active_alerts: activeAlerts.length,
            critical_alerts: criticalAlerts.length,
            monitoring_active: this.isMonitoring,
        };
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=performance-monitor.js.map