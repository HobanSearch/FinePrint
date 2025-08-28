/**
 * Statistical significance detection for A/B test winners
 * Implements multiple statistical tests for robust winner detection
 */

import * as stats from 'simple-statistics';
import { ContentVariant, PerformanceMetrics } from '../types';
import { logger } from '../utils/logger';

export class WinnerDetector {
  constructor(
    private readonly config: {
      minSampleSize: number;
      confidenceLevel: number;
      effectSizeThreshold: number;
      earlyStoppingEnabled: boolean;
    }
  ) {}

  /**
   * Detect if there's a statistically significant winner
   */
  async detectWinner(variants: ContentVariant[]): Promise<{
    winner: ContentVariant | null;
    confidence: number;
    pValue: number;
    canStop: boolean;
  }> {
    // Need at least 2 variants to compare
    if (variants.length < 2) {
      return { winner: null, confidence: 0, pValue: 1, canStop: false };
    }

    // Check sample size requirements
    const hasEnoughData = variants.every(
      v => v.performance.impressions >= this.config.minSampleSize
    );

    if (!hasEnoughData) {
      logger.debug({ 
        variants: variants.map(v => ({
          id: v.id,
          impressions: v.performance.impressions
        }))
      }, 'Insufficient sample size for winner detection');
      return { winner: null, confidence: 0, pValue: 1, canStop: false };
    }

    // Find control (baseline) and challengers
    const control = variants.find(v => v.variantId === 'control') || variants[0];
    const challengers = variants.filter(v => v.id !== control.id);

    let bestChallenger: ContentVariant | null = null;
    let bestPValue = 1;
    let bestConfidence = 0;

    // Compare each challenger against control
    for (const challenger of challengers) {
      const result = this.compareVariants(control, challenger);

      if (result.significant && result.pValue < bestPValue) {
        bestChallenger = challenger;
        bestPValue = result.pValue;
        bestConfidence = result.confidence;
      }
    }

    // Check if we have a winner
    if (bestChallenger && bestPValue < (1 - this.config.confidenceLevel)) {
      const effectSize = this.calculateEffectSize(control, bestChallenger);
      
      if (effectSize >= this.config.effectSizeThreshold) {
        logger.info({
          winner: bestChallenger.id,
          pValue: bestPValue,
          confidence: bestConfidence,
          effectSize
        }, 'Winner detected');

        return {
          winner: bestChallenger,
          confidence: bestConfidence,
          pValue: bestPValue,
          canStop: true
        };
      }
    }

    // Check for early stopping (futility)
    const canStop = this.config.earlyStoppingEnabled && 
                   this.checkFutility(variants);

    return {
      winner: null,
      confidence: bestConfidence,
      pValue: bestPValue,
      canStop
    };
  }

  /**
   * Compare two variants using Z-test for proportions
   */
  private compareVariants(
    control: ContentVariant,
    challenger: ContentVariant
  ): {
    significant: boolean;
    pValue: number;
    confidence: number;
    zScore: number;
  } {
    const n1 = control.performance.impressions;
    const n2 = challenger.performance.impressions;
    const x1 = control.performance.conversions;
    const x2 = challenger.performance.conversions;

    // Calculate conversion rates
    const p1 = x1 / n1;
    const p2 = x2 / n2;

    // Pooled proportion
    const pPooled = (x1 + x2) / (n1 + n2);

    // Standard error
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1/n1 + 1/n2));

    // Z-score
    const zScore = (p2 - p1) / se;

    // P-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    // Confidence interval
    const confidence = 1 - pValue;

    return {
      significant: pValue < (1 - this.config.confidenceLevel),
      pValue,
      confidence,
      zScore
    };
  }

  /**
   * Calculate effect size (Cohen's h) for practical significance
   */
  private calculateEffectSize(
    control: ContentVariant,
    challenger: ContentVariant
  ): number {
    const p1 = control.performance.conversionRate;
    const p2 = challenger.performance.conversionRate;

    // Cohen's h = 2 * arcsin(sqrt(p2)) - 2 * arcsin(sqrt(p1))
    const h = 2 * Math.asin(Math.sqrt(p2)) - 2 * Math.asin(Math.sqrt(p1));

    return Math.abs(h);
  }

  /**
   * Check if experiment should stop early due to futility
   */
  private checkFutility(variants: ContentVariant[]): boolean {
    // Calculate required sample size for detection
    const requiredSampleSize = this.calculateRequiredSampleSize(
      variants[0].performance.conversionRate,
      this.config.effectSizeThreshold
    );

    // Check if any variant is approaching sample size limit without showing improvement
    const maxImpressions = Math.max(...variants.map(v => v.performance.impressions));
    
    if (maxImpressions > requiredSampleSize * 0.8) {
      // Check if differences are minimal
      const rates = variants.map(v => v.performance.conversionRate);
      const maxDiff = Math.max(...rates) - Math.min(...rates);
      
      if (maxDiff < this.config.effectSizeThreshold * 0.5) {
        logger.info('Futility detected - stopping experiment early');
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate required sample size for detecting effect
   */
  private calculateRequiredSampleSize(
    baselineRate: number,
    minDetectableEffect: number
  ): number {
    const alpha = 1 - this.config.confidenceLevel;
    const beta = 0.2; // 80% power
    const zAlpha = this.normalQuantile(1 - alpha/2);
    const zBeta = this.normalQuantile(1 - beta);

    const p1 = baselineRate;
    const p2 = baselineRate + minDetectableEffect;
    const pBar = (p1 + p2) / 2;

    const n = Math.pow(zAlpha + zBeta, 2) * 
              (p1 * (1 - p1) + p2 * (1 - p2)) /
              Math.pow(p2 - p1, 2);

    return Math.ceil(n);
  }

  /**
   * Bayesian approach: Calculate probability of being best
   */
  calculateBayesianProbabilities(variants: ContentVariant[]): Map<string, number> {
    const probabilities = new Map<string, number>();
    const numSimulations = 10000;

    // Run Monte Carlo simulations
    const wins = new Map<string, number>();
    variants.forEach(v => wins.set(v.id, 0));

    for (let i = 0; i < numSimulations; i++) {
      let bestVariant = '';
      let bestValue = -Infinity;

      for (const variant of variants) {
        // Sample from Beta distribution
        const alpha = variant.performance.conversions + 1;
        const beta = variant.performance.impressions - variant.performance.conversions + 1;
        const sample = this.sampleBeta(alpha, beta);

        if (sample > bestValue) {
          bestValue = sample;
          bestVariant = variant.id;
        }
      }

      wins.set(bestVariant, (wins.get(bestVariant) || 0) + 1);
    }

    // Calculate probabilities
    for (const [id, winCount] of wins) {
      probabilities.set(id, winCount / numSimulations);
    }

    return probabilities;
  }

  /**
   * Sequential testing with alpha spending
   */
  sequentialTest(
    variants: ContentVariant[],
    informationFraction: number
  ): {
    canStop: boolean;
    decision: 'continue' | 'stop_success' | 'stop_futility';
  } {
    // O'Brien-Fleming boundaries
    const alpha = 1 - this.config.confidenceLevel;
    const zAlpha = this.normalQuantile(1 - alpha/2);
    
    // Adjust critical value based on information fraction
    const criticalValue = zAlpha / Math.sqrt(informationFraction);

    // Calculate test statistic
    const control = variants[0];
    const treatment = variants[1];
    
    if (!control || !treatment) {
      return { canStop: false, decision: 'continue' };
    }

    const result = this.compareVariants(control, treatment);

    if (Math.abs(result.zScore) > criticalValue) {
      return { canStop: true, decision: 'stop_success' };
    }

    // Futility boundary (simplified)
    if (informationFraction > 0.5 && Math.abs(result.zScore) < 0.5) {
      return { canStop: true, decision: 'stop_futility' };
    }

    return { canStop: false, decision: 'continue' };
  }

  /**
   * Normal CDF approximation
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    return x > 0 ? 1 - p : p;
  }

  /**
   * Normal quantile function (inverse CDF)
   */
  private normalQuantile(p: number): number {
    // Approximation using rational approximation
    const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
    const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
    const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
               0.0276438810333863, 0.0038405729373609, 0.0003951896511919,
               0.0000321767881768, 0.0000002888167364, 0.0000003960315187];

    const y = p - 0.5;
    
    if (Math.abs(y) < 0.42) {
      const z = y * y;
      return y * (((a[3] * z + a[2]) * z + a[1]) * z + a[0]) /
                ((((b[3] * z + b[2]) * z + b[1]) * z + b[0]) * z + 1);
    }

    const x = p < 0.5 ? p : 1 - p;
    const z = Math.sqrt(-Math.log(x));
    
    let q = c[0];
    for (let i = 1; i < 9; i++) {
      q = q * z + c[i];
    }
    
    return p < 0.5 ? -z + q : z - q;
  }

  /**
   * Sample from Beta distribution
   */
  private sampleBeta(alpha: number, beta: number): number {
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }

  /**
   * Sample from Gamma distribution
   */
  private sampleGamma(shape: number): number {
    // Simplified implementation
    let sum = 0;
    for (let i = 0; i < shape; i++) {
      sum -= Math.log(Math.random());
    }
    return sum;
  }
}