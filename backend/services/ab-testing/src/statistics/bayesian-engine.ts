// Bayesian Analysis Engine - Advanced Bayesian testing and decision making

import { Logger } from 'pino';
import jStat from 'jstat';
import { create, all } from 'mathjs';

const math = create(all);

export interface BayesianConfig {
  priorType: 'uniform' | 'beta' | 'normal' | 'gaussian' | 'custom';
  priorParams?: {
    alpha?: number;
    beta?: number;
    mean?: number;
    variance?: number;
  };
  numSimulations?: number;
  credibleIntervalLevel?: number;
  decisionThreshold?: number;
}

export interface BayesianResult {
  posteriorParams: any;
  posteriorMean: number;
  posteriorVariance: number;
  credibleInterval: {
    lower: number;
    upper: number;
    level: number;
  };
  probabilityOfImprovement: number;
  expectedImprovement: number;
  valueRemaining: number;
  recommendation: string;
}

export class BayesianEngine {
  private logger: Logger;
  private defaultSimulations = 10000;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Perform Bayesian A/B test for conversion rate optimization
   */
  async analyzeConversionRate(
    controlData: { successes: number; trials: number },
    treatmentData: { successes: number; trials: number },
    config: BayesianConfig = {}
  ): Promise<any> {
    this.logger.info('Performing Bayesian conversion rate analysis');

    // Set default prior (uniform/uninformative)
    const priorAlpha = config.priorParams?.alpha || 1;
    const priorBeta = config.priorParams?.beta || 1;

    // Calculate posterior parameters for control
    const controlPosterior = {
      alpha: priorAlpha + controlData.successes,
      beta: priorBeta + (controlData.trials - controlData.successes)
    };

    // Calculate posterior parameters for treatment
    const treatmentPosterior = {
      alpha: priorAlpha + treatmentData.successes,
      beta: priorBeta + (treatmentData.trials - treatmentData.successes)
    };

    // Calculate posterior statistics
    const controlStats = this.calculateBetaStatistics(controlPosterior);
    const treatmentStats = this.calculateBetaStatistics(treatmentPosterior);

    // Calculate probability that treatment is better
    const probTreatmentBetter = await this.calculateProbabilityOfSuperiority(
      treatmentPosterior,
      controlPosterior,
      config.numSimulations || this.defaultSimulations
    );

    // Calculate expected loss
    const expectedLoss = await this.calculateExpectedLoss(
      controlPosterior,
      treatmentPosterior,
      config.numSimulations || this.defaultSimulations
    );

    // Calculate value of information
    const valueOfInformation = await this.calculateValueOfInformation(
      controlPosterior,
      treatmentPosterior
    );

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      probTreatmentBetter,
      expectedLoss,
      valueOfInformation,
      config.decisionThreshold || 0.95
    );

    return {
      control: {
        posterior: controlPosterior,
        statistics: controlStats,
        rawData: controlData
      },
      treatment: {
        posterior: treatmentPosterior,
        statistics: treatmentStats,
        rawData: treatmentData
      },
      comparison: {
        probabilityTreatmentBetter: probTreatmentBetter,
        probabilityControlBetter: 1 - probTreatmentBetter,
        expectedLoss,
        valueOfInformation,
        riskRatio: treatmentStats.mean / controlStats.mean,
        absoluteDifference: treatmentStats.mean - controlStats.mean
      },
      recommendation
    };
  }

  /**
   * Perform Bayesian analysis for continuous metrics (revenue, time, etc.)
   */
  async analyzeContinuousMetric(
    controlData: number[],
    treatmentData: number[],
    config: BayesianConfig = {}
  ): Promise<any> {
    this.logger.info('Performing Bayesian continuous metric analysis');

    // Calculate summary statistics
    const controlStats = this.calculateSummaryStats(controlData);
    const treatmentStats = this.calculateSummaryStats(treatmentData);

    // Use conjugate prior for normal distribution (Normal-Inverse-Gamma)
    const controlPosterior = this.calculateNormalPosterior(
      controlData,
      config.priorParams
    );
    const treatmentPosterior = this.calculateNormalPosterior(
      treatmentData,
      config.priorParams
    );

    // Calculate probability of superiority using t-distribution
    const probTreatmentBetter = this.calculateNormalProbabilityOfSuperiority(
      treatmentPosterior,
      controlPosterior
    );

    // Calculate effect size with uncertainty
    const effectSize = await this.calculateBayesianEffectSize(
      controlPosterior,
      treatmentPosterior,
      config.numSimulations || this.defaultSimulations
    );

    // Calculate ROPE (Region of Practical Equivalence)
    const ropeAnalysis = this.analyzeROPE(
      effectSize.samples,
      config.priorParams?.mean || 0,
      0.1 // 10% ROPE by default
    );

    return {
      control: {
        summary: controlStats,
        posterior: controlPosterior
      },
      treatment: {
        summary: treatmentStats,
        posterior: treatmentPosterior
      },
      comparison: {
        probabilityTreatmentBetter: probTreatmentBetter,
        effectSize,
        ropeAnalysis
      },
      recommendation: this.generateContinuousRecommendation(
        probTreatmentBetter,
        ropeAnalysis
      )
    };
  }

  /**
   * Thompson Sampling for multi-armed bandits
   */
  async thompsonSampling(
    arms: Array<{ successes: number; failures: number; name: string }>,
    config: BayesianConfig = {}
  ): Promise<any> {
    const priorAlpha = config.priorParams?.alpha || 1;
    const priorBeta = config.priorParams?.beta || 1;

    // Calculate posterior for each arm
    const posteriors = arms.map(arm => ({
      name: arm.name,
      alpha: priorAlpha + arm.successes,
      beta: priorBeta + arm.failures
    }));

    // Sample from each posterior
    const samples = posteriors.map(post => ({
      name: post.name,
      sample: jStat.beta.sample(post.alpha, post.beta),
      mean: post.alpha / (post.alpha + post.beta),
      variance: (post.alpha * post.beta) / 
        (Math.pow(post.alpha + post.beta, 2) * (post.alpha + post.beta + 1))
    }));

    // Select best arm
    const bestArm = samples.reduce((best, current) => 
      current.sample > best.sample ? current : best
    );

    // Calculate selection probabilities
    const selectionProbabilities = await this.calculateSelectionProbabilities(
      posteriors,
      config.numSimulations || this.defaultSimulations
    );

    return {
      selectedArm: bestArm.name,
      armStatistics: samples,
      selectionProbabilities,
      posteriors
    };
  }

  /**
   * Bayesian optimization for hyperparameter tuning
   */
  async bayesianOptimization(
    observations: Array<{ params: Record<string, number>; value: number }>,
    paramBounds: Record<string, { min: number; max: number }>,
    acquisitionFunction: 'ei' | 'ucb' | 'poi' = 'ei'
  ): Promise<any> {
    this.logger.info('Performing Bayesian optimization');

    // Build Gaussian Process model
    const gp = this.buildGaussianProcess(observations);

    // Generate candidate points
    const candidates = this.generateCandidates(paramBounds, 100);

    // Evaluate acquisition function
    const acquisitionValues = candidates.map(candidate => {
      const prediction = this.gpPredict(gp, candidate);
      return {
        params: candidate,
        acquisition: this.evaluateAcquisition(
          prediction,
          acquisitionFunction,
          Math.max(...observations.map(o => o.value))
        )
      };
    });

    // Select next point to evaluate
    const nextPoint = acquisitionValues.reduce((best, current) =>
      current.acquisition > best.acquisition ? current : best
    );

    return {
      nextPoint: nextPoint.params,
      expectedImprovement: nextPoint.acquisition,
      model: gp,
      observations
    };
  }

  /**
   * Calculate Bayes Factor for model comparison
   */
  async calculateBayesFactor(
    data: number[],
    nullHypothesis: { mean: number; variance: number },
    alternativeHypothesis: { mean: number; variance: number }
  ): Promise<number> {
    // Calculate likelihood under null hypothesis
    const nullLikelihood = this.calculateLikelihood(data, nullHypothesis);

    // Calculate likelihood under alternative hypothesis
    const altLikelihood = this.calculateLikelihood(data, alternativeHypothesis);

    // Bayes Factor = P(data|H1) / P(data|H0)
    const bayesFactor = altLikelihood / nullLikelihood;

    return bayesFactor;
  }

  // Private helper methods

  private calculateBetaStatistics(params: { alpha: number; beta: number }): any {
    const mean = params.alpha / (params.alpha + params.beta);
    const variance = (params.alpha * params.beta) / 
      (Math.pow(params.alpha + params.beta, 2) * (params.alpha + params.beta + 1));
    
    const credibleInterval = this.calculateBetaCredibleInterval(
      params.alpha,
      params.beta,
      0.95
    );

    const mode = params.alpha > 1 && params.beta > 1
      ? (params.alpha - 1) / (params.alpha + params.beta - 2)
      : mean;

    return {
      mean,
      variance,
      standardDeviation: Math.sqrt(variance),
      mode,
      credibleInterval
    };
  }

  private calculateBetaCredibleInterval(
    alpha: number,
    beta: number,
    level: number
  ): any {
    const lower = jStat.beta.inv((1 - level) / 2, alpha, beta);
    const upper = jStat.beta.inv(1 - (1 - level) / 2, alpha, beta);
    
    return {
      lower,
      upper,
      level,
      width: upper - lower
    };
  }

  private async calculateProbabilityOfSuperiority(
    treatmentPosterior: { alpha: number; beta: number },
    controlPosterior: { alpha: number; beta: number },
    numSimulations: number
  ): Promise<number> {
    let treatmentWins = 0;

    for (let i = 0; i < numSimulations; i++) {
      const treatmentSample = jStat.beta.sample(
        treatmentPosterior.alpha,
        treatmentPosterior.beta
      );
      const controlSample = jStat.beta.sample(
        controlPosterior.alpha,
        controlPosterior.beta
      );

      if (treatmentSample > controlSample) {
        treatmentWins++;
      }
    }

    return treatmentWins / numSimulations;
  }

  private async calculateExpectedLoss(
    controlPosterior: { alpha: number; beta: number },
    treatmentPosterior: { alpha: number; beta: number },
    numSimulations: number
  ): Promise<{ control: number; treatment: number }> {
    const samples = {
      control: [] as number[],
      treatment: [] as number[]
    };

    // Generate samples
    for (let i = 0; i < numSimulations; i++) {
      samples.control.push(
        jStat.beta.sample(controlPosterior.alpha, controlPosterior.beta)
      );
      samples.treatment.push(
        jStat.beta.sample(treatmentPosterior.alpha, treatmentPosterior.beta)
      );
    }

    // Calculate expected loss for each variant
    const maxSamples = samples.control.map((c, i) => 
      Math.max(c, samples.treatment[i])
    );

    const controlLoss = maxSamples.reduce((sum, max, i) => 
      sum + (max - samples.control[i]), 0
    ) / numSimulations;

    const treatmentLoss = maxSamples.reduce((sum, max, i) => 
      sum + (max - samples.treatment[i]), 0
    ) / numSimulations;

    return {
      control: controlLoss,
      treatment: treatmentLoss
    };
  }

  private async calculateValueOfInformation(
    controlPosterior: { alpha: number; beta: number },
    treatmentPosterior: { alpha: number; beta: number }
  ): Promise<number> {
    // Expected value of perfect information
    const controlMean = controlPosterior.alpha / (controlPosterior.alpha + controlPosterior.beta);
    const treatmentMean = treatmentPosterior.alpha / (treatmentPosterior.alpha + treatmentPosterior.beta);
    
    const currentBest = Math.max(controlMean, treatmentMean);
    
    // Estimate uncertainty reduction from additional data
    const controlUncertainty = Math.sqrt(
      (controlPosterior.alpha * controlPosterior.beta) / 
      (Math.pow(controlPosterior.alpha + controlPosterior.beta, 2) * 
       (controlPosterior.alpha + controlPosterior.beta + 1))
    );
    
    const treatmentUncertainty = Math.sqrt(
      (treatmentPosterior.alpha * treatmentPosterior.beta) / 
      (Math.pow(treatmentPosterior.alpha + treatmentPosterior.beta, 2) * 
       (treatmentPosterior.alpha + treatmentPosterior.beta + 1))
    );

    const averageUncertainty = (controlUncertainty + treatmentUncertainty) / 2;
    
    return averageUncertainty * currentBest;
  }

  private generateRecommendation(
    probTreatmentBetter: number,
    expectedLoss: { control: number; treatment: number },
    valueOfInformation: number,
    threshold: number
  ): string {
    // Strong evidence for treatment
    if (probTreatmentBetter > threshold && expectedLoss.treatment < 0.01) {
      return 'STRONG_EVIDENCE_FOR_TREATMENT: Deploy treatment to all users';
    }

    // Strong evidence for control
    if (probTreatmentBetter < (1 - threshold) && expectedLoss.control < 0.01) {
      return 'STRONG_EVIDENCE_FOR_CONTROL: Keep control, discontinue treatment';
    }

    // Moderate evidence but high value of information
    if (valueOfInformation > 0.05) {
      return 'CONTINUE_EXPERIMENT: Value of additional information is high';
    }

    // Practical equivalence
    if (Math.abs(probTreatmentBetter - 0.5) < 0.1) {
      return 'PRACTICAL_EQUIVALENCE: Variants are practically equivalent';
    }

    return 'CONTINUE_MONITORING: Continue collecting data for more certainty';
  }

  private calculateSummaryStats(data: number[]): any {
    if (data.length === 0) {
      return {
        mean: 0,
        variance: 0,
        standardDeviation: 0,
        sampleSize: 0
      };
    }

    const mean = math.mean(data);
    const variance = math.variance(data, 'unbiased');
    const standardDeviation = math.std(data, 'unbiased');

    return {
      mean,
      variance,
      standardDeviation,
      sampleSize: data.length,
      min: math.min(data),
      max: math.max(data),
      median: math.median(data)
    };
  }

  private calculateNormalPosterior(
    data: number[],
    priorParams?: any
  ): any {
    // Using conjugate prior (Normal-Inverse-Gamma)
    const n = data.length;
    if (n === 0) {
      return {
        mean: priorParams?.mean || 0,
        variance: priorParams?.variance || 1,
        degreesOfFreedom: 1
      };
    }

    const sampleMean = math.mean(data);
    const sampleVariance = math.variance(data, 'unbiased');

    // Prior parameters
    const priorMean = priorParams?.mean || 0;
    const priorVariance = priorParams?.variance || 1;
    const priorN = 1; // Prior sample size

    // Posterior parameters
    const posteriorN = priorN + n;
    const posteriorMean = (priorN * priorMean + n * sampleMean) / posteriorN;
    const posteriorVariance = (priorN * priorVariance + n * sampleVariance + 
      (priorN * n / posteriorN) * Math.pow(sampleMean - priorMean, 2)) / posteriorN;

    return {
      mean: posteriorMean,
      variance: posteriorVariance,
      standardError: Math.sqrt(posteriorVariance / n),
      degreesOfFreedom: n - 1
    };
  }

  private calculateNormalProbabilityOfSuperiority(
    treatmentPosterior: any,
    controlPosterior: any
  ): number {
    // Difference distribution
    const diffMean = treatmentPosterior.mean - controlPosterior.mean;
    const diffVariance = treatmentPosterior.variance + controlPosterior.variance;
    const diffStd = Math.sqrt(diffVariance);

    // Probability that difference > 0
    const zScore = diffMean / diffStd;
    return jStat.normal.cdf(zScore, 0, 1);
  }

  private async calculateBayesianEffectSize(
    controlPosterior: any,
    treatmentPosterior: any,
    numSimulations: number
  ): Promise<any> {
    const samples = [];

    for (let i = 0; i < numSimulations; i++) {
      const controlSample = jStat.normal.sample(
        controlPosterior.mean,
        Math.sqrt(controlPosterior.variance)
      );
      const treatmentSample = jStat.normal.sample(
        treatmentPosterior.mean,
        Math.sqrt(treatmentPosterior.variance)
      );

      const effectSize = (treatmentSample - controlSample) / 
        Math.sqrt((controlPosterior.variance + treatmentPosterior.variance) / 2);
      
      samples.push(effectSize);
    }

    return {
      mean: math.mean(samples),
      standardDeviation: math.std(samples),
      credibleInterval: {
        lower: math.quantileSeq(samples, 0.025),
        upper: math.quantileSeq(samples, 0.975),
        level: 0.95
      },
      samples
    };
  }

  private analyzeROPE(
    effectSizeSamples: number[],
    nullValue: number,
    ropeWidth: number
  ): any {
    const ropeLower = nullValue - ropeWidth;
    const ropeUpper = nullValue + ropeWidth;

    const inROPE = effectSizeSamples.filter(s => 
      s >= ropeLower && s <= ropeUpper
    ).length;
    const belowROPE = effectSizeSamples.filter(s => s < ropeLower).length;
    const aboveROPE = effectSizeSamples.filter(s => s > ropeUpper).length;

    const total = effectSizeSamples.length;

    return {
      probabilityInROPE: inROPE / total,
      probabilityBelowROPE: belowROPE / total,
      probabilityAboveROPE: aboveROPE / total,
      decision: this.makeROPEDecision(inROPE / total, belowROPE / total, aboveROPE / total)
    };
  }

  private makeROPEDecision(pIn: number, pBelow: number, pAbove: number): string {
    if (pIn > 0.95) return 'ACCEPT_NULL';
    if (pBelow > 0.95) return 'REJECT_NULL_NEGATIVE';
    if (pAbove > 0.95) return 'REJECT_NULL_POSITIVE';
    return 'UNDECIDED';
  }

  private generateContinuousRecommendation(
    probTreatmentBetter: number,
    ropeAnalysis: any
  ): string {
    if (ropeAnalysis.decision === 'ACCEPT_NULL') {
      return 'NO_PRACTICAL_DIFFERENCE: Effects are within equivalence bounds';
    }
    if (ropeAnalysis.decision === 'REJECT_NULL_POSITIVE' && probTreatmentBetter > 0.95) {
      return 'TREATMENT_SUPERIOR: Strong evidence for treatment effectiveness';
    }
    if (ropeAnalysis.decision === 'REJECT_NULL_NEGATIVE' && probTreatmentBetter < 0.05) {
      return 'CONTROL_SUPERIOR: Strong evidence for control effectiveness';
    }
    return 'CONTINUE_EXPERIMENT: More data needed for conclusive results';
  }

  private async calculateSelectionProbabilities(
    posteriors: Array<{ name: string; alpha: number; beta: number }>,
    numSimulations: number
  ): Promise<Record<string, number>> {
    const wins: Record<string, number> = {};
    
    // Initialize
    posteriors.forEach(p => { wins[p.name] = 0; });

    // Simulate
    for (let i = 0; i < numSimulations; i++) {
      const samples = posteriors.map(p => ({
        name: p.name,
        value: jStat.beta.sample(p.alpha, p.beta)
      }));

      const best = samples.reduce((max, current) => 
        current.value > max.value ? current : max
      );
      
      wins[best.name]++;
    }

    // Calculate probabilities
    const probabilities: Record<string, number> = {};
    posteriors.forEach(p => {
      probabilities[p.name] = wins[p.name] / numSimulations;
    });

    return probabilities;
  }

  private buildGaussianProcess(
    observations: Array<{ params: Record<string, number>; value: number }>
  ): any {
    // Simplified GP implementation
    return {
      observations,
      kernel: 'rbf',
      lengthScale: 1.0,
      variance: 1.0
    };
  }

  private generateCandidates(
    bounds: Record<string, { min: number; max: number }>,
    numCandidates: number
  ): Array<Record<string, number>> {
    const candidates = [];
    
    for (let i = 0; i < numCandidates; i++) {
      const candidate: Record<string, number> = {};
      
      for (const [param, bound] of Object.entries(bounds)) {
        candidate[param] = math.random(bound.min, bound.max);
      }
      
      candidates.push(candidate);
    }

    return candidates;
  }

  private gpPredict(gp: any, point: Record<string, number>): any {
    // Simplified GP prediction
    const mean = math.mean(gp.observations.map((o: any) => o.value));
    const std = math.std(gp.observations.map((o: any) => o.value));
    
    return { mean, std };
  }

  private evaluateAcquisition(
    prediction: { mean: number; std: number },
    function_: string,
    currentBest: number
  ): number {
    switch (function_) {
      case 'ei': // Expected Improvement
        const z = (prediction.mean - currentBest) / prediction.std;
        return prediction.std * (z * jStat.normal.cdf(z, 0, 1) + 
          jStat.normal.pdf(z, 0, 1));
      
      case 'ucb': // Upper Confidence Bound
        return prediction.mean + 2 * prediction.std;
      
      case 'poi': // Probability of Improvement
        return jStat.normal.cdf((prediction.mean - currentBest) / prediction.std, 0, 1);
      
      default:
        return 0;
    }
  }

  private calculateLikelihood(
    data: number[],
    hypothesis: { mean: number; variance: number }
  ): number {
    // Calculate likelihood assuming normal distribution
    let logLikelihood = 0;
    
    for (const value of data) {
      const pdf = jStat.normal.pdf(value, hypothesis.mean, Math.sqrt(hypothesis.variance));
      logLikelihood += Math.log(pdf);
    }

    return Math.exp(logLikelihood);
  }
}