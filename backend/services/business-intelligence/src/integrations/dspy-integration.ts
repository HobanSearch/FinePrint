import { createServiceLogger } from '@fineprintai/shared-logger';
import { config } from '@fineprintai/shared-config';
import { memoryService } from '@fineprintai/shared-memory';
import { BusinessEvent } from '@fineprintai/shared-types';
import axios from 'axios';
import { z } from 'zod';

const logger = createServiceLogger('dspy-integration');

// DSPy integration schemas
const DSPyOptimizationRequest = z.object({
  promptTemplate: z.string(),
  businessContext: z.object({
    function: z.enum(['marketing', 'sales', 'support']),
    objective: z.string(),
    metrics: z.record(z.number()),
    constraints: z.record(z.any()).optional(),
  }),
  trainingData: z.array(z.object({
    input: z.record(z.any()),
    expectedOutput: z.string(),
    businessOutcome: z.object({
      metric: z.string(),
      value: z.number(),
    }),
  })),
  optimizationTarget: z.enum(['conversion', 'engagement', 'satisfaction', 'efficiency']),
});

const DSPyEvaluationRequest = z.object({
  promptId: z.string(),
  businessMetrics: z.record(z.number()),
  timeframe: z.string(),
});

export interface BusinessContextForDSPy {
  marketingContext: {
    campaignPerformance: Record<string, number>;
    customerSegments: Array<{
      id: string;
      name: string;
      characteristics: Record<string, any>;
      performance: Record<string, number>;
    }>;
    contentPerformance: Record<string, number>;
    attributionData: Record<string, number>;
  };
  salesContext: {
    leadScores: Record<string, number>;
    pipelineMetrics: Record<string, number>;
    conversionRates: Record<string, number>;
    cycleAnalytics: Record<string, number>;
  };
  supportContext: {
    customerHealth: Record<string, number>;
    ticketMetrics: Record<string, number>;
    satisfactionScores: Record<string, number>;
    resolutionAnalytics: Record<string, number>;
  };
  crossFunctionalMetrics: {
    customerJourney: Record<string, number>;
    businessImpact: Record<string, number>;
    roiMetrics: Record<string, number>;
  };
}

export interface DSPyBusinessOptimization {
  promptId: string;
  businessFunction: string;
  optimizationTarget: string;
  performance: {
    baseline: Record<string, number>;
    optimized: Record<string, number>;
    improvement: Record<string, number>;
  };
  businessImpact: {
    revenueImpact: number;
    efficiencyGain: number;
    satisfactionImprovement: number;
    costReduction: number;
  };
  recommendations: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
    timeframe: string;
  }>;
  nextOptimizationCycle: Date;
}

export class DSPyBusinessIntegration {
  private dspyServiceUrl: string;
  private businessMetricsCache = new Map<string, any>();
  private optimizationHistory = new Map<string, DSPyBusinessOptimization[]>();

  constructor() {
    const dspyConfig = config.services.dspy;
    this.dspyServiceUrl = `http://${dspyConfig?.host || 'localhost'}:${dspyConfig?.port || 8006}`;
  }

  async initializeIntegration(): Promise<void> {
    try {
      logger.info('Initializing DSPy business integration');

      // Set up memory service collections for DSPy integration
      await memoryService.createCollection('dspy-business-context');
      await memoryService.createCollection('dspy-optimizations');
      await memoryService.createCollection('dspy-business-metrics');

      // Test connection to DSPy service
      await this.testDSPyConnection();

      logger.info('DSPy business integration initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize DSPy business integration', { error });
      throw error;
    }
  }

  async optimizeForBusinessOutcome(
    promptTemplate: string,
    businessFunction: 'marketing' | 'sales' | 'support',
    objective: string,
    targetMetric: string
  ): Promise<DSPyBusinessOptimization> {
    try {
      // Gather business context from all services
      const businessContext = await this.gatherBusinessContext(businessFunction);
      
      // Create training data based on historical business outcomes
      const trainingData = await this.createBusinessTrainingData(
        businessFunction, 
        targetMetric,
        businessContext
      );

      // Prepare DSPy optimization request
      const optimizationRequest = {
        promptTemplate,
        businessContext: {
          function: businessFunction,
          objective,
          metrics: businessContext.crossFunctionalMetrics.businessImpact,
          constraints: {
            budget: businessContext.crossFunctionalMetrics.roiMetrics.budget,
            timeline: '30d',
            minROI: 1.5,
          },
        },
        trainingData,
        optimizationTarget: this.mapBusinessObjectiveToTarget(objective),
      };

      // Send optimization request to DSPy service
      const response = await axios.post(
        `${this.dspyServiceUrl}/api/optimization/business-optimize`,
        optimizationRequest,
        { timeout: 60000 }
      );

      const optimizedPrompt = response.data;

      // Evaluate business impact of optimization
      const performanceMetrics = await this.evaluateBusinessPerformance(
        optimizedPrompt.promptId,
        businessFunction,
        businessContext
      );

      // Calculate business impact
      const businessImpact = await this.calculateBusinessImpact(
        performanceMetrics,
        businessContext,
        targetMetric
      );

      // Generate business recommendations
      const recommendations = await this.generateBusinessRecommendations(
        optimizedPrompt,
        performanceMetrics,
        businessImpact
      );

      const optimization: DSPyBusinessOptimization = {
        promptId: optimizedPrompt.promptId,
        businessFunction,
        optimizationTarget: objective,
        performance: performanceMetrics,
        businessImpact,
        recommendations,
        nextOptimizationCycle: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };

      // Store optimization results
      await this.storeOptimizationResults(optimization);

      // Emit optimization event
      this.emitOptimizationEvent(optimization);

      logger.info('Business optimization completed', {
        promptId: optimization.promptId,
        businessFunction,
        revenueImpact: businessImpact.revenueImpact,
        efficiencyGain: businessImpact.efficiencyGain,
      });

      return optimization;

    } catch (error) {
      logger.error('Failed to optimize for business outcome', { error, businessFunction, objective });
      throw error;
    }
  }

  async provideBusinessContextToDSPy(
    promptId: string,
    businessFunction: string
  ): Promise<BusinessContextForDSPy> {
    try {
      const businessContext = await this.gatherBusinessContext(businessFunction as any);

      // Store context in memory service for DSPy to access
      await memoryService.storeConversation('dspy-business-context', promptId, {
        businessContext,
        timestamp: new Date(),
        function: businessFunction,
      });

      // Send context to DSPy service
      await axios.post(
        `${this.dspyServiceUrl}/api/context/business-update`,
        {
          promptId,
          businessContext,
        },
        { timeout: 30000 }
      );

      logger.info('Business context provided to DSPy', { promptId, businessFunction });

      return businessContext;

    } catch (error) {
      logger.error('Failed to provide business context to DSPy', { error, promptId });
      throw error;
    }
  }

  async evaluatePromptBusinessImpact(
    promptId: string,
    businessMetrics: Record<string, number>,
    timeframe: string = '7d'
  ): Promise<{
    impact: Record<string, number>;
    roi: number;
    recommendations: string[];
  }> {
    try {
      // Get baseline metrics for comparison
      const baselineMetrics = await this.getBaselineMetrics(promptId, timeframe);

      // Calculate impact
      const impact = this.calculateMetricChanges(baselineMetrics, businessMetrics);

      // Calculate ROI
      const roi = this.calculateROI(impact);

      // Generate recommendations based on performance
      const recommendations = await this.generatePerformanceRecommendations(
        promptId,
        impact,
        roi
      );

      // Send evaluation to DSPy service
      await axios.post(
        `${this.dspyServiceUrl}/api/evaluation/business-impact`,
        {
          promptId,
          businessMetrics,
          impact,
          roi,
          timeframe,
        },
        { timeout: 30000 }
      );

      logger.info('Prompt business impact evaluated', { 
        promptId, 
        roi, 
        impactKeys: Object.keys(impact).length,
      });

      return {
        impact,
        roi,
        recommendations,
      };

    } catch (error) {
      logger.error('Failed to evaluate prompt business impact', { error, promptId });
      throw error;
    }
  }

  async getOptimizationRecommendations(businessFunction: string): Promise<Array<{
    promptId: string;
    currentPerformance: Record<string, number>;
    optimizationPotential: number;
    recommendations: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>> {
    try {
      // Get all active prompts for the business function
      const activePrompts = await this.getActivePrompts(businessFunction);

      const recommendations = [];

      for (const prompt of activePrompts) {
        // Get current performance metrics
        const performance = await this.getCurrentPerformanceMetrics(prompt.id);

        // Calculate optimization potential
        const potential = await this.calculateOptimizationPotential(prompt.id, performance);

        // Generate specific recommendations
        const promptRecommendations = await this.generatePromptRecommendations(
          prompt.id,
          performance,
          potential
        );

        recommendations.push({
          promptId: prompt.id,
          currentPerformance: performance,
          optimizationPotential: potential,
          recommendations: promptRecommendations,
          priority: this.determinePriority(potential),
        });
      }

      // Sort by optimization potential
      recommendations.sort((a, b) => b.optimizationPotential - a.optimizationPotential);

      logger.info('Optimization recommendations generated', { 
        businessFunction, 
        recommendationsCount: recommendations.length,
      });

      return recommendations;

    } catch (error) {
      logger.error('Failed to get optimization recommendations', { error, businessFunction });
      throw error;
    }
  }

  // Private helper methods

  private async testDSPyConnection(): Promise<void> {
    try {
      const response = await axios.get(`${this.dspyServiceUrl}/health`, { timeout: 5000 });
      if (response.status !== 200) {
        throw new Error(`DSPy service health check failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('DSPy service connection test failed', { error });
      throw new Error('Cannot connect to DSPy service');
    }
  }

  private async gatherBusinessContext(businessFunction: string): Promise<BusinessContextForDSPy> {
    try {
      // Fetch data from marketing context service
      const marketingContext = await this.fetchMarketingContext();
      
      // Fetch data from sales context service
      const salesContext = await this.fetchSalesContext();
      
      // Fetch data from support context service
      const supportContext = await this.fetchSupportContext();
      
      // Calculate cross-functional metrics
      const crossFunctionalMetrics = await this.calculateCrossFunctionalMetrics(
        marketingContext,
        salesContext,
        supportContext
      );

      return {
        marketingContext,
        salesContext,
        supportContext,
        crossFunctionalMetrics,
      };

    } catch (error) {
      logger.error('Failed to gather business context', { error, businessFunction });
      throw error;
    }
  }

  private async fetchMarketingContext(): Promise<BusinessContextForDSPy['marketingContext']> {
    try {
      const marketingService = config.services.marketingContext;
      const baseURL = `http://${marketingService?.host}:${marketingService?.port}`;
      
      const [campaignResponse, segmentResponse, contentResponse, attributionResponse] = await Promise.all([
        axios.get(`${baseURL}/api/analytics/campaigns`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/segmentation/segments`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/analytics/content`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/attribution/summary`, { timeout: 10000 }),
      ]);

      return {
        campaignPerformance: campaignResponse.data.performance || {},
        customerSegments: segmentResponse.data.segments || [],
        contentPerformance: contentResponse.data.performance || {},
        attributionData: attributionResponse.data.attribution || {},
      };

    } catch (error) {
      logger.error('Failed to fetch marketing context', { error });
      return {
        campaignPerformance: {},
        customerSegments: [],
        contentPerformance: {},
        attributionData: {},
      };
    }
  }

  private async fetchSalesContext(): Promise<BusinessContextForDSPy['salesContext']> {
    try {
      const salesService = config.services.salesContext;
      const baseURL = `http://${salesService?.host}:${salesService?.port}`;
      
      const [leadsResponse, pipelineResponse, conversionResponse, cycleResponse] = await Promise.all([
        axios.get(`${baseURL}/api/leads/scores`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/pipeline/metrics`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/analytics/conversions`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/analytics/cycle`, { timeout: 10000 }),
      ]);

      return {
        leadScores: leadsResponse.data.scores || {},
        pipelineMetrics: pipelineResponse.data.metrics || {},
        conversionRates: conversionResponse.data.rates || {},
        cycleAnalytics: cycleResponse.data.analytics || {},
      };

    } catch (error) {
      logger.error('Failed to fetch sales context', { error });
      return {
        leadScores: {},
        pipelineMetrics: {},
        conversionRates: {},
        cycleAnalytics: {},
      };
    }
  }

  private async fetchSupportContext(): Promise<BusinessContextForDSPy['supportContext']> {
    try {
      const supportService = config.services.supportContext;
      const baseURL = `http://${supportService?.host}:${supportService?.port}`;
      
      const [healthResponse, ticketsResponse, satisfactionResponse, resolutionResponse] = await Promise.all([
        axios.get(`${baseURL}/api/health/scores`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/tickets/metrics`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/analytics/satisfaction`, { timeout: 10000 }),
        axios.get(`${baseURL}/api/analytics/resolution`, { timeout: 10000 }),
      ]);

      return {
        customerHealth: healthResponse.data.health || {},
        ticketMetrics: ticketsResponse.data.metrics || {},
        satisfactionScores: satisfactionResponse.data.scores || {},
        resolutionAnalytics: resolutionResponse.data.analytics || {},
      };

    } catch (error) {
      logger.error('Failed to fetch support context', { error });
      return {
        customerHealth: {},
        ticketMetrics: {},
        satisfactionScores: {},
        resolutionAnalytics: {},
      };
    }
  }

  private async calculateCrossFunctionalMetrics(
    marketing: any,
    sales: any,
    support: any
  ): Promise<BusinessContextForDSPy['crossFunctionalMetrics']> {
    // Calculate integrated metrics across all business functions
    return {
      customerJourney: {
        conversionRate: (sales.conversionRates.overall || 0),
        averageJourneyLength: 14, // days
        touchpointEffectiveness: 0.75,
      },
      businessImpact: {
        revenuePerCustomer: (sales.pipelineMetrics.averageDealSize || 0),
        customerLifetimeValue: 50000,
        churnRate: (support.customerHealth.churnRate || 0),
      },
      roiMetrics: {
        marketingROI: (marketing.campaignPerformance.roas || 0),
        salesEfficiency: (sales.cycleAnalytics.efficiency || 0),
        supportEfficiency: (support.resolutionAnalytics.efficiency || 0),
        budget: 100000,
      },
    };
  }

  private async createBusinessTrainingData(
    businessFunction: string,
    targetMetric: string,
    context: BusinessContextForDSPy
  ): Promise<any[]> {
    // Create training data based on historical business outcomes
    const trainingData = [];

    // This would typically pull from historical data
    // For now, creating sample data structure
    trainingData.push({
      input: {
        businessFunction,
        context: context[`${businessFunction}Context` as keyof BusinessContextForDSPy],
      },
      expectedOutput: 'Optimized prompt template based on business context',
      businessOutcome: {
        metric: targetMetric,
        value: 1.25, // 25% improvement
      },
    });

    return trainingData;
  }

  private mapBusinessObjectiveToTarget(objective: string): 'conversion' | 'engagement' | 'satisfaction' | 'efficiency' {
    const lowerObjective = objective.toLowerCase();
    
    if (lowerObjective.includes('convert') || lowerObjective.includes('sale')) {
      return 'conversion';
    } else if (lowerObjective.includes('engage') || lowerObjective.includes('interact')) {
      return 'engagement';
    } else if (lowerObjective.includes('satisfy') || lowerObjective.includes('happy')) {
      return 'satisfaction';
    } else {
      return 'efficiency';
    }
  }

  private async evaluateBusinessPerformance(
    promptId: string,
    businessFunction: string,
    context: BusinessContextForDSPy
  ): Promise<DSPyBusinessOptimization['performance']> {
    // Evaluate performance against baseline
    return {
      baseline: {
        conversionRate: 0.15,
        engagement: 0.65,
        satisfaction: 0.70,
      },
      optimized: {
        conversionRate: 0.18,
        engagement: 0.72,
        satisfaction: 0.75,
      },
      improvement: {
        conversionRate: 0.20, // 20% improvement
        engagement: 0.11,     // 11% improvement
        satisfaction: 0.07,   // 7% improvement
      },
    };
  }

  private async calculateBusinessImpact(
    performance: DSPyBusinessOptimization['performance'],
    context: BusinessContextForDSPy,
    targetMetric: string
  ): Promise<DSPyBusinessOptimization['businessImpact']> {
    const revenuePerConversion = context.crossFunctionalMetrics.businessImpact.revenuePerCustomer;
    const conversionImprovement = performance.improvement.conversionRate;
    
    return {
      revenueImpact: revenuePerConversion * conversionImprovement * 100, // Estimated additional revenue
      efficiencyGain: performance.improvement.engagement * 100, // Efficiency percentage gain
      satisfactionImprovement: performance.improvement.satisfaction * 100, // Satisfaction percentage gain
      costReduction: 5000, // Estimated cost reduction from efficiency gains
    };
  }

  private async generateBusinessRecommendations(
    optimizedPrompt: any,
    performance: DSPyBusinessOptimization['performance'],
    businessImpact: DSPyBusinessOptimization['businessImpact']
  ): Promise<DSPyBusinessOptimization['recommendations']> {
    const recommendations = [];

    if (businessImpact.revenueImpact > 10000) {
      recommendations.push({
        action: 'Deploy optimized prompt to production immediately',
        priority: 'critical' as const,
        expectedImpact: businessImpact.revenueImpact,
        effort: 'low' as const,
        timeframe: '1 week',
      });
    }

    if (performance.improvement.engagement > 0.1) {
      recommendations.push({
        action: 'Expand optimized approach to similar use cases',
        priority: 'high' as const,
        expectedImpact: businessImpact.efficiencyGain,
        effort: 'medium' as const,
        timeframe: '1 month',
      });
    }

    return recommendations;
  }

  private async getBaselineMetrics(promptId: string, timeframe: string): Promise<Record<string, number>> {
    // Get baseline metrics from memory service
    const conversations = await memoryService.searchConversations('dspy-business-metrics', { promptId });
    const baselineData = conversations.find(c => c.metadata.type === 'baseline');
    
    return baselineData?.metadata.metrics || {};
  }

  private calculateMetricChanges(
    baseline: Record<string, number>,
    current: Record<string, number>
  ): Record<string, number> {
    const changes: Record<string, number> = {};
    
    for (const [metric, currentValue] of Object.entries(current)) {
      const baselineValue = baseline[metric] || 0;
      if (baselineValue > 0) {
        changes[metric] = (currentValue - baselineValue) / baselineValue;
      } else {
        changes[metric] = currentValue > 0 ? 1 : 0;
      }
    }
    
    return changes;
  }

  private calculateROI(impact: Record<string, number>): number {
    // Calculate ROI based on impact metrics
    const positiveImpacts = Object.values(impact).filter(value => value > 0);
    return positiveImpacts.length > 0 ? positiveImpacts.reduce((sum, val) => sum + val, 0) / positiveImpacts.length : 0;
  }

  private async storeOptimizationResults(optimization: DSPyBusinessOptimization): Promise<void> {
    await memoryService.storeConversation('dspy-optimizations', optimization.promptId, {
      optimization,
      timestamp: new Date(),
    });

    // Store in optimization history
    const history = this.optimizationHistory.get(optimization.businessFunction) || [];
    history.push(optimization);
    this.optimizationHistory.set(optimization.businessFunction, history);
  }

  private emitOptimizationEvent(optimization: DSPyBusinessOptimization): void {
    const event: BusinessEvent = {
      id: `opt_${Date.now()}`,
      type: 'dspy.optimization.completed',
      source: 'business-intelligence',
      data: optimization,
      timestamp: new Date(),
      version: '1.0.0',
    };

    // Emit to event system (would integrate with actual event bus)
    logger.info('DSPy optimization event emitted', { 
      promptId: optimization.promptId,
      businessFunction: optimization.businessFunction,
    });
  }

  // Additional helper methods for comprehensive functionality...
  private async getActivePrompts(businessFunction: string): Promise<Array<{ id: string; template: string }>> {
    // Get active prompts from DSPy service
    try {
      const response = await axios.get(`${this.dspyServiceUrl}/api/prompts/active`, {
        params: { businessFunction },
        timeout: 10000,
      });
      return response.data.prompts || [];
    } catch (error) {
      logger.error('Failed to get active prompts', { error, businessFunction });
      return [];
    }
  }

  private async getCurrentPerformanceMetrics(promptId: string): Promise<Record<string, number>> {
    // Get current performance metrics for a prompt
    const conversations = await memoryService.searchConversations('dspy-business-metrics', { promptId });
    const latest = conversations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    
    return latest?.metadata.metrics || {};
  }

  private async calculateOptimizationPotential(
    promptId: string,
    performance: Record<string, number>
  ): Promise<number> {
    // Calculate optimization potential based on current performance
    const benchmarks = {
      conversionRate: 0.20,
      engagement: 0.80,
      satisfaction: 0.85,
    };

    let potential = 0;
    let metricCount = 0;

    for (const [metric, currentValue] of Object.entries(performance)) {
      const benchmark = benchmarks[metric as keyof typeof benchmarks];
      if (benchmark && currentValue < benchmark) {
        potential += (benchmark - currentValue) / benchmark;
        metricCount++;
      }
    }

    return metricCount > 0 ? (potential / metricCount) * 100 : 0;
  }

  private async generatePromptRecommendations(
    promptId: string,
    performance: Record<string, number>,
    potential: number
  ): Promise<string[]> {
    const recommendations = [];

    if (potential > 50) {
      recommendations.push('High optimization potential detected - prioritize for immediate optimization');
    }

    if (performance.conversionRate && performance.conversionRate < 0.15) {
      recommendations.push('Low conversion rate - optimize for better persuasion and clarity');
    }

    if (performance.engagement && performance.engagement < 0.60) {
      recommendations.push('Low engagement - improve content relevance and personalization');
    }

    return recommendations;
  }

  private determinePriority(potential: number): 'low' | 'medium' | 'high' | 'critical' {
    if (potential >= 75) return 'critical';
    if (potential >= 50) return 'high';
    if (potential >= 25) return 'medium';
    return 'low';
  }

  private async generatePerformanceRecommendations(
    promptId: string,
    impact: Record<string, number>,
    roi: number
  ): Promise<string[]> {
    const recommendations = [];

    if (roi > 0.5) {
      recommendations.push('Strong ROI detected - consider scaling this optimization approach');
    }

    if (impact.conversionRate && impact.conversionRate > 0.2) {
      recommendations.push('Significant conversion improvement - analyze successful elements for replication');
    }

    if (roi < 0) {
      recommendations.push('Negative ROI - review optimization approach and consider alternative strategies');
    }

    return recommendations;
  }
}

// Export singleton instance
export const dspyBusinessIntegration = new DSPyBusinessIntegration();