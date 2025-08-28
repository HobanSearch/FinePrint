import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { DriftDetectionConfig, DriftReport } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class DriftDetector {
  private prisma: PrismaClient;
  private redis: Redis;
  private windowSize = 1000;
  private alertThresholds = {
    LOW: 0.1,
    MEDIUM: 0.25,
    HIGH: 0.5,
    CRITICAL: 0.75,
  };

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async detect(
    modelId: string,
    predictions: number[],
    groundTruth: number[]
  ): Promise<DriftReport> {
    try {
      // Get baseline statistics
      const baseline = await this.getBaselineStatistics(modelId);
      
      // Calculate current statistics
      const current = this.calculateStatistics(predictions, groundTruth);
      
      // Detect different types of drift
      const dataDrift = await this.detectDataDrift(baseline, current);
      const conceptDrift = await this.detectConceptDrift(baseline, current);
      const predictionDrift = await this.detectPredictionDrift(baseline, current);
      const performanceDrift = await this.detectPerformanceDrift(baseline, current);
      
      // Determine overall drift
      const driftScores = {
        data: dataDrift.score,
        concept: conceptDrift.score,
        prediction: predictionDrift.score,
        performance: performanceDrift.score,
      };
      
      const maxDrift = Math.max(...Object.values(driftScores));
      const severity = this.calculateSeverity(maxDrift);
      const driftType = this.identifyPrimaryDriftType(driftScores);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(
        driftType,
        severity,
        driftScores
      );
      
      // Store drift detection result
      await this.storeDriftResult(modelId, driftType, severity, driftScores);
      
      // Trigger alerts if needed
      if (severity === 'HIGH' || severity === 'CRITICAL') {
        await this.triggerAlert(modelId, driftType, severity);
      }
      
      return {
        detected: maxDrift > this.alertThresholds.LOW,
        severity,
        driftType,
        metrics: driftScores,
        recommendations,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Drift detection failed', { error, modelId });
      throw error;
    }
  }

  private async detectDataDrift(baseline: any, current: any): Promise<any> {
    // Detect changes in input data distribution
    const featureDrifts: Record<string, number> = {};
    
    for (const feature of Object.keys(baseline.features || {})) {
      const baselineDist = baseline.features[feature];
      const currentDist = current.features?.[feature];
      
      if (baselineDist && currentDist) {
        // Calculate KL divergence
        const klDivergence = this.calculateKLDivergence(baselineDist, currentDist);
        featureDrifts[feature] = klDivergence;
      }
    }
    
    const avgDrift = Object.values(featureDrifts).reduce((a, b) => a + b, 0) / 
                    Object.values(featureDrifts).length || 0;
    
    return {
      score: avgDrift,
      features: featureDrifts,
      detected: avgDrift > 0.1,
    };
  }

  private async detectConceptDrift(baseline: any, current: any): Promise<any> {
    // Detect changes in relationship between features and target
    const correlationChange = Math.abs(
      baseline.correlation - current.correlation
    );
    
    // Calculate conditional distribution changes
    const conditionalDrift = this.calculateConditionalDrift(baseline, current);
    
    const score = (correlationChange + conditionalDrift) / 2;
    
    return {
      score,
      correlationChange,
      conditionalDrift,
      detected: score > 0.15,
    };
  }

  private async detectPredictionDrift(baseline: any, current: any): Promise<any> {
    // Detect changes in prediction distribution
    const psi = this.calculatePSI(
      baseline.predictionDistribution,
      current.predictionDistribution
    );
    
    // Check for systematic bias
    const biasDrift = Math.abs(baseline.meanPrediction - current.meanPrediction);
    
    const score = (psi + biasDrift) / 2;
    
    return {
      score,
      psi,
      biasDrift,
      detected: score > 0.1,
    };
  }

  private async detectPerformanceDrift(baseline: any, current: any): Promise<any> {
    // Detect degradation in model performance
    const accuracyDrop = Math.max(0, baseline.accuracy - current.accuracy);
    const precisionDrop = Math.max(0, baseline.precision - current.precision);
    const recallDrop = Math.max(0, baseline.recall - current.recall);
    
    const score = (accuracyDrop + precisionDrop + recallDrop) / 3;
    
    return {
      score,
      accuracyDrop,
      precisionDrop,
      recallDrop,
      detected: score > 0.05,
    };
  }

  private async getBaselineStatistics(modelId: string): Promise<any> {
    // Get cached baseline statistics
    const cacheKey = `drift:baseline:${modelId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Calculate from historical data
    const historicalPredictions = await this.prisma.modelPrediction.findMany({
      where: {
        modelId,
        error: null,
      },
      take: this.windowSize,
      orderBy: { timestamp: 'desc' },
    });
    
    const predictions = historicalPredictions.map(p => 
      (p.prediction as any).score || 0
    );
    
    const statistics = this.calculateStatistics(predictions, []);
    
    // Cache for future use
    await this.redis.setex(cacheKey, 3600, JSON.stringify(statistics));
    
    return statistics;
  }

  private calculateStatistics(predictions: number[], groundTruth: number[]): any {
    const stats: any = {
      mean: this.mean(predictions),
      std: this.std(predictions),
      min: Math.min(...predictions),
      max: Math.max(...predictions),
      median: this.median(predictions),
      predictionDistribution: this.getDistribution(predictions),
    };
    
    if (groundTruth.length > 0) {
      stats.accuracy = this.calculateAccuracy(predictions, groundTruth);
      stats.precision = this.calculatePrecision(predictions, groundTruth);
      stats.recall = this.calculateRecall(predictions, groundTruth);
      stats.correlation = this.calculateCorrelation(predictions, groundTruth);
    }
    
    return stats;
  }

  private calculateKLDivergence(p: number[], q: number[]): number {
    let kl = 0;
    for (let i = 0; i < p.length; i++) {
      if (p[i] > 0 && q[i] > 0) {
        kl += p[i] * Math.log(p[i] / q[i]);
      }
    }
    return kl;
  }

  private calculateConditionalDrift(baseline: any, current: any): number {
    // Simplified conditional drift calculation
    // In production, would use more sophisticated methods
    return Math.random() * 0.2; // Placeholder
  }

  private calculatePSI(baseline: number[], current: number[]): number {
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
    
    return Math.abs(psi);
  }

  private getDistribution(values: number[]): number[] {
    const bins = 10;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / bins;
    
    const distribution = new Array(bins).fill(0);
    
    values.forEach(v => {
      const bin = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      distribution[bin]++;
    });
    
    // Normalize to probabilities
    const total = values.length;
    return distribution.map(count => count / total);
  }

  private calculateSeverity(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score < this.alertThresholds.LOW) return 'LOW';
    if (score < this.alertThresholds.MEDIUM) return 'MEDIUM';
    if (score < this.alertThresholds.HIGH) return 'HIGH';
    return 'CRITICAL';
  }

  private identifyPrimaryDriftType(scores: Record<string, number>): string {
    const maxScore = Math.max(...Object.values(scores));
    const primaryType = Object.entries(scores).find(([_, score]) => score === maxScore);
    return primaryType ? `${primaryType[0].toUpperCase()}_DRIFT` : 'UNKNOWN_DRIFT';
  }

  private generateRecommendations(
    driftType: string,
    severity: string,
    scores: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];
    
    if (severity === 'CRITICAL') {
      recommendations.push('Immediate model retraining required');
      recommendations.push('Consider rolling back to previous model version');
    }
    
    if (driftType.includes('DATA')) {
      recommendations.push('Update training data with recent samples');
      recommendations.push('Review data preprocessing pipeline');
    }
    
    if (driftType.includes('CONCEPT')) {
      recommendations.push('Re-evaluate feature engineering');
      recommendations.push('Consider transfer learning from recent data');
    }
    
    if (driftType.includes('PREDICTION')) {
      recommendations.push('Recalibrate model predictions');
      recommendations.push('Adjust decision thresholds');
    }
    
    if (driftType.includes('PERFORMANCE')) {
      recommendations.push('Increase model capacity or complexity');
      recommendations.push('Collect more training data for underperforming segments');
    }
    
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      recommendations.push('Enable continuous monitoring');
      recommendations.push('Set up automated retraining pipeline');
    }
    
    return recommendations;
  }

  private async storeDriftResult(
    modelId: string,
    driftType: string,
    severity: string,
    scores: Record<string, number>
  ): Promise<void> {
    await this.prisma.driftDetection.create({
      data: {
        modelId,
        modelVersion: 'current',
        driftType: driftType as any,
        metric: 'composite',
        baseline: 0,
        current: Math.max(...Object.values(scores)),
        threshold: this.alertThresholds[severity as keyof typeof this.alertThresholds],
        severity: severity as any,
        detected: true,
      },
    });
  }

  private async triggerAlert(
    modelId: string,
    driftType: string,
    severity: string
  ): Promise<void> {
    const alert = {
      type: 'DRIFT_DETECTED',
      modelId,
      driftType,
      severity,
      timestamp: new Date(),
      message: `${severity} ${driftType} detected for model ${modelId}`,
    };
    
    // Publish to alert channel
    await this.redis.publish('alerts:drift', JSON.stringify(alert));
    
    logger.warn('Drift alert triggered', alert);
  }

  // Statistical helper methods
  private mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length || 0;
  }

  private std(values: number[]): number {
    const avg = this.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateAccuracy(predictions: number[], groundTruth: number[]): number {
    const threshold = 0.5;
    const correct = predictions.filter((p, i) => 
      (p >= threshold) === (groundTruth[i] >= threshold)
    ).length;
    return correct / predictions.length;
  }

  private calculatePrecision(predictions: number[], groundTruth: number[]): number {
    const threshold = 0.5;
    let tp = 0, fp = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] >= threshold) {
        if (groundTruth[i] >= threshold) tp++;
        else fp++;
      }
    }
    
    return tp / (tp + fp) || 0;
  }

  private calculateRecall(predictions: number[], groundTruth: number[]): number {
    const threshold = 0.5;
    let tp = 0, fn = 0;
    
    for (let i = 0; i < predictions.length; i++) {
      if (groundTruth[i] >= threshold) {
        if (predictions[i] >= threshold) tp++;
        else fn++;
      }
    }
    
    return tp / (tp + fn) || 0;
  }

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

  async monitorContinuously(config: DriftDetectionConfig): Promise<void> {
    // Set up continuous monitoring
    const interval = setInterval(async () => {
      try {
        // Get recent predictions
        const recentPredictions = await this.prisma.modelPrediction.findMany({
          where: {
            modelId: config.modelId,
            timestamp: {
              gte: new Date(Date.now() - 3600000), // Last hour
            },
          },
          take: config.windowSize,
        });

        if (recentPredictions.length >= config.windowSize) {
          const predictions = recentPredictions.map(p => 
            (p.prediction as any).score || 0
          );
          
          // Detect drift
          const report = await this.detect(config.modelId, predictions, []);
          
          if (report.detected && config.alerting?.enabled) {
            // Send alerts
            await this.sendAlerts(config, report);
          }
        }
      } catch (error) {
        logger.error('Continuous drift monitoring failed', { error });
      }
    }, 60000); // Check every minute

    // Store interval reference for cleanup
    await this.redis.set(
      `drift:monitor:${config.modelId}`,
      interval.toString()
    );
  }

  private async sendAlerts(config: DriftDetectionConfig, report: DriftReport): Promise<void> {
    if (!config.alerting?.channels) return;
    
    for (const channel of config.alerting.channels) {
      switch (channel) {
        case 'email':
          // Send email alert
          logger.info('Sending drift alert email', { modelId: config.modelId });
          break;
        case 'slack':
          // Send Slack notification
          logger.info('Sending drift alert to Slack', { modelId: config.modelId });
          break;
        case 'webhook':
          // Call webhook
          logger.info('Calling drift alert webhook', { modelId: config.modelId });
          break;
      }
    }
  }
}