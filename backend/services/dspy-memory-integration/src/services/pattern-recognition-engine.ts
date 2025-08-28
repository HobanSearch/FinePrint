/**
 * Pattern Recognition Engine - Identifies successful patterns in business outcomes
 * Uses statistical analysis and machine learning to discover optimization opportunities
 */

import { createServiceLogger } from '@fineprintai/shared-logger';
import { 
  BusinessOutcome, 
  BusinessDomain, 
  LearningPattern,
  PatternStatus,
  PatternDefinition,
  PatternConditions,
  PatternOutcomes,
  SuccessCriteria,
  BusinessMetrics,
  CrossDomainInsight
} from '../types/learning';
import * as stats from 'simple-statistics';

export interface PatternAnalysisResult {
  patternsDiscovered: LearningPattern[];
  patternsUpdated: LearningPattern[];
  patternsDeprecated: string[];
  crossDomainInsights: CrossDomainInsight[];
  analysisMetrics: {
    totalOutcomesAnalyzed: number;
    patternsEvaluated: number;
    newPatternsFound: number;
    confidenceDistribution: Record<string, number>;
  };
}

export interface PatternValidationResult {
  valid: boolean;
  confidence: number;
  sampleSize: number;
  performanceMetrics: Record<string, number>;
  issues: PatternIssue[];
  recommendations: string[];
}

export interface PatternIssue {
  type: 'low_confidence' | 'insufficient_data' | 'performance_decline' | 'context_drift';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  resolution: string;
}

export interface ContextualFeature {
  name: string;
  type: 'categorical' | 'numerical' | 'temporal' | 'textual';
  importance: number;
  correlation: number;
  stability: number;
  values: any[];
}

export class PatternRecognitionEngine {
  private logger = createServiceLogger('pattern-recognition-engine');
  
  // Pattern storage
  private patterns: Map<string, LearningPattern> = new Map();
  private patternPerformanceHistory: Map<string, PerformanceMetric[]> = new Map();
  
  // Analysis parameters
  private readonly MIN_PATTERN_SAMPLE_SIZE = 50;
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.7;
  private readonly CORRELATION_THRESHOLD = 0.3;
  private readonly STABILITY_THRESHOLD = 0.8;
  private readonly PATTERN_DECAY_DAYS = 90;

  // Feature extraction cache
  private featureCache: Map<string, ContextualFeature[]> = new Map();

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Pattern Recognition Engine...');
      
      // Load existing patterns if any
      await this.loadExistingPatterns();
      
      this.logger.info('Pattern Recognition Engine initialized successfully', {
        existingPatterns: this.patterns.size,
      });

    } catch (error) {
      this.logger.error('Failed to initialize Pattern Recognition Engine', { error });
      throw error;
    }
  }

  private async loadExistingPatterns(): Promise<void> {
    // In a real implementation, this would load patterns from the memory service
    // For now, we'll start with an empty pattern set
    this.logger.debug('Loading existing patterns from storage...');
  }

  /**
   * Analyze outcomes to discover and update patterns
   */
  async analyzeOutcomes(outcomes: BusinessOutcome[]): Promise<PatternAnalysisResult> {
    try {
      this.logger.info('Starting pattern analysis', { outcomeCount: outcomes.length });

      const result: PatternAnalysisResult = {
        patternsDiscovered: [],
        patternsUpdated: [],
        patternsDeprecated: [],
        crossDomainInsights: [],
        analysisMetrics: {
          totalOutcomesAnalyzed: outcomes.length,
          patternsEvaluated: this.patterns.size,
          newPatternsFound: 0,
          confidenceDistribution: {},
        },
      };

      if (outcomes.length === 0) {
        return result;
      }

      // Group outcomes by domain for analysis
      const outcomesByDomain = this.groupOutcomesByDomain(outcomes);

      // Analyze each domain
      for (const [domain, domainOutcomes] of outcomesByDomain) {
        const domainResult = await this.analyzeDomainOutcomes(domain, domainOutcomes);
        
        result.patternsDiscovered.push(...domainResult.discovered);
        result.patternsUpdated.push(...domainResult.updated);
        result.patternsDeprecated.push(...domainResult.deprecated);
      }

      // Update existing patterns with new data
      await this.updateExistingPatterns(outcomes);

      // Discover cross-domain insights
      result.crossDomainInsights = await this.discoverCrossDomainInsights(outcomes);

      // Calculate analysis metrics
      result.analysisMetrics.newPatternsFound = result.patternsDiscovered.length;
      result.analysisMetrics.confidenceDistribution = this.calculateConfidenceDistribution();

      this.logger.info('Pattern analysis completed', {
        discovered: result.patternsDiscovered.length,
        updated: result.patternsUpdated.length,
        deprecated: result.patternsDeprecated.length,
        crossDomainInsights: result.crossDomainInsights.length,
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to analyze outcomes for patterns', { error });
      throw error;
    }
  }

  private groupOutcomesByDomain(outcomes: BusinessOutcome[]): Map<BusinessDomain, BusinessOutcome[]> {
    const grouped = new Map<BusinessDomain, BusinessOutcome[]>();
    
    for (const outcome of outcomes) {
      if (!grouped.has(outcome.domain)) {
        grouped.set(outcome.domain, []);
      }
      grouped.get(outcome.domain)!.push(outcome);
    }

    return grouped;
  }

  private async analyzeDomainOutcomes(domain: BusinessDomain, outcomes: BusinessOutcome[]): Promise<{
    discovered: LearningPattern[];
    updated: LearningPattern[];
    deprecated: string[];
  }> {
    const result = {
      discovered: [] as LearningPattern[],
      updated: [] as LearningPattern[],
      deprecated: [] as string[],
    };

    if (outcomes.length < this.MIN_PATTERN_SAMPLE_SIZE) {
      this.logger.debug('Insufficient outcomes for pattern discovery', {
        domain,
        count: outcomes.length,
        required: this.MIN_PATTERN_SAMPLE_SIZE,
      });
      return result;
    }

    // Extract contextual features
    const features = await this.extractContextualFeatures(outcomes);
    this.featureCache.set(domain, features);

    // Discover success patterns
    const successPatterns = await this.discoverSuccessPatterns(domain, outcomes, features);
    result.discovered.push(...successPatterns);

    // Discover failure patterns (to avoid)
    const failurePatterns = await this.discoverFailurePatterns(domain, outcomes, features);
    result.discovered.push(...failurePatterns);

    // Check for pattern deprecation
    const deprecatedPatterns = await this.identifyDeprecatedPatterns(domain, outcomes);
    result.deprecated.push(...deprecatedPatterns);

    return result;
  }

  private async extractContextualFeatures(outcomes: BusinessOutcome[]): Promise<ContextualFeature[]> {
    const features: ContextualFeature[] = [];
    
    if (outcomes.length === 0) return features;

    // Get all unique context keys
    const contextKeys = new Set<string>();
    outcomes.forEach(outcome => {
      Object.keys(outcome.context).forEach(key => contextKeys.add(key));
    });

    // Analyze each context feature
    for (const key of contextKeys) {
      const feature = await this.analyzeContextualFeature(key, outcomes);
      if (feature.importance > 0.1) { // Only include features with meaningful importance
        features.push(feature);
      }
    }

    // Sort by importance
    features.sort((a, b) => b.importance - a.importance);

    return features;
  }

  private async analyzeContextualFeature(
    featureName: string, 
    outcomes: BusinessOutcome[]
  ): Promise<ContextualFeature> {
    const values = outcomes
      .map(outcome => outcome.context[featureName])
      .filter(value => value !== undefined && value !== null);

    const featureType = this.determineFeatureType(values);
    const importance = this.calculateFeatureImportance(featureName, outcomes);
    const correlation = this.calculateFeatureCorrelation(featureName, outcomes);
    const stability = this.calculateFeatureStability(featureName, outcomes);

    return {
      name: featureName,
      type: featureType,
      importance,
      correlation,
      stability,
      values: [...new Set(values)], // Unique values
    };
  }

  private determineFeatureType(values: any[]): 'categorical' | 'numerical' | 'temporal' | 'textual' {
    if (values.length === 0) return 'categorical';

    const sampleValue = values[0];
    
    if (typeof sampleValue === 'number') {
      return 'numerical';
    } else if (typeof sampleValue === 'string') {
      // Check if it's a date
      if (!isNaN(Date.parse(sampleValue))) {
        return 'temporal';
      }
      
      // Check if it's categorical (limited unique values)
      const uniqueValues = new Set(values).size;
      return uniqueValues <= 20 ? 'categorical' : 'textual';
    }
    
    return 'categorical';
  }

  private calculateFeatureImportance(featureName: string, outcomes: BusinessOutcome[]): number {
    // Calculate how much this feature affects success rates
    const featureGroups = new Map<any, { total: number; success: number }>();
    
    outcomes.forEach(outcome => {
      const value = outcome.context[featureName];
      if (value === undefined || value === null) return;

      if (!featureGroups.has(value)) {
        featureGroups.set(value, { total: 0, success: 0 });
      }

      const group = featureGroups.get(value)!;
      group.total += 1;
      if (outcome.success) {
        group.success += 1;
      }
    });

    if (featureGroups.size <= 1) return 0;

    // Calculate variance in success rates across feature values
    const successRates = Array.from(featureGroups.values())
      .filter(group => group.total >= 5) // Only consider groups with sufficient data
      .map(group => group.success / group.total);

    if (successRates.length <= 1) return 0;

    const meanSuccessRate = stats.mean(successRates);
    const variance = stats.variance(successRates);
    
    // Normalize importance based on variance and number of groups
    return Math.min(1, variance * featureGroups.size / 10);
  }

  private calculateFeatureCorrelation(featureName: string, outcomes: BusinessOutcome[]): number {
    // Calculate correlation between feature values and business metrics
    const pairs: { feature: number; metric: number }[] = [];

    outcomes.forEach(outcome => {
      const featureValue = outcome.context[featureName];
      if (featureValue === undefined || featureValue === null) return;

      // Convert feature value to numeric for correlation
      const numericFeature = this.convertToNumeric(featureValue);
      if (numericFeature === null) return;

      // Use primary business metric (accuracy or revenue)
      const metric = outcome.metrics.performance?.accuracy || 
                    (outcome.metrics.revenue?.amount ? Math.log(outcome.metrics.revenue.amount + 1) : null);
      
      if (metric !== null) {
        pairs.push({ feature: numericFeature, metric });
      }
    });

    if (pairs.length < 10) return 0;

    try {
      const xValues = pairs.map(p => p.feature);
      const yValues = pairs.map(p => p.metric);
      return Math.abs(stats.sampleCorrelation(xValues, yValues) || 0);
    } catch {
      return 0;
    }
  }

  private calculateFeatureStability(featureName: string, outcomes: BusinessOutcome[]): number {
    // Calculate how stable the feature values are over time
    if (outcomes.length < 20) return 0;

    // Sort outcomes by time
    const sortedOutcomes = outcomes
      .filter(o => o.context[featureName] !== undefined)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (sortedOutcomes.length < 20) return 0;

    // Split into time windows and check consistency
    const windowSize = Math.floor(sortedOutcomes.length / 4);
    const windows = [];
    
    for (let i = 0; i < 4; i++) {
      const start = i * windowSize;
      const end = i === 3 ? sortedOutcomes.length : (i + 1) * windowSize;
      windows.push(sortedOutcomes.slice(start, end));
    }

    // Calculate value distribution similarity across windows
    const distributions = windows.map(window => {
      const valueCount = new Map<any, number>();
      window.forEach(outcome => {
        const value = outcome.context[featureName];
        valueCount.set(value, (valueCount.get(value) || 0) + 1);
      });
      return valueCount;
    });

    // Calculate average similarity between distributions
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < distributions.length; i++) {
      for (let j = i + 1; j < distributions.length; j++) {
        totalSimilarity += this.calculateDistributionSimilarity(distributions[i], distributions[j]);
        comparisons += 1;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private convertToNumeric(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
      // Try to parse as number
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
      
      // Hash string to number for categorical values
      return this.hashString(value) % 1000;
    }
    return null;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private calculateDistributionSimilarity(dist1: Map<any, number>, dist2: Map<any, number>): number {
    const allKeys = new Set([...dist1.keys(), ...dist2.keys()]);
    if (allKeys.size === 0) return 1;

    let totalCount1 = Array.from(dist1.values()).reduce((sum, count) => sum + count, 0);
    let totalCount2 = Array.from(dist2.values()).reduce((sum, count) => sum + count, 0);

    if (totalCount1 === 0 || totalCount2 === 0) return 0;

    let similarity = 0;
    for (const key of allKeys) {
      const prob1 = (dist1.get(key) || 0) / totalCount1;
      const prob2 = (dist2.get(key) || 0) / totalCount2;
      similarity += Math.min(prob1, prob2);
    }

    return similarity;
  }

  private async discoverSuccessPatterns(
    domain: BusinessDomain,
    outcomes: BusinessOutcome[],
    features: ContextualFeature[]
  ): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];
    const successfulOutcomes = outcomes.filter(outcome => outcome.success);

    if (successfulOutcomes.length < this.MIN_PATTERN_SAMPLE_SIZE) {
      return patterns;
    }

    // Group successful outcomes by important features
    const importantFeatures = features
      .filter(f => f.importance > 0.3)
      .slice(0, 5); // Top 5 most important features

    for (const feature of importantFeatures) {
      const featurePatterns = await this.discoverFeaturePatterns(
        domain,
        successfulOutcomes,
        feature,
        true // success patterns
      );
      patterns.push(...featurePatterns);
    }

    // Discover multi-feature patterns
    const multiFeaturePatterns = await this.discoverMultiFeaturePatterns(
      domain,
      successfulOutcomes,
      importantFeatures.slice(0, 3)
    );
    patterns.push(...multiFeaturePatterns);

    return patterns;
  }

  private async discoverFailurePatterns(
    domain: BusinessDomain,
    outcomes: BusinessOutcome[],
    features: ContextualFeature[]
  ): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];
    const failedOutcomes = outcomes.filter(outcome => !outcome.success);

    if (failedOutcomes.length < this.MIN_PATTERN_SAMPLE_SIZE) {
      return patterns;
    }

    // Focus on features that correlate with failure
    const riskFeatures = features
      .filter(f => f.correlation < -0.2) // Negative correlation with success
      .slice(0, 3);

    for (const feature of riskFeatures) {
      const featurePatterns = await this.discoverFeaturePatterns(
        domain,
        failedOutcomes,
        feature,
        false // failure patterns
      );
      patterns.push(...featurePatterns);
    }

    return patterns;
  }

  private async discoverFeaturePatterns(
    domain: BusinessDomain,
    outcomes: BusinessOutcome[],
    feature: ContextualFeature,
    isSuccessPattern: boolean
  ): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];

    // Group outcomes by feature value
    const valueGroups = new Map<any, BusinessOutcome[]>();
    outcomes.forEach(outcome => {
      const value = outcome.context[feature.name];
      if (value !== undefined && value !== null) {
        if (!valueGroups.has(value)) {
          valueGroups.set(value, []);
        }
        valueGroups.get(value)!.push(outcome);
      }
    });

    // Create patterns for values with sufficient data
    for (const [value, groupOutcomes] of valueGroups) {
      if (groupOutcomes.length >= this.MIN_PATTERN_SAMPLE_SIZE) {
        const pattern = await this.createFeaturePattern(
          domain,
          feature,
          value,
          groupOutcomes,
          isSuccessPattern
        );
        
        if (pattern.confidence >= this.MIN_CONFIDENCE_THRESHOLD) {
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  private async createFeaturePattern(
    domain: BusinessDomain,
    feature: ContextualFeature,
    value: any,
    outcomes: BusinessOutcome[],
    isSuccessPattern: boolean
  ): Promise<LearningPattern> {
    const patternId = `pattern_${domain}_${feature.name}_${this.hashString(String(value))}_${Date.now()}`;
    
    const successCount = outcomes.filter(o => o.success).length;
    const successRate = successCount / outcomes.length;
    
    // Calculate average metrics
    const averageMetrics = this.calculateAverageBusinessMetrics(outcomes);
    
    // Calculate confidence based on sample size and consistency
    const confidence = this.calculatePatternConfidence(outcomes, successRate);

    const pattern: LearningPattern = {
      id: patternId,
      domain,
      pattern: {
        promptTemplate: '', // Would be extracted from actual prompts
        contextFeatures: [feature.name],
        parameterRanges: {},
        successCriteria: [
          {
            metric: 'success_rate',
            operator: isSuccessPattern ? 'gte' : 'lt',
            value: isSuccessPattern ? 0.8 : 0.5,
            weight: 1.0,
          },
        ],
      },
      conditions: {
        contextFilters: {
          [feature.name]: value,
        },
        minimumSampleSize: this.MIN_PATTERN_SAMPLE_SIZE,
      },
      outcomes: {
        averageMetrics,
        successRate,
        improvementOverBaseline: this.calculateBaselineImprovement(domain, successRate),
        costEffectiveness: this.calculateCostEffectiveness(averageMetrics),
        riskScore: isSuccessPattern ? 0.2 : 0.8,
        adaptabilityScore: feature.stability,
      },
      confidence,
      sampleSize: outcomes.length,
      createdAt: new Date(),
      lastUpdated: new Date(),
      status: confidence >= this.MIN_CONFIDENCE_THRESHOLD ? PatternStatus.VALIDATED : PatternStatus.LEARNING,
    };

    return pattern;
  }

  private calculateAverageBusinessMetrics(outcomes: BusinessOutcome[]): BusinessMetrics {
    if (outcomes.length === 0) return {};

    const metrics: BusinessMetrics = {};
    
    // Performance metrics
    const performanceValues = outcomes
      .map(o => o.metrics.performance)
      .filter(p => p);
    
    if (performanceValues.length > 0) {
      metrics.performance = {
        accuracy: stats.mean(performanceValues.map(p => p.accuracy || 0).filter(v => v > 0)),
        responseTime: stats.mean(performanceValues.map(p => p.responseTime || 0).filter(v => v > 0)),
        precision: stats.mean(performanceValues.map(p => p.precision || 0).filter(v => v > 0)),
        recall: stats.mean(performanceValues.map(p => p.recall || 0).filter(v => v > 0)),
        f1Score: stats.mean(performanceValues.map(p => p.f1Score || 0).filter(v => v > 0)),
      };
    }

    // Revenue metrics
    const revenueValues = outcomes
      .map(o => o.metrics.revenue)
      .filter(r => r && r.amount);
    
    if (revenueValues.length > 0) {
      metrics.revenue = {
        amount: stats.mean(revenueValues.map(r => r!.amount)),
        currency: revenueValues[0]!.currency || 'USD',
        conversionRate: stats.mean(revenueValues.map(r => r!.conversionRate || 0).filter(v => v > 0)),
        lifetimeValue: stats.mean(revenueValues.map(r => r!.lifetimeValue || 0).filter(v => v > 0)),
      };
    }

    // Satisfaction metrics
    const satisfactionValues = outcomes
      .map(o => o.metrics.satisfaction)
      .filter(s => s);
    
    if (satisfactionValues.length > 0) {
      metrics.satisfaction = {
        score: stats.mean(satisfactionValues.map(s => s!.score).filter(v => v > 0)),
        nps: stats.mean(satisfactionValues.map(s => s!.nps || 0).filter(v => v !== 0)),
        responseTime: stats.mean(satisfactionValues.map(s => s!.responseTime || 0).filter(v => v > 0)),
        resolutionRate: stats.mean(satisfactionValues.map(s => s!.resolutionRate || 0).filter(v => v > 0)),
      };
    }

    return metrics;
  }

  private calculatePatternConfidence(outcomes: BusinessOutcome[], successRate: number): number {
    const sampleSize = outcomes.length;
    const sampleSizeConfidence = Math.min(1, sampleSize / 100);
    
    // Calculate consistency (low variance in results)
    const outcomes_success = outcomes.map(o => o.success ? 1 : 0);
    const variance = stats.variance(outcomes_success);
    const consistencyScore = 1 - Math.min(1, variance * 4); // Scale variance to 0-1
    
    // Weight factors
    const weights = {
      sampleSize: 0.3,
      consistency: 0.4,
      successRate: 0.3,
    };

    return (
      sampleSizeConfidence * weights.sampleSize +
      consistencyScore * weights.consistency +
      successRate * weights.successRate
    );
  }

  private calculateBaselineImprovement(domain: BusinessDomain, patternSuccessRate: number): number {
    // Get domain baseline success rate (would normally come from historical data)
    const domainBaselines = {
      [BusinessDomain.LEGAL_ANALYSIS]: 0.75,
      [BusinessDomain.MARKETING_CONTENT]: 0.65,
      [BusinessDomain.SALES_COMMUNICATION]: 0.70,
      [BusinessDomain.CUSTOMER_SUPPORT]: 0.80,
      [BusinessDomain.PRODUCT_RECOMMENDATIONS]: 0.60,
      [BusinessDomain.PRICING_OPTIMIZATION]: 0.55,
      [BusinessDomain.RISK_ASSESSMENT]: 0.85,
      [BusinessDomain.COMPLIANCE_MONITORING]: 0.90,
    };

    const baseline = domainBaselines[domain] || 0.5;
    return (patternSuccessRate - baseline) / baseline;
  }

  private calculateCostEffectiveness(metrics: BusinessMetrics): number {
    let costEffectiveness = 1.0;

    // Factor in operational costs
    if (metrics.cost?.operationalCost) {
      costEffectiveness *= Math.max(0.1, 1 - (metrics.cost.operationalCost / 1000));
    }

    // Factor in compute costs
    if (metrics.cost?.computeCost) {
      costEffectiveness *= Math.max(0.1, 1 - (metrics.cost.computeCost / 100));
    }

    // Factor in human intervention requirement
    if (metrics.cost?.humanIntervention) {
      costEffectiveness *= 0.7;
    }

    return Math.max(0, Math.min(1, costEffectiveness));
  }

  private async discoverMultiFeaturePatterns(
    domain: BusinessDomain,
    outcomes: BusinessOutcome[],
    features: ContextualFeature[]
  ): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];

    if (features.length < 2) return patterns;

    // Try combinations of 2-3 features
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const pattern = await this.discoverTwoFeaturePattern(
          domain,
          outcomes,
          [features[i], features[j]]
        );
        if (pattern && pattern.confidence >= this.MIN_CONFIDENCE_THRESHOLD) {
          patterns.push(pattern);
        }

        // Try three-feature combinations if we have enough features
        if (j + 1 < features.length) {
          const threeFeaturePattern = await this.discoverThreeFeaturePattern(
            domain,
            outcomes,
            [features[i], features[j], features[j + 1]]
          );
          if (threeFeaturePattern && threeFeaturePattern.confidence >= this.MIN_CONFIDENCE_THRESHOLD) {
            patterns.push(threeFeaturePattern);
          }
        }
      }
    }

    return patterns;
  }

  private async discoverTwoFeaturePattern(
    domain: BusinessDomain,
    outcomes: BusinessOutcome[],
    features: [ContextualFeature, ContextualFeature]
  ): Promise<LearningPattern | null> {
    // Group outcomes by combinations of both feature values
    const combinationGroups = new Map<string, BusinessOutcome[]>();
    
    outcomes.forEach(outcome => {
      const value1 = outcome.context[features[0].name];
      const value2 = outcome.context[features[1].name];
      
      if (value1 !== undefined && value2 !== undefined) {
        const key = `${value1}|${value2}`;
        if (!combinationGroups.has(key)) {
          combinationGroups.set(key, []);
        }
        combinationGroups.get(key)!.push(outcome);
      }
    });

    // Find the best combination
    let bestCombination: { key: string; outcomes: BusinessOutcome[]; successRate: number } | null = null;
    
    for (const [key, groupOutcomes] of combinationGroups) {
      if (groupOutcomes.length >= this.MIN_PATTERN_SAMPLE_SIZE) {
        const successRate = groupOutcomes.filter(o => o.success).length / groupOutcomes.length;
        
        if (!bestCombination || successRate > bestCombination.successRate) {
          bestCombination = { key, outcomes: groupOutcomes, successRate };
        }
      }
    }

    if (!bestCombination) return null;

    // Create pattern for best combination
    const [value1, value2] = bestCombination.key.split('|');
    const patternId = `pattern_${domain}_multi_${features[0].name}_${features[1].name}_${Date.now()}`;
    
    const averageMetrics = this.calculateAverageBusinessMetrics(bestCombination.outcomes);
    const confidence = this.calculatePatternConfidence(bestCombination.outcomes, bestCombination.successRate);

    return {
      id: patternId,
      domain,
      pattern: {
        promptTemplate: '',
        contextFeatures: [features[0].name, features[1].name],
        parameterRanges: {},
        successCriteria: [
          {
            metric: 'success_rate',
            operator: 'gte',
            value: 0.8,
            weight: 1.0,
          },
        ],
      },
      conditions: {
        contextFilters: {
          [features[0].name]: value1,
          [features[1].name]: value2,
        },
        minimumSampleSize: this.MIN_PATTERN_SAMPLE_SIZE,
      },
      outcomes: {
        averageMetrics,
        successRate: bestCombination.successRate,
        improvementOverBaseline: this.calculateBaselineImprovement(domain, bestCombination.successRate),
        costEffectiveness: this.calculateCostEffectiveness(averageMetrics),
        riskScore: 0.3,
        adaptabilityScore: (features[0].stability + features[1].stability) / 2,
      },
      confidence,
      sampleSize: bestCombination.outcomes.length,
      createdAt: new Date(),
      lastUpdated: new Date(),
      status: confidence >= this.MIN_CONFIDENCE_THRESHOLD ? PatternStatus.VALIDATED : PatternStatus.LEARNING,
    };
  }

  private async discoverThreeFeaturePattern(
    domain: BusinessDomain,
    outcomes: BusinessOutcome[],
    features: [ContextualFeature, ContextualFeature, ContextualFeature]
  ): Promise<LearningPattern | null> {
    // Similar to two-feature pattern but with three features
    // Implementation would be similar but more complex
    return null; // Simplified for now
  }

  private async updateExistingPatterns(outcomes: BusinessOutcome[]): Promise<void> {
    for (const [patternId, pattern] of this.patterns) {
      const relevantOutcomes = outcomes.filter(outcome => 
        this.outcomeMatchesPattern(outcome, pattern)
      );

      if (relevantOutcomes.length > 0) {
        await this.updatePatternWithNewOutcomes(pattern, relevantOutcomes);
      }
    }
  }

  private outcomeMatchesPattern(outcome: BusinessOutcome, pattern: LearningPattern): boolean {
    if (outcome.domain !== pattern.domain) return false;

    // Check if outcome context matches pattern conditions
    for (const [key, expectedValue] of Object.entries(pattern.conditions.contextFilters)) {
      if (outcome.context[key] !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  private async updatePatternWithNewOutcomes(
    pattern: LearningPattern, 
    newOutcomes: BusinessOutcome[]
  ): Promise<void> {
    const oldSampleSize = pattern.sampleSize;
    const newSampleSize = oldSampleSize + newOutcomes.length;
    
    // Update sample size
    pattern.sampleSize = newSampleSize;
    pattern.lastUpdated = new Date();

    // Update success rate using weighted average
    const newSuccessCount = newOutcomes.filter(o => o.success).length;
    const newSuccessRate = newSuccessCount / newOutcomes.length;
    
    pattern.outcomes.successRate = (
      (pattern.outcomes.successRate * oldSampleSize) + 
      (newSuccessRate * newOutcomes.length)
    ) / newSampleSize;

    // Update confidence
    pattern.confidence = this.calculatePatternConfidence(newOutcomes, pattern.outcomes.successRate);

    // Update status if needed
    if (pattern.confidence >= this.MIN_CONFIDENCE_THRESHOLD && newSampleSize >= this.MIN_PATTERN_SAMPLE_SIZE) {
      pattern.status = PatternStatus.VALIDATED;
    } else if (pattern.confidence < 0.5) {
      pattern.status = PatternStatus.DEPRECATED;
    }

    // Track performance history
    this.updatePatternPerformanceHistory(pattern.id, {
      timestamp: new Date(),
      confidence: pattern.confidence,
      successRate: pattern.outcomes.successRate,
      sampleSize: newSampleSize,
    });
  }

  private updatePatternPerformanceHistory(patternId: string, metric: PerformanceMetric): void {
    if (!this.patternPerformanceHistory.has(patternId)) {
      this.patternPerformanceHistory.set(patternId, []);
    }

    const history = this.patternPerformanceHistory.get(patternId)!;
    history.push(metric);

    // Keep only last 100 entries
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  private async identifyDeprecatedPatterns(
    domain: BusinessDomain, 
    recentOutcomes: BusinessOutcome[]
  ): Promise<string[]> {
    const deprecated: string[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.PATTERN_DECAY_DAYS);

    for (const [patternId, pattern] of this.patterns) {
      if (pattern.domain !== domain) continue;

      // Check if pattern is old and not recently validated
      if (pattern.lastUpdated < cutoffDate) {
        deprecated.push(patternId);
        continue;
      }

      // Check if pattern performance has declined
      const history = this.patternPerformanceHistory.get(patternId);
      if (history && history.length >= 10) {
        const recentPerformance = history.slice(-5).map(h => h.successRate);
        const olderPerformance = history.slice(-10, -5).map(h => h.successRate);
        
        const recentAvg = stats.mean(recentPerformance);
        const olderAvg = stats.mean(olderPerformance);
        
        if (recentAvg < olderAvg * 0.8) { // 20% decline
          deprecated.push(patternId);
        }
      }
    }

    // Mark patterns as deprecated
    deprecated.forEach(patternId => {
      const pattern = this.patterns.get(patternId);
      if (pattern) {
        pattern.status = PatternStatus.DEPRECATED;
      }
    });

    return deprecated;
  }

  private async discoverCrossDomainInsights(outcomes: BusinessOutcome[]): Promise<CrossDomainInsight[]> {
    const insights: CrossDomainInsight[] = [];
    
    // Group outcomes by domain
    const domainOutcomes = this.groupOutcomesByDomain(outcomes);
    const domains = Array.from(domainOutcomes.keys());

    // Compare patterns across domains
    for (let i = 0; i < domains.length; i++) {
      for (let j = i + 1; j < domains.length; j++) {
        const sourceDomain = domains[i];
        const targetDomain = domains[j];
        
        const insight = await this.analyzeCrossDomainSimilarity(
          sourceDomain,
          targetDomain,
          domainOutcomes.get(sourceDomain)!,
          domainOutcomes.get(targetDomain)!
        );
        
        if (insight) {
          insights.push(insight);
        }
      }
    }

    return insights;
  }

  private async analyzeCrossDomainSimilarity(
    sourceDomain: BusinessDomain,
    targetDomain: BusinessDomain,
    sourceOutcomes: BusinessOutcome[],
    targetOutcomes: BusinessOutcome[]
  ): Promise<CrossDomainInsight | null> {
    // Analyze common successful patterns between domains
    const sourceFeatures = await this.extractContextualFeatures(sourceOutcomes);
    const targetFeatures = await this.extractContextualFeatures(targetOutcomes);

    // Find overlapping high-importance features
    const commonFeatures = sourceFeatures.filter(sourceFeature =>
      targetFeatures.some(targetFeature =>
        targetFeature.name === sourceFeature.name &&
        targetFeature.importance > 0.3 &&
        sourceFeature.importance > 0.3
      )
    );

    if (commonFeatures.length === 0) return null;

    // Calculate transferability score
    const applicability = this.calculateTransferApplicability(
      sourceOutcomes,
      targetOutcomes,
      commonFeatures
    );

    if (applicability < 0.5) return null;

    const insight: CrossDomainInsight = {
      id: `insight_${sourceDomain}_to_${targetDomain}_${Date.now()}`,
      sourcedomains: [sourceDomain],
      targetDomain,
      insight: `Successful patterns from ${sourceDomain} may be applicable to ${targetDomain}. Common success factors: ${commonFeatures.map(f => f.name).join(', ')}`,
      applicability,
      transferSuccess: 0, // Would be updated after application
      examples: commonFeatures.slice(0, 3).map(f => 
        `Feature '${f.name}' shows ${(f.importance * 100).toFixed(1)}% importance in both domains`
      ),
      createdAt: new Date(),
    };

    return insight;
  }

  private calculateTransferApplicability(
    sourceOutcomes: BusinessOutcome[],
    targetOutcomes: BusinessOutcome[],
    commonFeatures: ContextualFeature[]
  ): number {
    if (commonFeatures.length === 0) return 0;

    let applicabilityScore = 0;
    let featureCount = 0;

    for (const feature of commonFeatures) {
      // Check value overlap between domains
      const sourceValues = new Set(
        sourceOutcomes.map(o => o.context[feature.name]).filter(v => v !== undefined)
      );
      const targetValues = new Set(
        targetOutcomes.map(o => o.context[feature.name]).filter(v => v !== undefined)
      );

      const intersection = new Set([...sourceValues].filter(v => targetValues.has(v)));
      const union = new Set([...sourceValues, ...targetValues]);
      
      if (union.size > 0) {
        const overlap = intersection.size / union.size;
        applicabilityScore += overlap * feature.importance;
        featureCount += feature.importance;
      }
    }

    return featureCount > 0 ? applicabilityScore / featureCount : 0;
  }

  private calculateConfidenceDistribution(): Record<string, number> {
    const distribution = {
      'high': 0,    // >0.8
      'medium': 0,  // 0.5-0.8
      'low': 0,     // <0.5
    };

    for (const pattern of this.patterns.values()) {
      if (pattern.confidence > 0.8) {
        distribution.high += 1;
      } else if (pattern.confidence > 0.5) {
        distribution.medium += 1;
      } else {
        distribution.low += 1;
      }
    }

    return distribution;
  }

  /**
   * Update a specific pattern with a new outcome
   */
  async updatePattern(patternId: string, outcomeId: string): Promise<boolean> {
    try {
      const pattern = this.patterns.get(patternId);
      if (!pattern) {
        this.logger.warn('Pattern not found for update', { patternId });
        return false;
      }

      // In a real implementation, would fetch the outcome from storage
      this.logger.debug('Pattern updated with outcome', { patternId, outcomeId });
      return true;

    } catch (error) {
      this.logger.error('Failed to update pattern', { error, patternId, outcomeId });
      return false;
    }
  }

  /**
   * Validate a pattern's current performance
   */
  async validatePattern(patternId: string): Promise<PatternValidationResult> {
    try {
      const pattern = this.patterns.get(patternId);
      if (!pattern) {
        throw new Error(`Pattern not found: ${patternId}`);
      }

      const issues: PatternIssue[] = [];
      
      // Check confidence
      if (pattern.confidence < this.MIN_CONFIDENCE_THRESHOLD) {
        issues.push({
          type: 'low_confidence',
          severity: 'high',
          description: `Pattern confidence (${pattern.confidence.toFixed(2)}) below threshold (${this.MIN_CONFIDENCE_THRESHOLD})`,
          impact: 'Pattern may not be reliable for optimization',
          resolution: 'Collect more training data or adjust pattern criteria',
        });
      }

      // Check sample size
      if (pattern.sampleSize < this.MIN_PATTERN_SAMPLE_SIZE) {
        issues.push({
          type: 'insufficient_data',
          severity: 'medium',
          description: `Sample size (${pattern.sampleSize}) below minimum (${this.MIN_PATTERN_SAMPLE_SIZE})`,
          impact: 'Pattern may not be statistically significant',
          resolution: 'Collect more training examples',
        });
      }

      // Check for performance decline
      const history = this.patternPerformanceHistory.get(patternId);
      if (history && history.length >= 5) {
        const recentPerformance = history.slice(-3).map(h => h.successRate);
        const avgRecent = stats.mean(recentPerformance);
        
        if (avgRecent < pattern.outcomes.successRate * 0.9) {
          issues.push({
            type: 'performance_decline',
            severity: 'high',
            description: 'Recent performance below pattern average',
            impact: 'Pattern effectiveness may be declining',
            resolution: 'Review pattern conditions and update criteria',
          });
        }
      }

      const valid = issues.filter(i => i.severity === 'high' || i.severity === 'critical').length === 0;
      
      const recommendations: string[] = [];
      if (!valid) {
        recommendations.push('Address high-severity issues before using pattern');
      }
      if (pattern.confidence < 0.9) {
        recommendations.push('Consider collecting more training data');
      }
      if (pattern.sampleSize < 100) {
        recommendations.push('Expand sample size for better statistical confidence');
      }

      return {
        valid,
        confidence: pattern.confidence,
        sampleSize: pattern.sampleSize,
        performanceMetrics: {
          successRate: pattern.outcomes.successRate,
          adaptabilityScore: pattern.outcomes.adaptabilityScore,
          riskScore: pattern.outcomes.riskScore,
        },
        issues,
        recommendations,
      };

    } catch (error) {
      this.logger.error('Failed to validate pattern', { error, patternId });
      throw error;
    }
  }

  /**
   * Get all validated patterns for a domain
   */
  getValidatedPatterns(domain: BusinessDomain): LearningPattern[] {
    return Array.from(this.patterns.values()).filter(pattern =>
      pattern.domain === domain && 
      pattern.status === PatternStatus.VALIDATED &&
      pattern.confidence >= this.MIN_CONFIDENCE_THRESHOLD
    );
  }

  /**
   * Get pattern performance history
   */
  getPatternHistory(patternId: string): PerformanceMetric[] {
    return this.patternPerformanceHistory.get(patternId) || [];
  }

  async healthCheck(): Promise<boolean> {
    return true; // Basic health check
  }
}

interface PerformanceMetric {
  timestamp: Date;
  confidence: number;
  successRate: number;
  sampleSize: number;
}