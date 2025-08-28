import { EventEmitter } from 'events';
import { Socket } from 'socket.io-client';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export class TestEventMonitor extends EventEmitter {
  private events: Map<string, any[]>;
  private sockets: Map<string, Socket>;

  constructor() {
    super();
    this.events = new Map();
    this.sockets = new Map();
  }

  trackEvent(eventType: string, data: any): void {
    const events = this.events.get(eventType) || [];
    events.push({
      timestamp: new Date(),
      data
    });
    this.events.set(eventType, events);
    this.emit(eventType, data);
  }

  getEvents(eventType: string): any[] {
    return this.events.get(eventType) || [];
  }

  clearEvents(eventType?: string): void {
    if (eventType) {
      this.events.delete(eventType);
    } else {
      this.events.clear();
    }
  }

  attachSocket(name: string, socket: Socket): void {
    this.sockets.set(name, socket);
    
    // Listen to all events
    socket.onAny((eventName, ...args) => {
      this.trackEvent(`${name}:${eventName}`, args);
    });
  }

  detachSocket(name: string): void {
    const socket = this.sockets.get(name);
    if (socket) {
      socket.offAny();
      this.sockets.delete(name);
    }
  }

  async waitForEvent(
    eventType: string,
    timeout = 30000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      this.once(eventType, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  async waitForEvents(
    eventTypes: string[],
    timeout = 30000
  ): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const promises = eventTypes.map(async (eventType) => {
      const data = await this.waitForEvent(eventType, timeout);
      results.set(eventType, data);
    });

    await Promise.all(promises);
    return results;
  }
}

export class MetricsCollector {
  private metrics: Map<string, number[]>;
  private startTimes: Map<string, number>;

  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  startTimer(label: string): void {
    this.startTimes.set(label, Date.now());
  }

  endTimer(label: string): number {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      throw new Error(`No timer started for ${label}`);
    }

    const duration = Date.now() - startTime;
    this.recordMetric(label, duration);
    this.startTimes.delete(label);
    
    return duration;
  }

  recordMetric(label: string, value: number): void {
    const values = this.metrics.get(label) || [];
    values.push(value);
    this.metrics.set(label, values);
  }

  getMetrics(label: string): number[] {
    return this.metrics.get(label) || [];
  }

  getStatistics(label: string): {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  } {
    const values = this.getMetrics(label);
    if (values.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / values.length,
      median: this.getPercentile(sorted, 50),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99)
    };
  }

  private getPercentile(sortedValues: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  clear(label?: string): void {
    if (label) {
      this.metrics.delete(label);
      this.startTimes.delete(label);
    } else {
      this.metrics.clear();
      this.startTimes.clear();
    }
  }

  generateReport(): string {
    const report: string[] = ['=== Metrics Report ==='];
    
    for (const [label, values] of this.metrics) {
      const stats = this.getStatistics(label);
      report.push(`\n${label}:`);
      report.push(`  Count: ${stats.count}`);
      report.push(`  Mean: ${stats.mean.toFixed(2)}ms`);
      report.push(`  Median: ${stats.median.toFixed(2)}ms`);
      report.push(`  Min: ${stats.min.toFixed(2)}ms`);
      report.push(`  Max: ${stats.max.toFixed(2)}ms`);
      report.push(`  P95: ${stats.p95.toFixed(2)}ms`);
      report.push(`  P99: ${stats.p99.toFixed(2)}ms`);
    }

    return report.join('\n');
  }
}

export class TestDataFactory {
  static createOrganization(overrides?: Partial<any>): any {
    return {
      id: `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Test Organization ${Date.now()}`,
      plan: 'enterprise',
      apiKey: `test_${Math.random().toString(36).substr(2, 32)}`,
      ...overrides
    };
  }

  static createAgent(organizationId: string, type: string, overrides?: Partial<any>): any {
    return {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId,
      type,
      modelVersion: 'v1.0.0',
      config: {
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9
      },
      isActive: true,
      ...overrides
    };
  }

  static createExperiment(
    organizationId: string,
    agentId: string,
    overrides?: Partial<any>
  ): any {
    return {
      id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId,
      agentId,
      name: `Test Experiment ${Date.now()}`,
      status: 'draft',
      variantA: { config: 'a' },
      variantB: { config: 'b' },
      trafficSplit: 0.5,
      ...overrides
    };
  }

  static createFeedback(
    organizationId: string,
    agentId: string,
    overrides?: Partial<any>
  ): any {
    return {
      organizationId,
      agentId,
      type: 'implicit',
      metadata: {
        eventType: 'click',
        timestamp: new Date().toISOString()
      },
      ...overrides
    };
  }
}

export class AsyncBatcher<T> {
  private batch: T[];
  private batchSize: number;
  private flushInterval: number;
  private processor: (batch: T[]) => Promise<void>;
  private timer?: NodeJS.Timeout;

  constructor(
    batchSize: number,
    flushInterval: number,
    processor: (batch: T[]) => Promise<void>
  ) {
    this.batch = [];
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    this.processor = processor;
  }

  async add(item: T): Promise<void> {
    this.batch.push(item);

    if (this.batch.length >= this.batchSize) {
      await this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.batch.length === 0) return;

    const batchToProcess = [...this.batch];
    this.batch = [];

    try {
      await this.processor(batchToProcess);
    } catch (error) {
      logger.error({ error, batchSize: batchToProcess.length }, 'Batch processing failed');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }

  get size(): number {
    return this.batch.length;
  }
}

export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate; // tokens per second
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1): Promise<void> {
    await this.refill();

    while (this.tokens < tokens) {
      await this.delay(100);
      await this.refill();
    }

    this.tokens -= tokens;
  }

  private async refill(): Promise<void> {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // in seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get available(): number {
    return this.tokens;
  }
}

export class CircuitBreaker {
  private failureCount: number;
  private successCount: number;
  private state: 'closed' | 'open' | 'half-open';
  private lastFailureTime?: number;
  private readonly threshold: number;
  private readonly timeout: number;
  private readonly successThreshold: number;

  constructor(
    threshold = 5,
    timeout = 60000,
    successThreshold = 3
  ) {
    this.failureCount = 0;
    this.successCount = 0;
    this.state = 'closed';
    this.threshold = threshold;
    this.timeout = timeout;
    this.successThreshold = successThreshold;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'closed';
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }

  get currentState(): string {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.state = 'closed';
    this.lastFailureTime = undefined;
  }
}

export class TestReporter {
  private results: Map<string, any>;

  constructor() {
    this.results = new Map();
  }

  recordTest(name: string, result: any): void {
    this.results.set(name, {
      ...result,
      timestamp: new Date()
    });
  }

  generateHtmlReport(): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>E2E Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .test { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .pass { background-color: #d4edda; border-color: #c3e6cb; }
    .fail { background-color: #f8d7da; border-color: #f5c6cb; }
    .metrics { margin-top: 10px; }
    .metric { display: inline-block; margin-right: 20px; }
    .timestamp { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>AI Improvement Cycle E2E Test Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Tests: ${this.results.size}</p>
    <p>Passed: ${Array.from(this.results.values()).filter(r => r.passed).length}</p>
    <p>Failed: ${Array.from(this.results.values()).filter(r => !r.passed).length}</p>
  </div>
  <div class="tests">
    <h2>Test Results</h2>
    ${Array.from(this.results.entries()).map(([name, result]) => `
      <div class="test ${result.passed ? 'pass' : 'fail'}">
        <h3>${name}</h3>
        <p class="timestamp">${result.timestamp}</p>
        <div class="metrics">
          ${result.metrics ? Object.entries(result.metrics).map(([key, value]) => `
            <span class="metric"><strong>${key}:</strong> ${value}</span>
          `).join('') : ''}
        </div>
        ${result.error ? `<p class="error">Error: ${result.error}</p>` : ''}
      </div>
    `).join('')}
  </div>
</body>
</html>
    `;

    return html;
  }

  saveReport(filepath: string): void {
    const fs = require('fs');
    fs.writeFileSync(filepath, this.generateHtmlReport());
    logger.info({ filepath }, 'Test report saved');
  }
}