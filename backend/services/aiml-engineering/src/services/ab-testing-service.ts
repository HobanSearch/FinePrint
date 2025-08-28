/**
 * Fine Print AI - A/B Testing Service for Model Evaluation
 * 
 * Provides A/B testing framework for comparing model performance in production
 * Supports statistical significance testing and automated decision making
 */

import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const logger = createServiceLogger('ab-testing-service');

// A/B Test Configuration Schema
export const ABTestConfigSchema = z.object({
  test_name: z.string(),
  description: z.string().optional(),
  model_variants: z.array(z.object({
    model_id: z.string(),
    model_name: z.string(),
    traffic_percentage: z.number().min(0).max(100),
  })),
  traffic_allocation: z.object({
    control_percentage: z.number().min(10).max(90).default(50),
    treatment_percentage: z.number().min(10).max(90).default(50),
  }),
  success_metrics: z.array(z.enum(['accuracy', 'response_time', 'user_satisfaction', 'conversion_rate', 'error_rate'])),
  statistical_config: z.object({
    confidence_level: z.number().min(0.9).max(0.99).default(0.95),
    minimum_sample_size: z.number().min(100).default(1000),
    maximum_duration_days: z.number().min(1).max(30).default(14),
    effect_size_threshold: z.number().min(0.01).max(0.5).default(0.05),
  }),
  stopping_criteria: z.object({
    early_stopping_enabled: z.boolean().default(true),
    significance_threshold: z.number().min(0.01).max(0.1).default(0.05),
    minimum_effect_size: z.number().min(0.01).max(0.2).default(0.02),
    max_runtime_hours: z.number().min(1).max(720).default(168), // 1 week default
  }),
  targeting_criteria: z.object({
    user_segments: z.array(z.string()).optional(),
    geographic_regions: z.array(z.string()).optional(),
    device_types: z.array(z.string()).optional(),
    time_of_day: z.object({
      start_hour: z.number().min(0).max(23).optional(),
      end_hour: z.number().min(0).max(23).optional(),
    }).optional(),
  }).optional(),
});

export type ABTestConfig = z.infer<typeof ABTestConfigSchema>;

export interface ABTest {
  id: string;
  name: string;
  config: ABTestConfig;
  status: 'draft' | 'running' | 'completed' | 'stopped' | 'failed';
  variants: TestVariant[];
  metrics: TestMetrics;
  statistical_results: StatisticalResults | null;
  winner: string | null;
  confidence_level: number;
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
  current_sample_size: number;
  estimated_completion: Date | null;
}

export interface TestVariant {
  id: string;
  model_id: string;
  model_name: string;
  is_control: boolean;
  traffic_percentage: number;
  sample_size: number;
  metrics: VariantMetrics;
  performance_data: PerformanceData[];
}

export interface VariantMetrics {
  accuracy: number;
  avg_response_time: number;
  error_rate: number;
  user_satisfaction: number;
  conversion_rate: number;
  confidence_intervals: Record<string, { lower: number; upper: number }>;
}

export interface PerformanceData {
  timestamp: Date;
  metric_name: string;
  value: number;
  sample_count: number;
}

export interface TestMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  avg_response_time: number;
  p95_response_time: number;
  conversion_rate: number;
  user_satisfaction_score: number;
}

export interface StatisticalResults {
  is_significant: boolean;
  p_value: number;
  effect_size: number;
  confidence_interval: { lower: number; upper: number };
  statistical_power: number;
  required_sample_size: number;
  bayesian_probability: number; // Probability that treatment is better
}

export interface TestResult {
  test_id: string;
  variant_id: string;
  user_id: string;
  request_id: string;
  timestamp: Date;
  response_time: number;
  accuracy_score?: number;
  user_feedback?: number;
  conversion: boolean;
  error_occurred: boolean;
  metadata: Record<string, any>;
}

export class ABTestingService extends EventEmitter {
  private prisma: PrismaClient;
  private cache: CacheService;
  private activeTests: Map<string, ABTest> = new Map();
  private testResults: Map<string, TestResult[]> = new Map();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.cache = new CacheService('ab-testing');
    
    // Start background monitoring
    this.startBackgroundMonitoring();
  }

  /**
   * Create new A/B test
   */
  async createTest(config: ABTestConfig): Promise<ABTest> {
    const testId = uuidv4();
    
    // Initialize variants
    const variants: TestVariant[] = config.model_variants.map((variant, index) => ({
      id: uuidv4(),
      model_id: variant.model_id,
      model_name: variant.model_name,
      is_control: index === 0, // First variant is control
      traffic_percentage: variant.traffic_percentage,
      sample_size: 0,
      metrics: {
        accuracy: 0,
        avg_response_time: 0,
        error_rate: 0,
        user_satisfaction: 0,
        conversion_rate: 0,
        confidence_intervals: {},
      },
      performance_data: [],
    }));

    const test: ABTest = {
      id: testId,
      name: config.test_name,
      config,
      status: 'draft',
      variants,
      metrics: {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        avg_response_time: 0,
        p95_response_time: 0,
        conversion_rate: 0,
        user_satisfaction_score: 0,
      },
      statistical_results: null,
      winner: null,
      confidence_level: 0,
      created_at: new Date(),
      current_sample_size: 0,
      estimated_completion: null,
    };

    this.activeTests.set(testId, test);
    this.testResults.set(testId, []);

    // Cache test configuration
    await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30); // 30 days

    logger.info('A/B test created', { testId, variantCount: variants.length });

    return test;
  }

  /**
   * Start A/B test
   */
  async startTest(testId: string): Promise<ABTest> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error('Test not found');
    }

    if (test.status !== 'draft') {
      throw new Error(`Cannot start test in status: ${test.status}`);
    }

    // Validate traffic allocation
    const totalTraffic = test.variants.reduce((sum, v) => sum + v.traffic_percentage, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error('Traffic allocation must sum to 100%');
    }

    test.status = 'running';
    test.started_at = new Date();
    
    // Estimate completion time
    const hoursToCompletion = this.estimateCompletionTime(test);
    test.estimated_completion = new Date(Date.now() + hoursToCompletion * 60 * 60 * 1000);

    await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);

    logger.info('A/B test started', { 
      testId, 
      estimatedCompletion: test.estimated_completion,
      minSampleSize: test.config.statistical_config.minimum_sample_size,
    });

    this.emit('test:started', test);

    return test;
  }

  /**
   * Stop A/B test
   */
  async stopTest(testId: string, reason: string = 'Manual stop'): Promise<ABTest> {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error('Test not found');
    }

    if (test.status !== 'running') {
      throw new Error(`Cannot stop test in status: ${test.status}`);
    }

    test.status = 'stopped';
    test.completed_at = new Date();

    // Perform final analysis
    await this.performFinalAnalysis(test);

    await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);

    logger.info('A/B test stopped', { testId, reason, sampleSize: test.current_sample_size });

    this.emit('test:stopped', { test, reason });

    return test;
  }

  /**
   * Record test result
   */
  async recordResult(result: Omit<TestResult, 'variant_id'>): Promise<void> {
    const test = this.activeTests.get(result.test_id);
    if (!test || test.status !== 'running') {
      return; // Ignore results for inactive tests
    }

    // Determine variant based on traffic allocation
    const variant = this.selectVariant(test, result.user_id);
    if (!variant) {
      return;
    }

    const fullResult: TestResult = {
      ...result,
      variant_id: variant.id,
    };

    // Store result
    const results = this.testResults.get(result.test_id) || [];
    results.push(fullResult);
    this.testResults.set(result.test_id, results);

    // Update variant metrics
    this.updateVariantMetrics(variant, fullResult);
    
    // Update test metrics
    this.updateTestMetrics(test, fullResult);

    test.current_sample_size++;

    // Check for early stopping conditions
    if (test.config.stopping_criteria.early_stopping_enabled) {
      await this.checkEarlyStoppingConditions(test);
    }

    // Check for completion
    if (this.shouldCompleteTest(test)) {
      await this.completeTest(test.id);
    }
  }

  /**
   * Select variant for user
   */
  private selectVariant(test: ABTest, userId: string): TestVariant | null {
    // Use deterministic hash to ensure consistent variant assignment
    const hash = this.hashUserId(userId);
    const randomValue = hash % 100;

    let cumulativePercentage = 0;
    for (const variant of test.variants) {
      cumulativePercentage += variant.traffic_percentage;
      if (randomValue < cumulativePercentage) {
        return variant;
      }
    }

    return test.variants[0]; // Fallback to first variant
  }

  /**
   * Hash user ID for consistent variant assignment
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Update variant metrics
   */
  private updateVariantMetrics(variant: TestVariant, result: TestResult): void {
    variant.sample_size++;
    
    // Update running averages
    const n = variant.sample_size;
    
    // Response time
    variant.metrics.avg_response_time = 
      ((variant.metrics.avg_response_time * (n - 1)) + result.response_time) / n;
    
    // Error rate
    const wasError = result.error_occurred ? 1 : 0;
    variant.metrics.error_rate = 
      ((variant.metrics.error_rate * (n - 1)) + wasError) / n;
    
    // Accuracy (if provided)
    if (result.accuracy_score !== undefined) {
      variant.metrics.accuracy = 
        ((variant.metrics.accuracy * (n - 1)) + result.accuracy_score) / n;
    }
    
    // User satisfaction (if provided)
    if (result.user_feedback !== undefined) {
      variant.metrics.user_satisfaction = 
        ((variant.metrics.user_satisfaction * (n - 1)) + result.user_feedback) / n;
    }
    
    // Conversion rate
    const wasConversion = result.conversion ? 1 : 0;
    variant.metrics.conversion_rate = 
      ((variant.metrics.conversion_rate * (n - 1)) + wasConversion) / n;

    // Store performance data point
    variant.performance_data.push({
      timestamp: result.timestamp,
      metric_name: 'response_time',
      value: result.response_time,
      sample_count: n,
    });

    // Keep only recent performance data (last 1000 points)
    if (variant.performance_data.length > 1000) {
      variant.performance_data = variant.performance_data.slice(-1000);
    }
  }

  /**
   * Update test metrics
   */
  private updateTestMetrics(test: ABTest, result: TestResult): void {
    test.metrics.total_requests++;
    
    if (result.error_occurred) {
      test.metrics.failed_requests++;
    } else {
      test.metrics.successful_requests++;
    }

    // Update running averages
    const n = test.metrics.total_requests;
    
    test.metrics.avg_response_time = 
      ((test.metrics.avg_response_time * (n - 1)) + result.response_time) / n;

    if (result.conversion) {
      test.metrics.conversion_rate = 
        ((test.metrics.conversion_rate * (n - 1)) + 1) / n;
    }

    if (result.user_feedback !== undefined) {
      test.metrics.user_satisfaction_score = 
        ((test.metrics.user_satisfaction_score * (n - 1)) + result.user_feedback) / n;
    }

    // Calculate P95 response time (simplified)
    const allResults = this.testResults.get(test.id) || [];
    const responseTimes = allResults.map(r => r.response_time).sort((a, b) => a - b);
    test.metrics.p95_response_time = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
  }

  /**
   * Check early stopping conditions
   */
  private async checkEarlyStoppingConditions(test: ABTest): Promise<void> {
    if (test.current_sample_size < test.config.statistical_config.minimum_sample_size) {
      return; // Not enough samples yet
    }

    // Perform statistical analysis
    const analysis = this.performStatisticalAnalysis(test);
    test.statistical_results = analysis;

    const criteria = test.config.stopping_criteria;
    
    // Check significance and effect size
    if (analysis.is_significant && 
        analysis.effect_size >= criteria.minimum_effect_size &&
        analysis.p_value <= criteria.significance_threshold) {
      
      logger.info('Early stopping triggered - significant results', {
        testId: test.id,
        pValue: analysis.p_value,
        effectSize: analysis.effect_size,
      });
      
      await this.completeTest(test.id);
    }
  }

  /**
   * Perform statistical analysis
   */
  private performStatisticalAnalysis(test: ABTest): StatisticalResults {
    const controlVariant = test.variants.find(v => v.is_control);
    const treatmentVariant = test.variants.find(v => !v.is_control);
    
    if (!controlVariant || !treatmentVariant) {
      throw new Error('Control and treatment variants required for analysis');
    }

    // Primary metric analysis (using conversion rate as example)
    const controlRate = controlVariant.metrics.conversion_rate;
    const treatmentRate = treatmentVariant.metrics.conversion_rate;
    const controlSample = controlVariant.sample_size;
    const treatmentSample = treatmentVariant.sample_size;

    // Calculate statistical significance using Z-test for proportions
    const pooledRate = ((controlRate * controlSample) + (treatmentRate * treatmentSample)) / (controlSample + treatmentSample);
    const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * ((1 / controlSample) + (1 / treatmentSample)));
    
    const zScore = Math.abs(treatmentRate - controlRate) / standardError;
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore))); // Two-tailed test
    
    const effectSize = Math.abs(treatmentRate - controlRate);
    const isSignificant = pValue <= test.config.statistical_config.confidence_level;

    // Calculate confidence interval for difference
    const ciMargin = 1.96 * standardError; // 95% CI
    const lowerBound = (treatmentRate - controlRate) - ciMargin;
    const upperBound = (treatmentRate - controlRate) + ciMargin;

    // Calculate statistical power (simplified)
    const power = this.calculateStatisticalPower(effectSize, controlSample + treatmentSample);

    // Calculate required sample size for desired power
    const requiredSampleSize = this.calculateRequiredSampleSize(effectSize, 0.8, 0.05);

    // Bayesian probability (simplified)
    const bayesianProbability = treatmentRate > controlRate ? 
      Math.min(0.99, 0.5 + (zScore / 10)) : 
      Math.max(0.01, 0.5 - (zScore / 10));

    return {
      is_significant: isSignificant,
      p_value: pValue,
      effect_size: effectSize,
      confidence_interval: { lower: lowerBound, upper: upperBound },
      statistical_power: power,
      required_sample_size: requiredSampleSize,
      bayesian_probability: bayesianProbability,
    };
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  /**
   * Error function approximation
   */
  private erf(x: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Calculate statistical power
   */
  private calculateStatisticalPower(effectSize: number, sampleSize: number): number {
    // Simplified power calculation
    const standardError = Math.sqrt(2 / sampleSize);
    const zScore = effectSize / standardError;
    return this.normalCDF(zScore - 1.96);
  }

  /**
   * Calculate required sample size
   */
  private calculateRequiredSampleSize(effectSize: number, power: number, alpha: number): number {
    // Simplified sample size calculation for two-proportion test
    const zAlpha = 1.96; // For alpha = 0.05
    const zBeta = 0.84;  // For power = 0.8
    
    const n = 2 * Math.pow(zAlpha + zBeta, 2) / Math.pow(effectSize, 2);
    return Math.ceil(n);
  }

  /**
   * Complete test
   */
  private async completeTest(testId: string): Promise<void> {
    const test = this.activeTests.get(testId);
    if (!test || test.status !== 'running') {
      return;
    }

    test.status = 'completed';
    test.completed_at = new Date();

    // Perform final analysis
    await this.performFinalAnalysis(test);

    await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);

    logger.info('A/B test completed', { 
      testId, 
      winner: test.winner,
      confidence: test.confidence_level,
    });

    this.emit('test:completed', test);
  }

  /**
   * Perform final analysis
   */
  private async performFinalAnalysis(test: ABTest): Promise<void> {
    if (test.variants.length < 2) {
      return;
    }

    // Calculate final statistical results
    test.statistical_results = this.performStatisticalAnalysis(test);
    
    // Determine winner
    if (test.statistical_results.is_significant) {
      const treatmentVariant = test.variants.find(v => !v.is_control);
      const controlVariant = test.variants.find(v => v.is_control);
      
      if (treatmentVariant && controlVariant) {
        // Compare primary metric (conversion rate)
        if (treatmentVariant.metrics.conversion_rate > controlVariant.metrics.conversion_rate) {
          test.winner = treatmentVariant.model_name;
        } else {
          test.winner = controlVariant.model_name;
        }
        
        test.confidence_level = 1 - test.statistical_results.p_value;
      }
    }

    // Calculate confidence intervals for all variants
    for (const variant of test.variants) {
      variant.metrics.confidence_intervals = this.calculateConfidenceIntervals(variant);
    }
  }

  /**
   * Calculate confidence intervals for variant metrics
   */
  private calculateConfidenceIntervals(variant: TestVariant): Record<string, { lower: number; upper: number }> {
    const n = variant.sample_size;
    if (n < 30) {
      return {}; // Need sufficient sample size
    }

    const intervals: Record<string, { lower: number; upper: number }> = {};
    
    // Conversion rate CI (proportion)
    const p = variant.metrics.conversion_rate;
    const seP = Math.sqrt((p * (1 - p)) / n);
    const marginP = 1.96 * seP;
    intervals.conversion_rate = {
      lower: Math.max(0, p - marginP),
      upper: Math.min(1, p + marginP),
    };

    // Response time CI (assuming normal distribution)
    const rt = variant.metrics.avg_response_time;
    // Estimate standard deviation (would be better to track this)
    const estimatedStdDev = rt * 0.3; // Rough estimate
    const seRT = estimatedStdDev / Math.sqrt(n);
    const marginRT = 1.96 * seRT;
    intervals.avg_response_time = {
      lower: Math.max(0, rt - marginRT),
      upper: rt + marginRT,
    };

    return intervals;
  }

  /**
   * Check if test should complete
   */
  private shouldCompleteTest(test: ABTest): boolean {
    const config = test.config.statistical_config;
    const criteria = test.config.stopping_criteria;
    
    // Check sample size
    if (test.current_sample_size >= config.minimum_sample_size) {
      return true;
    }
    
    // Check duration
    if (test.started_at) {
      const hoursRunning = (Date.now() - test.started_at.getTime()) / (1000 * 60 * 60);
      if (hoursRunning >= criteria.max_runtime_hours) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Estimate completion time
   */
  private estimateCompletionTime(test: ABTest): number {
    const minSampleSize = test.config.statistical_config.minimum_sample_size;
    const maxDuration = test.config.stopping_criteria.max_runtime_hours;
    
    // Estimate based on expected traffic (simplified)
    const estimatedRequestsPerHour = 100; // This would be based on actual traffic patterns
    const hoursToReachSample = minSampleSize / estimatedRequestsPerHour;
    
    return Math.min(hoursToReachSample, maxDuration);
  }

  /**
   * Start background monitoring
   */
  private startBackgroundMonitoring(): void {
    setInterval(() => {
      this.monitorActiveTests();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  /**
   * Monitor active tests
   */
  private async monitorActiveTests(): Promise<void> {
    for (const [testId, test] of this.activeTests) {
      if (test.status === 'running') {
        try {
          // Check for completion conditions
          if (this.shouldCompleteTest(test)) {
            await this.completeTest(testId);
          }
          
          // Update cache
          await this.cache.set(`test:${testId}`, test, 3600 * 24 * 30);
        } catch (error) {
          logger.error('Error monitoring test', { testId, error });
        }
      }
    }
  }

  /**
   * Public API methods
   */
  
  async getTest(testId: string): Promise<ABTest | null> {
    let test = this.activeTests.get(testId);
    if (!test) {
      test = await this.cache.get(`test:${testId}`) as ABTest;
      if (test) {
        this.activeTests.set(testId, test);
      }
    }
    return test || null;
  }

  async listTests(): Promise<ABTest[]> {
    return Array.from(this.activeTests.values());
  }

  async getTestResults(testId: string): Promise<TestResult[]> {
    return this.testResults.get(testId) || [];
  }

  async exportTestData(testId: string): Promise<any> {
    const test = await this.getTest(testId);
    const results = await this.getTestResults(testId);
    
    return {
      test_info: test,
      raw_results: results,
      aggregated_metrics: test?.variants.map(v => ({
        variant_name: v.model_name,
        sample_size: v.sample_size,
        metrics: v.metrics,
      })),
      statistical_analysis: test?.statistical_results,
    };
  }
}