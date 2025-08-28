/**
 * Business Outcome Learning Engine - Learns from business results to optimize AI performance
 * Tracks revenue, customer satisfaction, conversion rates, and other business metrics
 */

import { createServiceLogger } from '@fineprintai/shared-logger';
import { 
  BusinessOutcome, 
  BusinessDomain, 
  BusinessMetrics,
  LearningPattern,
  PatternStatus,
  SuccessCriteria,
  PatternOutcomes,
  TrainingExample,
  TrainingSource 
} from '../types/learning';
import * as stats from 'simple-statistics';
import { mean, standardDeviation, correlation, regression } from 'ml-matrix';

export interface LearningResult {
  outcomeId: string;
  patternsAffected: string[];
  improvementDetected: boolean;
  confidenceChange: number;
  recommendations: string[];
  newInsights: BusinessInsight[];
  trainingExamplesGenerated: number;
}

export interface BusinessInsight {
  type: 'opportunity' | 'risk' | 'pattern' | 'anomaly';
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
  recommendations: string[];
  evidence: OutcomeEvidence[];
}

export interface OutcomeEvidence {
  outcomeId: string;
  metric: string;
  value: number;
  context: Record<string, any>;
  contribution: number;
}

export interface DomainLearningState {
  domain: BusinessDomain;
  totalOutcomes: number;
  successRate: number;
  averageMetrics: BusinessMetrics;
  trendAnalysis: TrendAnalysis;
  activePatterns: string[];
  lastOptimization: Date;
  performanceGains: PerformanceGain[];
}

export interface TrendAnalysis {
  direction: 'improving' | 'declining' | 'stable';
  strength: number; // 0-1
  confidence: number; // 0-1
  timeWindow: string;
  keyDrivers: string[];
  projectedMetrics: BusinessMetrics;
}

export interface PerformanceGain {
  metric: string;
  baseline: number;
  current: number;
  improvement: number;
  timeframe: string;
  significance: number;
}

export class BusinessOutcomeLearner {
  private logger = createServiceLogger('business-outcome-learner');
  
  // Domain-specific learning states
  private domainStates: Map<BusinessDomain, DomainLearningState> = new Map();
  
  // Pattern storage and analysis
  private patterns: Map<string, LearningPattern> = new Map();
  private outcomeHistory: BusinessOutcome[] = [];
  
  // Learning parameters
  private readonly MIN_SAMPLE_SIZE = 30;
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly CORRELATION_THRESHOLD = 0.3;
  private readonly TREND_ANALYSIS_WINDOW = 30; // days

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Business Outcome Learner...');
      
      // Initialize domain states for all business domains
      Object.values(BusinessDomain).forEach(domain => {
        this.initializeDomainState(domain);
      });

      this.logger.info('Business Outcome Learner initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Business Outcome Learner', { error });
      throw error;
    }
  }

  private initializeDomainState(domain: BusinessDomain): void {
    const initialState: DomainLearningState = {
      domain,
      totalOutcomes: 0,
      successRate: 0,
      averageMetrics: this.getDefaultMetrics(),
      trendAnalysis: {
        direction: 'stable',
        strength: 0,
        confidence: 0,
        timeWindow: '30d',
        keyDrivers: [],
        projectedMetrics: this.getDefaultMetrics(),
      },
      activePatterns: [],
      lastOptimization: new Date(0),
      performanceGains: [],
    };

    this.domainStates.set(domain, initialState);
  }

  private getDefaultMetrics(): BusinessMetrics {
    return {
      performance: {
        accuracy: 0.5,
        responseTime: 1000,
      },
      satisfaction: {
        score: 5,
      },
      cost: {
        operationalCost: 0,
        computeCost: 0,
        humanIntervention: false,
      },
    };
  }

  /**
   * Process a business outcome and extract learning insights
   */
  async processOutcome(outcome: BusinessOutcome): Promise<LearningResult> {
    try {
      this.logger.debug('Processing business outcome', {
        outcomeId: outcome.id,
        domain: outcome.domain,
        success: outcome.success,
      });

      // Add to history
      this.outcomeHistory.push(outcome);
      
      // Update domain state
      await this.updateDomainState(outcome);

      // Analyze patterns
      const patternsAffected = await this.analyzePatterns(outcome);

      // Detect improvements
      const improvementDetected = await this.detectImprovement(outcome);

      // Generate insights
      const newInsights = await this.generateInsights(outcome);

      // Create training examples if outcome was successful
      const trainingExamplesGenerated = outcome.success ? 
        await this.generateTrainingExamples(outcome) : 0;

      // Generate recommendations
      const recommendations = await this.generateRecommendations(outcome, newInsights);

      const result: LearningResult = {
        outcomeId: outcome.id,
        patternsAffected,
        improvementDetected,
        confidenceChange: this.calculateConfidenceChange(outcome),
        recommendations,
        newInsights,
        trainingExamplesGenerated,
      };

      this.logger.info('Outcome processed successfully', {
        outcomeId: outcome.id,
        patternsAffected: patternsAffected.length,
        improvementDetected,
        insightsGenerated: newInsights.length,
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to process business outcome', {
        error: error.message,
        outcomeId: outcome.id,
      });
      throw error;
    }
  }

  private async updateDomainState(outcome: BusinessOutcome): Promise<void> {
    const state = this.domainStates.get(outcome.domain);
    if (!state) return;

    // Update counters
    state.totalOutcomes += 1;
    state.successRate = this.calculateSuccessRate(outcome.domain);

    // Update average metrics using exponential moving average
    state.averageMetrics = this.updateAverageMetrics(state.averageMetrics, outcome.metrics);

    // Update trend analysis
    state.trendAnalysis = await this.updateTrendAnalysis(outcome.domain);

    // Update performance gains
    state.performanceGains = await this.calculatePerformanceGains(outcome.domain);

    this.domainStates.set(outcome.domain, state);
  }

  private calculateSuccessRate(domain: BusinessDomain): number {
    const domainOutcomes = this.outcomeHistory.filter(o => o.domain === domain);
    if (domainOutcomes.length === 0) return 0;

    const successCount = domainOutcomes.filter(o => o.success).length;
    return successCount / domainOutcomes.length;
  }

  private updateAverageMetrics(current: BusinessMetrics, new_metrics: BusinessMetrics): BusinessMetrics {
    const alpha = 0.1; // Smoothing factor for exponential moving average

    const updated: BusinessMetrics = { ...current };

    // Update performance metrics
    if (new_metrics.performance && current.performance) {
      updated.performance = {
        accuracy: this.ema(current.performance.accuracy || 0, new_metrics.performance.accuracy || 0, alpha),
        precision: this.ema(current.performance.precision || 0, new_metrics.performance.precision || 0, alpha),
        recall: this.ema(current.performance.recall || 0, new_metrics.performance.recall || 0, alpha),
        f1Score: this.ema(current.performance.f1Score || 0, new_metrics.performance.f1Score || 0, alpha),
        responseTime: this.ema(current.performance.responseTime || 0, new_metrics.performance.responseTime || 0, alpha),
      };
    }

    // Update satisfaction metrics
    if (new_metrics.satisfaction && current.satisfaction) {
      updated.satisfaction = {
        score: this.ema(current.satisfaction.score || 0, new_metrics.satisfaction.score || 0, alpha),
        nps: this.ema(current.satisfaction.nps || 0, new_metrics.satisfaction.nps || 0, alpha),
        responseTime: this.ema(current.satisfaction.responseTime || 0, new_metrics.satisfaction.responseTime || 0, alpha),
        resolutionRate: this.ema(current.satisfaction.resolutionRate || 0, new_metrics.satisfaction.resolutionRate || 0, alpha),
      };
    }

    // Update revenue metrics
    if (new_metrics.revenue && current.revenue) {
      updated.revenue = {
        amount: this.ema(current.revenue.amount || 0, new_metrics.revenue.amount || 0, alpha),
        currency: new_metrics.revenue.currency || current.revenue.currency || 'USD',
        conversionRate: this.ema(current.revenue.conversionRate || 0, new_metrics.revenue.conversionRate || 0, alpha),
        lifetimeValue: this.ema(current.revenue.lifetimeValue || 0, new_metrics.revenue.lifetimeValue || 0, alpha),
      };
    }

    return updated;
  }

  private ema(current: number, new_value: number, alpha: number): number {
    return alpha * new_value + (1 - alpha) * current;
  }

  private async updateTrendAnalysis(domain: BusinessDomain): Promise<TrendAnalysis> {
    const recentOutcomes = this.getRecentOutcomes(domain, this.TREND_ANALYSIS_WINDOW);
    
    if (recentOutcomes.length < this.MIN_SAMPLE_SIZE) {
      return {
        direction: 'stable',
        strength: 0,
        confidence: 0,
        timeWindow: `${this.TREND_ANALYSIS_WINDOW}d`,
        keyDrivers: [],
        projectedMetrics: this.getDefaultMetrics(),
      };
    }

    // Calculate trends for key metrics
    const successRateTrend = this.calculateMetricTrend(recentOutcomes, 'success');
    const accuracyTrend = this.calculateMetricTrend(recentOutcomes, 'performance.accuracy');
    const satisfactionTrend = this.calculateMetricTrend(recentOutcomes, 'satisfaction.score');
    const revenueTrend = this.calculateMetricTrend(recentOutcomes, 'revenue.amount');

    const trends = [successRateTrend, accuracyTrend, satisfactionTrend, revenueTrend];
    const avgSlope = stats.mean(trends.map(t => t.slope));
    const avgConfidence = stats.mean(trends.map(t => t.confidence));

    const direction = this.determineTrendDirection(avgSlope);
    const strength = Math.abs(avgSlope);

    // Identify key drivers
    const keyDrivers = trends
      .filter(t => Math.abs(t.slope) > this.CORRELATION_THRESHOLD)
      .map(t => t.metric)
      .slice(0, 3);

    // Project future metrics
    const projectedMetrics = this.projectFutureMetrics(domain, trends);

    return {
      direction,
      strength,
      confidence: avgConfidence,
      timeWindow: `${this.TREND_ANALYSIS_WINDOW}d`,
      keyDrivers,
      projectedMetrics,
    };
  }

  private getRecentOutcomes(domain: BusinessDomain, days: number): BusinessOutcome[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.outcomeHistory.filter(outcome =>
      outcome.domain === domain && outcome.timestamp >= cutoffDate
    );
  }

  private calculateMetricTrend(outcomes: BusinessOutcome[], metricPath: string): {
    metric: string;
    slope: number;
    confidence: number;
  } {
    const values = outcomes.map((outcome, index) => {
      const value = this.getNestedMetricValue(outcome, metricPath);
      return { x: index, y: value };
    }).filter(point => point.y !== null && point.y !== undefined);

    if (values.length < 3) {
      return { metric: metricPath, slope: 0, confidence: 0 };
    }

    const xValues = values.map(p => p.x);
    const yValues = values.map(p => p.y);

    try {
      const linearRegression = stats.linearRegression(values);
      const rSquared = stats.rSquared(values, linearRegression);
      
      return {
        metric: metricPath,
        slope: linearRegression.m,
        confidence: rSquared,
      };
    } catch (error) {
      return { metric: metricPath, slope: 0, confidence: 0 };
    }
  }

  private getNestedMetricValue(outcome: BusinessOutcome, path: string): number | null {
    if (path === 'success') {
      return outcome.success ? 1 : 0;
    }

    const parts = path.split('.');
    let current: any = outcome.metrics;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return null;
      }
    }

    return typeof current === 'number' ? current : null;
  }

  private determineTrendDirection(slope: number): 'improving' | 'declining' | 'stable' {
    if (Math.abs(slope) < 0.01) return 'stable';
    return slope > 0 ? 'improving' : 'declining';
  }

  private projectFutureMetrics(domain: BusinessDomain, trends: any[]): BusinessMetrics {
    const currentState = this.domainStates.get(domain);
    if (!currentState) return this.getDefaultMetrics();

    // Simple linear projection 30 days into the future
    const projectionPeriod = 30;
    const projected = { ...currentState.averageMetrics };

    trends.forEach(trend => {
      if (trend.confidence > 0.5) {
        const projectedChange = trend.slope * projectionPeriod;
        this.applyProjectedChange(projected, trend.metric, projectedChange);
      }
    });

    return projected;
  }

  private applyProjectedChange(metrics: BusinessMetrics, metricPath: string, change: number): void {
    const parts = metricPath.split('.');
    
    if (parts[0] === 'performance' && metrics.performance) {
      if (parts[1] === 'accuracy') {
        metrics.performance.accuracy = Math.max(0, Math.min(1, (metrics.performance.accuracy || 0) + change));
      }
    } else if (parts[0] === 'satisfaction' && metrics.satisfaction) {
      if (parts[1] === 'score') {
        metrics.satisfaction.score = Math.max(1, Math.min(10, (metrics.satisfaction.score || 0) + change));
      }
    } else if (parts[0] === 'revenue' && metrics.revenue) {
      if (parts[1] === 'amount') {
        metrics.revenue.amount = Math.max(0, (metrics.revenue.amount || 0) + change);
      }
    }
  }

  private async calculatePerformanceGains(domain: BusinessDomain): Promise<PerformanceGain[]> {
    const currentMetrics = this.domainStates.get(domain)?.averageMetrics;
    if (!currentMetrics) return [];

    // Get baseline metrics from 90 days ago
    const baselineDate = new Date();
    baselineDate.setDate(baselineDate.getDate() - 90);
    
    const baselineOutcomes = this.outcomeHistory.filter(outcome =>
      outcome.domain === domain && 
      outcome.timestamp >= baselineDate &&
      outcome.timestamp <= new Date(baselineDate.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days window
    );

    if (baselineOutcomes.length < 10) return [];

    const baselineMetrics = this.calculateAverageMetrics(baselineOutcomes);
    const gains: PerformanceGain[] = [];

    // Calculate gains for key metrics
    if (currentMetrics.performance?.accuracy && baselineMetrics.performance?.accuracy) {
      const baseline = baselineMetrics.performance.accuracy;
      const current = currentMetrics.performance.accuracy;
      const improvement = (current - baseline) / baseline;
      
      gains.push({
        metric: 'accuracy',
        baseline,
        current,
        improvement,
        timeframe: '90d',
        significance: this.calculateSignificance(domain, 'performance.accuracy', baseline, current),
      });
    }

    if (currentMetrics.satisfaction?.score && baselineMetrics.satisfaction?.score) {
      const baseline = baselineMetrics.satisfaction.score;
      const current = currentMetrics.satisfaction.score;
      const improvement = (current - baseline) / baseline;
      
      gains.push({
        metric: 'satisfaction',
        baseline,
        current,
        improvement,
        timeframe: '90d',
        significance: this.calculateSignificance(domain, 'satisfaction.score', baseline, current),
      });
    }

    return gains;
  }

  private calculateAverageMetrics(outcomes: BusinessOutcome[]): BusinessMetrics {
    if (outcomes.length === 0) return this.getDefaultMetrics();

    const summed = outcomes.reduce((acc, outcome) => {
      if (outcome.metrics.performance?.accuracy) {
        acc.performance.accuracy += outcome.metrics.performance.accuracy;
        acc.performance.count += 1;
      }
      if (outcome.metrics.satisfaction?.score) {
        acc.satisfaction.score += outcome.metrics.satisfaction.score;
        acc.satisfaction.count += 1;
      }
      return acc;
    }, {
      performance: { accuracy: 0, count: 0 },
      satisfaction: { score: 0, count: 0 },
    });

    return {
      performance: {
        accuracy: summed.performance.count > 0 ? summed.performance.accuracy / summed.performance.count : 0,
        responseTime: 0,
      },
      satisfaction: {
        score: summed.satisfaction.count > 0 ? summed.satisfaction.score / summed.satisfaction.count : 0,
      },
    };
  }

  private calculateSignificance(domain: BusinessDomain, metric: string, baseline: number, current: number): number {
    const outcomes = this.getRecentOutcomes(domain, 30);
    const values = outcomes.map(o => this.getNestedMetricValue(o, metric)).filter(v => v !== null) as number[];
    
    if (values.length < 10) return 0;

    const stdDev = stats.standardDeviation(values);
    const zScore = Math.abs(current - baseline) / stdDev;
    
    // Convert z-score to p-value approximation
    return Math.min(1, 2 * (1 - this.normalCDF(Math.abs(zScore))));
  }

  private normalCDF(x: number): number {
    return (1 + Math.sign(x) * Math.sqrt(1 - Math.exp(-2 * x * x / Math.PI))) / 2;
  }

  private async analyzePatterns(outcome: BusinessOutcome): Promise<string[]> {
    const affectedPatterns: string[] = [];

    // Find patterns that match this outcome's context
    for (const [patternId, pattern] of this.patterns) {
      if (pattern.domain === outcome.domain) {
        const matches = this.doesOutcomeMatchPattern(outcome, pattern);
        if (matches) {
          // Update pattern with new outcome
          await this.updatePatternWithOutcome(pattern, outcome);
          affectedPatterns.push(patternId);
        }
      }
    }

    // Try to discover new patterns
    if (outcome.success) {
      const newPattern = await this.tryDiscoverNewPattern(outcome);
      if (newPattern) {
        this.patterns.set(newPattern.id, newPattern);
        affectedPatterns.push(newPattern.id);
      }
    }

    return affectedPatterns;
  }

  private doesOutcomeMatchPattern(outcome: BusinessOutcome, pattern: LearningPattern): boolean {
    // Check if outcome context matches pattern conditions
    const contextFilters = pattern.conditions.contextFilters;
    
    for (const [key, expectedValue] of Object.entries(contextFilters)) {
      const actualValue = outcome.context[key as keyof typeof outcome.context];
      if (actualValue !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  private async updatePatternWithOutcome(pattern: LearningPattern, outcome: BusinessOutcome): Promise<void> {
    pattern.sampleSize += 1;
    pattern.lastUpdated = new Date();

    // Update pattern outcomes
    const alpha = 1 / pattern.sampleSize; // Learning rate decreases with more samples
    
    if (outcome.metrics.performance?.accuracy) {
      pattern.outcomes.averageMetrics.performance = pattern.outcomes.averageMetrics.performance || {};
      pattern.outcomes.averageMetrics.performance.accuracy = this.ema(
        pattern.outcomes.averageMetrics.performance.accuracy || 0,
        outcome.metrics.performance.accuracy,
        alpha
      );
    }

    // Update success rate
    const currentSuccessRate = pattern.outcomes.successRate;
    pattern.outcomes.successRate = this.ema(currentSuccessRate, outcome.success ? 1 : 0, alpha);

    // Update confidence based on sample size and consistency
    pattern.confidence = this.calculatePatternConfidence(pattern);

    // Update status based on performance
    if (pattern.confidence > this.CONFIDENCE_THRESHOLD && pattern.sampleSize >= this.MIN_SAMPLE_SIZE) {
      pattern.status = PatternStatus.VALIDATED;
    }
  }

  private calculatePatternConfidence(pattern: LearningPattern): number {
    // Confidence increases with sample size and decreases with variance
    const sampleSizeConfidence = Math.min(1, pattern.sampleSize / 100);
    const successRateConfidence = pattern.outcomes.successRate;
    
    // Combine factors
    return (sampleSizeConfidence * 0.3) + (successRateConfidence * 0.7);
  }

  private async tryDiscoverNewPattern(outcome: BusinessOutcome): Promise<LearningPattern | null> {
    // Look for similar successful outcomes to identify patterns
    const similarOutcomes = this.findSimilarOutcomes(outcome, 0.8);
    
    if (similarOutcomes.length >= this.MIN_SAMPLE_SIZE) {
      return this.createPatternFromOutcomes([outcome, ...similarOutcomes]);
    }

    return null;
  }

  private findSimilarOutcomes(targetOutcome: BusinessOutcome, similarityThreshold: number): BusinessOutcome[] {
    return this.outcomeHistory.filter(outcome => {
      if (outcome.domain !== targetOutcome.domain || !outcome.success) {
        return false;
      }

      const similarity = this.calculateOutcomeSimilarity(targetOutcome, outcome);
      return similarity >= similarityThreshold;
    });
  }

  private calculateOutcomeSimilarity(outcome1: BusinessOutcome, outcome2: BusinessOutcome): number {
    let similarity = 0;
    let factors = 0;

    // Context similarity
    const contextKeys = Object.keys(outcome1.context);
    const matchingContextKeys = contextKeys.filter(key => 
      outcome1.context[key] === outcome2.context[key]
    );
    similarity += (matchingContextKeys.length / contextKeys.length) * 0.4;
    factors += 0.4;

    // Metrics similarity
    if (outcome1.metrics.performance?.accuracy && outcome2.metrics.performance?.accuracy) {
      const accuracyDiff = Math.abs(outcome1.metrics.performance.accuracy - outcome2.metrics.performance.accuracy);
      similarity += (1 - accuracyDiff) * 0.3;
      factors += 0.3;
    }

    // Temporal similarity (outcomes close in time are more similar)
    const timeDiff = Math.abs(outcome1.timestamp.getTime() - outcome2.timestamp.getTime());
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    const temporalSimilarity = Math.max(0, 1 - (daysDiff / 30)); // 30-day window
    similarity += temporalSimilarity * 0.3;
    factors += 0.3;

    return factors > 0 ? similarity / factors : 0;
  }

  private createPatternFromOutcomes(outcomes: BusinessOutcome[]): LearningPattern {
    if (outcomes.length === 0) throw new Error('Cannot create pattern from empty outcomes');

    const firstOutcome = outcomes[0];
    const patternId = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract common context features
    const commonContext = this.extractCommonContext(outcomes);
    
    // Calculate average metrics
    const averageMetrics = this.calculateAverageMetrics(outcomes);
    
    // Calculate success rate
    const successCount = outcomes.filter(o => o.success).length;
    const successRate = successCount / outcomes.length;

    const pattern: LearningPattern = {
      id: patternId,
      domain: firstOutcome.domain,
      pattern: {
        promptTemplate: '', // Would need to extract from prompt data
        contextFeatures: Object.keys(commonContext),
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
        contextFilters: commonContext,
        minimumSampleSize: this.MIN_SAMPLE_SIZE,
      },
      outcomes: {
        averageMetrics,
        successRate,
        improvementOverBaseline: 0, // Would need baseline data
        costEffectiveness: 1.0,
        riskScore: 0.2,
        adaptabilityScore: 0.8,
      },
      confidence: this.calculatePatternConfidence({
        sampleSize: outcomes.length,
        outcomes: { successRate } as PatternOutcomes,
      } as LearningPattern),
      sampleSize: outcomes.length,
      createdAt: new Date(),
      lastUpdated: new Date(),
      status: PatternStatus.LEARNING,
    };

    return pattern;
  }

  private extractCommonContext(outcomes: BusinessOutcome[]): Record<string, any> {
    if (outcomes.length === 0) return {};

    const commonContext: Record<string, any> = {};
    const firstContext = outcomes[0].context;

    // Find context attributes that are common across all outcomes
    Object.keys(firstContext).forEach(key => {
      const firstValue = firstContext[key];
      const allMatch = outcomes.every(outcome => outcome.context[key] === firstValue);
      
      if (allMatch) {
        commonContext[key] = firstValue;
      }
    });

    return commonContext;
  }

  private async detectImprovement(outcome: BusinessOutcome): Promise<boolean> {
    const recentOutcomes = this.getRecentOutcomes(outcome.domain, 7);
    const olderOutcomes = this.outcomeHistory.filter(o => 
      o.domain === outcome.domain && 
      o.timestamp < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) &&
      o.timestamp >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    );

    if (recentOutcomes.length < 10 || olderOutcomes.length < 10) {
      return false;
    }

    const recentSuccessRate = recentOutcomes.filter(o => o.success).length / recentOutcomes.length;
    const olderSuccessRate = olderOutcomes.filter(o => o.success).length / olderOutcomes.length;

    const improvement = (recentSuccessRate - olderSuccessRate) / olderSuccessRate;
    return improvement > 0.1; // 10% improvement threshold
  }

  private calculateConfidenceChange(outcome: BusinessOutcome): number {
    // Calculate how this outcome affects overall confidence in the domain
    const domainState = this.domainStates.get(outcome.domain);
    if (!domainState) return 0;

    const beforeConfidence = domainState.successRate;
    const afterConfidence = this.calculateSuccessRate(outcome.domain);

    return afterConfidence - beforeConfidence;
  }

  private async generateInsights(outcome: BusinessOutcome): Promise<BusinessInsight[]> {
    const insights: BusinessInsight[] = [];

    // Revenue opportunity insights
    if (outcome.metrics.revenue?.amount && outcome.metrics.revenue.amount > 5000) {
      insights.push({
        type: 'opportunity',
        description: `High-value outcome detected in ${outcome.domain}. Consider scaling similar approaches.`,
        confidence: 0.8,
        impact: 'high',
        actionable: true,
        recommendations: [
          'Analyze the context that led to this high-value outcome',
          'Create training examples based on this successful interaction',
          'Test similar approaches in comparable contexts',
        ],
        evidence: [{
          outcomeId: outcome.id,
          metric: 'revenue',
          value: outcome.metrics.revenue.amount,
          context: outcome.context,
          contribution: 1.0,
        }],
      });
    }

    // Performance risk insights
    if (outcome.metrics.performance?.accuracy && outcome.metrics.performance.accuracy < 0.5) {
      insights.push({
        type: 'risk',
        description: `Low accuracy detected in ${outcome.domain}. Immediate optimization recommended.`,
        confidence: 0.9,
        impact: 'high',
        actionable: true,
        recommendations: [
          'Trigger emergency optimization for this domain',
          'Review recent training data quality',
          'Implement additional safety checks',
        ],
        evidence: [{
          outcomeId: outcome.id,
          metric: 'accuracy',
          value: outcome.metrics.performance.accuracy,
          context: outcome.context,
          contribution: 1.0,
        }],
      });
    }

    // Pattern insights
    const domainPatterns = Array.from(this.patterns.values()).filter(p => p.domain === outcome.domain);
    const strongPatterns = domainPatterns.filter(p => p.confidence > 0.8 && p.sampleSize > 50);
    
    if (strongPatterns.length > 0) {
      insights.push({
        type: 'pattern',
        description: `Strong patterns identified in ${outcome.domain}. Ready for production deployment.`,
        confidence: 0.85,
        impact: 'medium',
        actionable: true,
        recommendations: [
          'Deploy validated patterns to production',
          'Set up monitoring for pattern performance',
          'Create automated optimization schedules',
        ],
        evidence: strongPatterns.map(pattern => ({
          outcomeId: outcome.id,
          metric: 'pattern_confidence',
          value: pattern.confidence,
          context: { patternId: pattern.id },
          contribution: pattern.confidence,
        })),
      });
    }

    return insights;
  }

  private async generateTrainingExamples(outcome: BusinessOutcome): Promise<number> {
    if (!outcome.success) return 0;

    // Create high-quality training examples from successful outcomes
    const examples: TrainingExample[] = [];

    // Generate primary example
    const primaryExample: TrainingExample = {
      id: `example_${outcome.id}_primary`,
      domain: outcome.domain,
      input: {
        prompt: '', // Would need to extract from outcome
        context: outcome.context,
        parameters: {},
        expectedType: 'success',
      },
      output: {
        response: '', // Would need from outcome data
        confidence: outcome.confidence,
        processingTime: outcome.metrics.performance?.responseTime || 0,
        tokens: 0,
        cost: outcome.metrics.cost?.computeCost || 0,
      },
      outcome,
      qualityScore: this.calculateExampleQuality(outcome),
      relevanceScore: this.calculateExampleRelevance(outcome),
      timestamp: new Date(),
      source: TrainingSource.HISTORICAL_SUCCESS,
    };

    examples.push(primaryExample);

    // Generate variations if outcome quality is high
    if (this.calculateExampleQuality(outcome) > 0.8) {
      const variations = this.generateExampleVariations(primaryExample);
      examples.push(...variations);
    }

    // Store examples (would integrate with training data storage)
    this.logger.debug('Generated training examples', {
      outcomeId: outcome.id,
      exampleCount: examples.length,
      qualityScore: primaryExample.qualityScore,
    });

    return examples.length;
  }

  private calculateExampleQuality(outcome: BusinessOutcome): number {
    let quality = 0;
    let factors = 0;

    // Success factor
    quality += outcome.success ? 1 : 0;
    factors += 1;

    // Confidence factor
    quality += outcome.confidence;
    factors += 1;

    // Performance factor
    if (outcome.metrics.performance?.accuracy) {
      quality += outcome.metrics.performance.accuracy;
      factors += 1;
    }

    // Business value factor
    if (outcome.metrics.revenue?.amount) {
      const normalizedRevenue = Math.min(1, outcome.metrics.revenue.amount / 10000);
      quality += normalizedRevenue;
      factors += 1;
    }

    return factors > 0 ? quality / factors : 0;
  }

  private calculateExampleRelevance(outcome: BusinessOutcome): number {
    // Calculate how relevant this example is for future training
    const recency = this.calculateRecencyScore(outcome.timestamp);
    const domainImportance = this.getDomainImportanceScore(outcome.domain);
    const contextRichness = this.calculateContextRichness(outcome.context);

    return (recency * 0.3) + (domainImportance * 0.4) + (contextRichness * 0.3);
  }

  private calculateRecencyScore(timestamp: Date): number {
    const daysSince = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - (daysSince / 30)); // Decay over 30 days
  }

  private getDomainImportanceScore(domain: BusinessDomain): number {
    const importance = {
      [BusinessDomain.LEGAL_ANALYSIS]: 0.9,
      [BusinessDomain.PRICING_OPTIMIZATION]: 0.9,
      [BusinessDomain.SALES_COMMUNICATION]: 0.8,
      [BusinessDomain.CUSTOMER_SUPPORT]: 0.8,
      [BusinessDomain.MARKETING_CONTENT]: 0.7,
      [BusinessDomain.PRODUCT_RECOMMENDATIONS]: 0.7,
      [BusinessDomain.RISK_ASSESSMENT]: 0.8,
      [BusinessDomain.COMPLIANCE_MONITORING]: 0.8,
    };

    return importance[domain] || 0.5;
  }

  private calculateContextRichness(context: Record<string, any>): number {
    const keyCount = Object.keys(context).length;
    const valueCount = Object.values(context).filter(v => v != null && v !== '').length;
    
    return Math.min(1, (valueCount / Math.max(keyCount, 1)));
  }

  private generateExampleVariations(baseExample: TrainingExample): TrainingExample[] {
    const variations: TrainingExample[] = [];

    // Create slight context variations for robustness
    const contextVariations = this.generateContextVariations(baseExample.input.context);
    
    contextVariations.forEach((variation, index) => {
      const variationExample: TrainingExample = {
        ...baseExample,
        id: `${baseExample.id}_var_${index}`,
        input: {
          ...baseExample.input,
          context: variation,
        },
        qualityScore: baseExample.qualityScore * 0.9, // Slightly lower quality for variations
        source: TrainingSource.SYNTHETIC_GENERATION,
      };

      variations.push(variationExample);
    });

    return variations.slice(0, 3); // Limit to 3 variations
  }

  private generateContextVariations(context: Record<string, any>): Record<string, any>[] {
    const variations: Record<string, any>[] = [];

    // Time-based variations
    if (context.timeOfDay) {
      const timeVariations = ['morning', 'afternoon', 'evening'];
      timeVariations.forEach(time => {
        if (time !== context.timeOfDay) {
          variations.push({ ...context, timeOfDay: time });
        }
      });
    }

    // Customer segment variations
    if (context.customerSegment) {
      const segmentVariations = ['enterprise', 'smb', 'startup'];
      segmentVariations.forEach(segment => {
        if (segment !== context.customerSegment) {
          variations.push({ ...context, customerSegment: segment });
        }
      });
    }

    return variations.slice(0, 5); // Limit variations
  }

  private async generateRecommendations(outcome: BusinessOutcome, insights: BusinessInsight[]): Promise<string[]> {
    const recommendations: string[] = [];

    // Success-based recommendations
    if (outcome.success) {
      recommendations.push(`Scale successful approach used in outcome ${outcome.id}`);
      recommendations.push('Generate additional training examples from this successful pattern');
    } else {
      recommendations.push(`Investigate failure causes in outcome ${outcome.id}`);
      recommendations.push('Trigger optimization to address performance issues');
    }

    // Insight-based recommendations
    insights.forEach(insight => {
      if (insight.actionable) {
        recommendations.push(...insight.recommendations);
      }
    });

    // Domain-specific recommendations
    const domainState = this.domainStates.get(outcome.domain);
    if (domainState) {
      if (domainState.successRate < 0.7) {
        recommendations.push(`Urgent: ${outcome.domain} success rate below 70%. Consider emergency optimization.`);
      }
      
      if (domainState.trendAnalysis.direction === 'declining') {
        recommendations.push(`Trend alert: ${outcome.domain} performance declining. Review recent changes.`);
      }
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Get domain learning state
   */
  getDomainState(domain: BusinessDomain): DomainLearningState | undefined {
    return this.domainStates.get(domain);
  }

  /**
   * Get all learning patterns for a domain
   */
  getDomainPatterns(domain: BusinessDomain): LearningPattern[] {
    return Array.from(this.patterns.values()).filter(pattern => pattern.domain === domain);
  }

  /**
   * Get system-wide learning metrics
   */
  getSystemMetrics(): any {
    const allOutcomes = this.outcomeHistory;
    const totalOutcomes = allOutcomes.length;
    const overallSuccessRate = totalOutcomes > 0 ? 
      allOutcomes.filter(o => o.success).length / totalOutcomes : 0;

    const domainMetrics = Object.values(BusinessDomain).map(domain => {
      const state = this.domainStates.get(domain);
      return {
        domain,
        totalOutcomes: state?.totalOutcomes || 0,
        successRate: state?.successRate || 0,
        trendDirection: state?.trendAnalysis.direction || 'stable',
        activePatterns: state?.activePatterns.length || 0,
      };
    });

    return {
      totalOutcomes,
      overallSuccessRate,
      totalPatterns: this.patterns.size,
      validatedPatterns: Array.from(this.patterns.values()).filter(p => p.status === PatternStatus.VALIDATED).length,
      domainMetrics,
      lastUpdate: new Date(),
    };
  }

  async healthCheck(): Promise<boolean> {
    return true; // Basic health check - could be enhanced
  }
}