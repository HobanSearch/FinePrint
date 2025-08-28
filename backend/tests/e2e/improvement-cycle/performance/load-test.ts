import { performance } from 'perf_hooks';
import { ImprovementCycleApiClient } from '../utils/api-clients';
import { TestDataGenerator } from '../utils/data-generators';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  }
});

interface LoadTestConfig {
  concurrentUsers: number;
  testDuration: number; // milliseconds
  requestsPerSecond: number;
  services: string[];
}

interface LoadTestResult {
  service: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
}

export class LoadTester {
  private apiClient: ImprovementCycleApiClient;
  private results: Map<string, number[]>;
  private errors: Map<string, number>;

  constructor() {
    this.apiClient = new ImprovementCycleApiClient('load_test_key');
    this.results = new Map();
    this.errors = new Map();
  }

  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResult[]> {
    logger.info({ config }, 'Starting load test');

    const startTime = performance.now();
    const endTime = startTime + config.testDuration;
    const requestInterval = 1000 / config.requestsPerSecond;

    // Initialize result collectors
    config.services.forEach(service => {
      this.results.set(service, []);
      this.errors.set(service, 0);
    });

    // Create concurrent user sessions
    const userSessions = [];
    for (let i = 0; i < config.concurrentUsers; i++) {
      userSessions.push(this.simulateUser(i, endTime, requestInterval, config.services));
    }

    // Wait for all sessions to complete
    await Promise.all(userSessions);

    // Calculate results
    const testResults = this.calculateResults(config.services);
    
    logger.info({ results: testResults }, 'Load test completed');
    
    return testResults;
  }

  private async simulateUser(
    userId: number,
    endTime: number,
    requestInterval: number,
    services: string[]
  ): Promise<void> {
    const orgId = `org_${userId}`;
    const agentId = `agent_${userId}`;

    while (performance.now() < endTime) {
      for (const service of services) {
        await this.makeRequest(service, orgId, agentId);
        await this.delay(requestInterval);
      }
    }
  }

  private async makeRequest(
    service: string,
    orgId: string,
    agentId: string
  ): Promise<void> {
    const startTime = performance.now();

    try {
      switch (service) {
        case 'digital-twin':
          await this.testDigitalTwin(orgId, agentId);
          break;
        case 'business-agents':
          await this.testBusinessAgents(orgId, agentId);
          break;
        case 'content-optimizer':
          await this.testContentOptimizer(agentId);
          break;
        case 'feedback-collector':
          await this.testFeedbackCollector(orgId, agentId);
          break;
        case 'improvement-orchestrator':
          await this.testImprovementOrchestrator(agentId);
          break;
      }

      const latency = performance.now() - startTime;
      this.recordLatency(service, latency);
    } catch (error) {
      this.recordError(service);
      logger.debug({ service, error }, 'Request failed');
    }
  }

  private async testDigitalTwin(orgId: string, agentId: string): Promise<void> {
    const config = TestDataGenerator.generateABTestConfig('marketing');
    await this.apiClient.digitalTwin.createExperiment({
      organizationId: orgId,
      agentId,
      name: `Load test experiment ${Date.now()}`,
      variantA: config.variantA,
      variantB: config.variantB
    });
  }

  private async testBusinessAgents(orgId: string, agentId: string): Promise<void> {
    await this.apiClient.businessAgents.generateContent(
      agentId,
      'Generate test content for load testing'
    );
  }

  private async testContentOptimizer(agentId: string): Promise<void> {
    await this.apiClient.contentOptimizer.optimizeContent({
      agentId,
      content: TestDataGenerator.generateContent('marketing'),
      targetMetric: 'engagement'
    });
  }

  private async testFeedbackCollector(orgId: string, agentId: string): Promise<void> {
    const feedback = TestDataGenerator.generateFeedback(orgId, agentId);
    await this.apiClient.feedbackCollector.submitFeedback(feedback);
  }

  private async testImprovementOrchestrator(agentId: string): Promise<void> {
    await this.apiClient.improvementOrchestrator.getImprovementHistory(agentId);
  }

  private recordLatency(service: string, latency: number): void {
    const latencies = this.results.get(service) || [];
    latencies.push(latency);
    this.results.set(service, latencies);
  }

  private recordError(service: string): void {
    const errors = this.errors.get(service) || 0;
    this.errors.set(service, errors + 1);
  }

  private calculateResults(services: string[]): LoadTestResult[] {
    return services.map(service => {
      const latencies = this.results.get(service) || [];
      const errorCount = this.errors.get(service) || 0;
      const totalRequests = latencies.length + errorCount;

      // Sort latencies for percentile calculation
      const sortedLatencies = [...latencies].sort((a, b) => a - b);

      return {
        service,
        totalRequests,
        successfulRequests: latencies.length,
        failedRequests: errorCount,
        averageLatency: this.calculateAverage(latencies),
        p50Latency: this.calculatePercentile(sortedLatencies, 50),
        p95Latency: this.calculatePercentile(sortedLatencies, 95),
        p99Latency: this.calculatePercentile(sortedLatencies, 99),
        throughput: latencies.length / (this.calculateSum(latencies) / 1000), // requests per second
        errorRate: (errorCount / totalRequests) * 100
      };
    });
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return this.calculateSum(values) / values.length;
  }

  private calculateSum(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0);
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    await this.apiClient.cleanup();
  }
}

export class StressTester {
  private loadTester: LoadTester;

  constructor() {
    this.loadTester = new LoadTester();
  }

  async findBreakingPoint(
    service: string,
    startingLoad: number = 10,
    increment: number = 10,
    maxLoad: number = 1000
  ): Promise<{
    breakingPoint: number;
    maxSuccessfulLoad: number;
    failureThreshold: number;
  }> {
    logger.info({ service }, 'Finding breaking point');

    let currentLoad = startingLoad;
    let maxSuccessfulLoad = 0;
    let breakingPoint = 0;

    while (currentLoad <= maxLoad) {
      logger.info({ currentLoad }, 'Testing load level');

      const results = await this.loadTester.runLoadTest({
        concurrentUsers: currentLoad,
        testDuration: 30000, // 30 seconds
        requestsPerSecond: currentLoad * 2,
        services: [service]
      });

      const result = results[0];

      // Check if system is still healthy
      if (result.errorRate < 5 && result.p95Latency < 2000) {
        maxSuccessfulLoad = currentLoad;
      } else {
        breakingPoint = currentLoad;
        break;
      }

      currentLoad += increment;
    }

    return {
      breakingPoint,
      maxSuccessfulLoad,
      failureThreshold: breakingPoint - maxSuccessfulLoad
    };
  }

  async runEnduranceTest(
    config: LoadTestConfig,
    checkInterval: number = 60000 // Check every minute
  ): Promise<{
    duration: number;
    degradation: boolean;
    averageMetrics: LoadTestResult[];
  }> {
    logger.info('Starting endurance test');

    const startTime = performance.now();
    const results: LoadTestResult[][] = [];
    let degradationDetected = false;

    const intervalId = setInterval(async () => {
      const intervalResults = await this.loadTester.runLoadTest({
        ...config,
        testDuration: checkInterval
      });

      results.push(intervalResults);

      // Check for performance degradation
      if (results.length > 2) {
        const current = results[results.length - 1];
        const previous = results[results.length - 2];

        for (let i = 0; i < current.length; i++) {
          if (current[i].averageLatency > previous[i].averageLatency * 1.5) {
            degradationDetected = true;
            clearInterval(intervalId);
            break;
          }
        }
      }
    }, checkInterval);

    // Run for specified duration
    await new Promise(resolve => setTimeout(resolve, config.testDuration));
    clearInterval(intervalId);

    // Calculate average metrics
    const averageMetrics = this.calculateAverageMetrics(results);

    return {
      duration: performance.now() - startTime,
      degradation: degradationDetected,
      averageMetrics
    };
  }

  private calculateAverageMetrics(results: LoadTestResult[][]): LoadTestResult[] {
    if (results.length === 0) return [];

    const serviceMetrics: Map<string, LoadTestResult> = new Map();

    // Initialize with first result structure
    results[0].forEach(result => {
      serviceMetrics.set(result.service, {
        ...result,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        throughput: 0,
        errorRate: 0
      });
    });

    // Sum all metrics
    results.forEach(intervalResults => {
      intervalResults.forEach(result => {
        const current = serviceMetrics.get(result.service)!;
        current.totalRequests += result.totalRequests;
        current.successfulRequests += result.successfulRequests;
        current.failedRequests += result.failedRequests;
        current.averageLatency += result.averageLatency;
        current.p50Latency += result.p50Latency;
        current.p95Latency += result.p95Latency;
        current.p99Latency += result.p99Latency;
        current.throughput += result.throughput;
        current.errorRate += result.errorRate;
      });
    });

    // Calculate averages
    const count = results.length;
    return Array.from(serviceMetrics.values()).map(metrics => ({
      ...metrics,
      averageLatency: metrics.averageLatency / count,
      p50Latency: metrics.p50Latency / count,
      p95Latency: metrics.p95Latency / count,
      p99Latency: metrics.p99Latency / count,
      throughput: metrics.throughput / count,
      errorRate: metrics.errorRate / count
    }));
  }

  async cleanup(): Promise<void> {
    await this.loadTester.cleanup();
  }
}

// CLI execution for standalone testing
if (require.main === module) {
  const runTests = async () => {
    const loadTester = new LoadTester();
    const stressTester = new StressTester();

    try {
      // Run standard load test
      logger.info('Running standard load test');
      const loadResults = await loadTester.runLoadTest({
        concurrentUsers: 100,
        testDuration: 60000, // 1 minute
        requestsPerSecond: 50,
        services: [
          'digital-twin',
          'business-agents',
          'content-optimizer',
          'feedback-collector',
          'improvement-orchestrator'
        ]
      });

      console.log('\n=== Load Test Results ===');
      console.table(loadResults);

      // Find breaking points
      logger.info('Finding breaking points');
      const breakingPoints = await Promise.all([
        stressTester.findBreakingPoint('digital-twin'),
        stressTester.findBreakingPoint('business-agents'),
        stressTester.findBreakingPoint('content-optimizer')
      ]);

      console.log('\n=== Breaking Points ===');
      console.table(breakingPoints);

      // Run endurance test
      logger.info('Running endurance test');
      const enduranceResults = await stressTester.runEnduranceTest({
        concurrentUsers: 50,
        testDuration: 300000, // 5 minutes
        requestsPerSecond: 25,
        services: ['digital-twin', 'business-agents']
      });

      console.log('\n=== Endurance Test Results ===');
      console.log(`Duration: ${enduranceResults.duration}ms`);
      console.log(`Degradation detected: ${enduranceResults.degradation}`);
      console.table(enduranceResults.averageMetrics);

    } catch (error) {
      logger.error({ error }, 'Load test failed');
      process.exit(1);
    } finally {
      await loadTester.cleanup();
      await stressTester.cleanup();
    }
  };

  runTests().then(() => {
    logger.info('Load tests completed');
    process.exit(0);
  });
}