/**
 * Multi-Armed Bandit implementation using Thompson Sampling
 * Balances exploration and exploitation for optimal content selection
 */

import { BanditArm, BanditState } from '../types';
import { logger } from '../utils/logger';

export class MultiArmedBandit {
  private state: BanditState;
  private readonly minPulls = 10; // Minimum pulls before considering performance

  constructor(
    private readonly explorationRate: number = 0.1,
    initialState?: BanditState
  ) {
    this.state = initialState || {
      arms: new Map(),
      totalPulls: 0,
      explorationRate: this.explorationRate,
      lastUpdate: new Date()
    };
  }

  /**
   * Initialize or update an arm in the bandit
   */
  addArm(id: string, initialAlpha: number = 1, initialBeta: number = 1): void {
    if (!this.state.arms.has(id)) {
      this.state.arms.set(id, {
        id,
        pulls: 0,
        rewards: 0,
        alpha: initialAlpha,
        beta: initialBeta,
        averageReward: 0
      });
      logger.info({ armId: id }, 'Added new arm to bandit');
    }
  }

  /**
   * Select an arm using Thompson Sampling algorithm
   * Samples from Beta distribution for each arm and selects the highest
   */
  selectArm(): string | null {
    if (this.state.arms.size === 0) {
      logger.warn('No arms available for selection');
      return null;
    }

    // Force exploration for arms with insufficient data
    const underExploredArms = Array.from(this.state.arms.values())
      .filter(arm => arm.pulls < this.minPulls);
    
    if (underExploredArms.length > 0) {
      const selected = underExploredArms[Math.floor(Math.random() * underExploredArms.length)];
      logger.debug({ armId: selected.id, pulls: selected.pulls }, 'Forcing exploration for under-sampled arm');
      return selected.id;
    }

    // Thompson Sampling: Sample from Beta distribution for each arm
    let bestArm: string | null = null;
    let bestSample = -Infinity;

    for (const [id, arm] of this.state.arms) {
      const sample = this.sampleBeta(arm.alpha, arm.beta);
      
      if (sample > bestSample) {
        bestSample = sample;
        bestArm = id;
      }
    }

    // Epsilon-greedy override for additional exploration
    if (Math.random() < this.explorationRate) {
      const arms = Array.from(this.state.arms.keys());
      bestArm = arms[Math.floor(Math.random() * arms.length)];
      logger.debug({ armId: bestArm }, 'Epsilon-greedy exploration override');
    }

    logger.debug({ 
      selectedArm: bestArm, 
      sample: bestSample,
      totalPulls: this.state.totalPulls 
    }, 'Arm selected');

    return bestArm;
  }

  /**
   * Update arm statistics after observing a reward
   */
  updateArm(id: string, reward: number): void {
    const arm = this.state.arms.get(id);
    if (!arm) {
      logger.error({ armId: id }, 'Attempted to update non-existent arm');
      return;
    }

    // Update pull count and rewards
    arm.pulls++;
    arm.rewards += reward;
    arm.averageReward = arm.rewards / arm.pulls;
    arm.lastPull = new Date();

    // Update Beta distribution parameters
    // Success: alpha += reward, Failure: beta += (1 - reward)
    arm.alpha += reward;
    arm.beta += (1 - reward);

    this.state.totalPulls++;
    this.state.lastUpdate = new Date();

    logger.info({
      armId: id,
      reward,
      pulls: arm.pulls,
      averageReward: arm.averageReward,
      alpha: arm.alpha,
      beta: arm.beta
    }, 'Arm updated with reward');

    // Decay exploration rate over time
    this.adjustExplorationRate();
  }

  /**
   * Get the best performing arm based on empirical average
   */
  getBestArm(): string | null {
    if (this.state.arms.size === 0) return null;

    let bestArm: string | null = null;
    let bestReward = -Infinity;

    for (const [id, arm] of this.state.arms) {
      // Only consider arms with sufficient data
      if (arm.pulls >= this.minPulls && arm.averageReward > bestReward) {
        bestReward = arm.averageReward;
        bestArm = id;
      }
    }

    return bestArm;
  }

  /**
   * Calculate confidence interval for an arm using Wilson score
   */
  getConfidence(armId: string): number {
    const arm = this.state.arms.get(armId);
    if (!arm || arm.pulls < this.minPulls) return 0;

    const z = 1.96; // 95% confidence
    const n = arm.pulls;
    const p = arm.averageReward;

    const denominator = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denominator;
    const spread = (z / denominator) * Math.sqrt((p * (1 - p) / n) + (z * z / (4 * n * n)));

    return Math.max(0, center - spread); // Lower bound of confidence interval
  }

  /**
   * Remove poorly performing arms
   */
  pruneArms(threshold: number = 0.1): void {
    const bestArm = this.getBestArm();
    if (!bestArm) return;

    const bestPerformance = this.state.arms.get(bestArm)!.averageReward;
    const pruned: string[] = [];

    for (const [id, arm] of this.state.arms) {
      // Don't prune the best arm or arms with insufficient data
      if (id === bestArm || arm.pulls < this.minPulls * 2) continue;

      // Prune if significantly worse than best
      if (arm.averageReward < bestPerformance * threshold) {
        this.state.arms.delete(id);
        pruned.push(id);
      }
    }

    if (pruned.length > 0) {
      logger.info({ prunedArms: pruned }, 'Pruned underperforming arms');
    }
  }

  /**
   * Get current state for persistence
   */
  getState(): BanditState {
    return {
      ...this.state,
      arms: new Map(this.state.arms)
    };
  }

  /**
   * Get statistics for all arms
   */
  getStatistics(): Array<{
    id: string;
    pulls: number;
    averageReward: number;
    confidence: number;
    lastPull?: Date;
  }> {
    return Array.from(this.state.arms.values()).map(arm => ({
      id: arm.id,
      pulls: arm.pulls,
      averageReward: arm.averageReward,
      confidence: this.getConfidence(arm.id),
      lastPull: arm.lastPull
    }));
  }

  /**
   * Sample from Beta distribution using approximation
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Using Gamma distribution approximation for Beta sampling
    const gammaAlpha = this.sampleGamma(alpha);
    const gammaBeta = this.sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  /**
   * Sample from Gamma distribution using Marsaglia and Tsang method
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      // Handle case where shape < 1
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this.normalRandom();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Generate normal distribution random number using Box-Muller
   */
  private normalRandom(): number {
    const u = 1 - Math.random(); // Avoid 0
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Gradually reduce exploration rate as confidence increases
   */
  private adjustExplorationRate(): void {
    const decayFactor = 0.9999;
    const minExploration = 0.01;
    
    this.state.explorationRate = Math.max(
      minExploration,
      this.state.explorationRate * decayFactor
    );
  }
}

/**
 * Epsilon-Greedy variant for simpler exploration strategy
 */
export class EpsilonGreedyBandit {
  private arms: Map<string, BanditArm>;
  private epsilon: number;

  constructor(epsilon: number = 0.1) {
    this.arms = new Map();
    this.epsilon = epsilon;
  }

  addArm(id: string): void {
    if (!this.arms.has(id)) {
      this.arms.set(id, {
        id,
        pulls: 0,
        rewards: 0,
        alpha: 1,
        beta: 1,
        averageReward: 0
      });
    }
  }

  selectArm(): string | null {
    if (this.arms.size === 0) return null;

    // Explore with probability epsilon
    if (Math.random() < this.epsilon) {
      const armIds = Array.from(this.arms.keys());
      return armIds[Math.floor(Math.random() * armIds.length)];
    }

    // Exploit: choose best performing arm
    let bestArm: string | null = null;
    let bestReward = -Infinity;

    for (const [id, arm] of this.arms) {
      if (arm.averageReward > bestReward) {
        bestReward = arm.averageReward;
        bestArm = id;
      }
    }

    return bestArm;
  }

  updateArm(id: string, reward: number): void {
    const arm = this.arms.get(id);
    if (!arm) return;

    arm.pulls++;
    arm.rewards += reward;
    arm.averageReward = arm.rewards / arm.pulls;
    arm.lastPull = new Date();

    // Decay epsilon over time
    this.epsilon *= 0.9999;
    this.epsilon = Math.max(0.01, this.epsilon);
  }
}