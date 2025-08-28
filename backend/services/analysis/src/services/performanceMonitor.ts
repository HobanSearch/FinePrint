import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { modelManager } from './modelManager';
import { queueManager } from './queueManager';
import { progressTracker } from './progressTracker';
import { EventEmitter } from 'events';
import * as os from 'os';

const logger = createServiceLogger('performance-monitor');

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number; // 0-100
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number; // 0-100
    heapUsed: number;
    heapTotal: number;
  };
  disk: {
    usage: number; // 0-100 (estimated)
  };
  network: {
    connections: number;
    activeWebSockets: number;
  };
  process: {
    uptime: number;
    pid: number;
    version: string;
  };
}

export interface AnalysisMetrics {
  timestamp: Date;
  totalAnalyses: number;
  completedAnalyses: number;
  failedAnalyses: number;
  averageProcessingTime: number;
  throughput: number; // analyses per minute
  accuracyScore: number; // 0-100
  modelPerformance: { [model: string]: ModelPerformanceMetrics };
  queueMetrics: {
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    averageWaitTime: number;
  };
  errorRates: {
    extractionErrors: number;
    patternErrors: number;
    aiErrors: number;
    embeddingErrors: number;
  };
}

export interface ModelPerformanceMetrics {
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  averageTokensPerSecond: number;
  memoryUsage: number;
  accuracy: number;
  lastUsed: Date;
  errorRate: number;
}

export interface CacheMetrics {
  timestamp: Date;
  hitRate: number; // 0-100
  missRate: number; // 0-100
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  cacheSize: number; // bytes
  evictions: number;
  averageKeySize: number;
  averageValueSize: number;
  topKeys: Array<{ key: string; hits: number; size: number }>;
}

export interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  comparison: 'greater' | 'less' | 'equal';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  description: string;
}

export interface Alert {
  id: string;
  configId: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  resolved: boolean;
  resolvedAt?: Date;
}

export class PerformanceMonitor extends EventEmitter {
  private isRunning = false;
  private metricsIntervalId?: NodeJS.Timeout;
  private cacheStatsIntervalId?: NodeJS.Timeout;
  private alertCheckIntervalId?: NodeJS.Timeout;
  
  // Metrics storage
  private systemMetricsHistory: SystemMetrics[] = [];
  private analysisMetricsHistory: AnalysisMetrics[] = [];
  private cacheMetricsHistory: CacheMetrics[] = [];
  
  // Alert management
  private alertConfigs: Map<string, AlertConfig> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();
  
  // Performance tracking
  private requestCounts: Map<string, number> = new Map();
  private responseTimeHistogram: Map<string, number[]> = new Map();
  private errorCounts: Map<string, number> = new Map();
  
  // Cache tracking
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheRequests = 0;

  constructor() {
    super();
    this.initializeDefaultAlerts();
    this.setupCacheTracking();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Performance Monitor already running');
      return;
    }

    logger.info('Starting Performance Monitor');

    try {
      // Start metrics collection
      this.startSystemMetricsCollection();
      this.startAnalysisMetricsCollection();
      this.startCacheMetricsCollection();
      this.startAlertChecking();

      this.isRunning = true;
      logger.info('Performance Monitor started successfully');

    } catch (error) {
      logger.error('Failed to start Performance Monitor', { error: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping Performance Monitor');

    // Clear intervals
    if (this.metricsIntervalId) clearInterval(this.metricsIntervalId);
    if (this.cacheStatsIntervalId) clearInterval(this.cacheStatsIntervalId);
    if (this.alertCheckIntervalId) clearInterval(this.alertCheckIntervalId);

    this.isRunning = false;
    logger.info('Performance Monitor stopped');
  }

  // System Metrics Collection
  private startSystemMetricsCollection(): void {
    this.metricsIntervalId = setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.systemMetricsHistory.push(metrics);
        
        // Keep only last 24 hours of data (1440 minutes)
        if (this.systemMetricsHistory.length > 1440) {
          this.systemMetricsHistory = this.systemMetricsHistory.slice(-1440);
        }

        this.emit('systemMetrics', metrics);
        
        // Check for system alerts
        this.checkSystemAlerts(metrics);

      } catch (error) {
        logger.error('Failed to collect system metrics', { error: error.message });
      }
    }, 60000); // Every minute

    logger.info('System metrics collection started');
  }

  private async collectSystemMetrics(): Promise<SystemMetrics> {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // CPU usage calculation (simplified)
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
        usage: 0 // Would need disk space monitoring library
      },
      network: {
        connections: 0, // Would need network monitoring
        activeWebSockets: progressTracker.getStats().totalConnections
      },
      process: {
        uptime: process.uptime(),
        pid: process.pid,
        version: process.version
      }
    };
  }

  // Analysis Metrics Collection
  private startAnalysisMetricsCollection(): void {
    setInterval(async () => {
      try {
        const metrics = await this.collectAnalysisMetrics();
        this.analysisMetricsHistory.push(metrics);
        
        // Keep only last 24 hours
        if (this.analysisMetricsHistory.length > 1440) {
          this.analysisMetricsHistory = this.analysisMetricsHistory.slice(-1440);
        }

        this.emit('analysisMetrics', metrics);
        
        // Check for analysis alerts
        this.checkAnalysisAlerts(metrics);

      } catch (error) {
        logger.error('Failed to collect analysis metrics', { error: error.message });
      }
    }, 60000); // Every minute

    logger.info('Analysis metrics collection started');
  }

  private async collectAnalysisMetrics(): Promise<AnalysisMetrics> {
    const queueStats = queueManager.getStats();
    const modelStatus = modelManager.getModelStatus();
    
    // Calculate model performance metrics
    const modelPerformance: { [model: string]: ModelPerformanceMetrics } = {};
    
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
        averageWaitTime: 0 // Would need wait time tracking
      },
      errorRates: {
        extractionErrors: this.errorCounts.get('extraction') || 0,
        patternErrors: this.errorCounts.get('pattern') || 0,
        aiErrors: this.errorCounts.get('ai') || 0,
        embeddingErrors: this.errorCounts.get('embedding') || 0
      }
    };
  }

  // Cache Metrics Collection
  private startCacheMetricsCollection(): void {
    this.cacheStatsIntervalId = setInterval(async () => {
      try {
        const metrics = await this.collectCacheMetrics();
        this.cacheMetricsHistory.push(metrics);
        
        // Keep only last 24 hours
        if (this.cacheMetricsHistory.length > 1440) {
          this.cacheMetricsHistory = this.cacheMetricsHistory.slice(-1440);
        }

        this.emit('cacheMetrics', metrics);

      } catch (error) {
        logger.error('Failed to collect cache metrics', { error: error.message });
      }
    }, 300000); // Every 5 minutes

    logger.info('Cache metrics collection started');
  }

  private async collectCacheMetrics(): Promise<CacheMetrics> {
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
      cacheSize: 0, // Would need cache size tracking
      evictions: 0, // Would need eviction tracking
      averageKeySize: 0,
      averageValueSize: 0,
      topKeys: [] // Would need key usage tracking
    };
  }

  // Alert Management
  private initializeDefaultAlerts(): void {
    const defaultAlerts: AlertConfig[] = [
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

  private startAlertChecking(): void {
    this.alertCheckIntervalId = setInterval(() => {
      try {
        this.checkAllAlerts();
      } catch (error) {
        logger.error('Alert checking failed', { error: error.message });
      }
    }, 30000); // Every 30 seconds

    logger.info('Alert checking started');
  }

  private checkAllAlerts(): void {
    const latestSystemMetrics = this.systemMetricsHistory[this.systemMetricsHistory.length - 1];
    const latestAnalysisMetrics = this.analysisMetricsHistory[this.analysisMetricsHistory.length - 1];

    if (latestSystemMetrics) {
      this.checkSystemAlerts(latestSystemMetrics);
    }

    if (latestAnalysisMetrics) {
      this.checkAnalysisAlerts(latestAnalysisMetrics);
    }
  }

  private checkSystemAlerts(metrics: SystemMetrics): void {
    this.checkAlert('high_cpu_usage', metrics.cpu.usage);
    this.checkAlert('high_memory_usage', metrics.memory.usage);
  }

  private checkAnalysisAlerts(metrics: AnalysisMetrics): void {
    const errorRate = metrics.totalAnalyses > 0 
      ? (metrics.failedAnalyses / metrics.totalAnalyses) * 100 
      : 0;
    
    this.checkAlert('high_error_rate', errorRate);
    this.checkAlert('low_throughput', metrics.throughput);
    this.checkAlert('queue_backlog', metrics.queueMetrics.pendingJobs);
  }

  private checkAlert(configId: string, value: number): void {
    const config = this.alertConfigs.get(configId);
    if (!config || !config.enabled) return;

    // Check cooldown
    const cooldownEnd = this.alertCooldowns.get(configId);
    if (cooldownEnd && cooldownEnd > new Date()) {
      return;
    }

    const shouldAlert = this.evaluateAlertCondition(config, value);
    const existingAlert = this.activeAlerts.get(configId);

    if (shouldAlert && !existingAlert) {
      // Create new alert
      const alert: Alert = {
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
      
      // Set cooldown
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

    } else if (!shouldAlert && existingAlert && !existingAlert.resolved) {
      // Resolve existing alert
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

  private evaluateAlertCondition(config: AlertConfig, value: number): boolean {
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

  // Tracking Methods
  trackRequest(operation: string, modelName?: string): void {
    if (modelName) {
      const count = this.requestCounts.get(modelName) || 0;
      this.requestCounts.set(modelName, count + 1);
    }
  }

  trackResponse(operation: string, responseTime: number, modelName?: string): void {
    if (modelName) {
      if (!this.responseTimeHistogram.has(modelName)) {
        this.responseTimeHistogram.set(modelName, []);
      }
      
      const times = this.responseTimeHistogram.get(modelName)!;
      times.push(responseTime);
      
      // Keep only last 1000 response times
      if (times.length > 1000) {
        times.splice(0, times.length - 1000);
      }
    }
  }

  trackError(operation: string, error: string, modelName?: string): void {
    if (modelName) {
      const count = this.errorCounts.get(modelName) || 0;
      this.errorCounts.set(modelName, count + 1);
    }
    
    const operationCount = this.errorCounts.get(operation) || 0;
    this.errorCounts.set(operation, operationCount + 1);
  }

  private setupCacheTracking(): void {
    // Hook into cache operations (this would need to be integrated with the actual cache)
    // For now, we'll track basic metrics
    setInterval(() => {
      // This would integrate with the actual cache implementation
    }, 10000);
  }

  // Public API Methods
  getCurrentSystemMetrics(): SystemMetrics | null {
    return this.systemMetricsHistory[this.systemMetricsHistory.length - 1] || null;
  }

  getCurrentAnalysisMetrics(): AnalysisMetrics | null {
    return this.analysisMetricsHistory[this.analysisMetricsHistory.length - 1] || null;
  }

  getCurrentCacheMetrics(): CacheMetrics | null {
    return this.cacheMetricsHistory[this.cacheMetricsHistory.length - 1] || null;
  }

  getSystemMetricsHistory(hours: number = 1): SystemMetrics[] {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return this.systemMetricsHistory.filter(m => m.timestamp >= cutoff);
  }

  getAnalysisMetricsHistory(hours: number = 1): AnalysisMetrics[] {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return this.analysisMetricsHistory.filter(m => m.timestamp >= cutoff);
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
  }

  getAllAlerts(hours: number = 24): Alert[] {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    
    return Array.from(this.activeAlerts.values()).filter(a => a.timestamp >= cutoff);
  }

  addAlertConfig(config: AlertConfig): void {
    this.alertConfigs.set(config.id, config);
    logger.info('Alert config added', { configId: config.id, name: config.name });
  }

  removeAlertConfig(configId: string): void {
    this.alertConfigs.delete(configId);
    this.activeAlerts.delete(configId);
    logger.info('Alert config removed', { configId });
  }

  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    checks: { [key: string]: { status: 'pass' | 'warn' | 'fail'; message: string } };
  } {
    const checks: { [key: string]: { status: 'pass' | 'warn' | 'fail'; message: string } } = {};
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    const systemMetrics = this.getCurrentSystemMetrics();
    const analysisMetrics = this.getCurrentAnalysisMetrics();
    const activeAlerts = this.getActiveAlerts();

    // System checks
    if (systemMetrics) {
      if (systemMetrics.cpu.usage > 90) {
        checks.cpu = { status: 'fail', message: `CPU usage critical: ${systemMetrics.cpu.usage.toFixed(1)}%` };
        overallStatus = 'critical';
      } else if (systemMetrics.cpu.usage > 80) {
        checks.cpu = { status: 'warn', message: `CPU usage high: ${systemMetrics.cpu.usage.toFixed(1)}%` };
        if (overallStatus === 'healthy') overallStatus = 'warning';
      } else {
        checks.cpu = { status: 'pass', message: `CPU usage normal: ${systemMetrics.cpu.usage.toFixed(1)}%` };
      }

      if (systemMetrics.memory.usage > 90) {
        checks.memory = { status: 'fail', message: `Memory usage critical: ${systemMetrics.memory.usage.toFixed(1)}%` };
        overallStatus = 'critical';
      } else if (systemMetrics.memory.usage > 85) {
        checks.memory = { status: 'warn', message: `Memory usage high: ${systemMetrics.memory.usage.toFixed(1)}%` };
        if (overallStatus === 'healthy') overallStatus = 'warning';
      } else {
        checks.memory = { status: 'pass', message: `Memory usage normal: ${systemMetrics.memory.usage.toFixed(1)}%` };
      }
    }

    // Analysis checks
    if (analysisMetrics) {
      const errorRate = analysisMetrics.totalAnalyses > 0 
        ? (analysisMetrics.failedAnalyses / analysisMetrics.totalAnalyses) * 100 
        : 0;

      if (errorRate > 20) {
        checks.errorRate = { status: 'fail', message: `Error rate critical: ${errorRate.toFixed(1)}%` };
        overallStatus = 'critical';
      } else if (errorRate > 10) {
        checks.errorRate = { status: 'warn', message: `Error rate high: ${errorRate.toFixed(1)}%` };
        if (overallStatus === 'healthy') overallStatus = 'warning';
      } else {
        checks.errorRate = { status: 'pass', message: `Error rate normal: ${errorRate.toFixed(1)}%` };
      }
    }

    // Alert checks
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
    const highAlerts = activeAlerts.filter(a => a.severity === 'high').length;

    if (criticalAlerts > 0) {
      checks.alerts = { status: 'fail', message: `${criticalAlerts} critical alert(s) active` };
      overallStatus = 'critical';
    } else if (highAlerts > 0) {
      checks.alerts = { status: 'warn', message: `${highAlerts} high-severity alert(s) active` };
      if (overallStatus === 'healthy') overallStatus = 'warning';
    } else {
      checks.alerts = { status: 'pass', message: 'No critical alerts' };
    }

    return { status: overallStatus, checks };
  }

  private calculateOverallAccuracy(modelPerformance: { [model: string]: ModelPerformanceMetrics }): number {
    const models = Object.values(modelPerformance);
    if (models.length === 0) return 0;

    const totalRequests = models.reduce((sum, m) => sum + m.totalRequests, 0);
    if (totalRequests === 0) return 0;

    const weightedAccuracy = models.reduce((sum, m) => {
      return sum + (m.accuracy * m.totalRequests);
    }, 0);

    return weightedAccuracy / totalRequests;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();