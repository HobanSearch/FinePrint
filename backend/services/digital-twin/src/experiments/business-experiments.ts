/**
 * Business Experiments Module
 * Orchestrates A/B testing for business agent models
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { EnvironmentSimulator } from '../simulator/environment-simulator';
import { BusinessAgentConnector } from '../integrations/business-agent-connector';
import {
  BusinessEnvironment,
  ExperimentConfig,
  ExperimentResult,
  ModelConfiguration,
  SimulationRequest,
  SimulationResult,
  BusinessMetrics,
  EnvironmentType,
  CustomerSegment
} from '../types';
import { logger } from '../utils/logger';

export interface ExperimentSetup {
  name: string;
  description: string;
  hypothesis: string;
  duration: number; // days to run
  variants: ExperimentVariant[];
  metrics: string[];
  successCriteria: {
    metric: string;
    improvement: number; // percentage improvement required
    confidence: number; // statistical confidence required
  };
  segmentTargeting?: string[]; // specific customer segments to target
}

export interface ExperimentVariant {
  id: string;
  name: string;
  modelType: 'marketing' | 'sales' | 'support' | 'analytics';
  modelVersion: string;
  allocationPercent: number;
  parameters?: Record<string, any>;
}

export interface ExperimentProgress {
  experimentId: string;
  startTime: Date;
  currentTime: Date;
  progressPercent: number;
  variantMetrics: Map<string, VariantMetrics>;
  currentWinner?: string;
  confidence?: number;
  estimatedCompletion?: Date;
}

export interface VariantMetrics {
  variantId: string;
  sampleSize: number;
  conversionRate: number;
  avgRevenue: number;
  satisfactionScore: number;
  responseTime: number;
  errorRate: number;
  customMetrics: Map<string, number>;
}

export class BusinessExperiments extends EventEmitter {
  private activeExperiments: Map<string, ActiveExperiment> = new Map();
  private experimentResults: Map<string, ExperimentResult[]> = new Map();
  private agentConnector: BusinessAgentConnector;
  private simulators: Map<string, EnvironmentSimulator> = new Map();

  constructor(ollamaUrl?: string) {
    super();
    this.agentConnector = new BusinessAgentConnector(ollamaUrl);
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.agentConnector.on('agent:invoked', (data) => {
      this.handleAgentInvocation(data);
    });

    this.agentConnector.on('metrics:recorded', (data) => {
      this.emit('experiment:metrics', data);
    });
  }

  /**
   * Marketing Content A/B Test
   */
  async runMarketingContentTest(
    emailVariants?: string[],
    duration: number = 7
  ): Promise<ExperimentResult> {
    const experimentId = uuidv4();
    logger.info('Starting marketing content A/B test', { experimentId, duration });

    const setup: ExperimentSetup = {
      name: 'Marketing Content Optimization',
      description: 'Test different marketing email content variations',
      hypothesis: 'Personalized, value-focused content will increase conversion rates',
      duration,
      variants: [
        {
          id: 'control',
          name: 'Current Marketing Model',
          modelType: 'marketing',
          modelVersion: 'fine-print-marketing:latest',
          allocationPercent: 50,
          parameters: { style: 'professional' }
        },
        {
          id: 'variant-a',
          name: 'Personalized Marketing Model',
          modelType: 'marketing',
          modelVersion: 'fine-print-marketing:latest',
          allocationPercent: 50,
          parameters: { style: 'personalized', urgency: 'high' }
        }
      ],
      metrics: ['conversionRate', 'emailOpenRate', 'clickThroughRate', 'leadQuality'],
      successCriteria: {
        metric: 'conversionRate',
        improvement: 15,
        confidence: 0.95
      }
    };

    return this.runExperiment(experimentId, setup);
  }

  /**
   * Sales Qualification Experiment
   */
  async runSalesQualificationTest(
    duration: number = 14
  ): Promise<ExperimentResult> {
    const experimentId = uuidv4();
    logger.info('Starting sales qualification experiment', { experimentId, duration });

    const setup: ExperimentSetup = {
      name: 'Sales Qualification Optimization',
      description: 'Test different sales qualification approaches',
      hypothesis: 'BANT-focused qualification will improve close rates',
      duration,
      variants: [
        {
          id: 'control',
          name: 'Standard Sales Model',
          modelType: 'sales',
          modelVersion: 'fine-print-sales:latest',
          allocationPercent: 50,
          parameters: { approach: 'consultative' }
        },
        {
          id: 'variant-bant',
          name: 'BANT-Focused Model',
          modelType: 'sales',
          modelVersion: 'fine-print-sales:latest',
          allocationPercent: 50,
          parameters: { approach: 'bant', qualification: 'strict' }
        }
      ],
      metrics: ['winRate', 'dealSize', 'salesCycle', 'qualificationAccuracy'],
      successCriteria: {
        metric: 'winRate',
        improvement: 20,
        confidence: 0.95
      }
    };

    return this.runExperiment(experimentId, setup);
  }

  /**
   * Support Response Quality Test
   */
  async runSupportQualityTest(
    duration: number = 7
  ): Promise<ExperimentResult> {
    const experimentId = uuidv4();
    logger.info('Starting support response quality test', { experimentId, duration });

    const setup: ExperimentSetup = {
      name: 'Support Response Optimization',
      description: 'Test different support response strategies',
      hypothesis: 'Empathetic, solution-focused responses will improve CSAT',
      duration,
      variants: [
        {
          id: 'control',
          name: 'Standard Support Model',
          modelType: 'support',
          modelVersion: 'fine-print-customer:latest',
          allocationPercent: 33,
          parameters: { tone: 'professional' }
        },
        {
          id: 'variant-empathetic',
          name: 'Empathetic Support Model',
          modelType: 'support',
          modelVersion: 'fine-print-customer:latest',
          allocationPercent: 33,
          parameters: { tone: 'empathetic', personalization: 'high' }
        },
        {
          id: 'variant-technical',
          name: 'Technical Support Model',
          modelType: 'support',
          modelVersion: 'fine-print-customer:latest',
          allocationPercent: 34,
          parameters: { tone: 'technical', detail: 'comprehensive' }
        }
      ],
      metrics: ['csat', 'firstContactResolution', 'responseTime', 'ticketReopenRate'],
      successCriteria: {
        metric: 'csat',
        improvement: 10,
        confidence: 0.90
      }
    };

    return this.runExperiment(experimentId, setup);
  }

  /**
   * Analytics Insight Generation Test
   */
  async runAnalyticsInsightTest(
    duration: number = 30
  ): Promise<ExperimentResult> {
    const experimentId = uuidv4();
    logger.info('Starting analytics insight generation test', { experimentId, duration });

    const setup: ExperimentSetup = {
      name: 'Analytics Insight Quality',
      description: 'Test different analytics insight generation approaches',
      hypothesis: 'Predictive analytics will drive better business decisions',
      duration,
      variants: [
        {
          id: 'control',
          name: 'Descriptive Analytics Model',
          modelType: 'analytics',
          modelVersion: 'fine-print-analytics:latest',
          allocationPercent: 50,
          parameters: { mode: 'descriptive', depth: 'standard' }
        },
        {
          id: 'variant-predictive',
          name: 'Predictive Analytics Model',
          modelType: 'analytics',
          modelVersion: 'fine-print-analytics:latest',
          allocationPercent: 50,
          parameters: { mode: 'predictive', forecasting: 'enabled' }
        }
      ],
      metrics: ['insightAccuracy', 'actionability', 'businessImpact', 'adoptionRate'],
      successCriteria: {
        metric: 'businessImpact',
        improvement: 25,
        confidence: 0.95
      }
    };

    return this.runExperiment(experimentId, setup);
  }

  /**
   * Run a custom experiment
   */
  async runExperiment(
    experimentId: string,
    setup: ExperimentSetup
  ): Promise<ExperimentResult> {
    try {
      logger.info('Starting experiment', { experimentId, name: setup.name });

      // Create environment for experiment
      const environment = this.createExperimentEnvironment(setup);
      
      // Initialize simulator with real models
      const simulator = new EnvironmentSimulator(
        environment,
        Date.now(),
        process.env.OLLAMA_URL
      );
      
      this.simulators.set(experimentId, simulator);

      // Create active experiment tracking
      const activeExperiment = new ActiveExperiment(
        experimentId,
        setup,
        simulator
      );
      
      this.activeExperiments.set(experimentId, activeExperiment);

      // Setup simulator event handlers
      this.setupSimulatorHandlers(experimentId, simulator);

      // Prepare model configurations for variants
      const modelConfigs: ModelConfiguration[] = setup.variants.map(v => ({
        id: v.id,
        type: v.modelType,
        version: v.modelVersion,
        parameters: v.parameters || {},
        allocationPercent: v.allocationPercent
      }));

      // Start simulation with real models
      await simulator.startSimulation(
        setup.duration,
        100, // 100x speed for faster experiments
        modelConfigs,
        true // Use real models
      );

      // Wait for completion or timeout
      const result = await this.waitForExperimentCompletion(
        experimentId,
        setup.duration * 1000 // Convert to milliseconds, accounting for speed
      );

      // Store result
      if (!this.experimentResults.has(setup.name)) {
        this.experimentResults.set(setup.name, []);
      }
      this.experimentResults.get(setup.name)!.push(result);

      logger.info('Experiment completed', { experimentId, winner: result.winner });
      
      return result;

    } catch (error) {
      logger.error('Experiment failed', { experimentId, error });
      throw error;
    } finally {
      // Cleanup
      await this.cleanupExperiment(experimentId);
    }
  }

  /**
   * Create environment for experiment
   */
  private createExperimentEnvironment(setup: ExperimentSetup): BusinessEnvironment {
    const segments: CustomerSegment[] = [
      {
        id: 'enterprise',
        name: 'Enterprise',
        size: 1000,
        growthRate: 0.1,
        priceSensitivity: 0.3,
        qualitySensitivity: 0.9,
        brandLoyalty: 0.7,
        churnRate: 0.05,
        averageLifetimeValue: 50000
      },
      {
        id: 'mid-market',
        name: 'Mid-Market',
        size: 5000,
        growthRate: 0.15,
        priceSensitivity: 0.6,
        qualitySensitivity: 0.7,
        brandLoyalty: 0.5,
        churnRate: 0.1,
        averageLifetimeValue: 10000
      },
      {
        id: 'small-business',
        name: 'Small Business',
        size: 20000,
        growthRate: 0.2,
        priceSensitivity: 0.8,
        qualitySensitivity: 0.5,
        brandLoyalty: 0.3,
        churnRate: 0.15,
        averageLifetimeValue: 2000
      }
    ];

    // Filter segments if targeting specified
    const targetSegments = setup.segmentTargeting 
      ? segments.filter(s => setup.segmentTargeting!.includes(s.id))
      : segments;

    return {
      id: uuidv4(),
      name: `Experiment: ${setup.name}`,
      type: EnvironmentType.INTEGRATED,
      parameters: {
        marketSize: 100000,
        competitorCount: 5,
        seasonality: {
          type: 'none',
          factors: []
        },
        economicConditions: {
          growth: 0.03,
          volatility: 0.2,
          consumerConfidence: 0.7
        },
        customerSegments: targetSegments,
        productOfferings: [
          {
            id: 'starter',
            name: 'Starter',
            tier: 'starter',
            price: 99,
            features: ['Basic Analysis', 'Email Support'],
            targetSegments: ['small-business']
          },
          {
            id: 'professional',
            name: 'Professional',
            tier: 'professional',
            price: 499,
            features: ['Advanced Analysis', 'Priority Support', 'API Access'],
            targetSegments: ['mid-market']
          },
          {
            id: 'enterprise',
            name: 'Enterprise',
            tier: 'enterprise',
            price: 2499,
            features: ['Full Suite', 'Dedicated Support', 'Custom Integration'],
            targetSegments: ['enterprise']
          }
        ],
        pricingStrategy: {
          type: 'tiered',
          discountPolicy: {
            volumeDiscounts: [],
            seasonalDiscounts: [],
            loyaltyDiscounts: []
          },
          promotions: []
        }
      },
      state: {
        currentTime: new Date(),
        simulationSpeed: 100,
        isPaused: false,
        customers: [],
        interactions: [],
        transactions: []
      },
      metrics: {} as BusinessMetrics,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Setup simulator event handlers
   */
  private setupSimulatorHandlers(experimentId: string, simulator: EnvironmentSimulator): void {
    simulator.on('simulation:tick', (data) => {
      this.handleSimulationTick(experimentId, data);
    });

    simulator.on('model:invoked', (data) => {
      this.handleModelInvocation(experimentId, data);
    });

    simulator.on('interaction:created', (interaction) => {
      this.emit('experiment:interaction', { experimentId, interaction });
    });

    simulator.on('simulation:complete', (results) => {
      this.handleSimulationComplete(experimentId, results);
    });
  }

  /**
   * Handle simulation tick
   */
  private handleSimulationTick(experimentId: string, data: any): void {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) return;

    experiment.updateMetrics(data.metrics);
    
    // Calculate current progress
    const progress = experiment.getProgress();
    
    // Emit progress update
    this.emit('experiment:progress', {
      experimentId,
      progress
    });

    // Check for early stopping conditions
    if (this.shouldStopEarly(experiment)) {
      logger.info('Stopping experiment early due to clear winner', { experimentId });
      this.stopExperiment(experimentId);
    }
  }

  /**
   * Handle model invocation
   */
  private handleModelInvocation(experimentId: string, data: any): void {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) return;

    experiment.recordModelInvocation(data);
  }

  /**
   * Handle agent invocation (global)
   */
  private handleAgentInvocation(data: any): void {
    // Record global metrics
    this.emit('global:agent:invoked', data);
  }

  /**
   * Handle simulation completion
   */
  private handleSimulationComplete(experimentId: string, results: any): void {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) return;

    experiment.complete(results);
  }

  /**
   * Check if experiment should stop early
   */
  private shouldStopEarly(experiment: ActiveExperiment): boolean {
    const progress = experiment.getProgress();
    
    // Need minimum sample size
    const minSampleSize = 100;
    const allVariantsHaveMinSample = Array.from(progress.variantMetrics.values())
      .every(m => m.sampleSize >= minSampleSize);
    
    if (!allVariantsHaveMinSample) return false;

    // Check if we have a clear winner with high confidence
    if (progress.confidence && progress.confidence > 0.99) {
      const winnerMetrics = progress.variantMetrics.get(progress.currentWinner!);
      const otherMetrics = Array.from(progress.variantMetrics.values())
        .filter(m => m.variantId !== progress.currentWinner);
      
      if (!winnerMetrics || otherMetrics.length === 0) return false;
      
      // Winner should be significantly better
      const improvement = otherMetrics.every(m => 
        winnerMetrics.conversionRate > m.conversionRate * 1.5
      );
      
      return improvement;
    }

    return false;
  }

  /**
   * Stop experiment
   */
  private async stopExperiment(experimentId: string): Promise<void> {
    const simulator = this.simulators.get(experimentId);
    if (simulator) {
      await simulator.stopSimulation();
    }
  }

  /**
   * Wait for experiment completion
   */
  private async waitForExperimentCompletion(
    experimentId: string,
    timeout: number
  ): Promise<ExperimentResult> {
    return new Promise((resolve, reject) => {
      const experiment = this.activeExperiments.get(experimentId);
      if (!experiment) {
        reject(new Error('Experiment not found'));
        return;
      }

      const timeoutHandle = setTimeout(() => {
        reject(new Error('Experiment timeout'));
      }, timeout);

      experiment.once('complete', (result: ExperimentResult) => {
        clearTimeout(timeoutHandle);
        resolve(result);
      });
    });
  }

  /**
   * Cleanup experiment resources
   */
  private async cleanupExperiment(experimentId: string): Promise<void> {
    const simulator = this.simulators.get(experimentId);
    if (simulator) {
      await simulator.stopSimulation();
      this.simulators.delete(experimentId);
    }

    this.activeExperiments.delete(experimentId);
  }

  /**
   * Get experiment history
   */
  getExperimentHistory(experimentName?: string): ExperimentResult[] {
    if (experimentName) {
      return this.experimentResults.get(experimentName) || [];
    }

    const allResults: ExperimentResult[] = [];
    for (const results of this.experimentResults.values()) {
      allResults.push(...results);
    }
    return allResults;
  }

  /**
   * Get active experiments
   */
  getActiveExperiments(): ExperimentProgress[] {
    const active: ExperimentProgress[] = [];
    
    for (const experiment of this.activeExperiments.values()) {
      active.push(experiment.getProgress());
    }
    
    return active;
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    // Stop all active experiments
    for (const experimentId of this.activeExperiments.keys()) {
      await this.cleanupExperiment(experimentId);
    }

    // Cleanup agent connector
    await this.agentConnector.cleanup();
    
    this.removeAllListeners();
    logger.info('Business experiments module cleaned up');
  }
}

/**
 * Active experiment tracking
 */
class ActiveExperiment extends EventEmitter {
  private startTime: Date;
  private variantData: Map<string, VariantData> = new Map();
  private completed: boolean = false;

  constructor(
    public readonly id: string,
    public readonly setup: ExperimentSetup,
    private simulator: EnvironmentSimulator
  ) {
    super();
    this.startTime = new Date();
    
    // Initialize variant data
    for (const variant of setup.variants) {
      this.variantData.set(variant.id, new VariantData(variant));
    }
  }

  updateMetrics(metrics: BusinessMetrics): void {
    // Update variant metrics based on current business metrics
    // This is simplified - in production would track per-variant
  }

  recordModelInvocation(data: any): void {
    const variantId = this.findVariantByModel(data.modelName);
    if (!variantId) return;

    const variant = this.variantData.get(variantId);
    if (variant) {
      variant.recordInvocation(data);
    }
  }

  private findVariantByModel(modelName: string): string | undefined {
    for (const variant of this.setup.variants) {
      if (variant.modelVersion === modelName) {
        return variant.id;
      }
    }
    return undefined;
  }

  getProgress(): ExperimentProgress {
    const variantMetrics = new Map<string, VariantMetrics>();
    
    for (const [id, data] of this.variantData) {
      variantMetrics.set(id, data.getMetrics());
    }

    // Calculate current winner
    let currentWinner: string | undefined;
    let highestConversion = 0;
    
    for (const [id, metrics] of variantMetrics) {
      if (metrics.conversionRate > highestConversion) {
        highestConversion = metrics.conversionRate;
        currentWinner = id;
      }
    }

    // Calculate statistical confidence
    const confidence = this.calculateConfidence(variantMetrics);

    return {
      experimentId: this.id,
      startTime: this.startTime,
      currentTime: new Date(),
      progressPercent: this.calculateProgress(),
      variantMetrics,
      currentWinner,
      confidence,
      estimatedCompletion: this.estimateCompletion()
    };
  }

  private calculateProgress(): number {
    const elapsed = Date.now() - this.startTime.getTime();
    const total = this.setup.duration * 24 * 60 * 60 * 1000 / 100; // Adjusted for simulation speed
    return Math.min(100, (elapsed / total) * 100);
  }

  private calculateConfidence(metrics: Map<string, VariantMetrics>): number {
    // Simplified confidence calculation
    // In production, use proper statistical tests (chi-square, t-test, etc.)
    const samples = Array.from(metrics.values()).map(m => m.sampleSize);
    const minSample = Math.min(...samples);
    
    if (minSample < 30) return 0;
    if (minSample < 100) return 0.8;
    if (minSample < 500) return 0.9;
    return 0.95;
  }

  private estimateCompletion(): Date {
    const totalDuration = this.setup.duration * 24 * 60 * 60 * 1000 / 100;
    return new Date(this.startTime.getTime() + totalDuration);
  }

  complete(results: any): void {
    if (this.completed) return;
    this.completed = true;

    const progress = this.getProgress();
    
    const result: ExperimentResult = {
      experimentId: this.id,
      winner: progress.currentWinner || 'control',
      confidence: progress.confidence || 0,
      lift: this.calculateLift(),
      pValue: this.calculatePValue(),
      sampleSize: this.getTotalSampleSize()
    };

    this.emit('complete', result);
  }

  private calculateLift(): number {
    const progress = this.getProgress();
    const control = progress.variantMetrics.get('control');
    const winner = progress.variantMetrics.get(progress.currentWinner || '');
    
    if (!control || !winner) return 0;
    
    return ((winner.conversionRate - control.conversionRate) / control.conversionRate) * 100;
  }

  private calculatePValue(): number {
    // Simplified p-value calculation
    return 0.05; // In production, use proper statistical calculation
  }

  private getTotalSampleSize(): number {
    let total = 0;
    for (const data of this.variantData.values()) {
      total += data.getSampleSize();
    }
    return total;
  }
}

/**
 * Variant data tracking
 */
class VariantData {
  private invocations: any[] = [];
  private conversions: number = 0;
  private revenue: number = 0;
  private satisfactionScores: number[] = [];
  private responseTimes: number[] = [];
  private errors: number = 0;

  constructor(public readonly variant: ExperimentVariant) {}

  recordInvocation(data: any): void {
    this.invocations.push(data);
    
    if (data.success) {
      this.conversions++;
      if (data.revenue) {
        this.revenue += data.revenue;
      }
    } else {
      this.errors++;
    }

    if (data.metrics?.responseTime) {
      this.responseTimes.push(data.metrics.responseTime);
    }

    if (data.satisfactionScore) {
      this.satisfactionScores.push(data.satisfactionScore);
    }
  }

  getSampleSize(): number {
    return this.invocations.length;
  }

  getMetrics(): VariantMetrics {
    const sampleSize = this.getSampleSize();
    
    return {
      variantId: this.variant.id,
      sampleSize,
      conversionRate: sampleSize > 0 ? this.conversions / sampleSize : 0,
      avgRevenue: sampleSize > 0 ? this.revenue / sampleSize : 0,
      satisfactionScore: this.calculateAverage(this.satisfactionScores),
      responseTime: this.calculateAverage(this.responseTimes),
      errorRate: sampleSize > 0 ? this.errors / sampleSize : 0,
      customMetrics: new Map()
    };
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}