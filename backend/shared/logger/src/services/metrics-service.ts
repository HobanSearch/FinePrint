/**
 * Comprehensive MetricsService for Fine Print AI
 * Collects and exports business, technical, AI, and agent metrics with Prometheus integration
 */

import { EventEmitter } from 'events';
import { createPrometheusRegistry, register, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';
import {
  MetricDefinition,
  MetricData,
  MetricType,
  BusinessMetrics,
  AIMetrics,
  FinePrintMetrics,
  BusinessKPI,
  RevenueMetrics,
  CostMetrics,
  SecurityMetrics,
  PerformanceBenchmarks,
  TimeSeriesData,
  AggregationType,
  MetricAggregation,
  ServiceType,
  Environment,
  LogContext
} from '../types';

interface MetricsConfig {
  serviceName: string;
  environment: Environment;
  enablePrometheus: boolean;
  enableCustomMetrics: boolean;
  enableBusinessMetrics: boolean;
  aggregationWindows: string[];
  retentionPeriod: number; // Hours
  exportInterval: number; // Seconds
}

export class MetricsService extends EventEmitter {
  private config: MetricsConfig;
  private prometheusRegistry: any;
  private metrics: Map<string, any> = new Map();
  private metricDefinitions: Map<string, MetricDefinition> = new Map();
  private timeSeriesData: Map<string, TimeSeriesData> = new Map();
  private businessKPIs: Map<string, BusinessKPI> = new Map();
  private aggregationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private exportInterval?: NodeJS.Timeout;

  // Specialized metrics for Fine Print AI
  private finePrintMetrics: FinePrintMetrics;
  private revenueMetrics: RevenueMetrics;
  private costMetrics: CostMetrics;
  private securityMetrics: SecurityMetrics;
  private performanceBenchmarks: PerformanceBenchmarks;

  constructor(config: MetricsConfig) {
    super();
    this.config = config;
    this.prometheusRegistry = createPrometheusRegistry();
    this.initializeMetrics();
    this.setupDefaultMetrics();
    this.setupAggregation();
    this.setupExport();
  }

  /**
   * Initialize Fine Print AI specific metrics
   */
  private initializeMetrics(): void {
    this.finePrintMetrics = {
      documentAnalysis: {
        totalDocuments: 0,
        avgAnalysisTime: 0,
        successRate: 0,
        documentsPerSecond: 0,
        patternMatchRate: 0,
        riskScoreDistribution: {},
        documentTypes: {},
        languageSupport: {},
      },
      patternDetection: {
        totalPatterns: 0,
        newPatternsDetected: 0,
        falsePositiveRate: 0,
        confidenceScores: [],
        patternCategories: {},
        detectionLatency: 0,
        modelAccuracy: 0,
      },
      riskAssessment: {
        totalAssessments: 0,
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        assessmentAccuracy: 0,
        avgRiskScore: 0,
        riskTrends: [],
      },
      recommendations: {
        totalRecommendations: 0,
        acceptanceRate: 0,
        avgConfidence: 0,
        categoryDistribution: {},
        userEngagement: {
          viewRate: 0,
          actionRate: 0,
          dismissRate: 0,
        },
        businessImpact: {
          costSavings: 0,
          riskReduction: 0,
          complianceImprovement: 0,
        },
      },
      compliance: {
        totalChecks: 0,
        complianceRate: 0,
        violationTypes: {},
        regulationCoverage: {},
        auditTrailCompleteness: 0,
        dataRetentionCompliance: 0,
        privacyScorecard: {
          dataMinimization: 0,
          consentManagement: 0,
          rightToErasure: 0,
          dataPortability: 0,
        },
      },
      customerExperience: {
        userSatisfaction: 0,
        timeToValue: 0,
        featureAdoption: {},
        supportTickets: {
          total: 0,
          avgResolutionTime: 0,
          escalationRate: 0,
          satisfactionScore: 0,
        },
        churnIndicators: {
          riskScore: 0,
          engagementTrend: 0,
          featureUsageDecline: 0,
        },
      },
      agentPerformance: {
        taskCompletionRate: 0,
        avgTaskDuration: 0,
        decisionAccuracy: 0,
        learningProgress: {},
        adaptationRate: 0,
        errorRecoveryTime: 0,
        autonomyLevel: 0,
        agentCollaboration: {
          interAgentCommunication: 0,
          taskHandoffs: 0,
          conflictResolution: 0,
        },
      },
      modelMetrics: {
        training: {
          epochsCompleted: 0,
          trainingLoss: 0,
          validationLoss: 0,
          learningRate: 0,
          batchSize: 0,
          convergenceTime: 0,
        },
        inference: {
          requestsPerSecond: 0,
          avgLatency: 0,
          p95Latency: 0,
          p99Latency: 0,
          errorRate: 0,
          modelLoadTime: 0,
        },
        accuracy: {
          overallAccuracy: 0,
          precisionByClass: {},
          recallByClass: {},
          f1ScoreByClass: {},
          confusionMatrix: [],
        },
        drift: {
          dataDrift: 0,
          conceptDrift: 0,
          performanceDrift: 0,
          retrainingTrigger: false,
        },
      },
    };

    this.initializeRevenueMetrics();
    this.initializeCostMetrics();
    this.initializeSecurityMetrics();
    this.initializePerformanceBenchmarks();
  }

  /**
   * Setup default Prometheus metrics
   */
  private setupDefaultMetrics(): void {
    if (this.config.enablePrometheus) {
      collectDefaultMetrics({ register: this.prometheusRegistry });
      
      // Core application metrics
      this.defineMetric({
        name: 'fineprint_requests_total',
        type: 'counter',
        description: 'Total number of requests processed',
        labels: ['service', 'method', 'status'],
      });

      this.defineMetric({
        name: 'fineprint_request_duration_seconds',
        type: 'histogram',
        description: 'Request duration in seconds',
        labels: ['service', 'method'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
      });

      this.defineMetric({
        name: 'fineprint_errors_total',
        type: 'counter',
        description: 'Total number of errors',
        labels: ['service', 'type', 'severity'],
      });

      // Business metrics
      this.defineMetric({
        name: 'fineprint_documents_analyzed_total',
        type: 'counter',
        description: 'Total documents analyzed',
        labels: ['service', 'document_type', 'result'],
      });

      this.defineMetric({
        name: 'fineprint_patterns_detected_total',
        type: 'counter',
        description: 'Total patterns detected',
        labels: ['service', 'pattern_type', 'severity'],
      });

      this.defineMetric({
        name: 'fineprint_revenue_total',
        type: 'gauge',
        description: 'Total revenue',
        labels: ['service', 'plan_type', 'customer_segment'],
      });

      // AI model metrics
      this.defineMetric({
        name: 'fineprint_ai_inference_duration_seconds',
        type: 'histogram',
        description: 'AI inference duration in seconds',
        labels: ['model', 'service', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      });

      this.defineMetric({
        name: 'fineprint_ai_model_accuracy',
        type: 'gauge',
        description: 'AI model accuracy score',
        labels: ['model', 'metric_type'],
      });
    }
  }

  /**
   * Define a new metric
   */
  defineMetric(definition: MetricDefinition): void {
    this.metricDefinitions.set(definition.name, definition);

    if (this.config.enablePrometheus) {
      let metric;
      const labels = definition.labels || [];

      switch (definition.type) {
        case 'counter':
          metric = new Counter({
            name: definition.name,
            help: definition.description,
            labelNames: labels,
            registers: [this.prometheusRegistry],
          });
          break;

        case 'gauge':
          metric = new Gauge({
            name: definition.name,
            help: definition.description,
            labelNames: labels,
            registers: [this.prometheusRegistry],
          });
          break;

        case 'histogram':
          metric = new Histogram({
            name: definition.name,
            help: description,
            labelNames: labels,
            buckets: definition.buckets || [0.1, 0.5, 1, 5, 10],
            registers: [this.prometheusRegistry],
          });
          break;

        case 'summary':
          metric = new Summary({
            name: definition.name,
            help: definition.description,
            labelNames: labels,
            percentiles: definition.quantiles || [0.5, 0.9, 0.95, 0.99],
            registers: [this.prometheusRegistry],
          });
          break;
      }

      if (metric) {
        this.metrics.set(definition.name, metric);
      }
    }
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const metric = this.metrics.get(name);
    if (metric && metric.inc) {
      metric.inc(labels || {}, value);
    }

    // Store in time series
    this.storeTimeSeriesData(name, value, labels);
    
    // Update Fine Print specific metrics
    this.updateFinePrintMetrics(name, value, labels);
    
    // Emit metric event
    this.emit('metric', { name, value, labels, type: 'counter', timestamp: new Date() });
  }

  /**
   * Set a gauge metric value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (metric && metric.set) {
      metric.set(labels || {}, value);
    }

    this.storeTimeSeriesData(name, value, labels);
    this.updateFinePrintMetrics(name, value, labels);
    this.emit('metric', { name, value, labels, type: 'gauge', timestamp: new Date() });
  }

  /**
   * Record a value in a gauge metric
   */
  recordGauge(name: string, value: number, labels?: Record<string, string>): void {
    this.setGauge(name, value, labels);
  }

  /**
   * Observe a value in a histogram
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (metric && metric.observe) {
      metric.observe(labels || {}, value);
    }

    this.storeTimeSeriesData(name, value, labels);
    this.updateFinePrintMetrics(name, value, labels);
    this.emit('metric', { name, value, labels, type: 'histogram', timestamp: new Date() });
  }

  /**
   * Record a timing measurement
   */
  recordTiming(name: string, duration: number, labels?: Record<string, string>): void {
    this.recordHistogram(name, duration / 1000, labels); // Convert to seconds
  }

  /**
   * Create a timer function for measuring duration
   */
  startTimer(name: string, labels?: Record<string, string>): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.recordTiming(name, duration, labels);
    };
  }

  /**
   * Record business metrics
   */
  recordBusinessMetric(category: string, metric: string, value: number, context?: LogContext): void {
    const labels = {
      category,
      metric,
      service: context?.service || 'unknown',
      customer: context?.businessContext?.customerId || 'unknown',
    };

    this.recordGauge(`fineprint_business_${category}_${metric}`, value, labels);
    
    // Update revenue metrics if applicable
    if (category === 'revenue') {
      this.updateRevenueMetrics(metric, value, context);
    }
  }

  /**
   * Record AI model metrics
   */
  recordAIMetric(
    modelName: string,
    metricType: string,
    value: number,
    context?: LogContext
  ): void {
    const labels = {
      model: modelName,
      metric: metricType,
      service: context?.service || 'ai-service',
    };

    this.recordGauge(`fineprint_ai_${metricType}`, value, labels);
    this.updateAIMetrics(modelName, metricType, value);
  }

  /**
   * Record agent performance metrics
   */
  recordAgentMetric(
    agentId: string,
    metricType: string,
    value: number,
    context?: LogContext
  ): void {
    const labels = {
      agent: agentId,
      metric: metricType,
      service: context?.service || 'agent-service',
    };

    this.recordGauge(`fineprint_agent_${metricType}`, value, labels);
    this.updateAgentMetrics(agentId, metricType, value);
  }

  /**
   * Set a business KPI
   */
  setBusinessKPI(kpi: BusinessKPI): void {
    this.businessKPIs.set(kpi.name, kpi);
    
    const labels = {
      kpi: kpi.name,
      category: kpi.category,
      status: kpi.status,
    };

    this.recordGauge('fineprint_business_kpi_value', kpi.value, labels);
    this.recordGauge('fineprint_business_kpi_target', kpi.target, labels);
    
    this.emit('kpi-update', kpi);
  }

  /**
   * Get business KPIs
   */
  getBusinessKPIs(): BusinessKPI[] {
    return Array.from(this.businessKPIs.values());
  }

  /**
   * Get time series data for a metric
   */
  getTimeSeriesData(metricName: string): TimeSeriesData | undefined {
    return this.timeSeriesData.get(metricName);
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(
    metricName: string,
    aggregationType: AggregationType,
    timeWindow: string
  ): MetricAggregation | undefined {
    const timeSeriesData = this.timeSeriesData.get(metricName);
    if (!timeSeriesData) return undefined;

    const windowMs = this.parseTimeWindow(timeWindow);
    const cutoffTime = new Date(Date.now() - windowMs);
    
    const relevantPoints = timeSeriesData.points.filter(
      point => point.timestamp >= cutoffTime
    );

    if (relevantPoints.length === 0) return undefined;

    let value: number;
    const values = relevantPoints.map(p => p.value);

    switch (aggregationType) {
      case 'sum':
        value = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        value = Math.min(...values);
        break;
      case 'max':
        value = Math.max(...values);
        break;
      case 'count':
        value = values.length;
        break;
      case 'p50':
        value = this.percentile(values, 0.5);
        break;
      case 'p90':
        value = this.percentile(values, 0.9);
        break;
      case 'p95':
        value = this.percentile(values, 0.95);
        break;
      case 'p99':
        value = this.percentile(values, 0.99);
        break;
      default:
        value = 0;
    }

    return {
      type: aggregationType,
      value,
      timestamp: new Date(),
      window: timeWindow,
    };
  }

  /**
   * Get Prometheus metrics
   */
  async getPrometheusMetrics(): Promise<string> {
    if (this.config.enablePrometheus) {
      return this.prometheusRegistry.metrics();
    }
    return '';
  }

  /**
   * Get all Fine Print metrics
   */
  getFinePrintMetrics(): FinePrintMetrics {
    return { ...this.finePrintMetrics };
  }

  /**
   * Store time series data
   */
  private storeTimeSeriesData(name: string, value: number, labels?: Record<string, string>): void {
    let timeSeriesData = this.timeSeriesData.get(name);
    
    if (!timeSeriesData) {
      timeSeriesData = {
        metric: name,
        points: [],
        aggregations: {},
      };
      this.timeSeriesData.set(name, timeSeriesData);
    }

    timeSeriesData.points.push({
      timestamp: new Date(),
      value,
      labels,
    });

    // Keep only recent data points (last 24 hours by default)
    const cutoffTime = new Date(Date.now() - (this.config.retentionPeriod * 60 * 60 * 1000));
    timeSeriesData.points = timeSeriesData.points.filter(
      point => point.timestamp >= cutoffTime
    );
  }

  /**
   * Update Fine Print specific metrics
   */
  private updateFinePrintMetrics(name: string, value: number, labels?: Record<string, string>): void {
    // Document analysis metrics
    if (name.includes('documents_analyzed')) {
      this.finePrintMetrics.documentAnalysis.totalDocuments += value;
    }
    
    if (name.includes('patterns_detected')) {
      this.finePrintMetrics.patternDetection.totalPatterns += value;
    }

    // Add more specific metric updates based on metric names
    this.updateSpecializedMetrics(name, value, labels);
  }

  /**
   * Update specialized metrics based on patterns
   */
  private updateSpecializedMetrics(name: string, value: number, labels?: Record<string, string>): void {
    // This method would contain logic to update specific Fine Print metrics
    // based on the metric name and labels
    
    if (labels?.document_type) {
      this.finePrintMetrics.documentAnalysis.documentTypes[labels.document_type] = 
        (this.finePrintMetrics.documentAnalysis.documentTypes[labels.document_type] || 0) + value;
    }

    if (labels?.pattern_type) {
      this.finePrintMetrics.patternDetection.patternCategories[labels.pattern_type] = 
        (this.finePrintMetrics.patternDetection.patternCategories[labels.pattern_type] || 0) + value;
    }
  }

  /**
   * Update revenue metrics
   */
  private updateRevenueMetrics(metric: string, value: number, context?: LogContext): void {
    switch (metric) {
      case 'mrr':
        this.revenueMetrics.mrr = value;
        break;
      case 'arr':
        this.revenueMetrics.arr = value;
        break;
      case 'churn':
        this.revenueMetrics.churnRate = value;
        break;
      // Add more revenue metric updates
    }
  }

  /**
   * Update AI metrics
   */
  private updateAIMetrics(modelName: string, metricType: string, value: number): void {
    switch (metricType) {
      case 'inference_latency':
        this.finePrintMetrics.modelMetrics.inference.avgLatency = value;
        break;
      case 'accuracy':
        this.finePrintMetrics.modelMetrics.accuracy.overallAccuracy = value;
        break;
      // Add more AI metric updates
    }
  }

  /**
   * Update agent metrics
   */
  private updateAgentMetrics(agentId: string, metricType: string, value: number): void {
    switch (metricType) {
      case 'task_completion_rate':
        this.finePrintMetrics.agentPerformance.taskCompletionRate = value;
        break;
      case 'decision_accuracy':
        this.finePrintMetrics.agentPerformance.decisionAccuracy = value;
        break;
      // Add more agent metric updates
    }
  }

  /**
   * Initialize revenue metrics
   */
  private initializeRevenueMetrics(): void {
    this.revenueMetrics = {
      mrr: 0,
      arr: 0,
      netRevenue: 0,
      grossRevenue: 0,
      churnRate: 0,
      expansionRate: 0,
      contractionRate: 0,
      ltv: 0,
      cac: 0,
      paybackPeriod: 0,
      avgDealSize: 0,
      conversionRates: {
        trialToSubscription: 0,
        freeToSubscription: 0,
        leadToCustomer: 0,
      },
      cohortAnalysis: [],
    };
  }

  /**
   * Initialize cost metrics
   */
  private initializeCostMetrics(): void {
    this.costMetrics = {
      infrastructureCost: 0,
      computeCost: 0,
      storageCost: 0,
      networkCost: 0,
      aiModelCost: 0,
      operationalCost: 0,
      costPerRequest: 0,
      costPerCustomer: 0,
      costEfficiencyRatio: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0,
        storage: 0,
        network: 0,
      },
    };
  }

  /**
   * Initialize security metrics
   */
  private initializeSecurityMetrics(): void {
    this.securityMetrics = {
      threatDetection: {
        threatsDetected: 0,
        falsePositives: 0,
        responseTime: 0,
        resolutionTime: 0,
        severityDistribution: {},
      },
      vulnerabilities: {
        totalVulnerabilities: 0,
        criticalVulnerabilities: 0,
        patchingTime: 0,
        vulnerabilityAge: 0,
        complianceScore: 0,
      },
      accessControl: {
        failedLogins: 0,
        successfulLogins: 0,
        privilegeEscalations: 0,
        accessPatterns: {},
        anomalousAccess: 0,
      },
      dataProtection: {
        encryptionCoverage: 0,
        dataLeakEvents: 0,
        backupSuccess: 0,
        recoveryTime: 0,
        complianceViolations: 0,
      },
    };
  }

  /**
   * Initialize performance benchmarks
   */
  private initializePerformanceBenchmarks(): void {
    this.performanceBenchmarks = {
      api: {
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errorRate: 0,
        availability: 0,
      },
      database: {
        queryTime: 0,
        connectionPoolUsage: 0,
        slowQueries: 0,
        lockWaitTime: 0,
        cacheHitRate: 0,
      },
      ai: {
        inferenceTime: 0,
        batchProcessingTime: 0,
        modelLoadTime: 0,
        queueDepth: 0,
        gpuUtilization: 0,
      },
      frontend: {
        pageLoadTime: 0,
        firstContentfulPaint: 0,
        timeToInteractive: 0,
        cumulativeLayoutShift: 0,
        largestContentfulPaint: 0,
      },
    };
  }

  /**
   * Setup metric aggregation
   */
  private setupAggregation(): void {
    this.config.aggregationWindows.forEach(window => {
      const intervalMs = this.parseTimeWindow(window);
      const interval = setInterval(() => {
        this.performAggregation(window);
      }, Math.min(intervalMs / 10, 60000)); // Aggregate at least every minute

      this.aggregationIntervals.set(window, interval);
    });
  }

  /**
   * Setup metric export
   */
  private setupExport(): void {
    if (this.config.exportInterval > 0) {
      this.exportInterval = setInterval(() => {
        this.exportMetrics();
      }, this.config.exportInterval * 1000);
    }
  }

  /**
   * Perform aggregation for a time window
   */
  private performAggregation(window: string): void {
    this.timeSeriesData.forEach((data, metricName) => {
      const aggregations = ['sum', 'avg', 'min', 'max', 'count'] as AggregationType[];
      
      aggregations.forEach(type => {
        const aggregation = this.getAggregatedMetrics(metricName, type, window);
        if (aggregation) {
          data.aggregations![`${type}_${window}`] = aggregation;
        }
      });
    });
  }

  /**
   * Export metrics to external systems
   */
  private async exportMetrics(): Promise<void> {
    try {
      const metrics = await this.getPrometheusMetrics();
      this.emit('metrics-export', {
        timestamp: new Date(),
        format: 'prometheus',
        data: metrics,
      });
    } catch (error) {
      this.emit('export-error', error);
    }
  }

  /**
   * Parse time window string to milliseconds
   */
  private parseTimeWindow(window: string): number {
    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) return 300000; // Default 5 minutes

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 300000;
    }
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Shutdown metrics service
   */
  async shutdown(): Promise<void> {
    // Clear all intervals
    this.aggregationIntervals.forEach(interval => clearInterval(interval));
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
    }

    // Final metric export
    await this.exportMetrics();

    this.emit('shutdown');
  }
}