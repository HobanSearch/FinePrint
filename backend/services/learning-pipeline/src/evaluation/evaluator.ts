import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import axios from 'axios';
import * as fs from 'fs/promises';
import { EvaluationMetrics, EvaluationResponse } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { DriftDetector } from './drift-detector.js';
import { FairnessAnalyzer } from './fairness-analyzer.js';

export class ModelEvaluator {
  private prisma: PrismaClient;
  private redis: Redis;
  private driftDetector: DriftDetector;
  private fairnessAnalyzer: FairnessAnalyzer;
  private ollamaEndpoint: string;

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    ollamaEndpoint: string = 'http://localhost:11434'
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.ollamaEndpoint = ollamaEndpoint;
    this.driftDetector = new DriftDetector(prisma, redis);
    this.fairnessAnalyzer = new FairnessAnalyzer(prisma, redis);
  }

  async evaluateModel(
    runId: string,
    modelPath: string,
    evaluationType: string = 'comprehensive'
  ): Promise<EvaluationResponse> {
    try {
      logger.info('Starting model evaluation', { runId, evaluationType });

      // Get training run details
      const trainingRun = await this.prisma.trainingRun.findUnique({
        where: { id: runId },
        include: { dataset: true },
      });

      if (!trainingRun) {
        throw new Error(`Training run ${runId} not found`);
      }

      // Load test dataset
      const testDataset = await this.loadTestDataset(trainingRun.datasetId);

      // Run evaluation based on type
      let metrics: any = {};
      
      switch (evaluationType) {
        case 'comprehensive':
          metrics = await this.comprehensiveEvaluation(
            modelPath,
            testDataset,
            trainingRun.modelType
          );
          break;
        case 'accuracy':
          metrics = await this.accuracyEvaluation(modelPath, testDataset);
          break;
        case 'performance':
          metrics = await this.performanceEvaluation(modelPath, testDataset);
          break;
        case 'fairness':
          metrics = await this.fairnessEvaluation(modelPath, testDataset);
          break;
        case 'drift':
          metrics = await this.driftEvaluation(modelPath, testDataset);
          break;
        default:
          throw new Error(`Unknown evaluation type: ${evaluationType}`);
      }

      // Store evaluation results
      const evaluation = await this.prisma.modelEvaluation.create({
        data: {
          runId,
          modelId: trainingRun.modelType,
          modelVersion: runId,
          evaluationType,
          accuracy: metrics.accuracy,
          precision: metrics.precision,
          recall: metrics.recall,
          f1Score: metrics.f1Score,
          auc: metrics.auc,
          latencyP50: metrics.latencyP50,
          latencyP95: metrics.latencyP95,
          latencyP99: metrics.latencyP99,
          throughput: metrics.throughput,
          confusionMatrix: metrics.confusionMatrix,
          classMetrics: metrics.classMetrics,
          fairnessMetrics: metrics.fairnessMetrics,
          biasMetrics: metrics.biasMetrics,
        },
      });

      // Check if model passes thresholds
      const passed = this.checkThresholds(metrics);

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics);

      return {
        evaluationId: evaluation.id,
        modelId: trainingRun.modelType,
        modelVersion: runId,
        metrics,
        passed,
        recommendations,
      };
    } catch (error) {
      logger.error('Model evaluation failed', { error, runId });
      throw error;
    }
  }

  private async comprehensiveEvaluation(
    modelPath: string,
    testDataset: any[],
    modelType: string
  ): Promise<any> {
    const metrics: any = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      confusionMatrix: [],
      classMetrics: {},
      latencies: [],
    };

    // Initialize confusion matrix
    const numClasses = 5; // For rating predictions
    metrics.confusionMatrix = Array(numClasses).fill(null).map(() => 
      Array(numClasses).fill(0)
    );

    // Track predictions for metrics calculation
    const predictions: number[] = [];
    const groundTruth: number[] = [];
    const latencies: number[] = [];

    // Evaluate on test dataset
    for (const sample of testDataset) {
      const startTime = Date.now();
      
      // Get model prediction
      const prediction = await this.getPrediction(modelPath, sample.input, modelType);
      
      const latency = Date.now() - startTime;
      latencies.push(latency);

      // Parse prediction (simplified - assuming numeric rating)
      const predClass = Math.round(prediction.score * 4); // 0-4 rating
      const trueClass = Math.round(sample.output * 4);

      predictions.push(predClass);
      groundTruth.push(trueClass);

      // Update confusion matrix
      metrics.confusionMatrix[trueClass][predClass]++;
    }

    // Calculate accuracy metrics
    const correct = predictions.filter((p, i) => p === groundTruth[i]).length;
    metrics.accuracy = correct / predictions.length;

    // Calculate per-class metrics
    for (let i = 0; i < numClasses; i++) {
      const tp = metrics.confusionMatrix[i][i];
      const fp = metrics.confusionMatrix.reduce((sum, row, j) => 
        j !== i ? sum + row[i] : sum, 0
      );
      const fn = metrics.confusionMatrix[i].reduce((sum, val, j) => 
        j !== i ? sum + val : sum, 0
      );
      const tn = predictions.length - tp - fp - fn;

      const precision = tp / (tp + fp) || 0;
      const recall = tp / (tp + fn) || 0;
      const f1 = 2 * (precision * recall) / (precision + recall) || 0;

      metrics.classMetrics[`class_${i}`] = {
        precision,
        recall,
        f1Score: f1,
        support: groundTruth.filter(g => g === i).length,
      };
    }

    // Calculate overall metrics
    metrics.precision = Object.values(metrics.classMetrics).reduce(
      (sum: number, m: any) => sum + m.precision, 0
    ) / numClasses;
    
    metrics.recall = Object.values(metrics.classMetrics).reduce(
      (sum: number, m: any) => sum + m.recall, 0
    ) / numClasses;
    
    metrics.f1Score = 2 * (metrics.precision * metrics.recall) / 
      (metrics.precision + metrics.recall) || 0;

    // Calculate latency percentiles
    latencies.sort((a, b) => a - b);
    metrics.latencyP50 = latencies[Math.floor(latencies.length * 0.5)];
    metrics.latencyP95 = latencies[Math.floor(latencies.length * 0.95)];
    metrics.latencyP99 = latencies[Math.floor(latencies.length * 0.99)];
    metrics.throughput = 1000 / (latencies.reduce((a, b) => a + b, 0) / latencies.length);

    // Run fairness analysis
    metrics.fairnessMetrics = await this.fairnessAnalyzer.analyze(
      predictions,
      groundTruth,
      testDataset
    );

    // Check for drift
    metrics.driftMetrics = await this.driftDetector.detect(
      modelType,
      predictions,
      groundTruth
    );

    return metrics;
  }

  private async accuracyEvaluation(
    modelPath: string,
    testDataset: any[]
  ): Promise<any> {
    const predictions: any[] = [];
    const groundTruth: any[] = [];

    for (const sample of testDataset) {
      const prediction = await this.getPrediction(modelPath, sample.input, 'default');
      predictions.push(prediction.score);
      groundTruth.push(sample.output);
    }

    // Calculate correlation for continuous outputs
    const correlation = this.calculateCorrelation(predictions, groundTruth);
    
    // Calculate MAE and RMSE
    const mae = this.calculateMAE(predictions, groundTruth);
    const rmse = this.calculateRMSE(predictions, groundTruth);

    return {
      accuracy: correlation,
      mae,
      rmse,
      correlation,
      sampleSize: testDataset.length,
    };
  }

  private async performanceEvaluation(
    modelPath: string,
    testDataset: any[]
  ): Promise<any> {
    const latencies: number[] = [];
    const memorySamples: number[] = [];
    const throughputSamples: number[] = [];

    // Warm up
    for (let i = 0; i < 10; i++) {
      await this.getPrediction(modelPath, testDataset[0].input, 'default');
    }

    // Measure performance
    const batchSize = 10;
    for (let i = 0; i < testDataset.length; i += batchSize) {
      const batch = testDataset.slice(i, i + batchSize);
      
      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;
      
      // Process batch
      await Promise.all(
        batch.map(sample => this.getPrediction(modelPath, sample.input, 'default'))
      );
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      const batchLatency = (endTime - startTime) / batch.length;
      const memoryDelta = (endMemory - startMemory) / 1024 / 1024; // MB
      
      latencies.push(batchLatency);
      memorySamples.push(memoryDelta);
      throughputSamples.push(batch.length / ((endTime - startTime) / 1000));
    }

    // Calculate statistics
    latencies.sort((a, b) => a - b);
    
    return {
      latencyP50: latencies[Math.floor(latencies.length * 0.5)],
      latencyP95: latencies[Math.floor(latencies.length * 0.95)],
      latencyP99: latencies[Math.floor(latencies.length * 0.99)],
      latencyMean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      throughput: throughputSamples.reduce((a, b) => a + b, 0) / throughputSamples.length,
      memoryUsage: memorySamples.reduce((a, b) => a + b, 0) / memorySamples.length,
      consistency: this.calculateStdDev(latencies) / (latencies.reduce((a, b) => a + b, 0) / latencies.length),
    };
  }

  private async fairnessEvaluation(
    modelPath: string,
    testDataset: any[]
  ): Promise<any> {
    // Group test data by sensitive attributes
    const groups = this.groupBySensitiveAttributes(testDataset);
    
    const groupMetrics: any = {};
    
    for (const [groupName, groupData] of Object.entries(groups)) {
      const predictions: number[] = [];
      const groundTruth: number[] = [];
      
      for (const sample of groupData as any[]) {
        const prediction = await this.getPrediction(modelPath, sample.input, 'default');
        predictions.push(prediction.score);
        groundTruth.push(sample.output);
      }
      
      // Calculate group-specific metrics
      const accuracy = this.calculateAccuracy(predictions, groundTruth);
      const falsePositiveRate = this.calculateFPR(predictions, groundTruth);
      const falseNegativeRate = this.calculateFNR(predictions, groundTruth);
      
      groupMetrics[groupName] = {
        accuracy,
        falsePositiveRate,
        falseNegativeRate,
        sampleSize: (groupData as any[]).length,
      };
    }
    
    // Calculate fairness metrics
    const fairnessMetrics = this.calculateFairnessMetrics(groupMetrics);
    
    return {
      groupMetrics,
      fairnessMetrics,
      biasDetected: fairnessMetrics.maxDisparity > 0.1,
      recommendations: this.generateFairnessRecommendations(fairnessMetrics),
    };
  }

  private async driftEvaluation(
    modelPath: string,
    testDataset: any[]
  ): Promise<any> {
    // Get baseline predictions (from production model)
    const baselineModelPath = await this.getBaselineModelPath();
    
    const currentPredictions: number[] = [];
    const baselinePredictions: number[] = [];
    
    for (const sample of testDataset) {
      const current = await this.getPrediction(modelPath, sample.input, 'default');
      const baseline = await this.getPrediction(baselineModelPath, sample.input, 'default');
      
      currentPredictions.push(current.score);
      baselinePredictions.push(baseline.score);
    }
    
    // Calculate drift metrics
    const psi = this.calculatePSI(baselinePredictions, currentPredictions);
    const ksDStatistic = this.calculateKSStatistic(baselinePredictions, currentPredictions);
    const wasserstein = this.calculateWassersteinDistance(baselinePredictions, currentPredictions);
    
    return {
      psi,
      ksDStatistic,
      wasserstein,
      driftDetected: psi > 0.1 || ksDStatistic > 0.1,
      driftType: this.classifyDriftType(psi, ksDStatistic, wasserstein),
      severity: this.calculateDriftSeverity(psi, ksDStatistic),
    };
  }

  private async getPrediction(
    modelPath: string,
    input: any,
    modelType: string
  ): Promise<any> {
    try {
      // Call Ollama API for prediction
      const response = await axios.post(`${this.ollamaEndpoint}/api/generate`, {
        model: modelPath,
        prompt: typeof input === 'string' ? input : JSON.stringify(input),
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 100,
        },
      });

      // Parse response
      const output = response.data.response;
      
      // Extract score from output (simplified)
      const scoreMatch = output.match(/score[:\s]*([\d.]+)/i);
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
      
      return {
        score,
        output,
        confidence: this.extractConfidence(output),
      };
    } catch (error) {
      logger.error('Prediction failed', { error, modelPath });
      // Return default prediction
      return {
        score: 0.5,
        output: '',
        confidence: 0,
      };
    }
  }

  private extractConfidence(output: string): number {
    const confMatch = output.match(/confidence[:\s]*([\d.]+)/i);
    return confMatch ? parseFloat(confMatch[1]) : 0.5;
  }

  private async loadTestDataset(datasetId: string): Promise<any[]> {
    // Load test split of dataset
    const dataset = await this.prisma.trainingDataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    // Load from file or database
    // Simplified for brevity
    return [
      { input: 'Test document 1', output: 0.8 },
      { input: 'Test document 2', output: 0.3 },
      { input: 'Test document 3', output: 0.9 },
      // ... more test samples
    ];
  }

  private checkThresholds(metrics: any): boolean {
    const thresholds = {
      accuracy: 0.8,
      precision: 0.75,
      recall: 0.75,
      f1Score: 0.75,
      latencyP95: 500, // ms
      throughput: 10, // requests/sec
    };

    for (const [metric, threshold] of Object.entries(thresholds)) {
      if (metrics[metric] !== undefined) {
        if (metric.includes('latency')) {
          if (metrics[metric] > threshold) return false;
        } else {
          if (metrics[metric] < threshold) return false;
        }
      }
    }

    return true;
  }

  private generateRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];

    // Accuracy recommendations
    if (metrics.accuracy < 0.8) {
      recommendations.push('Consider increasing training data or epochs');
    }
    
    if (metrics.precision < metrics.recall) {
      recommendations.push('Model has high false positive rate - adjust threshold');
    } else if (metrics.recall < metrics.precision) {
      recommendations.push('Model has high false negative rate - consider rebalancing dataset');
    }

    // Performance recommendations
    if (metrics.latencyP95 > 500) {
      recommendations.push('Optimize model for inference - consider quantization or pruning');
    }

    if (metrics.throughput < 10) {
      recommendations.push('Enable batch processing or model caching for better throughput');
    }

    // Fairness recommendations
    if (metrics.fairnessMetrics?.maxDisparity > 0.1) {
      recommendations.push('Bias detected - consider debiasing techniques or balanced training');
    }

    // Drift recommendations
    if (metrics.driftMetrics?.driftDetected) {
      recommendations.push('Data drift detected - consider retraining with recent data');
    }

    return recommendations;
  }

  // Statistical helper methods
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return correlation;
  }

  private calculateMAE(predictions: number[], groundTruth: number[]): number {
    const errors = predictions.map((p, i) => Math.abs(p - groundTruth[i]));
    return errors.reduce((a, b) => a + b, 0) / errors.length;
  }

  private calculateRMSE(predictions: number[], groundTruth: number[]): number {
    const errors = predictions.map((p, i) => Math.pow(p - groundTruth[i], 2));
    return Math.sqrt(errors.reduce((a, b) => a + b, 0) / errors.length);
  }

  private calculateStdDev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private calculateAccuracy(predictions: number[], groundTruth: number[]): number {
    const threshold = 0.5;
    const correct = predictions.filter((p, i) => 
      (p >= threshold) === (groundTruth[i] >= threshold)
    ).length;
    return correct / predictions.length;
  }

  private calculateFPR(predictions: number[], groundTruth: number[]): number {
    const threshold = 0.5;
    let fp = 0, tn = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      if (groundTruth[i] < threshold) {
        if (predictions[i] >= threshold) fp++;
        else tn++;
      }
    }
    
    return fp / (fp + tn) || 0;
  }

  private calculateFNR(predictions: number[], groundTruth: number[]): number {
    const threshold = 0.5;
    let fn = 0, tp = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      if (groundTruth[i] >= threshold) {
        if (predictions[i] < threshold) fn++;
        else tp++;
      }
    }
    
    return fn / (fn + tp) || 0;
  }

  private groupBySensitiveAttributes(dataset: any[]): Record<string, any[]> {
    // Group by predefined sensitive attributes
    // Simplified for demonstration
    return {
      group_a: dataset.slice(0, dataset.length / 2),
      group_b: dataset.slice(dataset.length / 2),
    };
  }

  private calculateFairnessMetrics(groupMetrics: any): any {
    const accuracies = Object.values(groupMetrics).map((m: any) => m.accuracy);
    const fprs = Object.values(groupMetrics).map((m: any) => m.falsePositiveRate);
    
    return {
      maxDisparity: Math.max(...accuracies) - Math.min(...accuracies),
      demographicParity: this.calculateDemographicParity(groupMetrics),
      equalOpportunity: this.calculateEqualOpportunity(groupMetrics),
      equalisedOdds: Math.max(...fprs) - Math.min(...fprs),
    };
  }

  private calculateDemographicParity(groupMetrics: any): number {
    // Simplified calculation
    const positiveRates = Object.values(groupMetrics).map(
      (m: any) => m.accuracy
    );
    return Math.max(...positiveRates) - Math.min(...positiveRates);
  }

  private calculateEqualOpportunity(groupMetrics: any): number {
    // Simplified calculation
    const tprs = Object.values(groupMetrics).map(
      (m: any) => 1 - m.falseNegativeRate
    );
    return Math.max(...tprs) - Math.min(...tprs);
  }

  private generateFairnessRecommendations(fairnessMetrics: any): string[] {
    const recommendations: string[] = [];
    
    if (fairnessMetrics.maxDisparity > 0.1) {
      recommendations.push('Apply fairness-aware training techniques');
    }
    
    if (fairnessMetrics.demographicParity > 0.15) {
      recommendations.push('Rebalance training data across groups');
    }
    
    if (fairnessMetrics.equalOpportunity > 0.1) {
      recommendations.push('Adjust decision thresholds per group');
    }
    
    return recommendations;
  }

  private calculatePSI(baseline: number[], current: number[]): number {
    // Population Stability Index calculation
    const bins = 10;
    const min = Math.min(...baseline, ...current);
    const max = Math.max(...baseline, ...current);
    const binWidth = (max - min) / bins;
    
    const baselineCounts = new Array(bins).fill(0);
    const currentCounts = new Array(bins).fill(0);
    
    baseline.forEach(v => {
      const bin = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      baselineCounts[bin]++;
    });
    
    current.forEach(v => {
      const bin = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      currentCounts[bin]++;
    });
    
    let psi = 0;
    for (let i = 0; i < bins; i++) {
      const baselineProb = (baselineCounts[i] + 1) / (baseline.length + bins);
      const currentProb = (currentCounts[i] + 1) / (current.length + bins);
      psi += (currentProb - baselineProb) * Math.log(currentProb / baselineProb);
    }
    
    return psi;
  }

  private calculateKSStatistic(baseline: number[], current: number[]): number {
    // Kolmogorov-Smirnov statistic
    baseline.sort((a, b) => a - b);
    current.sort((a, b) => a - b);
    
    let maxDiff = 0;
    const allValues = [...baseline, ...current].sort((a, b) => a - b);
    
    for (const value of allValues) {
      const baselineCDF = baseline.filter(v => v <= value).length / baseline.length;
      const currentCDF = current.filter(v => v <= value).length / current.length;
      maxDiff = Math.max(maxDiff, Math.abs(baselineCDF - currentCDF));
    }
    
    return maxDiff;
  }

  private calculateWassersteinDistance(baseline: number[], current: number[]): number {
    // Simplified 1D Wasserstein distance
    baseline.sort((a, b) => a - b);
    current.sort((a, b) => a - b);
    
    let distance = 0;
    const n = Math.min(baseline.length, current.length);
    
    for (let i = 0; i < n; i++) {
      distance += Math.abs(baseline[i] - current[i]);
    }
    
    return distance / n;
  }

  private classifyDriftType(psi: number, ks: number, wasserstein: number): string {
    if (psi > 0.25) return 'CONCEPT_DRIFT';
    if (ks > 0.2) return 'DATA_DRIFT';
    if (wasserstein > 0.5) return 'PREDICTION_DRIFT';
    if (psi > 0.1 || ks > 0.1) return 'PERFORMANCE_DRIFT';
    return 'NO_DRIFT';
  }

  private calculateDriftSeverity(psi: number, ks: number): string {
    const maxMetric = Math.max(psi, ks);
    if (maxMetric < 0.1) return 'LOW';
    if (maxMetric < 0.25) return 'MEDIUM';
    if (maxMetric < 0.5) return 'HIGH';
    return 'CRITICAL';
  }

  private async getBaselineModelPath(): Promise<string> {
    // Get current production model path
    const productionDeployment = await this.prisma.modelDeployment.findFirst({
      where: {
        environment: 'PRODUCTION',
        status: 'DEPLOYED',
      },
      orderBy: { deployedAt: 'desc' },
    });
    
    return productionDeployment?.modelId || '/models/baseline/model.bin';
  }
}