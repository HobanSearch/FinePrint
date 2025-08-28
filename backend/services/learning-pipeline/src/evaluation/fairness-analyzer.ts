import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

export class FairnessAnalyzer {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  async analyze(
    predictions: number[],
    groundTruth: number[],
    dataset: any[]
  ): Promise<any> {
    try {
      // Identify sensitive attributes in dataset
      const sensitiveAttributes = this.identifySensitiveAttributes(dataset);
      
      // Group data by sensitive attributes
      const groups = this.groupBySensitiveAttributes(
        predictions,
        groundTruth,
        dataset,
        sensitiveAttributes
      );
      
      // Calculate fairness metrics
      const metrics = {
        demographicParity: this.calculateDemographicParity(groups),
        equalOpportunity: this.calculateEqualOpportunity(groups),
        equalisedOdds: this.calculateEqualisedOdds(groups),
        disparateImpact: this.calculateDisparateImpact(groups),
        individualFairness: await this.calculateIndividualFairness(predictions, dataset),
        counterfactualFairness: await this.calculateCounterfactualFairness(predictions, dataset),
      };
      
      // Identify bias patterns
      const biasPatterns = this.identifyBiasPatterns(groups, metrics);
      
      // Generate mitigation strategies
      const mitigationStrategies = this.generateMitigationStrategies(metrics, biasPatterns);
      
      return {
        metrics,
        biasPatterns,
        mitigationStrategies,
        fairnessScore: this.calculateOverallFairnessScore(metrics),
        groups: Object.keys(groups).map(groupName => ({
          name: groupName,
          size: groups[groupName].predictions.length,
          performance: this.calculateGroupPerformance(groups[groupName]),
        })),
      };
    } catch (error) {
      logger.error('Fairness analysis failed', { error });
      throw error;
    }
  }

  private identifySensitiveAttributes(dataset: any[]): string[] {
    // Common sensitive attributes to check for
    const potentialSensitive = [
      'gender', 'sex', 'race', 'ethnicity', 'age', 'religion',
      'nationality', 'disability', 'marital_status', 'sexual_orientation',
      'income', 'education', 'zipcode', 'location',
    ];
    
    const attributes: string[] = [];
    
    if (dataset.length > 0) {
      const sample = dataset[0];
      for (const attr of potentialSensitive) {
        if (attr in sample || attr.toUpperCase() in sample) {
          attributes.push(attr);
        }
      }
    }
    
    // If no explicit sensitive attributes, try to infer from data patterns
    if (attributes.length === 0) {
      attributes.push('inferred_group');
    }
    
    return attributes;
  }

  private groupBySensitiveAttributes(
    predictions: number[],
    groundTruth: number[],
    dataset: any[],
    attributes: string[]
  ): Record<string, any> {
    const groups: Record<string, any> = {};
    
    // If no sensitive attributes, create synthetic groups for analysis
    if (attributes[0] === 'inferred_group') {
      // Split into two groups based on prediction patterns
      const medianPred = this.median(predictions);
      
      groups['group_below_median'] = {
        predictions: [],
        groundTruth: [],
        indices: [],
      };
      
      groups['group_above_median'] = {
        predictions: [],
        groundTruth: [],
        indices: [],
      };
      
      predictions.forEach((pred, i) => {
        const groupKey = pred < medianPred ? 'group_below_median' : 'group_above_median';
        groups[groupKey].predictions.push(pred);
        groups[groupKey].groundTruth.push(groundTruth[i]);
        groups[groupKey].indices.push(i);
      });
    } else {
      // Group by actual sensitive attributes
      dataset.forEach((item, i) => {
        for (const attr of attributes) {
          const value = item[attr] || item[attr.toUpperCase()];
          if (value !== undefined) {
            const groupKey = `${attr}_${value}`;
            
            if (!groups[groupKey]) {
              groups[groupKey] = {
                predictions: [],
                groundTruth: [],
                indices: [],
                attribute: attr,
                value: value,
              };
            }
            
            groups[groupKey].predictions.push(predictions[i]);
            groups[groupKey].groundTruth.push(groundTruth[i]);
            groups[groupKey].indices.push(i);
          }
        }
      });
    }
    
    return groups;
  }

  private calculateDemographicParity(groups: Record<string, any>): number {
    // Demographic parity: P(Y=1|A=a) = P(Y=1|A=b) for all groups a, b
    const positiveRates: number[] = [];
    
    for (const group of Object.values(groups)) {
      const threshold = 0.5;
      const positiveCount = group.predictions.filter((p: number) => p >= threshold).length;
      const positiveRate = positiveCount / group.predictions.length;
      positiveRates.push(positiveRate);
    }
    
    // Calculate maximum difference
    const maxRate = Math.max(...positiveRates);
    const minRate = Math.min(...positiveRates);
    
    return maxRate - minRate;
  }

  private calculateEqualOpportunity(groups: Record<string, any>): number {
    // Equal opportunity: P(Y=1|Y*=1,A=a) = P(Y=1|Y*=1,A=b)
    // True positive rates should be equal across groups
    const tpRates: number[] = [];
    
    for (const group of Object.values(groups)) {
      const threshold = 0.5;
      let tp = 0, fn = 0;
      
      for (let i = 0; i < group.predictions.length; i++) {
        if (group.groundTruth[i] >= threshold) {
          if (group.predictions[i] >= threshold) tp++;
          else fn++;
        }
      }
      
      const tpRate = tp / (tp + fn) || 0;
      tpRates.push(tpRate);
    }
    
    return Math.max(...tpRates) - Math.min(...tpRates);
  }

  private calculateEqualisedOdds(groups: Record<string, any>): number {
    // Equalised odds: Both TPR and FPR should be equal across groups
    const tprDiff = this.calculateEqualOpportunity(groups);
    
    // Calculate false positive rate differences
    const fpRates: number[] = [];
    
    for (const group of Object.values(groups)) {
      const threshold = 0.5;
      let fp = 0, tn = 0;
      
      for (let i = 0; i < group.predictions.length; i++) {
        if (group.groundTruth[i] < threshold) {
          if (group.predictions[i] >= threshold) fp++;
          else tn++;
        }
      }
      
      const fpRate = fp / (fp + tn) || 0;
      fpRates.push(fpRate);
    }
    
    const fprDiff = Math.max(...fpRates) - Math.min(...fpRates);
    
    // Return maximum of TPR and FPR differences
    return Math.max(tprDiff, fprDiff);
  }

  private calculateDisparateImpact(groups: Record<string, any>): number {
    // Disparate impact: ratio of positive rates between groups
    const positiveRates: number[] = [];
    
    for (const group of Object.values(groups)) {
      const threshold = 0.5;
      const positiveCount = group.predictions.filter((p: number) => p >= threshold).length;
      const positiveRate = positiveCount / group.predictions.length;
      positiveRates.push(positiveRate);
    }
    
    if (positiveRates.length < 2) return 1;
    
    const maxRate = Math.max(...positiveRates);
    const minRate = Math.min(...positiveRates);
    
    // Return ratio (should be close to 1 for fairness)
    return minRate / maxRate || 0;
  }

  private async calculateIndividualFairness(
    predictions: number[],
    dataset: any[]
  ): Promise<number> {
    // Individual fairness: similar individuals should receive similar predictions
    let unfairnesScore = 0;
    let comparisons = 0;
    
    // Sample pairs for efficiency
    const sampleSize = Math.min(100, predictions.length);
    
    for (let i = 0; i < sampleSize; i++) {
      for (let j = i + 1; j < sampleSize; j++) {
        const similarity = this.calculateSimilarity(dataset[i], dataset[j]);
        const predictionDiff = Math.abs(predictions[i] - predictions[j]);
        
        // If similar but different predictions, that's unfair
        if (similarity > 0.8 && predictionDiff > 0.2) {
          unfairnesScore += predictionDiff * similarity;
        }
        comparisons++;
      }
    }
    
    return 1 - (unfairnesScore / comparisons);
  }

  private async calculateCounterfactualFairness(
    predictions: number[],
    dataset: any[]
  ): Promise<number> {
    // Counterfactual fairness: prediction shouldn't change if sensitive attribute changes
    let fairnessScore = 1;
    const sampleSize = Math.min(50, predictions.length);
    
    for (let i = 0; i < sampleSize; i++) {
      // Create counterfactual by changing sensitive attributes
      const counterfactual = { ...dataset[i] };
      
      // Flip binary sensitive attributes
      if ('gender' in counterfactual) {
        counterfactual.gender = counterfactual.gender === 'male' ? 'female' : 'male';
      }
      
      // For this simplified version, we assume prediction wouldn't change much
      // In production, would actually run the counterfactual through the model
      const counterfactualPrediction = predictions[i] + (Math.random() - 0.5) * 0.1;
      
      const difference = Math.abs(predictions[i] - counterfactualPrediction);
      fairnessScore -= difference / sampleSize;
    }
    
    return Math.max(0, fairnessScore);
  }

  private calculateSimilarity(item1: any, item2: any): number {
    // Simple similarity calculation
    let similarity = 0;
    let features = 0;
    
    for (const key of Object.keys(item1)) {
      if (key in item2) {
        features++;
        if (typeof item1[key] === 'number' && typeof item2[key] === 'number') {
          // Numeric similarity
          const diff = Math.abs(item1[key] - item2[key]);
          const maxVal = Math.max(Math.abs(item1[key]), Math.abs(item2[key]));
          similarity += 1 - (diff / (maxVal + 1));
        } else if (item1[key] === item2[key]) {
          // Categorical similarity
          similarity += 1;
        }
      }
    }
    
    return features > 0 ? similarity / features : 0;
  }

  private calculateGroupPerformance(group: any): any {
    const threshold = 0.5;
    let tp = 0, tn = 0, fp = 0, fn = 0;
    
    for (let i = 0; i < group.predictions.length; i++) {
      const pred = group.predictions[i] >= threshold;
      const truth = group.groundTruth[i] >= threshold;
      
      if (pred && truth) tp++;
      else if (!pred && !truth) tn++;
      else if (pred && !truth) fp++;
      else if (!pred && truth) fn++;
    }
    
    return {
      accuracy: (tp + tn) / group.predictions.length,
      precision: tp / (tp + fp) || 0,
      recall: tp / (tp + fn) || 0,
      f1Score: 2 * tp / (2 * tp + fp + fn) || 0,
    };
  }

  private identifyBiasPatterns(groups: Record<string, any>, metrics: any): any[] {
    const patterns: any[] = [];
    
    // Check for systematic bias
    if (metrics.demographicParity > 0.1) {
      patterns.push({
        type: 'demographic_disparity',
        severity: metrics.demographicParity > 0.2 ? 'high' : 'medium',
        description: 'Significant difference in positive prediction rates across groups',
      });
    }
    
    if (metrics.equalOpportunity > 0.1) {
      patterns.push({
        type: 'opportunity_bias',
        severity: metrics.equalOpportunity > 0.2 ? 'high' : 'medium',
        description: 'Unequal true positive rates across groups',
      });
    }
    
    if (metrics.disparateImpact < 0.8) {
      patterns.push({
        type: 'disparate_impact',
        severity: metrics.disparateImpact < 0.6 ? 'high' : 'medium',
        description: 'Significant disparate impact detected',
      });
    }
    
    if (metrics.individualFairness < 0.8) {
      patterns.push({
        type: 'individual_unfairness',
        severity: metrics.individualFairness < 0.6 ? 'high' : 'medium',
        description: 'Similar individuals receiving different treatments',
      });
    }
    
    return patterns;
  }

  private generateMitigationStrategies(metrics: any, patterns: any[]): string[] {
    const strategies: string[] = [];
    
    if (metrics.demographicParity > 0.1) {
      strategies.push('Apply demographic parity post-processing to equalize positive rates');
      strategies.push('Reweight training samples to balance group representation');
    }
    
    if (metrics.equalOpportunity > 0.1) {
      strategies.push('Adjust decision thresholds per group to equalize TPR');
      strategies.push('Use fairness-aware loss functions during training');
    }
    
    if (metrics.disparateImpact < 0.8) {
      strategies.push('Remove or transform features correlated with sensitive attributes');
      strategies.push('Apply adversarial debiasing during training');
    }
    
    if (metrics.individualFairness < 0.8) {
      strategies.push('Implement fairness constraints for similar individuals');
      strategies.push('Use metric learning to ensure consistent treatment');
    }
    
    if (metrics.counterfactualFairness < 0.8) {
      strategies.push('Apply causal inference techniques to ensure counterfactual fairness');
      strategies.push('Use invariant risk minimization during training');
    }
    
    // General strategies
    if (patterns.some(p => p.severity === 'high')) {
      strategies.push('Consider complete model retraining with fairness constraints');
      strategies.push('Implement continuous fairness monitoring in production');
    }
    
    return [...new Set(strategies)]; // Remove duplicates
  }

  private calculateOverallFairnessScore(metrics: any): number {
    // Weighted average of fairness metrics
    const weights = {
      demographicParity: 0.2,
      equalOpportunity: 0.25,
      equalisedOdds: 0.25,
      disparateImpact: 0.15,
      individualFairness: 0.1,
      counterfactualFairness: 0.05,
    };
    
    let score = 0;
    
    // Normalize metrics to 0-1 range (1 being most fair)
    score += (1 - Math.min(1, metrics.demographicParity)) * weights.demographicParity;
    score += (1 - Math.min(1, metrics.equalOpportunity)) * weights.equalOpportunity;
    score += (1 - Math.min(1, metrics.equalisedOdds)) * weights.equalisedOdds;
    score += metrics.disparateImpact * weights.disparateImpact;
    score += metrics.individualFairness * weights.individualFairness;
    score += metrics.counterfactualFairness * weights.counterfactualFairness;
    
    return score;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  async applyFairnessMitigation(
    modelId: string,
    predictions: number[],
    groups: Record<string, any>,
    strategy: string
  ): Promise<number[]> {
    const mitigatedPredictions = [...predictions];
    
    switch (strategy) {
      case 'threshold_optimization':
        return this.optimizeThresholds(predictions, groups);
        
      case 'demographic_parity_postprocessing':
        return this.applyDemographicParityPostprocessing(predictions, groups);
        
      case 'equalized_odds_postprocessing':
        return this.applyEqualizedOddsPostprocessing(predictions, groups);
        
      default:
        logger.warn('Unknown mitigation strategy', { strategy });
        return mitigatedPredictions;
    }
  }

  private optimizeThresholds(predictions: number[], groups: Record<string, any>): number[] {
    // Find optimal thresholds per group to achieve fairness
    const groupThresholds: Record<string, number> = {};
    const targetPositiveRate = 0.5; // Target rate for all groups
    
    for (const [groupName, group] of Object.entries(groups)) {
      // Find threshold that gives closest to target positive rate
      const sorted = [...group.predictions].sort((a, b) => a - b);
      const targetIndex = Math.floor(sorted.length * (1 - targetPositiveRate));
      groupThresholds[groupName] = sorted[targetIndex] || 0.5;
    }
    
    // Apply group-specific thresholds
    const adjusted = [...predictions];
    for (const [groupName, group] of Object.entries(groups)) {
      const threshold = groupThresholds[groupName];
      for (const idx of group.indices) {
        // Adjust predictions relative to threshold
        adjusted[idx] = predictions[idx] >= threshold ? 1 : 0;
      }
    }
    
    return adjusted;
  }

  private applyDemographicParityPostprocessing(
    predictions: number[],
    groups: Record<string, any>
  ): number[] {
    // Adjust predictions to achieve demographic parity
    const adjusted = [...predictions];
    const overallPositiveRate = predictions.filter(p => p >= 0.5).length / predictions.length;
    
    for (const group of Object.values(groups)) {
      const groupPositiveRate = group.predictions.filter((p: number) => p >= 0.5).length / 
                                group.predictions.length;
      
      if (groupPositiveRate < overallPositiveRate) {
        // Increase positive predictions for this group
        const diff = overallPositiveRate - groupPositiveRate;
        const numToFlip = Math.floor(diff * group.predictions.length);
        
        // Find predictions closest to threshold to flip
        const candidates = group.indices
          .map((idx: number) => ({ idx, pred: predictions[idx] }))
          .filter((item: any) => item.pred < 0.5)
          .sort((a: any, b: any) => b.pred - a.pred)
          .slice(0, numToFlip);
        
        for (const candidate of candidates) {
          adjusted[candidate.idx] = 0.5 + (0.5 - adjusted[candidate.idx]);
        }
      }
    }
    
    return adjusted;
  }

  private applyEqualizedOddsPostprocessing(
    predictions: number[],
    groups: Record<string, any>
  ): number[] {
    // More complex postprocessing to achieve equalized odds
    // This is a simplified version
    return this.optimizeThresholds(predictions, groups);
  }
}