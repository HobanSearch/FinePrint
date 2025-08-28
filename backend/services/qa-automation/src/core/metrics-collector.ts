import { Logger } from 'pino';
import { performance, PerformanceObserver } from 'perf_hooks';
import { EventEmitter } from 'events';
import { 
  TestCase, 
  TestCaseResult, 
  PerformanceMetrics,
  ResponseTimeMetrics,
  ThroughputMetrics,
  ResourceMetrics,
  NetworkMetrics
} from './types';

interface MetricSnapshot {
  timestamp: number;
  tests: TestMetrics;
  performance: PerformanceMetrics;
  resources: SystemResources;
  custom: Map<string, any>;
}

interface TestMetrics {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  retried: number;
  duration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  throughput: number;
}

interface SystemResources {
  cpu: ResourceMetrics;
  memory: ResourceMetrics;
  network: NetworkMetrics;
  disk: DiskMetrics;
}

interface DiskMetrics {
  read: number;
  write: number;
  utilization: number;
}

export class MetricsCollector extends EventEmitter {
  private logger: Logger;
  private metrics: Map<string, any>;
  private timers: Map<string, number>;
  private counters: Map<string, number>;
  private gauges: Map<string, number>;
  private histograms: Map<string, number[]>;
  private performanceObserver?: PerformanceObserver;
  private startTime: number;
  private testMetrics: TestMetrics;
  private resourceInterval?: NodeJS.Timer;
  private networkStats: NetworkMetrics;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.metrics = new Map();
    this.timers = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.startTime = Date.now();
    
    this.testMetrics = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      retried: 0,
      duration: 0,
      avgDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      throughput: 0
    };

    this.networkStats = {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
      latency: 0,
      packetLoss: 0
    };
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing metrics collector');

    // Setup performance observer
    this.setupPerformanceObserver();

    // Start resource monitoring
    this.startResourceMonitoring();

    // Setup custom metrics
    this.setupCustomMetrics();

    this.emit('initialized');
  }

  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordPerformanceEntry(entry);
      }
    });

    this.performanceObserver.observe({ 
      entryTypes: ['measure', 'mark', 'resource', 'navigation'] 
    });
  }

  private recordPerformanceEntry(entry: PerformanceEntry): void {
    const metric = {
      name: entry.name,
      type: entry.entryType,
      duration: entry.duration,
      startTime: entry.startTime,
      timestamp: Date.now()
    };

    this.metrics.set(`perf:${entry.name}`, metric);
    this.emit('performance:entry', metric);
  }

  private startResourceMonitoring(): void {
    this.resourceInterval = setInterval(() => {
      this.collectResourceMetrics();
    }, 1000); // Collect every second
  }

  private collectResourceMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const memory: ResourceMetrics = {
      current: memUsage.heapUsed,
      peak: memUsage.heapTotal,
      min: this.gauges.get('memory:min') || memUsage.heapUsed,
      max: Math.max(this.gauges.get('memory:max') || 0, memUsage.heapUsed),
      mean: this.calculateMean('memory', memUsage.heapUsed)
    };

    const cpu: ResourceMetrics = {
      current: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      peak: this.gauges.get('cpu:peak') || 0,
      min: this.gauges.get('cpu:min') || 0,
      max: Math.max(this.gauges.get('cpu:max') || 0, (cpuUsage.user + cpuUsage.system) / 1000000),
      mean: this.calculateMean('cpu', (cpuUsage.user + cpuUsage.system) / 1000000)
    };

    this.gauges.set('memory:current', memory.current);
    this.gauges.set('memory:peak', memory.peak);
    this.gauges.set('memory:min', memory.min);
    this.gauges.set('memory:max', memory.max);

    this.gauges.set('cpu:current', cpu.current);
    this.gauges.set('cpu:peak', cpu.peak);
    this.gauges.set('cpu:min', cpu.min);
    this.gauges.set('cpu:max', cpu.max);

    this.emit('resources:collected', { memory, cpu });
  }

  private calculateMean(metric: string, value: number): number {
    const history = this.histograms.get(metric) || [];
    history.push(value);
    
    if (history.length > 100) {
      history.shift(); // Keep last 100 values
    }
    
    this.histograms.set(metric, history);
    
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  private setupCustomMetrics(): void {
    // Initialize custom metric collectors
    this.counters.set('api:calls', 0);
    this.counters.set('db:queries', 0);
    this.counters.set('cache:hits', 0);
    this.counters.set('cache:misses', 0);
    this.counters.set('errors:total', 0);
    this.counters.set('warnings:total', 0);
  }

  public recordTestStart(test: TestCase): void {
    this.testMetrics.total++;
    this.timers.set(`test:${test.id}`, performance.now());
    
    this.incrementCounter('tests:started');
    this.setGauge('tests:running', (this.gauges.get('tests:running') || 0) + 1);
    
    this.emit('test:started', { test: test.name, timestamp: Date.now() });
  }

  public recordTestPass(test: TestCase, result: TestCaseResult): void {
    this.testMetrics.passed++;
    
    const duration = this.endTimer(`test:${test.id}`);
    if (duration) {
      this.recordTestDuration(duration);
      this.recordHistogram('test:duration', duration);
    }
    
    this.incrementCounter('tests:passed');
    this.decrementGauge('tests:running');
    
    this.emit('test:passed', { 
      test: test.name, 
      duration, 
      timestamp: Date.now() 
    });
  }

  public recordTestFail(test: TestCase, error: Error): void {
    this.testMetrics.failed++;
    
    const duration = this.endTimer(`test:${test.id}`);
    if (duration) {
      this.recordTestDuration(duration);
    }
    
    this.incrementCounter('tests:failed');
    this.incrementCounter(`errors:${error.constructor.name}`);
    this.decrementGauge('tests:running');
    
    this.emit('test:failed', { 
      test: test.name, 
      error: error.message,
      duration,
      timestamp: Date.now() 
    });
  }

  public recordTestSkip(test: TestCase, reason: string): void {
    this.testMetrics.skipped++;
    
    this.incrementCounter('tests:skipped');
    this.incrementCounter(`skip:reason:${reason.toLowerCase().replace(/\s+/g, '_')}`);
    
    this.emit('test:skipped', { 
      test: test.name, 
      reason,
      timestamp: Date.now() 
    });
  }

  public recordTestRetry(test: TestCase, attempt: number): void {
    this.testMetrics.retried++;
    
    this.incrementCounter('tests:retried');
    this.incrementCounter(`retry:attempt:${attempt}`);
    
    if (attempt > 1) {
      this.testMetrics.flaky++;
      this.incrementCounter('tests:flaky');
    }
    
    this.emit('test:retried', { 
      test: test.name, 
      attempt,
      timestamp: Date.now() 
    });
  }

  private recordTestDuration(duration: number): void {
    this.testMetrics.duration += duration;
    this.testMetrics.minDuration = Math.min(this.testMetrics.minDuration, duration);
    this.testMetrics.maxDuration = Math.max(this.testMetrics.maxDuration, duration);
    
    const totalTests = this.testMetrics.passed + this.testMetrics.failed;
    if (totalTests > 0) {
      this.testMetrics.avgDuration = this.testMetrics.duration / totalTests;
      this.testMetrics.throughput = totalTests / ((Date.now() - this.startTime) / 1000);
    }
  }

  public startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  public endTimer(name: string): number | null {
    const start = this.timers.get(name);
    if (!start) {
      return null;
    }
    
    const duration = performance.now() - start;
    this.timers.delete(name);
    
    return duration;
  }

  public incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  public decrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, Math.max(0, current - value));
  }

  public setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  public incrementGauge(name: string, value: number = 1): void {
    const current = this.gauges.get(name) || 0;
    this.gauges.set(name, current + value);
  }

  public decrementGauge(name: string, value: number = 1): void {
    const current = this.gauges.get(name) || 0;
    this.gauges.set(name, Math.max(0, current - value));
  }

  public recordHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) || [];
    values.push(value);
    this.histograms.set(name, values);
  }

  public recordApiCall(endpoint: string, method: string, duration: number, status: number): void {
    this.incrementCounter('api:calls');
    this.incrementCounter(`api:${method.toLowerCase()}`);
    this.incrementCounter(`api:status:${Math.floor(status / 100)}xx`);
    
    if (status >= 400) {
      this.incrementCounter('api:errors');
    }
    
    this.recordHistogram(`api:duration:${endpoint}`, duration);
    
    this.emit('api:call', {
      endpoint,
      method,
      duration,
      status,
      timestamp: Date.now()
    });
  }

  public recordDatabaseQuery(query: string, duration: number, rows: number): void {
    this.incrementCounter('db:queries');
    this.recordHistogram('db:duration', duration);
    this.recordHistogram('db:rows', rows);
    
    if (duration > 1000) {
      this.incrementCounter('db:slow_queries');
    }
    
    this.emit('db:query', {
      query: query.substring(0, 100), // Truncate for logging
      duration,
      rows,
      timestamp: Date.now()
    });
  }

  public recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', key: string): void {
    this.incrementCounter(`cache:${operation}`);
    
    const hitRate = this.calculateCacheHitRate();
    this.setGauge('cache:hit_rate', hitRate);
    
    this.emit('cache:operation', {
      operation,
      key,
      hitRate,
      timestamp: Date.now()
    });
  }

  private calculateCacheHitRate(): number {
    const hits = this.counters.get('cache:hits') || 0;
    const misses = this.counters.get('cache:misses') || 0;
    const total = hits + misses;
    
    return total > 0 ? (hits / total) * 100 : 0;
  }

  public recordError(error: Error, context?: any): void {
    this.incrementCounter('errors:total');
    this.incrementCounter(`errors:${error.constructor.name}`);
    
    this.emit('error', {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
  }

  public recordNetworkTraffic(bytesIn: number, bytesOut: number): void {
    this.networkStats.bytesIn += bytesIn;
    this.networkStats.bytesOut += bytesOut;
    
    this.setGauge('network:bytes_in', this.networkStats.bytesIn);
    this.setGauge('network:bytes_out', this.networkStats.bytesOut);
  }

  public getSnapshot(): MetricSnapshot {
    const elapsed = Date.now() - this.startTime;
    
    return {
      timestamp: Date.now(),
      tests: { ...this.testMetrics },
      performance: this.getPerformanceMetrics(),
      resources: this.getResourceMetrics(),
      custom: new Map(this.metrics)
    };
  }

  private getPerformanceMetrics(): PerformanceMetrics {
    const responseTimes = this.histograms.get('test:duration') || [];
    
    return {
      responseTime: this.calculateResponseTimeMetrics(responseTimes),
      throughput: this.calculateThroughputMetrics(),
      errorRate: this.calculateErrorRate(),
      cpu: this.getCpuMetrics(),
      memory: this.getMemoryMetrics(),
      network: { ...this.networkStats }
    };
  }

  private calculateResponseTimeMetrics(times: number[]): ResponseTimeMetrics {
    if (times.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0,
        stdDev: 0
      };
    }

    const sorted = [...times].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;
    
    const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      mean,
      median: sorted[Math.floor(sorted.length / 2)]!,
      p95: sorted[Math.floor(sorted.length * 0.95)]!,
      p99: sorted[Math.floor(sorted.length * 0.99)]!,
      stdDev
    };
  }

  private calculateThroughputMetrics(): ThroughputMetrics {
    const elapsed = (Date.now() - this.startTime) / 1000; // seconds
    const totalRequests = this.counters.get('api:calls') || 0;
    const successfulRequests = totalRequests - (this.counters.get('api:errors') || 0);
    
    return {
      rps: elapsed > 0 ? totalRequests / elapsed : 0,
      rpm: elapsed > 0 ? (totalRequests / elapsed) * 60 : 0,
      totalRequests,
      successfulRequests,
      failedRequests: totalRequests - successfulRequests
    };
  }

  private calculateErrorRate(): number {
    const total = this.testMetrics.total;
    const failed = this.testMetrics.failed;
    
    return total > 0 ? (failed / total) * 100 : 0;
  }

  private getCpuMetrics(): ResourceMetrics {
    return {
      current: this.gauges.get('cpu:current') || 0,
      peak: this.gauges.get('cpu:peak') || 0,
      min: this.gauges.get('cpu:min') || 0,
      max: this.gauges.get('cpu:max') || 0,
      mean: this.calculateMean('cpu', this.gauges.get('cpu:current') || 0)
    };
  }

  private getMemoryMetrics(): ResourceMetrics {
    return {
      current: this.gauges.get('memory:current') || 0,
      peak: this.gauges.get('memory:peak') || 0,
      min: this.gauges.get('memory:min') || 0,
      max: this.gauges.get('memory:max') || 0,
      mean: this.calculateMean('memory', this.gauges.get('memory:current') || 0)
    };
  }

  private getResourceMetrics(): SystemResources {
    return {
      cpu: this.getCpuMetrics(),
      memory: this.getMemoryMetrics(),
      network: { ...this.networkStats },
      disk: {
        read: this.counters.get('disk:read') || 0,
        write: this.counters.get('disk:write') || 0,
        utilization: this.gauges.get('disk:utilization') || 0
      }
    };
  }

  public async collect(): Promise<any> {
    const snapshot = this.getSnapshot();
    
    // Add additional metrics
    const metrics = {
      ...snapshot,
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [
          key,
          this.calculateResponseTimeMetrics(values)
        ])
      )
    };
    
    return metrics;
  }

  public async flush(): Promise<void> {
    this.logger.info('Flushing metrics');
    
    // Get final metrics
    const metrics = await this.collect();
    
    // Emit final metrics event
    this.emit('metrics:final', metrics);
    
    // Stop resource monitoring
    if (this.resourceInterval) {
      clearInterval(this.resourceInterval);
    }
    
    // Disconnect performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    // Clear all metrics
    this.metrics.clear();
    this.timers.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  public reset(): void {
    this.testMetrics = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      retried: 0,
      duration: 0,
      avgDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      throughput: 0
    };
    
    this.networkStats = {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
      latency: 0,
      packetLoss: 0
    };
    
    this.startTime = Date.now();
    this.metrics.clear();
    this.timers.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}