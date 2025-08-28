// Statistical Analysis Engine - Core statistical testing and analysis

import { PrismaClient, Analysis, MetricEvent } from '@prisma/client';
import { Logger } from 'pino';
import * as ss from 'simple-statistics';
import jStat from 'jstat';
import { 
  AnalysisRequest,
  AnalysisResult,
  VariantStatistics,
  ComparisonResult,
  ConfidenceInterval,
  ExperimentRecommendation,
  PowerAnalysisResult,
  DiagnosticInfo,
  MetricType
} from '../types';

export class StatisticalEngine {
  private prisma: PrismaClient;
  private logger: Logger;

  constructor(prisma: PrismaClient, logger: Logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Perform statistical analysis on experiment data
   */
  async analyzeExperiment(request: AnalysisRequest): Promise<AnalysisResult> {
    this.logger.info({ request }, 'Performing statistical analysis');

    try {
      // Get experiment and variants
      const experiment = await this.prisma.experiment.findUnique({
        where: { id: request.experimentId },
        include: { variants: true }
      });

      if (!experiment) {
        throw new Error(`Experiment ${request.experimentId} not found`);
      }

      // Get metric data for each variant
      const variantData = await this.getVariantMetricData(
        request.experimentId,
        request.metricName,
        request.dateRange,
        request.segmentFilter
      );

      // Calculate statistics for each variant
      const control = experiment.variants.find(v => v.isControl);
      if (!control) {
        throw new Error('No control variant found');
      }

      const controlStats = await this.calculateVariantStatistics(
        control.id,
        variantData[control.id] || [],
        request.options
      );

      const treatmentStats: Record<string, VariantStatistics> = {};
      for (const variant of experiment.variants.filter(v => !v.isControl)) {
        treatmentStats[variant.name] = await this.calculateVariantStatistics(
          variant.id,
          variantData[variant.id] || [],
          request.options
        );
      }

      // Perform statistical comparison
      const comparison = await this.performComparison(
        controlStats,
        Object.values(treatmentStats)[0], // Primary treatment
        experiment.statisticalMethod,
        experiment.confidenceLevel
      );

      // Generate recommendation
      const recommendation = await this.generateRecommendation(
        experiment,
        controlStats,
        treatmentStats,
        comparison
      );

      // Perform diagnostics
      const diagnostics = await this.performDiagnostics(
        request.experimentId,
        variantData
      );

      // Store analysis results
      await this.storeAnalysisResults(
        request,
        controlStats,
        treatmentStats,
        comparison,
        recommendation
      );

      return {
        experimentId: request.experimentId,
        metricName: request.metricName,
        control: controlStats,
        treatments: treatmentStats,
        comparison,
        recommendation,
        diagnostics
      };

    } catch (error) {
      this.logger.error({ error, request }, 'Failed to analyze experiment');
      throw error;
    }
  }

  /**
   * Perform Bayesian analysis
   */
  async performBayesianAnalysis(
    experimentId: string,
    metricName: string,
    priorAlpha: number = 1,
    priorBeta: number = 1
  ): Promise<any> {
    this.logger.info({ experimentId, metricName }, 'Performing Bayesian analysis');

    const variantData = await this.getVariantMetricData(experimentId, metricName);
    const variants = await this.prisma.variant.findMany({
      where: { experimentId }
    });

    const results: any = {};

    for (const variant of variants) {
      const data = variantData[variant.id] || [];
      const conversions = data.filter(d => d > 0).length;
      const trials = data.length;

      // Update posterior parameters
      const posteriorAlpha = priorAlpha + conversions;
      const posteriorBeta = priorBeta + (trials - conversions);

      // Calculate posterior statistics
      const mean = posteriorAlpha / (posteriorAlpha + posteriorBeta);
      const variance = (posteriorAlpha * posteriorBeta) / 
        (Math.pow(posteriorAlpha + posteriorBeta, 2) * (posteriorAlpha + posteriorBeta + 1));

      // Calculate credible interval (95%)
      const credibleInterval = this.betaCredibleInterval(
        posteriorAlpha,
        posteriorBeta,
        0.95
      );

      results[variant.name] = {
        posteriorAlpha,
        posteriorBeta,
        mean,
        variance,
        credibleInterval,
        conversions,
        trials
      };
    }

    // Calculate probability of each variant being best
    const probabilities = await this.calculateWinningProbabilities(results);

    // Calculate expected loss
    const expectedLoss = await this.calculateExpectedLoss(results);

    return {
      variants: results,
      winningProbabilities: probabilities,
      expectedLoss
    };
  }

  /**
   * Perform sequential testing (for early stopping)
   */
  async performSequentialTest(
    experimentId: string,
    metricName: string,
    alpha: number = 0.05,
    beta: number = 0.2
  ): Promise<any> {
    this.logger.info({ experimentId, metricName }, 'Performing sequential test');

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const variantData = await this.getVariantMetricData(experimentId, metricName);
    const control = experiment.variants.find(v => v.isControl);
    const treatment = experiment.variants.find(v => !v.isControl);

    if (!control || !treatment) {
      throw new Error('Control and treatment variants required');
    }

    const controlData = variantData[control.id] || [];
    const treatmentData = variantData[treatment.id] || [];

    // Calculate sequential probability ratio test (SPRT)
    const sprtResult = this.calculateSPRT(
      controlData,
      treatmentData,
      alpha,
      beta,
      experiment.minimumEffect
    );

    return {
      testStatistic: sprtResult.likelihood,
      upperBound: sprtResult.upperBound,
      lowerBound: sprtResult.lowerBound,
      decision: sprtResult.decision,
      continueProbability: sprtResult.continueProbability
    };
  }

  /**
   * Calculate sample size requirements
   */
  async calculateSampleSize(
    baselineRate: number,
    minimumDetectableEffect: number,
    alpha: number = 0.05,
    power: number = 0.8,
    variants: number = 2
  ): Promise<number> {
    // Z-scores for alpha and beta
    const zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);
    const zBeta = jStat.normal.inv(power, 0, 1);

    // Calculate sample size per variant (for proportions)
    const p1 = baselineRate;
    const p2 = baselineRate * (1 + minimumDetectableEffect);
    const pBar = (p1 + p2) / 2;

    const n = Math.ceil(
      2 * Math.pow(zAlpha + zBeta, 2) * pBar * (1 - pBar) / 
      Math.pow(p2 - p1, 2)
    );

    return n * variants;
  }

  /**
   * Perform power analysis
   */
  async performPowerAnalysis(
    experimentId: string,
    metricName: string
  ): Promise<PowerAnalysisResult> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const currentSampleSize = experiment.currentSampleSize;
    const minimumEffect = experiment.minimumEffect;
    const alpha = 1 - experiment.confidenceLevel;

    // Estimate baseline rate from control
    const controlMetrics = await this.prisma.metricEvent.findMany({
      where: {
        experimentId,
        metricName,
        variant: { isControl: true }
      }
    });

    const baselineRate = controlMetrics.length > 0
      ? ss.mean(controlMetrics.map(m => m.metricValue))
      : 0.5;

    // Calculate actual power
    const actualPower = this.calculatePower(
      currentSampleSize,
      baselineRate,
      minimumEffect,
      alpha
    );

    // Calculate required sample size for target power
    const requiredSampleSize = await this.calculateSampleSize(
      baselineRate,
      minimumEffect,
      alpha,
      0.8
    );

    return {
      actualPower,
      requiredSampleSize,
      currentSampleSize,
      minimumDetectableEffect: minimumEffect
    };
  }

  // Private helper methods

  private async getVariantMetricData(
    experimentId: string,
    metricName: string,
    dateRange?: any,
    segmentFilter?: any
  ): Promise<Record<string, number[]>> {
    const where: any = {
      experimentId,
      metricName
    };

    if (dateRange) {
      where.timestamp = {
        gte: dateRange.start,
        lte: dateRange.end
      };
    }

    const metrics = await this.prisma.metricEvent.findMany({
      where,
      select: {
        variantId: true,
        metricValue: true,
        properties: true
      }
    });

    // Apply segment filter if provided
    let filteredMetrics = metrics;
    if (segmentFilter) {
      filteredMetrics = metrics.filter(m => 
        this.matchesSegmentFilter(m.properties as any, segmentFilter)
      );
    }

    // Group by variant
    const variantData: Record<string, number[]> = {};
    for (const metric of filteredMetrics) {
      if (metric.variantId) {
        if (!variantData[metric.variantId]) {
          variantData[metric.variantId] = [];
        }
        variantData[metric.variantId].push(metric.metricValue);
      }
    }

    return variantData;
  }

  private matchesSegmentFilter(properties: any, filter: any): boolean {
    // Implement segment filtering logic
    if (!properties || !filter) return true;
    
    const value = properties[filter.attribute];
    switch (filter.operator) {
      case 'equals':
        return value === filter.value;
      case 'contains':
        return String(value).includes(String(filter.value));
      case 'greater_than':
        return Number(value) > Number(filter.value);
      default:
        return true;
    }
  }

  private async calculateVariantStatistics(
    variantId: string,
    data: number[],
    options?: any
  ): Promise<VariantStatistics> {
    // Remove outliers if requested
    let cleanData = data;
    if (options?.includeOutliers === false && options?.outlierThreshold) {
      cleanData = this.removeOutliers(data, options.outlierThreshold);
    }

    if (cleanData.length === 0) {
      return {
        variantName: variantId,
        sampleSize: 0,
        mean: 0,
        variance: 0,
        standardError: 0,
        confidenceInterval: { lower: 0, upper: 0, level: 0.95 },
        percentiles: {}
      };
    }

    const mean = ss.mean(cleanData);
    const variance = ss.variance(cleanData);
    const standardError = Math.sqrt(variance / cleanData.length);

    // Calculate confidence interval
    const confidenceInterval = this.calculateConfidenceInterval(
      mean,
      standardError,
      cleanData.length,
      0.95
    );

    // Calculate percentiles
    const percentiles: Record<number, number> = {};
    [25, 50, 75, 90, 95, 99].forEach(p => {
      percentiles[p] = ss.quantile(cleanData, p / 100);
    });

    return {
      variantName: variantId,
      sampleSize: cleanData.length,
      mean,
      variance,
      standardError,
      confidenceInterval,
      percentiles
    };
  }

  private removeOutliers(data: number[], threshold: number): number[] {
    const q1 = ss.quantile(data, 0.25);
    const q3 = ss.quantile(data, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;
    
    return data.filter(d => d >= lowerBound && d <= upperBound);
  }

  private calculateConfidenceInterval(
    mean: number,
    standardError: number,
    sampleSize: number,
    level: number
  ): ConfidenceInterval {
    const alpha = 1 - level;
    const tValue = jStat.studentt.inv(1 - alpha / 2, sampleSize - 1);
    const margin = tValue * standardError;

    return {
      lower: mean - margin,
      upper: mean + margin,
      level
    };
  }

  private async performComparison(
    control: VariantStatistics,
    treatment: VariantStatistics,
    method: string,
    confidenceLevel: number
  ): Promise<ComparisonResult> {
    if (control.sampleSize === 0 || treatment.sampleSize === 0) {
      return {
        effectSize: 0,
        relativeEffect: 0,
        confidenceInterval: { lower: 0, upper: 0, level: confidenceLevel },
        statisticalSignificance: false,
        practicalSignificance: false
      };
    }

    // Calculate effect size
    const effectSize = treatment.mean - control.mean;
    const relativeEffect = control.mean > 0 ? effectSize / control.mean : 0;

    // Perform appropriate test based on method
    let pValue: number | undefined;
    let confidenceInterval: ConfidenceInterval;

    if (method === 'FREQUENTIST') {
      // Two-sample t-test
      const pooledVariance = ((control.sampleSize - 1) * control.variance + 
        (treatment.sampleSize - 1) * treatment.variance) / 
        (control.sampleSize + treatment.sampleSize - 2);
      
      const standardError = Math.sqrt(
        pooledVariance * (1 / control.sampleSize + 1 / treatment.sampleSize)
      );
      
      const tStatistic = effectSize / standardError;
      const df = control.sampleSize + treatment.sampleSize - 2;
      
      pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStatistic), df));
      
      confidenceInterval = this.calculateConfidenceInterval(
        effectSize,
        standardError,
        df + 1,
        confidenceLevel
      );
    } else {
      // For other methods, use appropriate calculations
      confidenceInterval = { lower: 0, upper: 0, level: confidenceLevel };
    }

    const statisticalSignificance = pValue !== undefined && pValue < (1 - confidenceLevel);
    const practicalSignificance = Math.abs(relativeEffect) > 0.05; // 5% threshold

    return {
      pValue,
      effectSize,
      relativeEffect,
      confidenceInterval,
      statisticalSignificance,
      practicalSignificance
    };
  }

  private async generateRecommendation(
    experiment: any,
    control: VariantStatistics,
    treatments: Record<string, VariantStatistics>,
    comparison: ComparisonResult
  ): Promise<ExperimentRecommendation> {
    // Check if we have enough data
    const totalSampleSize = control.sampleSize + 
      Object.values(treatments).reduce((sum, t) => sum + t.sampleSize, 0);
    
    if (totalSampleSize < (experiment.targetSampleSize || 100)) {
      const remainingDays = this.estimateRemainingDays(
        experiment.currentSampleSize,
        experiment.targetSampleSize,
        experiment.startDate
      );
      
      return {
        action: 'continue',
        confidence: 0.3,
        reason: 'Insufficient sample size',
        estimatedRemainingTime: remainingDays,
        requiredSampleSize: experiment.targetSampleSize
      };
    }

    // Check for statistical significance
    if (comparison.statisticalSignificance && comparison.practicalSignificance) {
      if (comparison.effectSize > 0) {
        return {
          action: 'stop_success',
          confidence: 0.95,
          reason: 'Treatment shows significant improvement',
          suggestedAllocation: { treatment: 1.0, control: 0.0 }
        };
      } else {
        return {
          action: 'stop_failure',
          confidence: 0.95,
          reason: 'Control performs better than treatment'
        };
      }
    }

    // Check if experiment has been running too long
    const daysSinceStart = experiment.startDate 
      ? (Date.now() - new Date(experiment.startDate).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    
    if (daysSinceStart > 90) {
      return {
        action: 'inconclusive',
        confidence: 0.5,
        reason: 'Experiment has been running for too long without conclusive results'
      };
    }

    return {
      action: 'continue',
      confidence: 0.7,
      reason: 'Continue collecting data for conclusive results',
      estimatedRemainingTime: this.estimateRemainingDays(
        experiment.currentSampleSize,
        experiment.targetSampleSize,
        experiment.startDate
      )
    };
  }

  private estimateRemainingDays(
    currentSampleSize: number,
    targetSampleSize: number,
    startDate: Date | null
  ): number {
    if (!startDate || currentSampleSize === 0) return 30;
    
    const daysSinceStart = (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
    const dailyRate = currentSampleSize / daysSinceStart;
    const remainingSamples = targetSampleSize - currentSampleSize;
    
    return Math.ceil(remainingSamples / dailyRate);
  }

  private async performDiagnostics(
    experimentId: string,
    variantData: Record<string, number[]>
  ): Promise<DiagnosticInfo> {
    // Check for sample ratio mismatch
    const srmCheck = await this.checkSampleRatioMismatch(experimentId);

    // Check for novelty effect (first week vs rest)
    const noveltyEffect = await this.checkNoveltyEffect(experimentId);

    // Check for weekday effect
    const weekdayEffect = await this.checkWeekdayEffect(experimentId);

    // Calculate outlier percentage
    const allData = Object.values(variantData).flat();
    const outlierPercentage = this.calculateOutlierPercentage(allData);

    // Perform power analysis
    const powerAnalysis = await this.performPowerAnalysis(
      experimentId,
      'primary_metric'
    );

    return {
      sampleRatioMismatch: srmCheck,
      noveltyEffect,
      weekdayEffect,
      outlierPercentage,
      powerAnalysis
    };
  }

  private async checkSampleRatioMismatch(experimentId: string): Promise<boolean> {
    const variants = await this.prisma.variant.findMany({
      where: { experimentId },
      include: {
        _count: {
          select: { assignments: true }
        }
      }
    });

    const total = variants.reduce((sum, v) => sum + v._count.assignments, 0);
    if (total === 0) return false;

    // Chi-square test
    let chiSquare = 0;
    for (const variant of variants) {
      const expected = total * variant.allocation;
      const observed = variant._count.assignments;
      if (expected > 0) {
        chiSquare += Math.pow(observed - expected, 2) / expected;
      }
    }

    // Critical value for p=0.001
    const criticalValue = 10.828;
    return chiSquare > criticalValue;
  }

  private async checkNoveltyEffect(experimentId: string): Promise<boolean> {
    // Check if first week performance differs significantly from rest
    const firstWeekMetrics = await this.prisma.metricEvent.findMany({
      where: {
        experimentId,
        timestamp: {
          lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    const laterMetrics = await this.prisma.metricEvent.findMany({
      where: {
        experimentId,
        timestamp: {
          gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    if (firstWeekMetrics.length === 0 || laterMetrics.length === 0) {
      return false;
    }

    const firstWeekMean = ss.mean(firstWeekMetrics.map(m => m.metricValue));
    const laterMean = ss.mean(laterMetrics.map(m => m.metricValue));
    
    return Math.abs(firstWeekMean - laterMean) / firstWeekMean > 0.1; // 10% difference
  }

  private async checkWeekdayEffect(experimentId: string): Promise<boolean> {
    // Check if weekday performance differs from weekend
    const metrics = await this.prisma.metricEvent.findMany({
      where: { experimentId }
    });

    const weekdayMetrics = metrics.filter(m => {
      const day = new Date(m.timestamp).getDay();
      return day >= 1 && day <= 5;
    });

    const weekendMetrics = metrics.filter(m => {
      const day = new Date(m.timestamp).getDay();
      return day === 0 || day === 6;
    });

    if (weekdayMetrics.length === 0 || weekendMetrics.length === 0) {
      return false;
    }

    const weekdayMean = ss.mean(weekdayMetrics.map(m => m.metricValue));
    const weekendMean = ss.mean(weekendMetrics.map(m => m.metricValue));
    
    return Math.abs(weekdayMean - weekendMean) / weekdayMean > 0.15; // 15% difference
  }

  private calculateOutlierPercentage(data: number[]): number {
    if (data.length === 0) return 0;
    
    const q1 = ss.quantile(data, 0.25);
    const q3 = ss.quantile(data, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    const outliers = data.filter(d => d < lowerBound || d > upperBound);
    return (outliers.length / data.length) * 100;
  }

  private betaCredibleInterval(
    alpha: number,
    beta: number,
    level: number
  ): ConfidenceInterval {
    const lower = jStat.beta.inv((1 - level) / 2, alpha, beta);
    const upper = jStat.beta.inv(1 - (1 - level) / 2, alpha, beta);
    
    return { lower, upper, level };
  }

  private async calculateWinningProbabilities(
    results: any
  ): Promise<Record<string, number>> {
    const simulations = 10000;
    const wins: Record<string, number> = {};
    
    // Initialize wins counter
    for (const variantName of Object.keys(results)) {
      wins[variantName] = 0;
    }

    // Monte Carlo simulation
    for (let i = 0; i < simulations; i++) {
      const samples: Record<string, number> = {};
      
      // Sample from each variant's posterior
      for (const [variantName, stats] of Object.entries(results)) {
        const s = stats as any;
        samples[variantName] = jStat.beta.sample(s.posteriorAlpha, s.posteriorBeta);
      }

      // Find winner
      const winner = Object.entries(samples).reduce((a, b) => 
        samples[a[0]] > samples[b[0]] ? a : b
      )[0];
      
      wins[winner]++;
    }

    // Calculate probabilities
    const probabilities: Record<string, number> = {};
    for (const [variantName, winCount] of Object.entries(wins)) {
      probabilities[variantName] = winCount / simulations;
    }

    return probabilities;
  }

  private async calculateExpectedLoss(results: any): Promise<Record<string, number>> {
    const expectedLoss: Record<string, number> = {};
    
    for (const variantName of Object.keys(results)) {
      // Calculate expected loss relative to best performing variant
      const maxMean = Math.max(...Object.values(results).map((r: any) => r.mean));
      const variantMean = results[variantName].mean;
      expectedLoss[variantName] = maxMean - variantMean;
    }

    return expectedLoss;
  }

  private calculateSPRT(
    controlData: number[],
    treatmentData: number[],
    alpha: number,
    beta: number,
    minimumEffect: number
  ): any {
    const n1 = controlData.length;
    const n2 = treatmentData.length;
    
    if (n1 === 0 || n2 === 0) {
      return {
        likelihood: 0,
        upperBound: Math.log((1 - beta) / alpha),
        lowerBound: Math.log(beta / (1 - alpha)),
        decision: 'continue',
        continueProbability: 1
      };
    }

    const p1 = controlData.filter(d => d > 0).length / n1;
    const p2 = treatmentData.filter(d => d > 0).length / n2;
    
    // Calculate likelihood ratio
    const likelihood = this.calculateLikelihoodRatio(p1, p2, n1, n2, minimumEffect);
    
    const upperBound = Math.log((1 - beta) / alpha);
    const lowerBound = Math.log(beta / (1 - alpha));
    
    let decision = 'continue';
    if (likelihood >= upperBound) {
      decision = 'reject_null';
    } else if (likelihood <= lowerBound) {
      decision = 'accept_null';
    }

    // Estimate continuation probability
    const continueProbability = 1 - Math.min(
      1,
      Math.max(0, (likelihood - lowerBound) / (upperBound - lowerBound))
    );

    return {
      likelihood,
      upperBound,
      lowerBound,
      decision,
      continueProbability
    };
  }

  private calculateLikelihoodRatio(
    p1: number,
    p2: number,
    n1: number,
    n2: number,
    delta: number
  ): number {
    // Log likelihood ratio for binomial data
    const nullLikelihood = n1 * Math.log(p1) + n2 * Math.log(p2);
    const altLikelihood = n1 * Math.log(p1) + n2 * Math.log(p1 + delta);
    
    return altLikelihood - nullLikelihood;
  }

  private calculatePower(
    sampleSize: number,
    baselineRate: number,
    minimumEffect: number,
    alpha: number
  ): number {
    // Simplified power calculation
    const zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);
    const effectSize = minimumEffect * Math.sqrt(sampleSize / 2);
    const power = jStat.normal.cdf(effectSize - zAlpha, 0, 1);
    
    return power;
  }

  private async storeAnalysisResults(
    request: AnalysisRequest,
    controlStats: VariantStatistics,
    treatmentStats: Record<string, VariantStatistics>,
    comparison: ComparisonResult,
    recommendation: ExperimentRecommendation
  ): Promise<void> {
    await this.prisma.analysis.create({
      data: {
        experimentId: request.experimentId,
        analysisType: request.analysisType,
        metricName: request.metricName,
        segmentFilter: request.segmentFilter || null,
        controlStats: controlStats as any,
        treatmentStats: treatmentStats as any,
        pValue: comparison.pValue,
        confidenceInterval: comparison.confidenceInterval as any,
        effectSize: comparison.effectSize,
        statisticalPower: 0.8, // Placeholder
        recommendation: recommendation.action,
        confidence: recommendation.confidence
      }
    });
  }
}