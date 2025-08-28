// Decision Engine - Automated decision making for experiments

import { PrismaClient, Decision, DecisionType } from '@prisma/client';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { 
  DecisionRequest,
  DecisionResult,
  AnalysisResult,
  BusinessContext,
  AutomationRule,
  TrafficAllocation,
  ImplementationPlan
} from '../types';

export class DecisionEngine {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: Logger;

  constructor(prisma: PrismaClient, redis: Redis, logger: Logger) {
    this.prisma = prisma;
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Make automated decision based on analysis results
   */
  async makeDecision(request: DecisionRequest): Promise<DecisionResult> {
    this.logger.info({ request }, 'Making automated decision');

    try {
      // Evaluate automation rules
      const ruleDecision = await this.evaluateAutomationRules(
        request.automationRules || [],
        request.analysisResults
      );

      if (ruleDecision) {
        return ruleDecision;
      }

      // Make decision based on analysis results
      const decision = await this.analyzeAndDecide(
        request.analysisResults,
        request.businessContext
      );

      // Store decision
      await this.storeDecision(
        request.experimentId,
        decision,
        request.decisionType
      );

      // Execute decision if automated
      if (decision.action !== 'continue') {
        await this.executeDecision(request.experimentId, decision);
      }

      return decision;

    } catch (error) {
      this.logger.error({ error, request }, 'Failed to make decision');
      throw error;
    }
  }

  /**
   * Evaluate early stopping criteria
   */
  async evaluateEarlyStopping(
    experimentId: string,
    analysisResult: AnalysisResult
  ): Promise<boolean> {
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Check statistical significance
    if (!analysisResult.comparison.statisticalSignificance) {
      return false;
    }

    // Check practical significance
    if (!analysisResult.comparison.practicalSignificance) {
      return false;
    }

    // Check sample size requirements
    const minSampleSize = experiment.targetSampleSize || 1000;
    const currentSampleSize = analysisResult.control.sampleSize + 
      Object.values(analysisResult.treatments).reduce((sum, t) => sum + t.sampleSize, 0);

    if (currentSampleSize < minSampleSize * 0.5) {
      // Don't stop if we have less than 50% of target sample
      return false;
    }

    // Check confidence level
    const confidence = analysisResult.recommendation.confidence;
    if (confidence < 0.95) {
      return false;
    }

    // Check for consistent results over time
    const consistentResults = await this.checkResultConsistency(
      experimentId,
      analysisResult
    );

    return consistentResults;
  }

  /**
   * Determine optimal traffic allocation
   */
  async optimizeTrafficAllocation(
    experimentId: string,
    analysisResults: AnalysisResult[]
  ): Promise<TrafficAllocation> {
    this.logger.info({ experimentId }, 'Optimizing traffic allocation');

    // Get current allocation
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true }
    });

    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Calculate performance scores for each variant
    const scores = await this.calculateVariantScores(analysisResults);

    // Determine optimal allocation based on algorithm
    let allocation: TrafficAllocation;

    switch (experiment.mabAlgorithm) {
      case 'thompson_sampling':
        allocation = await this.thompsonSamplingAllocation(scores);
        break;
      
      case 'epsilon_greedy':
        allocation = await this.epsilonGreedyAllocation(
          scores,
          experiment.mabParameters as any
        );
        break;
      
      case 'ucb':
        allocation = await this.ucbAllocation(scores);
        break;
      
      default:
        // Default to proportional allocation based on performance
        allocation = await this.proportionalAllocation(scores);
    }

    return allocation;
  }

  /**
   * Declare experiment winner
   */
  async declareWinner(
    experimentId: string,
    analysisResult: AnalysisResult
  ): Promise<DecisionResult> {
    this.logger.info({ experimentId }, 'Declaring experiment winner');

    // Determine winning variant
    let winningVariant: string | undefined;
    let improvement = 0;

    if (analysisResult.comparison.effectSize > 0) {
      // Treatment wins
      winningVariant = Object.keys(analysisResult.treatments)[0];
      improvement = analysisResult.comparison.relativeEffect;
    } else {
      // Control wins
      winningVariant = 'control';
      improvement = 0;
    }

    // Create implementation plan
    const implementationPlan = await this.createImplementationPlan(
      experimentId,
      winningVariant
    );

    // Store decision
    const decision: DecisionResult = {
      action: 'declare_winner',
      reason: `Experiment concluded with ${winningVariant} as winner`,
      confidence: analysisResult.recommendation.confidence,
      winningVariant,
      newAllocation: winningVariant === 'control' 
        ? { control: 1.0 } 
        : { [winningVariant]: 1.0 },
      implementationPlan
    };

    await this.storeDecision(
      experimentId,
      decision,
      DecisionType.WINNER_DECLARATION
    );

    return decision;
  }

  /**
   * Generate rollback plan
   */
  async generateRollbackPlan(experimentId: string): Promise<string> {
    const steps = [
      '1. Pause current experiment traffic',
      '2. Revert traffic allocation to 100% control',
      '3. Clear experiment assignment cache',
      '4. Monitor metrics for stability',
      '5. Document rollback reason and learnings'
    ];

    return steps.join('\n');
  }

  // Private helper methods

  private async evaluateAutomationRules(
    rules: AutomationRule[],
    analysisResults: AnalysisResult[]
  ): Promise<DecisionResult | null> {
    if (rules.length === 0) return null;

    // Sort rules by priority
    const sortedRules = rules
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const matches = this.evaluateRule(rule, analysisResults);
      if (matches) {
        return {
          action: rule.action,
          reason: `Automation rule triggered: ${rule.condition}`,
          confidence: 1.0
        };
      }
    }

    return null;
  }

  private evaluateRule(
    rule: AutomationRule,
    analysisResults: AnalysisResult[]
  ): boolean {
    // Simple rule evaluation (can be extended with expression parser)
    const latestResult = analysisResults[analysisResults.length - 1];
    
    try {
      // Parse condition (simplified)
      if (rule.condition.includes('significance')) {
        return latestResult.comparison.statisticalSignificance;
      }
      if (rule.condition.includes('sample_size')) {
        const targetSize = parseInt(rule.condition.match(/\d+/)?.[0] || '0');
        const currentSize = latestResult.control.sampleSize + 
          Object.values(latestResult.treatments).reduce((sum, t) => sum + t.sampleSize, 0);
        return currentSize >= targetSize;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async analyzeAndDecide(
    analysisResults: AnalysisResult[],
    businessContext?: BusinessContext
  ): Promise<DecisionResult> {
    const latestResult = analysisResults[analysisResults.length - 1];
    const recommendation = latestResult.recommendation;

    // Consider business context
    if (businessContext) {
      if (businessContext.riskTolerance === 'low' && recommendation.confidence < 0.99) {
        return {
          action: 'continue',
          reason: 'Low risk tolerance requires higher confidence',
          confidence: recommendation.confidence
        };
      }

      if (businessContext.urgency === 'high' && recommendation.confidence > 0.8) {
        return {
          action: recommendation.action === 'continue' ? 'modify_allocation' : recommendation.action,
          reason: 'High urgency - making decision with current confidence',
          confidence: recommendation.confidence,
          newAllocation: recommendation.suggestedAllocation
        };
      }
    }

    // Default decision based on recommendation
    return {
      action: recommendation.action,
      reason: recommendation.reason,
      confidence: recommendation.confidence,
      newAllocation: recommendation.suggestedAllocation
    };
  }

  private async checkResultConsistency(
    experimentId: string,
    currentResult: AnalysisResult
  ): Promise<boolean> {
    // Get last 3 analyses
    const recentAnalyses = await this.prisma.analysis.findMany({
      where: {
        experimentId,
        metricName: currentResult.metricName
      },
      orderBy: { performedAt: 'desc' },
      take: 3
    });

    if (recentAnalyses.length < 3) {
      return false; // Not enough history
    }

    // Check if all recent analyses agree on direction
    const allPositive = recentAnalyses.every(a => a.effectSize && a.effectSize > 0);
    const allNegative = recentAnalyses.every(a => a.effectSize && a.effectSize < 0);

    return (allPositive || allNegative) && 
           currentResult.comparison.effectSize > 0 === allPositive;
  }

  private async calculateVariantScores(
    analysisResults: AnalysisResult[]
  ): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};
    
    // Aggregate scores across all metrics
    for (const result of analysisResults) {
      // Control score
      scores['control'] = (scores['control'] || 0) + result.control.mean;
      
      // Treatment scores
      for (const [name, stats] of Object.entries(result.treatments)) {
        scores[name] = (scores[name] || 0) + stats.mean;
      }
    }

    // Normalize scores
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (total > 0) {
      for (const variant of Object.keys(scores)) {
        scores[variant] = scores[variant] / total;
      }
    }

    return scores;
  }

  private async thompsonSamplingAllocation(
    scores: Record<string, number>
  ): Promise<TrafficAllocation> {
    // Thompson sampling allocates traffic proportionally to posterior probabilities
    const allocation: TrafficAllocation = {};
    const total = Object.values(scores).reduce((sum, s) => sum + s, 0);
    
    for (const [variant, score] of Object.entries(scores)) {
      allocation[variant] = score / total;
    }

    return allocation;
  }

  private async epsilonGreedyAllocation(
    scores: Record<string, number>,
    params: { epsilon?: number }
  ): Promise<TrafficAllocation> {
    const epsilon = params.epsilon || 0.1;
    const bestVariant = Object.entries(scores).reduce((best, [variant, score]) =>
      score > best[1] ? [variant, score] : best
    )[0];

    const allocation: TrafficAllocation = {};
    const variants = Object.keys(scores);
    const explorationTraffic = epsilon / (variants.length - 1);

    for (const variant of variants) {
      if (variant === bestVariant) {
        allocation[variant] = 1 - epsilon;
      } else {
        allocation[variant] = explorationTraffic;
      }
    }

    return allocation;
  }

  private async ucbAllocation(
    scores: Record<string, number>
  ): Promise<TrafficAllocation> {
    // Upper Confidence Bound allocation
    // Simplified version - would need sample counts for full implementation
    return this.proportionalAllocation(scores);
  }

  private async proportionalAllocation(
    scores: Record<string, number>
  ): Promise<TrafficAllocation> {
    const allocation: TrafficAllocation = {};
    const total = Object.values(scores).reduce((sum, s) => sum + Math.max(0, s), 0);
    
    if (total === 0) {
      // Equal allocation if no positive scores
      const variants = Object.keys(scores);
      for (const variant of variants) {
        allocation[variant] = 1 / variants.length;
      }
    } else {
      for (const [variant, score] of Object.entries(scores)) {
        allocation[variant] = Math.max(0, score) / total;
      }
    }

    return allocation;
  }

  private async createImplementationPlan(
    experimentId: string,
    winningVariant: string
  ): Promise<ImplementationPlan> {
    return {
      steps: [
        {
          action: 'Notify stakeholders of experiment results',
          timing: 'Immediate',
          dependencies: []
        },
        {
          action: 'Prepare production deployment for winning variant',
          timing: 'Within 24 hours',
          dependencies: ['stakeholder_approval']
        },
        {
          action: 'Gradual rollout to 25% of traffic',
          timing: 'Day 1',
          dependencies: ['deployment_ready']
        },
        {
          action: 'Monitor key metrics for stability',
          timing: 'Continuous',
          dependencies: ['rollout_started']
        },
        {
          action: 'Increase to 50% traffic if stable',
          timing: 'Day 3',
          dependencies: ['metrics_stable']
        },
        {
          action: 'Full rollout to 100% traffic',
          timing: 'Day 7',
          dependencies: ['no_issues_detected']
        }
      ],
      rollbackPlan: await this.generateRollbackPlan(experimentId),
      monitoringRequirements: [
        'Error rate below baseline',
        'Latency within acceptable range',
        'Conversion rate stable or improving',
        'No customer complaints'
      ]
    };
  }

  private async storeDecision(
    experimentId: string,
    decision: DecisionResult,
    decisionType: DecisionType
  ): Promise<void> {
    await this.prisma.decision.create({
      data: {
        experimentId,
        decisionType,
        action: decision.action,
        reason: decision.reason,
        winningVariant: decision.winningVariant,
        improvement: decision.winningVariant ? 
          (decision.confidence - 0.5) * 100 : undefined,
        newAllocation: decision.newAllocation,
        isAutomated: true,
        automationRule: 'statistical_analysis',
        decidedBy: 'system'
      }
    });
  }

  private async executeDecision(
    experimentId: string,
    decision: DecisionResult
  ): Promise<void> {
    this.logger.info({ experimentId, decision }, 'Executing decision');

    switch (decision.action) {
      case 'stop_success':
      case 'stop_failure':
        await this.stopExperiment(experimentId, decision.reason);
        break;
      
      case 'modify_allocation':
        if (decision.newAllocation) {
          await this.updateTrafficAllocation(experimentId, decision.newAllocation);
        }
        break;
      
      case 'declare_winner':
        await this.completeExperiment(experimentId, decision.winningVariant);
        break;
    }
  }

  private async stopExperiment(experimentId: string, reason: string): Promise<void> {
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: 'STOPPED',
        endDate: new Date()
      }
    });

    // Notify via Redis pub/sub
    await this.redis.publish('experiment:stopped', JSON.stringify({
      experimentId,
      reason,
      timestamp: new Date()
    }));
  }

  private async updateTrafficAllocation(
    experimentId: string,
    allocation: TrafficAllocation
  ): Promise<void> {
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        trafficAllocation: allocation
      }
    });

    // Update variant allocations
    const variants = await this.prisma.variant.findMany({
      where: { experimentId }
    });

    for (const variant of variants) {
      const newAllocation = allocation[variant.name] || 0;
      await this.prisma.variant.update({
        where: { id: variant.id },
        data: { allocation: newAllocation }
      });
    }

    // Clear allocation cache
    await this.redis.del(`experiment:${experimentId}:active`);
  }

  private async completeExperiment(
    experimentId: string,
    winningVariant?: string
  ): Promise<void> {
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: {
        status: 'COMPLETED',
        endDate: new Date()
      }
    });

    if (winningVariant) {
      // Notify via Redis pub/sub
      await this.redis.publish('experiment:completed', JSON.stringify({
        experimentId,
        winner: winningVariant,
        timestamp: new Date()
      }));
    }
  }
}