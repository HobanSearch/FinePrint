import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../mocks/shared-logger';
import { ModelPerformanceMonitor } from './model-performance-monitor';

export interface ABTest {
  testId: string;
  name: string;
  domain: string;
  status: 'active' | 'completed' | 'paused';
  baselineModel: string;
  challengerModels: string[];
  trafficAllocation: TrafficAllocation;
  metrics: ABTestMetrics;
  startDate: Date;
  endDate?: Date;
  config: ABTestConfig;
}

export interface TrafficAllocation {
  baseline: number; // Percentage 0-100
  challengers: { [modelId: string]: number };
}

export interface ABTestConfig {
  minSampleSize: number;
  maxDuration: number; // hours
  confidenceLevel: number; // 0.95 = 95%
  primaryMetric: 'response_time' | 'error_rate' | 'user_satisfaction' | 'composite';
  autoStop: boolean;
  autoPromote: boolean;
}

export interface ABTestMetrics {
  baseline: ModelTestMetrics;
  challengers: { [modelId: string]: ModelTestMetrics };
}

export interface ModelTestMetrics {
  samples: number;
  avgResponseTime: number;
  errorRate: number;
  userSatisfaction: number;
  conversions: number; // For business metrics
  confidence: number;
}

export interface ABTestResult {
  testId: string;
  winner: string;
  confidence: number;
  improvement: number;
  recommendation: string;
  detailedMetrics: ABTestMetrics;
}

export class ABTestingManager extends EventEmitter {
  private redis: Redis;
  private performanceMonitor: ModelPerformanceMonitor;
  private activeTests = new Map<string, ABTest>();
  private testCheckInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis, performanceMonitor: ModelPerformanceMonitor) {
    super();
    this.redis = redis;
    this.performanceMonitor = performanceMonitor;
    this.loadActiveTests();
    this.startMonitoring();
  }

  async createABTest(params: {
    name: string;
    domain: string;
    baselineModel: string;
    challengerModels: string[];
    trafficAllocation?: TrafficAllocation;
    config?: Partial<ABTestConfig>;
  }): Promise<ABTest> {
    const testId = `ab_test_${Date.now()}_${uuidv4().slice(0, 8)}`;
    
    // Default traffic allocation if not provided
    const defaultAllocation = this.calculateDefaultAllocation(
      params.baselineModel,
      params.challengerModels
    );

    const test: ABTest = {
      testId,
      name: params.name,
      domain: params.domain,
      status: 'active',
      baselineModel: params.baselineModel,
      challengerModels: params.challengerModels,
      trafficAllocation: params.trafficAllocation || defaultAllocation,
      metrics: this.initializeMetrics(params.baselineModel, params.challengerModels),
      startDate: new Date(),
      config: {
        minSampleSize: params.config?.minSampleSize || 1000,
        maxDuration: params.config?.maxDuration || 168, // 7 days
        confidenceLevel: params.config?.confidenceLevel || 0.95,
        primaryMetric: params.config?.primaryMetric || 'composite',
        autoStop: params.config?.autoStop ?? true,
        autoPromote: params.config?.autoPromote ?? false
      }
    };

    // Save to Redis
    await this.redis.setex(
      `ab_test:${testId}`,
      86400 * 30, // 30 days TTL
      JSON.stringify(test)
    );

    // Add to active tests
    this.activeTests.set(testId, test);

    // Configure domain routing
    await this.configureDomainRouting(test);

    logger.info('Created A/B test', { testId, name: test.name });
    this.emit('test_created', test);

    return test;
  }

  async getModelForRequest(domain: string, userId?: string): Promise<string> {
    // Find active test for domain
    const activeTest = Array.from(this.activeTests.values()).find(
      test => test.domain === domain && test.status === 'active'
    );

    if (!activeTest) {
      // No active test, use default
      const defaultModel = await this.redis.get(`domain:${domain}:default`);
      return defaultModel || 'phi-2';
    }

    // Deterministic assignment based on user ID
    const assignment = userId 
      ? this.hashUserToModel(userId, activeTest)
      : this.randomModelSelection(activeTest);

    // Record the assignment
    await this.recordAssignment(activeTest.testId, assignment, userId);

    return assignment;
  }

  async recordConversion(testId: string, modelId: string, conversionValue: number = 1): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;

    const key = `ab_test:${testId}:conversions:${modelId}`;
    await this.redis.incrbyfloat(key, conversionValue);

    // Update metrics
    await this.updateTestMetrics(testId);
  }

  async stopTest(testId: string, reason?: string): Promise<ABTestResult> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    test.status = 'completed';
    test.endDate = new Date();

    // Calculate final results
    const result = await this.calculateTestResults(test);

    // Save final state
    await this.redis.setex(
      `ab_test:${testId}`,
      86400 * 90, // Keep for 90 days
      JSON.stringify(test)
    );

    // Remove from active tests
    this.activeTests.delete(testId);

    // Reset domain routing if needed
    if (result.winner !== test.baselineModel && test.config.autoPromote) {
      await this.promoteWinner(test.domain, result.winner);
    }

    logger.info('Stopped A/B test', { testId, reason, winner: result.winner });
    this.emit('test_completed', test, result);

    return result;
  }

  async getTestStatus(testId: string): Promise<ABTest | null> {
    let test = this.activeTests.get(testId);
    
    if (!test) {
      // Try loading from Redis
      const data = await this.redis.get(`ab_test:${testId}`);
      if (data) {
        test = JSON.parse(data);
      }
    }

    if (test) {
      // Update metrics
      await this.updateTestMetrics(testId);
    }

    return test || null;
  }

  async getActiveTests(domain?: string): Promise<ABTest[]> {
    const tests = Array.from(this.activeTests.values());
    
    if (domain) {
      return tests.filter(test => test.domain === domain);
    }
    
    return tests;
  }

  private async loadActiveTests(): Promise<void> {
    try {
      const keys = await this.redis.keys('ab_test:*');
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const test: ABTest = JSON.parse(data);
          if (test.status === 'active') {
            this.activeTests.set(test.testId, test);
          }
        }
      }

      logger.info(`Loaded ${this.activeTests.size} active A/B tests`);
    } catch (error) {
      logger.error('Failed to load active tests', error);
    }
  }

  private startMonitoring(): void {
    // Check tests every 5 minutes
    this.testCheckInterval = setInterval(async () => {
      for (const test of this.activeTests.values()) {
        await this.checkTestCompletion(test);
      }
    }, 300000); // 5 minutes
  }

  private async checkTestCompletion(test: ABTest): Promise<void> {
    try {
      // Update metrics first
      await this.updateTestMetrics(test.testId);

      // Check if test should be stopped
      const shouldStop = await this.shouldStopTest(test);
      
      if (shouldStop.stop) {
        await this.stopTest(test.testId, shouldStop.reason);
      }
    } catch (error) {
      logger.error('Error checking test completion', { testId: test.testId, error });
    }
  }

  private async shouldStopTest(test: ABTest): Promise<{ stop: boolean; reason?: string }> {
    // Check duration
    const hoursRunning = (Date.now() - test.startDate.getTime()) / (1000 * 60 * 60);
    if (hoursRunning >= test.config.maxDuration) {
      return { stop: true, reason: 'Max duration reached' };
    }

    // Check sample size
    const totalSamples = test.metrics.baseline.samples + 
      Object.values(test.metrics.challengers).reduce((sum, m) => sum + m.samples, 0);
    
    if (totalSamples < test.config.minSampleSize) {
      return { stop: false };
    }

    // Check statistical significance
    if (test.config.autoStop) {
      const result = await this.calculateTestResults(test);
      if (result.confidence >= test.config.confidenceLevel) {
        return { stop: true, reason: 'Statistical significance reached' };
      }
    }

    return { stop: false };
  }

  private async updateTestMetrics(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test) return;

    // Update baseline metrics
    const baselineMetrics = await this.performanceMonitor.getModelMetrics(test.baselineModel);
    test.metrics.baseline = {
      samples: baselineMetrics.totalRequests,
      avgResponseTime: baselineMetrics.avgResponseTime,
      errorRate: baselineMetrics.errorRate,
      userSatisfaction: baselineMetrics.userSatisfactionScore,
      conversions: await this.getConversions(testId, test.baselineModel),
      confidence: 0 // Will be calculated
    };

    // Update challenger metrics
    for (const challengerId of test.challengerModels) {
      const challengerMetrics = await this.performanceMonitor.getModelMetrics(challengerId);
      test.metrics.challengers[challengerId] = {
        samples: challengerMetrics.totalRequests,
        avgResponseTime: challengerMetrics.avgResponseTime,
        errorRate: challengerMetrics.errorRate,
        userSatisfaction: challengerMetrics.userSatisfactionScore,
        conversions: await this.getConversions(testId, challengerId),
        confidence: 0 // Will be calculated
      };
    }
  }

  private async calculateTestResults(test: ABTest): Promise<ABTestResult> {
    const results: { [modelId: string]: number } = {};
    
    // Calculate composite score for each model
    const baselineScore = this.calculateCompositeScore(test.metrics.baseline, test.config.primaryMetric);
    results[test.baselineModel] = baselineScore;

    for (const [modelId, metrics] of Object.entries(test.metrics.challengers)) {
      results[modelId] = this.calculateCompositeScore(metrics, test.config.primaryMetric);
    }

    // Find winner
    const winner = Object.entries(results).reduce((a, b) => 
      results[a[0]] > results[b[0]] ? a : b
    )[0];

    // Calculate improvement
    const improvement = ((results[winner] - baselineScore) / baselineScore) * 100;

    // Calculate confidence (simplified)
    const confidence = this.calculateConfidence(test);

    return {
      testId: test.testId,
      winner,
      confidence,
      improvement,
      recommendation: this.generateRecommendation(winner, test.baselineModel, confidence, improvement),
      detailedMetrics: test.metrics
    };
  }

  private calculateCompositeScore(metrics: ModelTestMetrics, primaryMetric: ABTestConfig['primaryMetric']): number {
    switch (primaryMetric) {
      case 'response_time':
        return 1000 / metrics.avgResponseTime; // Inverse for "lower is better"
      case 'error_rate':
        return 1 - metrics.errorRate;
      case 'user_satisfaction':
        return metrics.userSatisfaction;
      case 'composite':
      default:
        return (
          (1 - metrics.errorRate) * 0.3 +
          metrics.userSatisfaction * 0.3 +
          (1000 / metrics.avgResponseTime) * 0.2 +
          (metrics.conversions / Math.max(metrics.samples, 1)) * 0.2
        );
    }
  }

  private calculateConfidence(test: ABTest): number {
    // Simplified confidence calculation
    // In production, use proper statistical tests (t-test, chi-square, etc.)
    const baselineSamples = test.metrics.baseline.samples;
    const minChallengerSamples = Math.min(
      ...Object.values(test.metrics.challengers).map(m => m.samples)
    );

    if (baselineSamples < 100 || minChallengerSamples < 100) {
      return 0.5;
    }

    // More samples = higher confidence (simplified)
    const sampleConfidence = Math.min(0.95, 0.5 + (minChallengerSamples / 1000) * 0.45);
    
    return sampleConfidence;
  }

  private generateRecommendation(winner: string, baseline: string, confidence: number, improvement: number): string {
    if (winner === baseline) {
      return `Keep the current baseline model. Challengers did not show significant improvement.`;
    }

    if (confidence < 0.9) {
      return `Continue testing. Current leader is ${winner} with ${improvement.toFixed(1)}% improvement, but confidence is only ${(confidence * 100).toFixed(1)}%.`;
    }

    if (improvement > 10) {
      return `Strong recommendation to switch to ${winner}. Shows ${improvement.toFixed(1)}% improvement with ${(confidence * 100).toFixed(1)}% confidence.`;
    }

    return `Consider switching to ${winner}. Shows ${improvement.toFixed(1)}% improvement with ${(confidence * 100).toFixed(1)}% confidence.`;
  }

  private calculateDefaultAllocation(baseline: string, challengers: string[]): TrafficAllocation {
    const totalModels = 1 + challengers.length;
    const baselinePercentage = 50;
    const challengerPercentage = 50 / challengers.length;

    const allocation: TrafficAllocation = {
      baseline: baselinePercentage,
      challengers: {}
    };

    for (const challenger of challengers) {
      allocation.challengers[challenger] = challengerPercentage;
    }

    return allocation;
  }

  private initializeMetrics(baseline: string, challengers: string[]): ABTestMetrics {
    const metrics: ABTestMetrics = {
      baseline: {
        samples: 0,
        avgResponseTime: 0,
        errorRate: 0,
        userSatisfaction: 0,
        conversions: 0,
        confidence: 0
      },
      challengers: {}
    };

    for (const challenger of challengers) {
      metrics.challengers[challenger] = {
        samples: 0,
        avgResponseTime: 0,
        errorRate: 0,
        userSatisfaction: 0,
        conversions: 0,
        confidence: 0
      };
    }

    return metrics;
  }

  private async configureDomainRouting(test: ABTest): Promise<void> {
    // Store routing configuration
    await this.redis.setex(
      `ab_routing:${test.domain}`,
      86400 * 30,
      JSON.stringify({
        testId: test.testId,
        allocation: test.trafficAllocation
      })
    );
  }

  private hashUserToModel(userId: string, test: ABTest): string {
    // Simple hash-based assignment for consistency
    const hash = this.simpleHash(userId + test.testId);
    const percentage = (hash % 100) + 1;

    let cumulative = 0;
    
    // Check baseline
    cumulative += test.trafficAllocation.baseline;
    if (percentage <= cumulative) {
      return test.baselineModel;
    }

    // Check challengers
    for (const [modelId, allocation] of Object.entries(test.trafficAllocation.challengers)) {
      cumulative += allocation;
      if (percentage <= cumulative) {
        return modelId;
      }
    }

    // Fallback to baseline
    return test.baselineModel;
  }

  private randomModelSelection(test: ABTest): string {
    const random = Math.random() * 100;
    let cumulative = 0;

    // Check baseline
    cumulative += test.trafficAllocation.baseline;
    if (random <= cumulative) {
      return test.baselineModel;
    }

    // Check challengers
    for (const [modelId, allocation] of Object.entries(test.trafficAllocation.challengers)) {
      cumulative += allocation;
      if (random <= cumulative) {
        return modelId;
      }
    }

    // Fallback to baseline
    return test.baselineModel;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async recordAssignment(testId: string, modelId: string, userId?: string): Promise<void> {
    const key = `ab_assignment:${testId}:${modelId}`;
    await this.redis.incr(key);
    
    if (userId) {
      await this.redis.setex(
        `ab_user:${testId}:${userId}`,
        86400 * 7, // 7 days
        modelId
      );
    }
  }

  private async getConversions(testId: string, modelId: string): Promise<number> {
    const key = `ab_test:${testId}:conversions:${modelId}`;
    const value = await this.redis.get(key);
    return value ? parseFloat(value) : 0;
  }

  private async promoteWinner(domain: string, winnerId: string): Promise<void> {
    await this.redis.set(`domain:${domain}:default`, winnerId);
    logger.info('Promoted A/B test winner', { domain, model: winnerId });
  }

  async cleanup(): Promise<void> {
    if (this.testCheckInterval) {
      clearInterval(this.testCheckInterval);
    }
  }
}

export default ABTestingManager;