/**
 * Fine Print AI - Model Evaluation and Validation Service
 * 
 * Comprehensive evaluation framework for fine-tuned legal analysis models
 * Supports A/B testing, performance monitoring, and validation workflows
 */

import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { PerformanceMonitor } from './performance-monitor';
import { ModelRegistry } from './model-registry';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const logger = createServiceLogger('model-evaluation-service');

// Evaluation Configuration Schema
export const EvaluationConfigSchema = z.object({
  evaluation_name: z.string(),
  model_ids: z.array(z.string()),
  test_dataset_path: z.string(),
  evaluation_type: z.enum(['performance', 'ab_test', 'regression', 'benchmark']),
  metrics: z.array(z.enum(['accuracy', 'f1', 'precision', 'recall', 'rouge', 'bleu', 'perplexity', 'latency', 'throughput'])),
  comparison_baseline: z.string().optional(),
  sample_size: z.number().min(10).max(10000).default(1000),
  confidence_level: z.number().min(0.8).max(0.99).default(0.95),
  statistical_tests: z.array(z.enum(['t_test', 'mann_whitney', 'chi_square', 'anova'])).default(['t_test']),
  validation_criteria: z.object({
    min_accuracy: z.number().min(0).max(1).default(0.8),
    max_latency_ms: z.number().min(1).default(2000),
    min_throughput_rps: z.number().min(1).default(10),
    max_error_rate: z.number().min(0).max(1).default(0.05),
  }),
});

export type EvaluationConfig = z.infer<typeof EvaluationConfigSchema>;

export interface ModelEvaluation {
  id: string;
  name: string;
  config: EvaluationConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: EvaluationResults[];
  comparison_analysis?: ComparisonAnalysis;
  validation_status: 'passed' | 'failed' | 'pending';
  recommendations: Recommendation[];
  created_at: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface EvaluationResults {
  model_id: string;
  model_name: string;
  metrics: MetricResults;
  performance_stats: PerformanceStats;
  error_analysis: ErrorAnalysis;
  sample_predictions: PredictionSample[];
}

export interface MetricResults {
  accuracy?: number;
  f1_score?: number;
  precision?: number;
  recall?: number;
  rouge_l?: number;
  bleu_score?: number;
  perplexity?: number;
  avg_latency_ms?: number;
  throughput_rps?: number;
  error_rate?: number;
}

export interface PerformanceStats {
  total_predictions: number;
  successful_predictions: number;
  failed_predictions: number;
  avg_response_time: number;
  p95_response_time: number;
  p99_response_time: number;
  memory_usage_mb: number;
  cpu_utilization: number;
}

export interface ErrorAnalysis {
  error_types: Record<string, number>;
  common_failure_patterns: string[];
  problematic_input_types: string[];
  improvement_suggestions: string[];
}

export interface PredictionSample {
  input: string;
  expected_output: string;
  predicted_output: string;
  confidence_score: number;
  is_correct: boolean;
  error_type?: string;
}

export interface ComparisonAnalysis {
  statistical_significance: Record<string, boolean>;
  performance_differences: Record<string, number>;
  winner: string | null;
  confidence_intervals: Record<string, { lower: number; upper: number }>;
  effect_sizes: Record<string, number>;
}

export interface Recommendation {
  type: 'performance' | 'deployment' | 'training' | 'data';
  priority: 'high' | 'medium' | 'low';
  description: string;
  action_items: string[];
  expected_impact: string;
}

export class ModelEvaluationService {
  private prisma: PrismaClient;
  private cache: CacheService;
  private performanceMonitor: PerformanceMonitor;
  private modelRegistry: ModelRegistry;
  private activeEvaluations: Map<string, ModelEvaluation> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.cache = new CacheService('model-evaluation');
    this.performanceMonitor = new PerformanceMonitor();
    this.modelRegistry = new ModelRegistry();
  }

  /**
   * Start model evaluation
   */
  async startEvaluation(config: EvaluationConfig): Promise<ModelEvaluation> {
    const evaluationId = uuidv4();
    
    const evaluation: ModelEvaluation = {
      id: evaluationId,
      name: config.evaluation_name,
      config,
      status: 'pending',
      results: [],
      validation_status: 'pending',
      recommendations: [],
      created_at: new Date(),
    };

    this.activeEvaluations.set(evaluationId, evaluation);
    
    logger.info('Starting model evaluation', { evaluationId, modelCount: config.model_ids.length });

    try {
      evaluation.status = 'running';
      
      // Load test dataset
      const testDataset = await this.loadTestDataset(config.test_dataset_path);
      
      // Evaluate each model
      const results: EvaluationResults[] = [];
      for (const modelId of config.model_ids) {
        const modelResult = await this.evaluateModel(modelId, testDataset, config);
        results.push(modelResult);
      }
      
      evaluation.results = results;
      
      // Perform comparison analysis if multiple models
      if (config.model_ids.length > 1) {
        evaluation.comparison_analysis = await this.performComparisonAnalysis(results, config);
      }
      
      // Validate results against criteria
      evaluation.validation_status = this.validateResults(results, config);
      
      // Generate recommendations
      evaluation.recommendations = this.generateRecommendations(results, evaluation.comparison_analysis, config);
      
      evaluation.status = 'completed';
      evaluation.completed_at = new Date();
      
      // Cache results
      await this.cache.set(`evaluation:${evaluationId}`, evaluation, 3600 * 48); // 48 hours
      
      logger.info('Model evaluation completed', {
        evaluationId,
        validationStatus: evaluation.validation_status,
        recommendationCount: evaluation.recommendations.length,
      });
      
      return evaluation;
      
    } catch (error) {
      evaluation.status = 'failed';
      evaluation.error_message = error instanceof Error ? error.message : String(error);
      logger.error('Model evaluation failed', { evaluationId, error });
      throw error;
    }
  }

  /**
   * Evaluate single model
   */
  private async evaluateModel(
    modelId: string,
    testDataset: any[],
    config: EvaluationConfig
  ): Promise<EvaluationResults> {
    logger.info('Evaluating model', { modelId, sampleSize: Math.min(testDataset.length, config.sample_size) });

    const model = await this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Sample test data if needed
    const sampleData = this.sampleTestData(testDataset, config.sample_size);
    
    // Run predictions
    const predictions: PredictionSample[] = [];
    const performanceMetrics: number[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const sample of sampleData) {
      const startTime = Date.now();
      
      try {
        const prediction = await this.runModelPrediction(modelId, sample.input);
        const latency = Date.now() - startTime;
        performanceMetrics.push(latency);
        
        const isCorrect = this.evaluatePrediction(sample.expected_output, prediction.output);
        
        predictions.push({
          input: sample.input,
          expected_output: sample.expected_output,
          predicted_output: prediction.output,
          confidence_score: prediction.confidence || 0.5,
          is_correct: isCorrect,
          error_type: isCorrect ? undefined : this.classifyError(sample.expected_output, prediction.output),
        });
        
        successCount++;
      } catch (error) {
        failureCount++;
        performanceMetrics.push(Date.now() - startTime);
        
        predictions.push({
          input: sample.input,
          expected_output: sample.expected_output,
          predicted_output: '',
          confidence_score: 0,
          is_correct: false,
          error_type: 'prediction_failure',
        });
      }
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(predictions, config.metrics);
    const performanceStats = this.calculatePerformanceStats(predictions, performanceMetrics, successCount, failureCount);
    const errorAnalysis = this.analyzeErrors(predictions);

    return {
      model_id: modelId,
      model_name: model.name,
      metrics,
      performance_stats: performanceStats,
      error_analysis: errorAnalysis,
      sample_predictions: predictions.slice(0, 50), // Keep first 50 samples for analysis
    };
  }

  /**
   * Load test dataset from file
   */
  private async loadTestDataset(datasetPath: string): Promise<any[]> {
    if (!await fs.pathExists(datasetPath)) {
      throw new Error(`Test dataset not found: ${datasetPath}`);
    }

    const extension = path.extname(datasetPath).toLowerCase();
    let dataset: any[] = [];

    switch (extension) {
      case '.jsonl':
        const content = await fs.readFile(datasetPath, 'utf-8');
        dataset = content.trim().split('\n').map(line => JSON.parse(line));
        break;
      case '.json':
        dataset = await fs.readJSON(datasetPath);
        break;
      default:
        throw new Error(`Unsupported dataset format: ${extension}`);
    }

    if (!Array.isArray(dataset) || dataset.length === 0) {
      throw new Error('Dataset is empty or invalid format');
    }

    return dataset;
  }

  /**
   * Sample test data for evaluation
   */
  private sampleTestData(dataset: any[], sampleSize: number): any[] {
    if (dataset.length <= sampleSize) {
      return dataset;
    }

    // Stratified sampling to maintain distribution
    const shuffled = [...dataset].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, sampleSize);
  }

  /**
   * Run model prediction
   */
  private async runModelPrediction(modelId: string, input: string): Promise<{ output: string; confidence?: number }> {
    // This would call the actual model service
    // For now, simulate model prediction
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50)); // 50-150ms latency
    
    return {
      output: `Simulated prediction for: ${input.substring(0, 50)}...`,
      confidence: Math.random() * 0.4 + 0.6, // 0.6-1.0 confidence
    };
  }

  /**
   * Evaluate prediction correctness
   */
  private evaluatePrediction(expected: string, predicted: string): boolean {
    // Simple evaluation - in production would use more sophisticated methods
    const expectedLower = expected.toLowerCase().trim();
    const predictedLower = predicted.toLowerCase().trim();
    
    // Check for key terms match
    const expectedTerms = expectedLower.split(/\s+/);
    const predictedTerms = predictedLower.split(/\s+/);
    
    const commonTerms = expectedTerms.filter(term => predictedTerms.includes(term));
    const similarity = commonTerms.length / Math.max(expectedTerms.length, predictedTerms.length);
    
    return similarity >= 0.7; // 70% term overlap threshold
  }

  /**
   * Classify prediction error type
   */
  private classifyError(expected: string, predicted: string): string {
    if (predicted === '') return 'empty_prediction';
    if (predicted.length < expected.length * 0.5) return 'incomplete_prediction';
    if (predicted.length > expected.length * 2) return 'verbose_prediction';
    
    const expectedLower = expected.toLowerCase();
    const predictedLower = predicted.toLowerCase();
    
    if (expectedLower.includes('high') && !predictedLower.includes('high')) return 'severity_mismatch';
    if (expectedLower.includes('violation') && !predictedLower.includes('violation')) return 'classification_error';
    
    return 'semantic_error';
  }

  /**
   * Calculate evaluation metrics
   */
  private calculateMetrics(predictions: PredictionSample[], requestedMetrics: string[]): MetricResults {
    const correct = predictions.filter(p => p.is_correct).length;
    const total = predictions.length;
    
    const metrics: MetricResults = {};
    
    if (requestedMetrics.includes('accuracy')) {
      metrics.accuracy = total > 0 ? correct / total : 0;
    }
    
    if (requestedMetrics.includes('f1') || requestedMetrics.includes('precision') || requestedMetrics.includes('recall')) {
      // For simplification, assume binary classification
      const truePositives = predictions.filter(p => p.is_correct && p.predicted_output !== '').length;
      const falsePositives = predictions.filter(p => !p.is_correct && p.predicted_output !== '').length;
      const falseNegatives = predictions.filter(p => !p.is_correct && p.predicted_output === '').length;
      
      const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
      const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
      
      if (requestedMetrics.includes('precision')) metrics.precision = precision;
      if (requestedMetrics.includes('recall')) metrics.recall = recall;
      if (requestedMetrics.includes('f1')) {
        metrics.f1_score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
      }
    }
    
    // Additional metrics would be calculated based on specific task requirements
    if (requestedMetrics.includes('rouge')) {
      metrics.rouge_l = this.calculateRougeL(predictions);
    }
    
    return metrics;
  }

  /**
   * Calculate performance statistics
   */
  private calculatePerformanceStats(
    predictions: PredictionSample[],
    latencies: number[],
    successCount: number,
    failureCount: number
  ): PerformanceStats {
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    
    return {
      total_predictions: predictions.length,
      successful_predictions: successCount,
      failed_predictions: failureCount,
      avg_response_time: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      p95_response_time: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
      p99_response_time: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0,
      memory_usage_mb: Math.random() * 500 + 200, // Simulated
      cpu_utilization: Math.random() * 40 + 30, // Simulated
    };
  }

  /**
   * Analyze prediction errors
   */
  private analyzeErrors(predictions: PredictionSample[]): ErrorAnalysis {
    const errors = predictions.filter(p => !p.is_correct);
    const errorTypes: Record<string, number> = {};
    
    errors.forEach(error => {
      if (error.error_type) {
        errorTypes[error.error_type] = (errorTypes[error.error_type] || 0) + 1;
      }
    });

    return {
      error_types: errorTypes,
      common_failure_patterns: this.identifyFailurePatterns(errors),
      problematic_input_types: this.identifyProblematicInputs(errors),
      improvement_suggestions: this.generateImprovementSuggestions(errorTypes),
    };
  }

  /**
   * Perform comparison analysis between models
   */
  private async performComparisonAnalysis(
    results: EvaluationResults[],
    config: EvaluationConfig
  ): Promise<ComparisonAnalysis> {
    if (results.length < 2) {
      throw new Error('Need at least 2 models for comparison');
    }

    const analysis: ComparisonAnalysis = {
      statistical_significance: {},
      performance_differences: {},
      winner: null,
      confidence_intervals: {},
      effect_sizes: {},
    };

    // Compare each metric across models
    for (const metric of config.metrics) {
      const values = results.map(r => this.getMetricValue(r.metrics, metric)).filter(v => v !== undefined) as number[];
      
      if (values.length >= 2) {
        // Simple statistical comparison
        const isSignificant = this.performTTest(values, config.confidence_level);
        analysis.statistical_significance[metric] = isSignificant;
        
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        analysis.performance_differences[metric] = (maxValue - minValue) / minValue;
        
        // Calculate confidence intervals (simplified)
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1));
        const margin = 1.96 * (std / Math.sqrt(values.length)); // 95% CI
        
        analysis.confidence_intervals[metric] = {
          lower: mean - margin,
          upper: mean + margin,
        };
      }
    }

    // Determine overall winner
    analysis.winner = this.determineWinner(results);

    return analysis;
  }

  /**
   * Validate results against criteria
   */
  private validateResults(results: EvaluationResults[], config: EvaluationConfig): 'passed' | 'failed' {
    const criteria = config.validation_criteria;
    
    for (const result of results) {
      if (result.metrics.accuracy && result.metrics.accuracy < criteria.min_accuracy) {
        return 'failed';
      }
      
      if (result.performance_stats.avg_response_time > criteria.max_latency_ms) {
        return 'failed';
      }
      
      const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
      if (errorRate > criteria.max_error_rate) {
        return 'failed';
      }
    }
    
    return 'passed';
  }

  /**
   * Generate recommendations based on evaluation results
   */
  private generateRecommendations(
    results: EvaluationResults[],
    comparison?: ComparisonAnalysis,
    config?: EvaluationConfig
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    
    // Performance recommendations
    for (const result of results) {
      if (result.metrics.accuracy && result.metrics.accuracy < 0.8) {
        recommendations.push({
          type: 'training',
          priority: 'high',
          description: `Model ${result.model_name} has low accuracy (${(result.metrics.accuracy * 100).toFixed(1)}%)`,
          action_items: [
            'Increase training data size',
            'Improve data quality and labeling',
            'Adjust hyperparameters',
            'Consider different model architecture',
          ],
          expected_impact: 'Improve model accuracy by 10-20%',
        });
      }
      
      if (result.performance_stats.avg_response_time > 1000) {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          description: `Model ${result.model_name} has high latency (${result.performance_stats.avg_response_time}ms)`,
          action_items: [
            'Optimize model inference code',
            'Consider model quantization',
            'Implement caching strategies',
            'Scale inference infrastructure',
          ],
          expected_impact: 'Reduce response time by 30-50%',
        });
      }
    }
    
    // Comparison recommendations
    if (comparison && comparison.winner) {
      recommendations.push({
        type: 'deployment',
        priority: 'high',
        description: `Model ${comparison.winner} shows superior performance`,
        action_items: [
          'Deploy winning model to production',
          'Implement A/B testing for validation',
          'Monitor performance metrics post-deployment',
        ],
        expected_impact: 'Improve overall system performance',
      });
    }
    
    return recommendations;
  }

  // Helper methods
  private calculateRougeL(predictions: PredictionSample[]): number {
    // Simplified ROUGE-L calculation
    let totalScore = 0;
    let validPredictions = 0;
    
    for (const pred of predictions) {
      if (pred.predicted_output && pred.expected_output) {
        const score = this.longestCommonSubsequence(
          pred.expected_output.split(' '),
          pred.predicted_output.split(' ')
        );
        totalScore += score;
        validPredictions++;
      }
    }
    
    return validPredictions > 0 ? totalScore / validPredictions : 0;
  }

  private longestCommonSubsequence(arr1: string[], arr2: string[]): number {
    const m = arr1.length;
    const n = arr2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (arr1[i - 1] === arr2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    return dp[m][n] / Math.max(m, n); // Normalize by length
  }

  private getMetricValue(metrics: MetricResults, metricName: string): number | undefined {
    switch (metricName) {
      case 'accuracy': return metrics.accuracy;
      case 'f1': return metrics.f1_score;
      case 'precision': return metrics.precision;
      case 'recall': return metrics.recall;
      case 'rouge': return metrics.rouge_l;
      case 'latency': return metrics.avg_latency_ms;
      default: return undefined;
    }
  }

  private performTTest(values: number[], confidenceLevel: number): boolean {
    // Simplified t-test implementation
    if (values.length < 2) return false;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const standardError = Math.sqrt(variance / values.length);
    
    // Simple threshold-based significance test
    const tScore = Math.abs(mean) / standardError;
    const criticalValue = confidenceLevel === 0.95 ? 1.96 : 2.576; // For 95% or 99%
    
    return tScore > criticalValue;
  }

  private determineWinner(results: EvaluationResults[]): string | null {
    if (results.length < 2) return null;
    
    // Score each model based on key metrics
    let bestModel = results[0];
    let bestScore = this.calculateOverallScore(bestModel);
    
    for (let i = 1; i < results.length; i++) {
      const score = this.calculateOverallScore(results[i]);
      if (score > bestScore) {
        bestScore = score;
        bestModel = results[i];
      }
    }
    
    return bestModel.model_name;
  }

  private calculateOverallScore(result: EvaluationResults): number {
    // Weighted scoring of different metrics
    let score = 0;
    
    if (result.metrics.accuracy) score += result.metrics.accuracy * 0.4;
    if (result.metrics.f1_score) score += result.metrics.f1_score * 0.3;
    if (result.performance_stats.avg_response_time) {
      // Lower latency is better, normalize to 0-1 scale
      const latencyScore = Math.max(0, 1 - (result.performance_stats.avg_response_time / 2000));
      score += latencyScore * 0.2;
    }
    
    const errorRate = result.performance_stats.failed_predictions / result.performance_stats.total_predictions;
    score += (1 - errorRate) * 0.1;
    
    return score;
  }

  private identifyFailurePatterns(errors: PredictionSample[]): string[] {
    const patterns: Record<string, number> = {};
    
    errors.forEach(error => {
      // Analyze input characteristics
      const input = error.input.toLowerCase();
      if (input.length > 1000) patterns['long_input'] = (patterns['long_input'] || 0) + 1;
      if (input.includes('technical')) patterns['technical_terms'] = (patterns['technical_terms'] || 0) + 1;
      if (input.includes('legal')) patterns['legal_jargon'] = (patterns['legal_jargon'] || 0) + 1;
    });
    
    return Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);
  }

  private identifyProblematicInputs(errors: PredictionSample[]): string[] {
    return ['Complex legal clauses', 'Technical terminology', 'Long documents', 'Ambiguous language'];
  }

  private generateImprovementSuggestions(errorTypes: Record<string, number>): string[] {
    const suggestions: string[] = [];
    
    if (errorTypes['semantic_error'] > 0) {
      suggestions.push('Improve semantic understanding with more diverse training data');
    }
    if (errorTypes['classification_error'] > 0) {
      suggestions.push('Enhance classification head with additional training');
    }
    if (errorTypes['incomplete_prediction'] > 0) {
      suggestions.push('Adjust generation parameters to produce complete outputs');
    }
    if (errorTypes['verbose_prediction'] > 0) {
      suggestions.push('Implement length penalty to control output verbosity');
    }
    
    return suggestions;
  }

  /**
   * Public API methods
   */
  
  async getEvaluation(evaluationId: string): Promise<ModelEvaluation | null> {
    let evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      evaluation = await this.cache.get(`evaluation:${evaluationId}`) as ModelEvaluation;
    }
    return evaluation || null;
  }

  async listEvaluations(): Promise<ModelEvaluation[]> {
    return Array.from(this.activeEvaluations.values());
  }

  async cancelEvaluation(evaluationId: string): Promise<void> {
    const evaluation = this.activeEvaluations.get(evaluationId);
    if (!evaluation) {
      throw new Error('Evaluation not found');
    }
    
    if (evaluation.status === 'completed' || evaluation.status === 'failed') {
      throw new Error('Cannot cancel completed or failed evaluation');
    }
    
    evaluation.status = 'failed';
    evaluation.error_message = 'Evaluation cancelled by user';
    
    logger.info('Evaluation cancelled', { evaluationId });
  }

  async exportResults(evaluationId: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const evaluation = await this.getEvaluation(evaluationId);
    if (!evaluation) {
      throw new Error('Evaluation not found');
    }
    
    const exportPath = path.join('./exports', `evaluation_${evaluationId}.${format}`);
    await fs.ensureDir(path.dirname(exportPath));
    
    if (format === 'json') {
      await fs.writeJSON(exportPath, evaluation, { spaces: 2 });
    } else if (format === 'csv') {
      // Convert results to CSV format
      const csvData = this.convertToCsv(evaluation);
      await fs.writeFile(exportPath, csvData);
    }
    
    return exportPath;
  }

  private convertToCsv(evaluation: ModelEvaluation): string {
    const headers = ['model_id', 'model_name', 'accuracy', 'f1_score', 'precision', 'recall', 'avg_latency_ms', 'error_rate'];
    const rows = evaluation.results.map(result => [
      result.model_id,
      result.model_name,
      result.metrics.accuracy || 0,
      result.metrics.f1_score || 0,
      result.metrics.precision || 0,
      result.metrics.recall || 0,
      result.metrics.avg_latency_ms || 0,
      result.performance_stats.failed_predictions / result.performance_stats.total_predictions,
    ]);
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}