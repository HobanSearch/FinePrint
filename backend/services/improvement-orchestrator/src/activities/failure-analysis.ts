/**
 * Failure analysis activities for understanding root causes
 */

import { Context } from '@temporalio/activity';
import axios from 'axios';
import * as natural from 'natural';
import {
  ABTestFailure,
  FailureAnalysis,
  RootCause,
  FailurePattern,
  ImprovementHypothesis,
  Action
} from '../types';

export interface AnalyzeFailureInput {
  failure: ABTestFailure;
  includeHistorical: boolean;
  depth: 'basic' | 'standard' | 'comprehensive';
}

export async function analyzeFailure(
  input: AnalyzeFailureInput
): Promise<FailureAnalysis> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    // Fetch historical failures if requested
    const historicalFailures = input.includeHistorical 
      ? await fetchHistoricalFailures(input.failure.modelType)
      : [];

    // Analyze root causes
    const rootCauses = await identifyRootCauses(input.failure, historicalFailures);

    // Detect patterns
    const patterns = await detectFailurePatterns(input.failure, historicalFailures);

    // Generate improvement hypotheses
    const hypotheses = await generateHypotheses(input.failure, rootCauses, patterns);

    // Recommend actions
    const recommendedActions = await recommendActions(rootCauses, hypotheses);

    // Calculate overall confidence
    const confidence = calculateAnalysisConfidence(rootCauses, patterns, hypotheses);

    return {
      failureId: input.failure.id,
      rootCauses,
      patterns,
      hypotheses,
      recommendedActions,
      confidence,
      analysisTimestamp: new Date()
    };

  } catch (error) {
    console.error('Failed to analyze failure:', error);
    throw error;
  }
}

async function fetchHistoricalFailures(modelType: string): Promise<ABTestFailure[]> {
  try {
    const response = await axios.get(
      `${process.env.DIGITAL_TWIN_URL || 'http://localhost:3007'}/api/experiments/failures`,
      {
        params: {
          modelType,
          limit: 100,
          timeRange: '30d'
        }
      }
    );

    return response.data.failures || [];
  } catch (error) {
    console.error('Failed to fetch historical failures:', error);
    return [];
  }
}

async function identifyRootCauses(
  failure: ABTestFailure,
  historicalFailures: ABTestFailure[]
): Promise<RootCause[]> {
  const rootCauses: RootCause[] = [];

  // Analyze conversion rate drop
  if (failure.failureMetrics.variance > 0.1) {
    rootCauses.push({
      category: 'performance',
      description: 'Significant conversion rate degradation',
      evidence: [
        `Conversion dropped by ${(failure.failureMetrics.variance * 100).toFixed(2)}%`,
        `Current rate: ${(failure.failureMetrics.conversionRate * 100).toFixed(2)}%`,
        `Expected rate: ${(failure.failureMetrics.expectedRate * 100).toFixed(2)}%`
      ],
      probability: 0.95,
      impact: failure.failureMetrics.businessImpact
    });
  }

  // Check for data quality issues
  const dataQualityScore = await checkDataQuality(failure);
  if (dataQualityScore < 0.8) {
    rootCauses.push({
      category: 'data_quality',
      description: 'Training data quality issues detected',
      evidence: [
        `Data quality score: ${dataQualityScore.toFixed(2)}`,
        'Potential data drift or distribution shift',
        'Missing or corrupted features detected'
      ],
      probability: 0.7,
      impact: failure.failureMetrics.businessImpact * 0.6
    });
  }

  // Check for model architecture issues
  const architectureIssues = await analyzeModelArchitecture(failure);
  if (architectureIssues.length > 0) {
    rootCauses.push({
      category: 'architecture',
      description: 'Model architecture limitations',
      evidence: architectureIssues,
      probability: 0.6,
      impact: failure.failureMetrics.businessImpact * 0.5
    });
  }

  // Check for hyperparameter issues
  const hyperparameterIssues = await analyzeHyperparameters(failure);
  if (hyperparameterIssues.length > 0) {
    rootCauses.push({
      category: 'hyperparameters',
      description: 'Suboptimal hyperparameter configuration',
      evidence: hyperparameterIssues,
      probability: 0.8,
      impact: failure.failureMetrics.businessImpact * 0.4
    });
  }

  // Check for overfitting/underfitting
  const fittingIssue = await analyzeFitting(failure);
  if (fittingIssue) {
    rootCauses.push({
      category: 'training',
      description: fittingIssue.type === 'overfitting' ? 'Model overfitting detected' : 'Model underfitting detected',
      evidence: fittingIssue.evidence,
      probability: fittingIssue.confidence,
      impact: failure.failureMetrics.businessImpact * 0.7
    });
  }

  return rootCauses.sort((a, b) => b.impact - a.impact);
}

async function detectFailurePatterns(
  failure: ABTestFailure,
  historicalFailures: ABTestFailure[]
): Promise<FailurePattern[]> {
  const patterns: FailurePattern[] = [];

  // Time-based patterns
  const timePattern = analyzeTimePattern(failure, historicalFailures);
  if (timePattern) {
    patterns.push(timePattern);
  }

  // Model type patterns
  const modelTypePattern = analyzeModelTypePattern(failure, historicalFailures);
  if (modelTypePattern) {
    patterns.push(modelTypePattern);
  }

  // Metric correlation patterns
  const metricPattern = analyzeMetricPattern(failure, historicalFailures);
  if (metricPattern) {
    patterns.push(metricPattern);
  }

  // Context-based patterns
  const contextPattern = analyzeContextPattern(failure, historicalFailures);
  if (contextPattern) {
    patterns.push(contextPattern);
  }

  return patterns;
}

function analyzeTimePattern(
  failure: ABTestFailure,
  historicalFailures: ABTestFailure[]
): FailurePattern | null {
  const recentFailures = historicalFailures.filter(f => 
    new Date(f.timestamp).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  if (recentFailures.length > 3) {
    const trend = recentFailures.length > historicalFailures.length / 2 ? 'increasing' : 'stable';
    
    return {
      type: 'temporal_clustering',
      frequency: recentFailures.length,
      conditions: {
        timeWindow: '7d',
        threshold: 3
      },
      relatedFailures: recentFailures.map(f => f.id),
      trend
    };
  }

  return null;
}

function analyzeModelTypePattern(
  failure: ABTestFailure,
  historicalFailures: ABTestFailure[]
): FailurePattern | null {
  const sameTypeFailures = historicalFailures.filter(f => f.modelType === failure.modelType);
  
  if (sameTypeFailures.length > 5) {
    return {
      type: 'model_type_specific',
      frequency: sameTypeFailures.length,
      conditions: {
        modelType: failure.modelType,
        failureRate: sameTypeFailures.length / Math.max(historicalFailures.length, 1)
      },
      relatedFailures: sameTypeFailures.map(f => f.id),
      trend: 'stable'
    };
  }

  return null;
}

function analyzeMetricPattern(
  failure: ABTestFailure,
  historicalFailures: ABTestFailure[]
): FailurePattern | null {
  const similarMetricFailures = historicalFailures.filter(f => 
    Math.abs(f.failureMetrics.variance - failure.failureMetrics.variance) < 0.05
  );

  if (similarMetricFailures.length > 3) {
    return {
      type: 'metric_correlation',
      frequency: similarMetricFailures.length,
      conditions: {
        metricRange: {
          min: failure.failureMetrics.variance - 0.05,
          max: failure.failureMetrics.variance + 0.05
        }
      },
      relatedFailures: similarMetricFailures.map(f => f.id),
      trend: 'stable'
    };
  }

  return null;
}

function analyzeContextPattern(
  failure: ABTestFailure,
  historicalFailures: ABTestFailure[]
): FailurePattern | null {
  // Analyze context similarities using NLP
  const tfidf = new natural.TfIdf();
  
  // Add current failure context
  tfidf.addDocument(JSON.stringify(failure.context));
  
  // Add historical contexts
  historicalFailures.forEach(f => {
    tfidf.addDocument(JSON.stringify(f.context));
  });

  // Find similar contexts
  const similarities: number[] = [];
  tfidf.tfidfs(JSON.stringify(failure.context), (i, measure) => {
    if (i > 0) { // Skip self
      similarities.push(measure);
    }
  });

  const highSimilarityCount = similarities.filter(s => s > 0.7).length;
  
  if (highSimilarityCount > 2) {
    return {
      type: 'context_similarity',
      frequency: highSimilarityCount,
      conditions: {
        similarityThreshold: 0.7,
        contextFeatures: Object.keys(failure.context)
      },
      relatedFailures: historicalFailures
        .filter((_, i) => similarities[i] > 0.7)
        .map(f => f.id),
      trend: 'stable'
    };
  }

  return null;
}

async function generateHypotheses(
  failure: ABTestFailure,
  rootCauses: RootCause[],
  patterns: FailurePattern[]
): Promise<ImprovementHypothesis[]> {
  const hypotheses: ImprovementHypothesis[] = [];

  // Generate hypotheses based on root causes
  for (const cause of rootCauses) {
    switch (cause.category) {
      case 'performance':
        hypotheses.push({
          id: `hyp_perf_${Date.now()}`,
          description: 'Optimize model inference pipeline to improve conversion rates',
          expectedImprovement: 0.15,
          requiredChanges: [
            'Implement caching for frequent predictions',
            'Optimize feature preprocessing',
            'Reduce model complexity'
          ],
          estimatedEffort: 8,
          riskLevel: 'low',
          confidence: 0.8
        });
        break;

      case 'data_quality':
        hypotheses.push({
          id: `hyp_data_${Date.now()}`,
          description: 'Enhance training data quality and diversity',
          expectedImprovement: 0.2,
          requiredChanges: [
            'Implement data validation pipeline',
            'Add synthetic data generation',
            'Balance class distributions',
            'Remove outliers and noise'
          ],
          estimatedEffort: 12,
          riskLevel: 'medium',
          confidence: 0.7
        });
        break;

      case 'architecture':
        hypotheses.push({
          id: `hyp_arch_${Date.now()}`,
          description: 'Modify model architecture for better performance',
          expectedImprovement: 0.25,
          requiredChanges: [
            'Add attention mechanisms',
            'Implement residual connections',
            'Adjust layer depths',
            'Use ensemble methods'
          ],
          estimatedEffort: 16,
          riskLevel: 'high',
          confidence: 0.6
        });
        break;

      case 'hyperparameters':
        hypotheses.push({
          id: `hyp_hyper_${Date.now()}`,
          description: 'Optimize hyperparameters using Bayesian optimization',
          expectedImprovement: 0.12,
          requiredChanges: [
            'Conduct hyperparameter search',
            'Adjust learning rate schedule',
            'Optimize batch size',
            'Tune regularization parameters'
          ],
          estimatedEffort: 6,
          riskLevel: 'low',
          confidence: 0.85
        });
        break;

      case 'training':
        hypotheses.push({
          id: `hyp_train_${Date.now()}`,
          description: 'Improve training strategy to prevent overfitting/underfitting',
          expectedImprovement: 0.18,
          requiredChanges: [
            'Implement early stopping',
            'Add dropout layers',
            'Use data augmentation',
            'Apply gradient clipping'
          ],
          estimatedEffort: 10,
          riskLevel: 'medium',
          confidence: 0.75
        });
        break;
    }
  }

  // Generate hypotheses based on patterns
  for (const pattern of patterns) {
    if (pattern.type === 'temporal_clustering' && pattern.trend === 'increasing') {
      hypotheses.push({
        id: `hyp_temporal_${Date.now()}`,
        description: 'Address time-based degradation with continuous learning',
        expectedImprovement: 0.22,
        requiredChanges: [
          'Implement online learning',
          'Add concept drift detection',
          'Create adaptive retraining schedule',
          'Monitor data distribution shifts'
        ],
        estimatedEffort: 14,
        riskLevel: 'medium',
        confidence: 0.7
      });
    }
  }

  // Sort by expected improvement
  return hypotheses.sort((a, b) => b.expectedImprovement - a.expectedImprovement);
}

async function recommendActions(
  rootCauses: RootCause[],
  hypotheses: ImprovementHypothesis[]
): Promise<Action[]> {
  const actions: Action[] = [];

  // Immediate actions based on root causes
  for (const cause of rootCauses.slice(0, 3)) { // Top 3 causes
    actions.push({
      type: 'investigate',
      description: `Investigate ${cause.category}: ${cause.description}`,
      parameters: {
        category: cause.category,
        evidence: cause.evidence,
        priority: cause.impact > 50000 ? 'high' : 'medium'
      },
      priority: cause.impact,
      automated: false
    });
  }

  // Automated improvement actions
  for (const hypothesis of hypotheses.slice(0, 2)) { // Top 2 hypotheses
    if (hypothesis.confidence > 0.7 && hypothesis.riskLevel !== 'high') {
      actions.push({
        type: 'implement',
        description: hypothesis.description,
        parameters: {
          hypothesisId: hypothesis.id,
          changes: hypothesis.requiredChanges,
          estimatedEffort: hypothesis.estimatedEffort
        },
        priority: hypothesis.expectedImprovement * 100,
        automated: true
      });
    }
  }

  // Monitoring actions
  actions.push({
    type: 'monitor',
    description: 'Set up enhanced monitoring for affected metrics',
    parameters: {
      metrics: ['conversion_rate', 'latency', 'error_rate'],
      frequency: '1m',
      alertThreshold: 0.05
    },
    priority: 50,
    automated: true
  });

  return actions.sort((a, b) => b.priority - a.priority);
}

async function checkDataQuality(failure: ABTestFailure): Promise<number> {
  // Simulate data quality check
  // In production, this would analyze actual training data
  return Math.random() * 0.4 + 0.6; // Return score between 0.6 and 1.0
}

async function analyzeModelArchitecture(failure: ABTestFailure): Promise<string[]> {
  const issues: string[] = [];
  
  // Simulate architecture analysis
  if (Math.random() > 0.7) {
    issues.push('Model capacity too low for task complexity');
  }
  if (Math.random() > 0.8) {
    issues.push('Missing attention mechanisms for sequence data');
  }
  if (Math.random() > 0.6) {
    issues.push('Insufficient regularization layers');
  }
  
  return issues;
}

async function analyzeHyperparameters(failure: ABTestFailure): Promise<string[]> {
  const issues: string[] = [];
  
  // Simulate hyperparameter analysis
  if (Math.random() > 0.5) {
    issues.push('Learning rate too high causing instability');
  }
  if (Math.random() > 0.6) {
    issues.push('Batch size not optimal for convergence');
  }
  
  return issues;
}

async function analyzeFitting(failure: ABTestFailure): Promise<any> {
  // Simulate fitting analysis
  const random = Math.random();
  
  if (random > 0.7) {
    return {
      type: 'overfitting',
      evidence: [
        'Training loss much lower than validation loss',
        'Performance degrades on unseen data',
        'Model memorizing training examples'
      ],
      confidence: 0.85
    };
  } else if (random > 0.4) {
    return {
      type: 'underfitting',
      evidence: [
        'Both training and validation loss are high',
        'Model unable to capture patterns',
        'Insufficient model capacity'
      ],
      confidence: 0.75
    };
  }
  
  return null;
}

function calculateAnalysisConfidence(
  rootCauses: RootCause[],
  patterns: FailurePattern[],
  hypotheses: ImprovementHypothesis[]
): number {
  const avgRootCauseProb = rootCauses.reduce((sum, c) => sum + c.probability, 0) / Math.max(rootCauses.length, 1);
  const patternStrength = Math.min(patterns.length / 3, 1);
  const avgHypothesisConf = hypotheses.reduce((sum, h) => sum + h.confidence, 0) / Math.max(hypotheses.length, 1);
  
  return (avgRootCauseProb + patternStrength + avgHypothesisConf) / 3;
}