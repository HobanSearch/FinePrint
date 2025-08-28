/**
 * Model validation activities for ensuring model quality
 */

import { Context } from '@temporalio/activity';
import axios from 'axios';
import * as ss from 'simple-statistics';
import {
  ModelType,
  ModelValidation,
  ValidationResult,
  PerformanceMetrics,
  ComparisonResult,
  ValidationIssue,
  ResourceUsage
} from '../types';

export interface ValidateModelInput {
  modelId: string;
  modelType: ModelType;
  baselineModelId: string;
  validationSuite: 'basic' | 'standard' | 'comprehensive';
}

export async function validateModel(
  input: ValidateModelInput
): Promise<ModelValidation> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    // Run validation tests
    const validationResults = await runValidationSuite(
      input.modelId,
      input.modelType,
      input.validationSuite
    );

    // Measure performance metrics
    const performanceMetrics = await measurePerformance(
      input.modelId,
      input.modelType
    );

    // Compare with baseline
    const comparisonResult = await compareWithBaseline(
      input.modelId,
      input.baselineModelId,
      performanceMetrics
    );

    // Identify issues
    const issues = identifyValidationIssues(
      validationResults,
      performanceMetrics,
      comparisonResult
    );

    // Determine if validation passed
    const passed = determineValidationSuccess(
      validationResults,
      comparisonResult,
      issues
    );

    return {
      modelId: input.modelId,
      validationResults,
      performanceMetrics,
      comparisonWithBaseline: comparisonResult,
      passed,
      issues,
      timestamp: new Date()
    };

  } catch (error) {
    console.error('Failed to validate model:', error);
    throw error;
  }
}

async function runValidationSuite(
  modelId: string,
  modelType: ModelType,
  suite: string
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Define tests based on suite level
  const tests = getValidationTests(modelType, suite);

  for (const test of tests) {
    const result = await runValidationTest(modelId, test);
    results.push(result);
  }

  return results;
}

function getValidationTests(modelType: ModelType, suite: string): any[] {
  const basicTests = [
    { name: 'model_loads', type: 'functional' },
    { name: 'basic_inference', type: 'functional' },
    { name: 'output_format', type: 'functional' }
  ];

  const standardTests = [
    ...basicTests,
    { name: 'accuracy_test', type: 'performance' },
    { name: 'latency_test', type: 'performance' },
    { name: 'throughput_test', type: 'performance' },
    { name: 'memory_usage', type: 'resource' }
  ];

  const comprehensiveTests = [
    ...standardTests,
    { name: 'edge_cases', type: 'robustness' },
    { name: 'adversarial_inputs', type: 'security' },
    { name: 'bias_detection', type: 'fairness' },
    { name: 'consistency_check', type: 'reliability' },
    { name: 'scalability_test', type: 'performance' },
    { name: 'integration_test', type: 'functional' }
  ];

  // Add model-specific tests
  const modelSpecificTests: Record<ModelType, any[]> = {
    [ModelType.MARKETING]: [
      { name: 'content_quality', type: 'quality' },
      { name: 'brand_consistency', type: 'quality' },
      { name: 'engagement_prediction', type: 'performance' }
    ],
    [ModelType.SALES]: [
      { name: 'lead_scoring_accuracy', type: 'performance' },
      { name: 'conversion_prediction', type: 'performance' },
      { name: 'personalization_quality', type: 'quality' }
    ],
    [ModelType.SUPPORT]: [
      { name: 'response_relevance', type: 'quality' },
      { name: 'resolution_rate', type: 'performance' },
      { name: 'sentiment_accuracy', type: 'performance' }
    ],
    [ModelType.ANALYTICS]: [
      { name: 'prediction_accuracy', type: 'performance' },
      { name: 'anomaly_detection', type: 'performance' },
      { name: 'report_quality', type: 'quality' }
    ],
    [ModelType.CONTENT]: [
      { name: 'content_coherence', type: 'quality' },
      { name: 'factual_accuracy', type: 'quality' },
      { name: 'style_consistency', type: 'quality' }
    ]
  };

  let tests: any[] = [];

  switch (suite) {
    case 'basic':
      tests = basicTests;
      break;
    case 'standard':
      tests = standardTests;
      break;
    case 'comprehensive':
      tests = [...comprehensiveTests, ...(modelSpecificTests[modelType] || [])];
      break;
  }

  return tests;
}

async function runValidationTest(modelId: string, test: any): Promise<ValidationResult> {
  try {
    // Call validation service
    const response = await axios.post(
      `${process.env.VALIDATION_SERVICE_URL || 'http://localhost:3011'}/api/validate`,
      {
        modelId,
        testName: test.name,
        testType: test.type
      }
    );

    return {
      testName: test.name,
      passed: response.data.passed,
      score: response.data.score,
      details: response.data.details
    };
  } catch (error) {
    // If test fails to run, mark as failed
    return {
      testName: test.name,
      passed: false,
      score: 0,
      details: { error: error.message }
    };
  }
}

async function measurePerformance(
  modelId: string,
  modelType: ModelType
): Promise<PerformanceMetrics> {
  try {
    // Run performance benchmarks
    const response = await axios.post(
      `${process.env.BENCHMARK_SERVICE_URL || 'http://localhost:3012'}/api/benchmark`,
      {
        modelId,
        modelType,
        iterations: 1000,
        warmup: 100
      }
    );

    const data = response.data;

    return {
      accuracy: data.accuracy || 0,
      precision: data.precision || 0,
      recall: data.recall || 0,
      f1Score: calculateF1Score(data.precision, data.recall),
      latency: data.latency || 0,
      throughput: data.throughput || 0,
      resourceUsage: {
        cpuUsage: data.cpuUsage || 0,
        memoryUsage: data.memoryUsage || 0,
        gpuUsage: data.gpuUsage,
        diskIO: data.diskIO || 0,
        networkIO: data.networkIO || 0
      }
    };
  } catch (error) {
    console.error('Failed to measure performance:', error);
    
    // Return default metrics on error
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      latency: 999999,
      throughput: 0,
      resourceUsage: {
        cpuUsage: 100,
        memoryUsage: 100,
        diskIO: 0,
        networkIO: 0
      }
    };
  }
}

function calculateF1Score(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

async function compareWithBaseline(
  modelId: string,
  baselineModelId: string,
  currentMetrics: PerformanceMetrics
): Promise<ComparisonResult> {
  try {
    // Get baseline metrics
    const baselineMetrics = await measurePerformance(baselineModelId, ModelType.MARKETING);

    // Calculate improvements and regressions
    const improvements: Record<string, number> = {};
    const regressions: Record<string, number> = {};

    // Compare accuracy metrics
    const accuracyDiff = ((currentMetrics.accuracy - baselineMetrics.accuracy) / baselineMetrics.accuracy) * 100;
    if (accuracyDiff > 0) {
      improvements.accuracy = accuracyDiff;
    } else if (accuracyDiff < 0) {
      regressions.accuracy = Math.abs(accuracyDiff);
    }

    // Compare precision
    const precisionDiff = ((currentMetrics.precision - baselineMetrics.precision) / baselineMetrics.precision) * 100;
    if (precisionDiff > 0) {
      improvements.precision = precisionDiff;
    } else if (precisionDiff < 0) {
      regressions.precision = Math.abs(precisionDiff);
    }

    // Compare recall
    const recallDiff = ((currentMetrics.recall - baselineMetrics.recall) / baselineMetrics.recall) * 100;
    if (recallDiff > 0) {
      improvements.recall = recallDiff;
    } else if (recallDiff < 0) {
      regressions.recall = Math.abs(recallDiff);
    }

    // Compare F1 score
    const f1Diff = ((currentMetrics.f1Score - baselineMetrics.f1Score) / baselineMetrics.f1Score) * 100;
    if (f1Diff > 0) {
      improvements.f1Score = f1Diff;
    } else if (f1Diff < 0) {
      regressions.f1Score = Math.abs(f1Diff);
    }

    // Compare latency (lower is better)
    const latencyDiff = ((baselineMetrics.latency - currentMetrics.latency) / baselineMetrics.latency) * 100;
    if (latencyDiff > 0) {
      improvements.latency = latencyDiff;
    } else if (latencyDiff < 0) {
      regressions.latency = Math.abs(latencyDiff);
    }

    // Compare throughput (higher is better)
    const throughputDiff = ((currentMetrics.throughput - baselineMetrics.throughput) / baselineMetrics.throughput) * 100;
    if (throughputDiff > 0) {
      improvements.throughput = throughputDiff;
    } else if (throughputDiff < 0) {
      regressions.throughput = Math.abs(throughputDiff);
    }

    // Calculate overall improvement
    const improvementSum = Object.values(improvements).reduce((sum, val) => sum + val, 0);
    const regressionSum = Object.values(regressions).reduce((sum, val) => sum + val, 0);
    const overallImprovement = (improvementSum - regressionSum) / 
      (Object.keys(improvements).length + Object.keys(regressions).length);

    // Calculate statistical significance
    const significanceScore = calculateStatisticalSignificance(
      currentMetrics,
      baselineMetrics
    );

    return {
      baselineModelId,
      improvements,
      regressions,
      overallImprovement,
      statisticalSignificance: significanceScore
    };

  } catch (error) {
    console.error('Failed to compare with baseline:', error);
    
    return {
      baselineModelId,
      improvements: {},
      regressions: {},
      overallImprovement: 0,
      statisticalSignificance: 0
    };
  }
}

function calculateStatisticalSignificance(
  current: PerformanceMetrics,
  baseline: PerformanceMetrics
): number {
  // Simplified statistical significance calculation
  // In production, use proper statistical tests (t-test, Mann-Whitney U, etc.)
  
  const metrics = ['accuracy', 'precision', 'recall', 'f1Score'];
  let totalSignificance = 0;
  
  for (const metric of metrics) {
    const currentValue = current[metric as keyof PerformanceMetrics] as number;
    const baselineValue = baseline[metric as keyof PerformanceMetrics] as number;
    
    if (typeof currentValue === 'number' && typeof baselineValue === 'number') {
      const diff = Math.abs(currentValue - baselineValue);
      const avgValue = (currentValue + baselineValue) / 2;
      
      // Simple significance score based on relative difference
      const significance = diff / avgValue;
      totalSignificance += significance;
    }
  }
  
  // Normalize to 0-1 range
  return Math.min(1, totalSignificance / metrics.length * 10);
}

function identifyValidationIssues(
  validationResults: ValidationResult[],
  performanceMetrics: PerformanceMetrics,
  comparisonResult: ComparisonResult
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for failed tests
  const failedTests = validationResults.filter(r => !r.passed);
  for (const test of failedTests) {
    issues.push({
      severity: test.testName.includes('critical') ? 'critical' : 'high',
      category: 'test_failure',
      description: `Validation test '${test.testName}' failed with score ${test.score}`,
      recommendation: `Investigate and fix issues in ${test.testName}`
    });
  }

  // Check for performance regressions
  for (const [metric, regression] of Object.entries(comparisonResult.regressions)) {
    if (regression > 10) {
      issues.push({
        severity: regression > 20 ? 'high' : 'medium',
        category: 'performance_regression',
        description: `${metric} regressed by ${regression.toFixed(2)}%`,
        recommendation: `Optimize model to improve ${metric}`
      });
    }
  }

  // Check for high latency
  if (performanceMetrics.latency > 1000) {
    issues.push({
      severity: performanceMetrics.latency > 2000 ? 'high' : 'medium',
      category: 'performance',
      description: `High latency detected: ${performanceMetrics.latency}ms`,
      recommendation: 'Optimize model inference pipeline or reduce model complexity'
    });
  }

  // Check for low accuracy
  if (performanceMetrics.accuracy < 0.8) {
    issues.push({
      severity: performanceMetrics.accuracy < 0.6 ? 'critical' : 'high',
      category: 'accuracy',
      description: `Low accuracy: ${(performanceMetrics.accuracy * 100).toFixed(2)}%`,
      recommendation: 'Improve training data quality or adjust model architecture'
    });
  }

  // Check for resource usage
  if (performanceMetrics.resourceUsage.memoryUsage > 80) {
    issues.push({
      severity: performanceMetrics.resourceUsage.memoryUsage > 90 ? 'high' : 'medium',
      category: 'resource',
      description: `High memory usage: ${performanceMetrics.resourceUsage.memoryUsage}%`,
      recommendation: 'Optimize model size or implement memory-efficient inference'
    });
  }

  return issues;
}

function determineValidationSuccess(
  validationResults: ValidationResult[],
  comparisonResult: ComparisonResult,
  issues: ValidationIssue[]
): boolean {
  // Check critical issues
  const hasCriticalIssues = issues.some(i => i.severity === 'critical');
  if (hasCriticalIssues) {
    return false;
  }

  // Check test pass rate
  const passedTests = validationResults.filter(r => r.passed).length;
  const passRate = passedTests / validationResults.length;
  if (passRate < 0.8) {
    return false;
  }

  // Check overall improvement
  if (comparisonResult.overallImprovement < -5) {
    return false;
  }

  // Check high severity issues count
  const highSeverityIssues = issues.filter(i => i.severity === 'high').length;
  if (highSeverityIssues > 3) {
    return false;
  }

  return true;
}

export interface NotifyStakeholdersInput {
  workflowId: string;
  status: string;
  message: string;
  channels: string[];
  data?: any;
}

export async function notifyStakeholders(
  input: NotifyStakeholdersInput
): Promise<void> {
  try {
    // Send notifications through different channels
    for (const channel of input.channels) {
      await sendNotification(channel, input);
    }
  } catch (error) {
    console.error('Failed to notify stakeholders:', error);
  }
}

async function sendNotification(channel: string, input: NotifyStakeholdersInput): Promise<void> {
  switch (channel) {
    case 'email':
      await sendEmailNotification(input);
      break;
    case 'slack':
      await sendSlackNotification(input);
      break;
    case 'webhook':
      await sendWebhookNotification(input);
      break;
    default:
      console.warn(`Unknown notification channel: ${channel}`);
  }
}

async function sendEmailNotification(input: NotifyStakeholdersInput): Promise<void> {
  try {
    await axios.post(
      `${process.env.EMAIL_SERVICE_URL || 'http://localhost:3013'}/api/send`,
      {
        to: process.env.STAKEHOLDER_EMAILS?.split(',') || ['admin@example.com'],
        subject: `Workflow ${input.workflowId}: ${input.status}`,
        body: input.message,
        data: input.data
      }
    );
  } catch (error) {
    console.error('Failed to send email notification:', error);
  }
}

async function sendSlackNotification(input: NotifyStakeholdersInput): Promise<void> {
  try {
    await axios.post(
      process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/...',
      {
        text: `*Workflow ${input.workflowId}*\nStatus: ${input.status}\n${input.message}`,
        attachments: input.data ? [
          {
            color: input.status === 'completed' ? 'good' : input.status === 'failed' ? 'danger' : 'warning',
            fields: Object.entries(input.data || {}).map(([key, value]) => ({
              title: key,
              value: JSON.stringify(value),
              short: true
            }))
          }
        ] : []
      }
    );
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
  }
}

async function sendWebhookNotification(input: NotifyStakeholdersInput): Promise<void> {
  try {
    await axios.post(
      process.env.WEBHOOK_URL || 'http://localhost:3014/webhook',
      {
        workflowId: input.workflowId,
        status: input.status,
        message: input.message,
        data: input.data,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to send webhook notification:', error);
  }
}

export interface UpdateMetricsInput {
  workflowId: string;
  improvementId: string;
  metrics: Record<string, number>;
}

export async function updateMetrics(input: UpdateMetricsInput): Promise<void> {
  try {
    await axios.post(
      `${process.env.METRICS_SERVICE_URL || 'http://localhost:3015'}/api/metrics`,
      {
        workflowId: input.workflowId,
        improvementId: input.improvementId,
        metrics: input.metrics,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to update metrics:', error);
  }
}

export interface SaveWorkflowStateInput {
  workflowId: string;
  stage: string;
  data: any;
}

export async function saveWorkflowState(input: SaveWorkflowStateInput): Promise<void> {
  try {
    await axios.post(
      `${process.env.STATE_SERVICE_URL || 'http://localhost:3016'}/api/state`,
      {
        workflowId: input.workflowId,
        stage: input.stage,
        data: input.data,
        timestamp: new Date().toISOString()
      }
    );
  } catch (error) {
    console.error('Failed to save workflow state:', error);
  }
}