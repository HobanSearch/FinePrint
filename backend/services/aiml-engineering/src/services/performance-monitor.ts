import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { QueueService } from '@fineprintai/queue';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';

const logger = createServiceLogger('performance-monitor');

// Performance Metrics Schema
export const PerformanceMetricSchema = z.object({
  model_id: z.string(),
  model_name: z.string(),
  model_version: z.string(),
  timestamp: z.string(),
  request_id: z.string().optional(),
  metrics: z.object({
    // Inference Metrics
    inference_time_ms: z.number().min(0).optional(),
    queue_time_ms: z.number().min(0).optional(),
    preprocessing_time_ms: z.number().min(0).optional(),
    postprocessing_time_ms: z.number().min(0).optional(),
    total_time_ms: z.number().min(0).optional(),
    
    // Quality Metrics
    accuracy: z.number().min(0).max(1).optional(),
    confidence_score: z.number().min(0).max(1).optional(),
    prediction_quality: z.number().min(0).max(1).optional(),
    
    // Resource Metrics
    cpu_usage_percent: z.number().min(0).max(100).optional(),
    memory_usage_mb: z.number().min(0).optional(),
    gpu_utilization_percent: z.number().min(0).max(100).optional(),
    gpu_memory_usage_mb: z.number().min(0).optional(),
    
    // Throughput Metrics
    requests_per_second: z.number().min(0).optional(),
    concurrent_requests: z.number().min(0).optional(),
    queue_length: z.number().min(0).optional(),
    
    // Error Metrics
    error_rate: z.number().min(0).max(1).optional(),
    timeout_rate: z.number().min(0).max(1).optional(),
    
    // Custom Metrics
    custom: z.record(z.number()).optional(),
  }),
  metadata: z.record(z.any()).optional(),
});

export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;

// Data Drift Detection Schema
export const DataDriftConfigSchema = z.object({
  model_id: z.string(),
  drift_detection_method: z.enum(['statistical', 'domain_classifier', 'autoencoder', 'ensemble']).default('statistical'),
  reference_window_size: z.number().min(100).default(1000),
  detection_window_size: z.number().min(50).default(500),
  sensitivity: z.number().min(0).max(1).default(0.05), // p-value threshold
  minimum_samples: z.number().min(10).default(100),
  features_to_monitor: z.array(z.string()).optional(),
  alert_thresholds: z.object({
    drift_score: z.number().min(0).max(1).default(0.7),
    feature_drift_count: z.number().min(1).default(3),
    consecutive_alerts: z.number().min(1).default(2),
  }),
  monitoring_frequency: z.enum(['real_time', 'hourly', 'daily', 'weekly']).default('hourly'),
});

export type DataDriftConfig = z.infer<typeof DataDriftConfigSchema>;

// Drift Detection Result
export interface DriftDetectionResult {
  id: string;
  model_id: string;
  timestamp: string;
  drift_detected: boolean;
  drift_score: number;
  method_used: string;
  affected_features: string[];
  statistical_tests: {
    feature_name: string;
    test_name: string;
    p_value: number;
    drift_detected: boolean;
    drift_magnitude: number;
  }[];
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

// Performance Alert
export interface PerformanceAlert {
  id: string;
  type: 'performance_degradation' | 'data_drift' | 'resource_anomaly' | 'error_spike' | 'latency_spike';
  model_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  triggered_at: string;
  resolved_at?: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  threshold_value: number;
  current_value: number;
  recommendations: string[];
  metadata: Record<string, any>;
}

// Model Performance Dashboard Data
export interface ModelPerformanceDashboard {
  model_id: string;
  model_name: string;
  time_range: string;
  summary: {
    total_requests: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    error_rate: number;
    throughput_rps: number;
    uptime_percentage: number;
  };
  trends: {
    latency_trend: Array<{ timestamp: string; value: number }>;
    throughput_trend: Array<{ timestamp: string; value: number }>;
    error_trend: Array<{ timestamp: string; value: number }>;
    resource_usage_trend: Array<{ timestamp: string; cpu: number; memory: number; gpu?: number }>;
  };
  alerts: PerformanceAlert[];
  drift_status: {
    drift_detected: boolean;
    last_check: string;
    drift_score: number;
    affected_features: string[];
  };
}

export class PerformanceMonitor extends EventEmitter {
  private cache: CacheService;
  private queue: QueueService;
  
  private metricsBuffer: Map<string, PerformanceMetric[]> = new Map();
  private driftConfigs: Map<string, DataDriftConfig> = new Map();
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private referenceData: Map<string, any[]> = new Map();
  
  private metricsPath: string;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  constructor() {
    super();
    this.cache = new CacheService();
    this.queue = new QueueService();
    this.metricsPath = path.join(process.cwd(), 'data', 'performance-metrics');
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Performance Monitor');

      // Ensure directories exist
      await fs.ensureDir(this.metricsPath);
      await fs.ensureDir(path.join(this.metricsPath, 'daily'));
      await fs.ensureDir(path.join(this.metricsPath, 'alerts'));

      // Initialize monitoring queue
      await this.initializeMonitoringQueue();

      // Load existing configurations
      await this.loadDriftConfigurations();

      // Load active alerts
      await this.loadActiveAlerts();

      logger.info('Performance Monitor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Performance Monitor', { error: error.message });
      throw error;
    }
  }

  private async initializeMonitoringQueue(): Promise<void> {
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

  private async loadDriftConfigurations(): Promise<void> {
    try {
      const configPath = path.join(this.metricsPath, 'drift-configs.json');
      if (await fs.pathExists(configPath)) {
        const configs = await fs.readJSON(configPath);
        Object.entries(configs).forEach(([modelId, config]) => {
          this.driftConfigs.set(modelId, config as DataDriftConfig);
        });
        logger.info(`Loaded ${this.driftConfigs.size} drift configurations`);
      }
    } catch (error) {
      logger.warn('Failed to load drift configurations', { error: error.message });
    }
  }

  private async loadActiveAlerts(): Promise<void> {
    try {
      const alertsPath = path.join(this.metricsPath, 'alerts', 'active-alerts.json');
      if (await fs.pathExists(alertsPath)) {
        const alerts = await fs.readJSON(alertsPath);
        Object.entries(alerts).forEach(([alertId, alert]) => {
          this.activeAlerts.set(alertId, alert as PerformanceAlert);
        });
        logger.info(`Loaded ${this.activeAlerts.size} active alerts`);
      }
    } catch (error) {
      logger.warn('Failed to load active alerts', { error: error.message });
    }
  }

  // Metrics Collection
  async logMetrics(metric: PerformanceMetric): Promise<void> {
    try {
      const validatedMetric = PerformanceMetricSchema.parse(metric);
      
      // Add to buffer
      const modelMetrics = this.metricsBuffer.get(validatedMetric.model_id) || [];
      modelMetrics.push(validatedMetric);
      this.metricsBuffer.set(validatedMetric.model_id, modelMetrics);
      
      // Queue for processing
      await this.queue.add('performance-monitoring', validatedMetric);
      
      // Emit event for real-time monitoring
      this.emit('metric_logged', validatedMetric);
      
    } catch (error) {
      logger.error('Failed to log performance metric', { error: error.message, metric });
    }
  }

  private async processPerformanceMetric(metric: PerformanceMetric): Promise<void> {
    try {
      // Store metric in time-series database (simplified with file storage)
      await this.storeMetric(metric);
      
      // Check for performance anomalies
      await this.checkPerformanceAnomalies(metric);
      
      // Update performance aggregates
      await this.updatePerformanceAggregates(metric);
      
      // Check drift detection triggers
      await this.checkDriftDetectionTriggers(metric);
      
    } catch (error) {
      logger.error('Failed to process performance metric', { error: error.message });
    }
  }

  private async storeMetric(metric: PerformanceMetric): Promise<void> {
    const date = new Date(metric.timestamp).toISOString().split('T')[0];
    const metricsFile = path.join(this.metricsPath, 'daily', `${date}.jsonl`);
    
    // Append metric to daily file
    await fs.appendFile(metricsFile, JSON.stringify(metric) + '\n');
    
    // Cache recent metrics for quick access
    const cacheKey = `recent_metrics:${metric.model_id}`;
    const recentMetrics = await this.cache.get(cacheKey);
    const metrics = recentMetrics ? JSON.parse(recentMetrics) : [];
    
    metrics.push(metric);
    if (metrics.length > 1000) { // Keep last 1000 metrics
      metrics.shift();
    }
    
    await this.cache.set(cacheKey, JSON.stringify(metrics), 3600);
  }

  private async checkPerformanceAnomalies(metric: PerformanceMetric): Promise<void> {
    const modelId = metric.model_id;
    
    // Get recent metrics for comparison
    const recentMetrics = await this.getRecentMetrics(modelId, 100);
    if (recentMetrics.length < 10) return; // Need enough data for comparison
    
    // Check latency anomalies
    if (metric.metrics.inference_time_ms !== undefined) {
      const recentLatencies = recentMetrics
        .map(m => m.metrics.inference_time_ms)
        .filter(l => l !== undefined) as number[];
      
      if (recentLatencies.length > 0) {
        const avgLatency = recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length;
        const threshold = avgLatency * 2; // 2x average as threshold
        
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
    
    // Check error rate anomalies
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
    
    // Check resource usage anomalies
    if (metric.metrics.memory_usage_mb !== undefined) {
      const recentMemoryUsage = recentMetrics
        .map(m => m.metrics.memory_usage_mb)
        .filter(m => m !== undefined) as number[];
      
      if (recentMemoryUsage.length > 0) {
        const avgMemory = recentMemoryUsage.reduce((sum, m) => sum + m, 0) / recentMemoryUsage.length;
        const threshold = avgMemory * 1.5; // 1.5x average as threshold
        
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

  private async updatePerformanceAggregates(metric: PerformanceMetric): Promise<void> {
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
      
      // Update aggregates
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
      
      await this.cache.set(aggregateKey, JSON.stringify(aggregate), 86400); // 24 hours
    } catch (error) {
      logger.warn('Failed to update performance aggregates', { error: error.message, modelId });
    }
  }

  // Data Drift Detection
  async configureDriftDetection(config: DataDriftConfig): Promise<void> {
    try {
      const validatedConfig = DataDriftConfigSchema.parse(config);
      
      this.driftConfigs.set(validatedConfig.model_id, validatedConfig);
      
      // Save configuration
      await this.saveDriftConfigurations();
      
      logger.info('Drift detection configured', {
        modelId: validatedConfig.model_id,
        method: validatedConfig.drift_detection_method,
        sensitivity: validatedConfig.sensitivity,
      });
    } catch (error) {
      logger.error('Failed to configure drift detection', { error: error.message, config });
      throw error;
    }
  }

  private async saveDriftConfigurations(): Promise<void> {
    const configPath = path.join(this.metricsPath, 'drift-configs.json');
    const configs = Object.fromEntries(this.driftConfigs);
    await fs.writeJSON(configPath, configs, { spaces: 2 });
  }

  private async checkDriftDetectionTriggers(metric: PerformanceMetric): Promise<void> {
    const driftConfig = this.driftConfigs.get(metric.model_id);
    if (!driftConfig) return;
    
    const shouldTrigger = this.shouldTriggerDriftDetection(driftConfig);
    if (shouldTrigger) {
      await this.queue.add('drift-detection', {
        modelId: metric.model_id,
        config: driftConfig,
        triggerMetric: metric,
      });
    }
  }

  private shouldTriggerDriftDetection(config: DataDriftConfig): boolean {
    // Implement frequency-based triggering logic
    const now = new Date();
    const lastCheck = new Date(); // Would be stored and retrieved
    
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

  private async processDriftDetection(jobData: any): Promise<DriftDetectionResult> {
    const { modelId, config, triggerMetric } = jobData;
    
    try {
      logger.info('Starting drift detection', { modelId, method: config.drift_detection_method });
      
      // Get reference data
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
          id: uuidv4(),
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
      
      // Perform drift detection based on method
      const result = await this.detectDrift(config, referenceData, currentData);
      
      // Create alert if drift detected
      if (result.drift_detected) {
        await this.createDriftAlert(result);
      }
      
      // Store result
      await this.storeDriftResult(result);
      
      // Emit event
      this.emit('drift_detection_completed', result);
      
      logger.info('Drift detection completed', {
        modelId,
        driftDetected: result.drift_detected,
        driftScore: result.drift_score,
        affectedFeatures: result.affected_features.length,
      });
      
      return result;
    } catch (error) {
      logger.error('Drift detection failed', { error: error.message, modelId });
      throw error;
    }
  }

  private async detectDrift(
    config: DataDriftConfig,
    referenceData: any[],
    currentData: any[]
  ): Promise<DriftDetectionResult> {
    const result: DriftDetectionResult = {
      id: uuidv4(),
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
    } catch (error) {
      result.metadata.error = error.message;
      return result;
    }
  }

  private async statisticalDriftDetection(
    config: DataDriftConfig,
    referenceData: any[],
    currentData: any[],
    result: DriftDetectionResult
  ): Promise<DriftDetectionResult> {
    // Simplified statistical drift detection using KS test
    const features = config.features_to_monitor || ['inference_time_ms', 'confidence_score'];
    
    for (const feature of features) {
      const refValues = referenceData
        .map(d => d.metrics?.[feature])
        .filter(v => v !== undefined);
      const curValues = currentData
        .map(d => d.metrics?.[feature])
        .filter(v => v !== undefined);
      
      if (refValues.length === 0 || curValues.length === 0) continue;
      
      // Simplified KS test implementation
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
    
    // Calculate overall drift score
    const driftTests = result.statistical_tests.filter(t => t.drift_detected);
    result.drift_detected = driftTests.length >= config.alert_thresholds.feature_drift_count;
    result.drift_score = driftTests.length > 0 
      ? driftTests.reduce((sum, t) => sum + t.drift_magnitude, 0) / driftTests.length
      : 0;
    
    // Determine severity
    if (result.drift_score > 0.8) result.severity = 'critical';
    else if (result.drift_score > 0.6) result.severity = 'high';
    else if (result.drift_score > 0.4) result.severity = 'medium';
    else result.severity = 'low';
    
    // Generate recommendations
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

  private kolmogorovSmirnovTest(sample1: number[], sample2: number[]): number {
    // Sort samples
    const sorted1 = [...sample1].sort((a, b) => a - b);
    const sorted2 = [...sample2].sort((a, b) => a - b);
    
    // Get all unique values
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

  private calculateKSPValue(ksStatistic: number, n1: number, n2: number): number {
    // Simplified p-value calculation for KS test
    const n = (n1 * n2) / (n1 + n2);
    const lambda = ksStatistic * Math.sqrt(n);
    
    // Approximate p-value using asymptotic formula
    let pValue = 0;
    for (let k = 1; k <= 100; k++) {
      pValue += Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
    }
    return 2 * Math.max(0, Math.min(1, pValue));
  }

  private async domainClassifierDriftDetection(
    config: DataDriftConfig,
    referenceData: any[],
    currentData: any[],
    result: DriftDetectionResult
  ): Promise<DriftDetectionResult> {
    // Placeholder for domain classifier approach
    result.metadata.method_note = 'Domain classifier drift detection not fully implemented';
    return result;
  }

  private async autoencoderDriftDetection(
    config: DataDriftConfig,
    referenceData: any[],
    currentData: any[],
    result: DriftDetectionResult
  ): Promise<DriftDetectionResult> {
    // Placeholder for autoencoder approach
    result.metadata.method_note = 'Autoencoder drift detection not fully implemented';
    return result;
  }

  private async ensembleDriftDetection(
    config: DataDriftConfig,
    referenceData: any[],
    currentData: any[],
    result: DriftDetectionResult
  ): Promise<DriftDetectionResult> {
    // Combine multiple methods
    const methods = ['statistical'];
    const results: DriftDetectionResult[] = [];
    
    for (const method of methods) {
      const methodConfig = { ...config, drift_detection_method: method as any };
      const methodResult = await this.detectDrift(methodConfig, referenceData, currentData);
      results.push(methodResult);
    }
    
    // Ensemble decision
    const driftVotes = results.filter(r => r.drift_detected).length;
    result.drift_detected = driftVotes > results.length / 2;
    result.drift_score = results.reduce((sum, r) => sum + r.drift_score, 0) / results.length;
    
    // Combine affected features
    const allAffectedFeatures = new Set<string>();
    results.forEach(r => r.affected_features.forEach(f => allAffectedFeatures.add(f)));
    result.affected_features = Array.from(allAffectedFeatures);
    
    // Combine statistical tests
    result.statistical_tests = results.flatMap(r => r.statistical_tests);
    
    return result;
  }

  private async getReferenceData(modelId: string, windowSize: number): Promise<any[]> {
    // Get reference data from cache or storage
    const cacheKey = `reference_data:${modelId}`;
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      const data = JSON.parse(cached);
      return data.slice(-windowSize);
    }
    
    // Load from storage if not cached
    return this.loadReferenceDataFromStorage(modelId, windowSize);
  }

  private async getCurrentData(modelId: string, windowSize: number): Promise<any[]> {
    const recentMetrics = await this.getRecentMetrics(modelId, windowSize);
    return recentMetrics;
  }

  private async loadReferenceDataFromStorage(modelId: string, windowSize: number): Promise<any[]> {
    // Load reference data from historical metrics
    const data: any[] = [];
    
    try {
      // Get last 30 days of data as reference
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
            } catch (e) {
              // Skip invalid lines
            }
          }
        }
      }
      
      // Cache reference data
      const cacheKey = `reference_data:${modelId}`;
      await this.cache.set(cacheKey, JSON.stringify(data), 86400); // 24 hours
      
    } catch (error) {
      logger.warn('Failed to load reference data from storage', { error: error.message, modelId });
    }
    
    return data.slice(-windowSize);
  }

  private async getRecentMetrics(modelId: string, limit: number): Promise<PerformanceMetric[]> {
    const cacheKey = `recent_metrics:${modelId}`;
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      const metrics = JSON.parse(cached);
      return metrics.slice(-limit);
    }
    
    // Fallback to buffer
    const buffered = this.metricsBuffer.get(modelId) || [];
    return buffered.slice(-limit);
  }

  // Alert Management
  private async createAlert(alertData: Partial<PerformanceAlert>): Promise<string> {
    const alert: PerformanceAlert = {
      id: uuidv4(),
      triggered_at: new Date().toISOString(),
      status: 'active',
      metadata: {},
      ...alertData,
    } as PerformanceAlert;
    
    this.activeAlerts.set(alert.id, alert);
    await this.saveActiveAlerts();
    
    // Emit alert event
    this.emit('alert_created', alert);
    
    logger.warn('Performance alert created', {
      alertId: alert.id,
      type: alert.type,
      modelId: alert.model_id,
      severity: alert.severity,
    });
    
    return alert.id;
  }

  private async createDriftAlert(driftResult: DriftDetectionResult): Promise<void> {
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

  private async saveActiveAlerts(): Promise<void> {
    const alertsPath = path.join(this.metricsPath, 'alerts', 'active-alerts.json');
    const alerts = Object.fromEntries(this.activeAlerts);
    await fs.writeJSON(alertsPath, alerts, { spaces: 2 });
  }

  private async storeDriftResult(result: DriftDetectionResult): Promise<void> {
    const resultsPath = path.join(this.metricsPath, 'drift-results.jsonl');
    await fs.appendFile(resultsPath, JSON.stringify(result) + '\n');
  }

  // Continuous Monitoring
  async startContinuousMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Continuous monitoring already running');
      return;
    }
    
    this.isMonitoring = true;
    
    // Start periodic tasks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performPeriodicTasks();
      } catch (error) {
        logger.error('Periodic monitoring task failed', { error: error.message });
      }
    }, 60000); // Run every minute
    
    logger.info('Continuous monitoring started');
  }

  async stopContinuousMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.isMonitoring = false;
    logger.info('Continuous monitoring stopped');
  }

  private async performPeriodicTasks(): Promise<void> {
    // Flush metrics buffer to storage
    await this.flushMetricsBuffer();
    
    // Check for alert auto-resolution
    await this.checkAlertAutoResolution();
    
    // Cleanup old data
    await this.cleanupOldData();
  }

  private async flushMetricsBuffer(): Promise<void> {
    for (const [modelId, metrics] of this.metricsBuffer.entries()) {
      if (metrics.length > 0) {
        // Process buffered metrics
        for (const metric of metrics) {
          await this.storeMetric(metric);
        }
        
        // Clear buffer
        this.metricsBuffer.set(modelId, []);
      }
    }
  }

  private async checkAlertAutoResolution(): Promise<void> {
    const activeAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'active');
    
    for (const alert of activeAlerts) {
      // Check if conditions for auto-resolution are met
      const shouldResolve = await this.shouldAutoResolveAlert(alert);
      
      if (shouldResolve) {
        await this.resolveAlert(alert.id, 'Auto-resolved: conditions normalized');
      }
    }
  }

  private async shouldAutoResolveAlert(alert: PerformanceAlert): Promise<boolean> {
    // Get recent metrics to check if alert condition still exists
    const recentMetrics = await this.getRecentMetrics(alert.model_id, 10);
    
    if (recentMetrics.length === 0) return false;
    
    // Check based on alert type
    switch (alert.type) {
      case 'latency_spike':
        const recentLatencies = recentMetrics
          .map(m => m.metrics.inference_time_ms)
          .filter(l => l !== undefined) as number[];
        
        if (recentLatencies.length > 0) {
          const avgLatency = recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length;
          return avgLatency < alert.threshold_value;
        }
        break;
        
      case 'error_spike':
        const recentErrorRates = recentMetrics
          .map(m => m.metrics.error_rate)
          .filter(r => r !== undefined) as number[];
        
        if (recentErrorRates.length > 0) {
          const avgErrorRate = recentErrorRates.reduce((sum, r) => sum + r, 0) / recentErrorRates.length;
          return avgErrorRate < alert.threshold_value;
        }
        break;
    }
    
    return false;
  }

  async resolveAlert(alertId: string, resolution: string): Promise<void> {
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

  private async cleanupOldData(): Promise<void> {
    // Clean up old daily metric files (keep last 90 days)
    const dailyPath = path.join(this.metricsPath, 'daily');
    const files = await fs.readdir(dailyPath).catch(() => []);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    for (const file of files) {
      const fileDate = new Date(file.replace('.jsonl', ''));
      if (fileDate < cutoffDate) {
        await fs.remove(path.join(dailyPath, file)).catch(() => {});
      }
    }
  }

  // Public API Methods
  async getModelDashboard(modelId: string, timeRange: string = '24h'): Promise<ModelPerformanceDashboard> {
    const model = await this.getModelInfo(modelId);
    const metrics = await this.getMetricsForTimeRange(modelId, timeRange);
    const alerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.model_id === modelId && alert.status === 'active');
    
    // Calculate summary metrics
    const summary = this.calculateSummaryMetrics(metrics);
    
    // Generate trends
    const trends = this.calculateTrends(metrics, timeRange);
    
    // Get drift status
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

  private async getModelInfo(modelId: string): Promise<any> {
    // This would integrate with the model registry
    return { name: 'Model ' + modelId };
  }

  private async getMetricsForTimeRange(modelId: string, timeRange: string): Promise<PerformanceMetric[]> {
    // Parse time range and load metrics
    const metrics: PerformanceMetric[] = [];
    
    // Get from cache first
    const recentMetrics = await this.getRecentMetrics(modelId, 1000);
    
    const now = new Date();
    const timeRangeMs = this.parseTimeRange(timeRange);
    const cutoff = new Date(now.getTime() - timeRangeMs);
    
    return recentMetrics.filter(metric => 
      new Date(metric.timestamp) >= cutoff
    );
  }

  private parseTimeRange(timeRange: string): number {
    const unit = timeRange.slice(-1);
    const value = parseInt(timeRange.slice(0, -1));
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  }

  private calculateSummaryMetrics(metrics: PerformanceMetric[]): any {
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
      .sort((a, b) => a - b) as number[];
    
    const errorRates = metrics
      .map(m => m.metrics.error_rate)
      .filter(r => r !== undefined) as number[];
    
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
      throughput_rps: metrics.length / (24 * 60 * 60), // Simplified calculation
      uptime_percentage: (1 - avgErrorRate) * 100,
    };
  }

  private calculateTrends(metrics: PerformanceMetric[], timeRange: string): any {
    // Group metrics by time buckets for trend calculation
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

  private groupMetricsByTimeBuckets(metrics: PerformanceMetric[], timeRange: string): any[] {
    // Simplified bucketing - would be more sophisticated in production
    const bucketSize = this.parseTimeRange(timeRange) / 20; // 20 buckets
    const buckets: any[] = [];
    
    if (metrics.length === 0) return buckets;
    
    const startTime = new Date(metrics[0].timestamp).getTime();
    const endTime = new Date(metrics[metrics.length - 1].timestamp).getTime();
    
    for (let time = startTime; time <= endTime; time += bucketSize) {
      const bucketMetrics = metrics.filter(m => {
        const metricTime = new Date(m.timestamp).getTime();
        return metricTime >= time && metricTime < time + bucketSize;
      });
      
      if (bucketMetrics.length > 0) {
        const latencies = bucketMetrics.map(m => m.metrics.inference_time_ms).filter(l => l !== undefined) as number[];
        const errorRates = bucketMetrics.map(m => m.metrics.error_rate).filter(r => r !== undefined) as number[];
        const cpuUsages = bucketMetrics.map(m => m.metrics.cpu_usage_percent).filter(c => c !== undefined) as number[];
        const memoryUsages = bucketMetrics.map(m => m.metrics.memory_usage_mb).filter(m => m !== undefined) as number[];
        const gpuUsages = bucketMetrics.map(m => m.metrics.gpu_utilization_percent).filter(g => g !== undefined) as number[];
        
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

  private async getDriftStatus(modelId: string): Promise<any> {
    // Get latest drift detection result
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