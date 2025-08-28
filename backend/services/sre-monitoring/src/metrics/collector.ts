import * as client from 'prom-client';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labelNames?: string[];
  buckets?: number[];
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

export interface MetricValue {
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

/**
 * Comprehensive metrics collector for Fine Print AI
 * Handles all metric types and aggregations
 */
export class MetricsCollector extends EventEmitter {
  private register: client.Registry;
  private metrics: Map<string, any>;
  private aggregationBuffer: Map<string, MetricValue[]>;
  private aggregationInterval?: NodeJS.Timeout;

  // Core system metrics
  private httpRequestDuration: client.Histogram<string>;
  private httpRequestTotal: client.Counter<string>;
  private httpErrorTotal: client.Counter<string>;
  private activeConnections: client.Gauge<string>;
  private memoryUsage: client.Gauge<string>;
  private cpuUsage: client.Gauge<string>;
  private eventLoopLag: client.Histogram<string>;

  // AI/ML specific metrics
  private modelInferenceLatency: client.Histogram<string>;
  private modelInferenceErrors: client.Counter<string>;
  private modelLoadTime: client.Histogram<string>;
  private modelMemoryUsage: client.Gauge<string>;
  private trainingJobDuration: client.Histogram<string>;
  private trainingJobQueue: client.Gauge<string>;

  // Business metrics
  private documentProcessed: client.Counter<string>;
  private clausesDetected: client.Counter<string>;
  private userSessions: client.Gauge<string>;
  private subscriptionRevenue: client.Gauge<string>;
  private apiUsage: client.Counter<string>;

  // SLO metrics
  private sloCompliance: client.Gauge<string>;
  private errorBudgetRemaining: client.Gauge<string>;
  private burnRate: client.Gauge<string>;

  constructor() {
    super();
    this.register = new client.Registry();
    this.metrics = new Map();
    this.aggregationBuffer = new Map();

    // Set default labels
    this.register.setDefaultLabels(config.prometheus.defaultLabels);

    // Initialize core metrics
    this.initializeCoreMetrics();
    this.initializeAIMetrics();
    this.initializeBusinessMetrics();
    this.initializeSLOMetrics();
    this.initializeCustomMetrics();

    // Collect default metrics
    client.collectDefaultMetrics({ register: this.register });
  }

  private initializeCoreMetrics(): void {
    // HTTP metrics
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.register],
    });

    this.httpRequestTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.httpErrorTotal = new client.Counter({
      name: 'http_errors_total',
      help: 'Total number of HTTP errors',
      labelNames: ['method', 'route', 'error_type'],
      registers: [this.register],
    });

    this.activeConnections = new client.Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['service'],
      registers: [this.register],
    });

    // System metrics
    this.memoryUsage = new client.Gauge({
      name: 'memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'], // heap, external, rss
      registers: [this.register],
    });

    this.cpuUsage = new client.Gauge({
      name: 'cpu_usage_percentage',
      help: 'CPU usage percentage',
      labelNames: ['core'],
      registers: [this.register],
    });

    this.eventLoopLag = new client.Histogram({
      name: 'event_loop_lag_seconds',
      help: 'Event loop lag in seconds',
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register],
    });
  }

  private initializeAIMetrics(): void {
    this.modelInferenceLatency = new client.Histogram({
      name: 'model_inference_latency_seconds',
      help: 'Model inference latency in seconds',
      labelNames: ['model_name', 'model_version', 'input_size'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.register],
    });

    this.modelInferenceErrors = new client.Counter({
      name: 'model_inference_errors_total',
      help: 'Total number of model inference errors',
      labelNames: ['model_name', 'model_version', 'error_type'],
      registers: [this.register],
    });

    this.modelLoadTime = new client.Histogram({
      name: 'model_load_time_seconds',
      help: 'Time to load model in seconds',
      labelNames: ['model_name', 'model_version', 'model_size'],
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [this.register],
    });

    this.modelMemoryUsage = new client.Gauge({
      name: 'model_memory_usage_bytes',
      help: 'Memory usage by models in bytes',
      labelNames: ['model_name', 'model_version'],
      registers: [this.register],
    });

    this.trainingJobDuration = new client.Histogram({
      name: 'training_job_duration_seconds',
      help: 'Training job duration in seconds',
      labelNames: ['model_type', 'dataset_size', 'status'],
      buckets: [60, 300, 600, 1800, 3600, 7200, 14400],
      registers: [this.register],
    });

    this.trainingJobQueue = new client.Gauge({
      name: 'training_job_queue_size',
      help: 'Number of training jobs in queue',
      labelNames: ['priority', 'model_type'],
      registers: [this.register],
    });
  }

  private initializeBusinessMetrics(): void {
    this.documentProcessed = new client.Counter({
      name: 'documents_processed_total',
      help: 'Total number of documents processed',
      labelNames: ['document_type', 'source', 'status'],
      registers: [this.register],
    });

    this.clausesDetected = new client.Counter({
      name: 'clauses_detected_total',
      help: 'Total number of problematic clauses detected',
      labelNames: ['clause_type', 'severity', 'document_type'],
      registers: [this.register],
    });

    this.userSessions = new client.Gauge({
      name: 'active_user_sessions',
      help: 'Number of active user sessions',
      labelNames: ['user_type', 'platform'],
      registers: [this.register],
    });

    this.subscriptionRevenue = new client.Gauge({
      name: 'subscription_revenue_usd',
      help: 'Subscription revenue in USD',
      labelNames: ['plan_type', 'billing_period'],
      registers: [this.register],
    });

    this.apiUsage = new client.Counter({
      name: 'api_usage_total',
      help: 'Total API usage',
      labelNames: ['endpoint', 'client_id', 'plan_type'],
      registers: [this.register],
    });
  }

  private initializeSLOMetrics(): void {
    this.sloCompliance = new client.Gauge({
      name: 'slo_compliance_percentage',
      help: 'SLO compliance percentage',
      labelNames: ['service', 'slo_type'], // availability, latency, error_rate
      registers: [this.register],
    });

    this.errorBudgetRemaining = new client.Gauge({
      name: 'error_budget_remaining_percentage',
      help: 'Remaining error budget percentage',
      labelNames: ['service', 'window'],
      registers: [this.register],
    });

    this.burnRate = new client.Gauge({
      name: 'error_budget_burn_rate',
      help: 'Error budget burn rate',
      labelNames: ['service', 'window'], // 1h, 6h, 1d, 3d
      registers: [this.register],
    });
  }

  private initializeCustomMetrics(): void {
    // Register custom metrics from configuration
    config.monitoring.customMetrics.forEach(metricDef => {
      let metric: any;
      
      switch (metricDef.type) {
        case 'counter':
          metric = new client.Counter({
            name: metricDef.name,
            help: metricDef.description,
            labelNames: metricDef.labels,
            registers: [this.register],
          });
          break;
        case 'gauge':
          metric = new client.Gauge({
            name: metricDef.name,
            help: metricDef.description,
            labelNames: metricDef.labels,
            registers: [this.register],
          });
          break;
        case 'histogram':
          metric = new client.Histogram({
            name: metricDef.name,
            help: metricDef.description,
            labelNames: metricDef.labels,
            buckets: this.getDefaultBuckets(metricDef.unit),
            registers: [this.register],
          });
          break;
        case 'summary':
          metric = new client.Summary({
            name: metricDef.name,
            help: metricDef.description,
            labelNames: metricDef.labels,
            percentiles: [0.5, 0.9, 0.95, 0.99],
            registers: [this.register],
          });
          break;
      }
      
      this.metrics.set(metricDef.name, metric);
    });
  }

  private getDefaultBuckets(unit: string): number[] {
    switch (unit) {
      case 'milliseconds':
        return [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
      case 'seconds':
        return [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
      case 'bytes':
        return [1024, 10240, 102400, 1048576, 10485760, 104857600];
      default:
        return [1, 5, 10, 25, 50, 100, 250, 500, 1000];
    }
  }

  async start(): Promise<void> {
    logger.info('Starting metrics collector');
    
    // Start aggregation interval
    this.aggregationInterval = setInterval(() => {
      this.flushAggregationBuffer();
    }, config.prometheus.scrapeInterval);

    // Start system metrics collection
    this.collectSystemMetrics();
    
    this.emit('started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping metrics collector');
    
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }
    
    this.flushAggregationBuffer();
    this.emit('stopped');
  }

  private collectSystemMetrics(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.memoryUsage.set({ type: 'heap' }, memUsage.heapUsed);
      this.memoryUsage.set({ type: 'external' }, memUsage.external);
      this.memoryUsage.set({ type: 'rss' }, memUsage.rss);

      const cpuUsage = process.cpuUsage();
      const totalCPU = cpuUsage.user + cpuUsage.system;
      this.cpuUsage.set({ core: 'all' }, totalCPU / 1000000); // Convert to percentage
    }, 5000);
  }

  // Public methods for recording metrics
  recordRequestDuration(method: string, route: string, statusCode: number, duration: number): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      duration / 1000 // Convert to seconds
    );
  }

  incrementRequestCount(method: string, route: string, statusCode: number = 200): void {
    this.httpRequestTotal.inc({ method, route, status_code: String(statusCode) });
  }

  incrementErrorCount(errorType: string, method?: string, route?: string): void {
    this.httpErrorTotal.inc({ 
      method: method || 'unknown', 
      route: route || 'unknown', 
      error_type: errorType 
    });
  }

  recordModelInference(modelName: string, version: string, duration: number, inputSize: number): void {
    this.modelInferenceLatency.observe(
      { model_name: modelName, model_version: version, input_size: String(inputSize) },
      duration / 1000
    );
  }

  recordModelError(modelName: string, version: string, errorType: string): void {
    this.modelInferenceErrors.inc({
      model_name: modelName,
      model_version: version,
      error_type: errorType,
    });
  }

  updateSLOCompliance(service: string, sloType: string, compliance: number): void {
    this.sloCompliance.set({ service, slo_type: sloType }, compliance);
  }

  updateErrorBudget(service: string, window: string, remaining: number): void {
    this.errorBudgetRemaining.set({ service, window }, remaining);
  }

  updateBurnRate(service: string, window: string, rate: number): void {
    this.burnRate.set({ service, window }, rate);
  }

  // Custom metric recording
  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      logger.warn(`Metric ${name} not found`);
      return;
    }

    if (metric instanceof client.Counter) {
      metric.inc(labels, value);
    } else if (metric instanceof client.Gauge) {
      metric.set(labels, value);
    } else if (metric instanceof client.Histogram || metric instanceof client.Summary) {
      metric.observe(labels, value);
    }
  }

  // Aggregation methods
  bufferMetric(name: string, value: MetricValue): void {
    if (!this.aggregationBuffer.has(name)) {
      this.aggregationBuffer.set(name, []);
    }
    this.aggregationBuffer.get(name)!.push(value);
  }

  async aggregateMetrics(): Promise<void> {
    const aggregated = new Map<string, any>();
    
    for (const [name, values] of this.aggregationBuffer.entries()) {
      const metric = this.metrics.get(name);
      if (!metric) continue;

      if (metric instanceof client.Histogram || metric instanceof client.Summary) {
        // Calculate percentiles for histograms/summaries
        const sorted = values.map(v => v.value).sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        aggregated.set(name, { p50, p95, p99, count: values.length });
      } else if (metric instanceof client.Gauge) {
        // Average for gauges
        const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length;
        aggregated.set(name, { average: avg, last: values[values.length - 1].value });
      } else if (metric instanceof client.Counter) {
        // Sum for counters
        const sum = values.reduce((total, v) => total + v.value, 0);
        aggregated.set(name, { total: sum });
      }
    }
    
    this.emit('aggregated', aggregated);
    return;
  }

  private flushAggregationBuffer(): void {
    for (const [name, values] of this.aggregationBuffer.entries()) {
      const metric = this.metrics.get(name);
      if (!metric) continue;

      values.forEach(value => {
        this.recordMetric(name, value.value, value.labels);
      });
    }
    
    this.aggregationBuffer.clear();
  }

  // Get metrics for export
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getContentType(): string {
    return this.register.contentType;
  }

  // Get specific metric values
  async getMetricValue(name: string): Promise<any> {
    const metric = this.metrics.get(name) || 
                  this.register.getSingleMetric(name);
    
    if (!metric) {
      return null;
    }

    return metric.get();
  }

  // Reset all metrics
  reset(): void {
    this.register.resetMetrics();
  }
}