/**
 * Business Environment Simulator
 * Creates realistic business scenarios for testing AI models
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as math from 'mathjs';
import * as ss from 'simple-statistics';
import {
  BusinessEnvironment,
  EnvironmentType,
  EnvironmentParameters,
  EnvironmentState,
  Customer,
  Interaction,
  Transaction,
  BusinessMetrics,
  InteractionType,
  Channel,
  InteractionOutcome,
  CustomerSegment,
  ModelConfiguration
} from '../types';
import { logger } from '../utils/logger';
import { BusinessAgentConnector } from '../integrations/business-agent-connector';

export class EnvironmentSimulator extends EventEmitter {
  private environment: BusinessEnvironment;
  private simulationTimer: NodeJS.Timer | null = null;
  private tickInterval: number = 100; // ms per tick
  private timeMultiplier: number = 1; // simulation speed
  private models: Map<string, ModelConfiguration> = new Map();
  private randomSeed: number;
  private agentConnector: BusinessAgentConnector;
  private useRealModels: boolean = false;
  private modelPerformanceTracking: Map<string, any[]> = new Map();

  constructor(
    environment: BusinessEnvironment,
    seed?: number,
    ollamaUrl?: string
  ) {
    super();
    this.environment = environment;
    this.randomSeed = seed || Date.now();
    this.agentConnector = new BusinessAgentConnector(ollamaUrl);
    this.initializeState();
    this.setupAgentListeners();
  }

  /**
   * Setup listeners for agent events
   */
  private setupAgentListeners(): void {
    this.agentConnector.on('agent:invoked', (data) => {
      this.emit('model:invoked', data);
      this.trackModelPerformance(data);
    });

    this.agentConnector.on('agent:error', (data) => {
      logger.error('Agent invocation error', data);
      this.emit('model:error', data);
    });

    this.agentConnector.on('metrics:recorded', (data) => {
      this.emit('metrics:updated', data);
    });
  }

  private initializeState(): void {
    if (!this.environment.state) {
      this.environment.state = {
        currentTime: new Date(),
        simulationSpeed: 1,
        isPaused: false,
        customers: [],
        interactions: [],
        transactions: []
      };
    }

    // Initialize metrics if not present
    if (!this.environment.metrics) {
      this.environment.metrics = this.calculateInitialMetrics();
    }
  }

  /**
   * Start simulation
   */
  async startSimulation(
    duration: number,
    speed: number = 1,
    models?: ModelConfiguration[],
    useRealModels: boolean = true
  ): Promise<void> {
    logger.info('Starting business environment simulation', {
      environmentId: this.environment.id,
      duration,
      speed,
      useRealModels
    });

    this.timeMultiplier = speed;
    this.environment.state.simulationSpeed = speed;
    this.environment.state.isPaused = false;
    this.useRealModels = useRealModels;

    if (models) {
      models.forEach(model => this.models.set(model.id, model));
    }

    const endTime = new Date(
      this.environment.state.currentTime.getTime() + duration * 24 * 60 * 60 * 1000
    );

    this.simulationTimer = setInterval(() => {
      if (!this.environment.state.isPaused && 
          this.environment.state.currentTime < endTime) {
        this.tick();
      } else if (this.environment.state.currentTime >= endTime) {
        this.stopSimulation();
        this.emit('simulation:complete', this.getResults());
      }
    }, this.tickInterval);

    this.emit('simulation:started', {
      environmentId: this.environment.id,
      startTime: this.environment.state.currentTime,
      endTime
    });
  }

  /**
   * Process one simulation tick
   */
  private tick(): void {
    // Advance time
    const realTimeElapsed = this.tickInterval;
    const simulatedTimeElapsed = realTimeElapsed * this.timeMultiplier;
    
    this.environment.state.currentTime = new Date(
      this.environment.state.currentTime.getTime() + simulatedTimeElapsed
    );

    // Simulate various business activities
    this.simulateCustomerAcquisition();
    this.simulateCustomerInteractions();
    this.simulateTransactions();
    this.simulateChurn();
    this.updateMetrics();

    // Emit tick event
    this.emit('simulation:tick', {
      time: this.environment.state.currentTime,
      metrics: this.environment.metrics
    });
  }

  /**
   * Simulate new customer acquisition
   */
  private simulateCustomerAcquisition(): void {
    const acquisitionRate = this.calculateAcquisitionRate();
    
    if (Math.random() < acquisitionRate) {
      const segment = this.selectCustomerSegment();
      const customer: Customer = {
        id: uuidv4(),
        segmentId: segment.id,
        acquisitionDate: this.environment.state.currentTime,
        status: 'prospect',
        lifetimeValue: 0,
        interactionHistory: [],
        purchaseHistory: [],
        satisfactionScore: 0.7,
        churnProbability: this.calculateInitialChurnProbability(segment)
      };

      this.environment.state.customers.push(customer);
      
      // Trigger initial marketing interaction
      this.createInteraction(customer, InteractionType.MARKETING_EMAIL);
      
      this.emit('customer:acquired', customer);
    }
  }

  /**
   * Simulate customer interactions
   */
  private simulateCustomerInteractions(): void {
    const activeCustomers = this.environment.state.customers.filter(
      c => c.status !== 'churned'
    );

    activeCustomers.forEach(customer => {
      const interactionProbability = this.calculateInteractionProbability(customer);
      
      if (Math.random() < interactionProbability) {
        const interactionType = this.selectInteractionType(customer);
        this.createInteraction(customer, interactionType);
      }
    });
  }

  /**
   * Create and process an interaction
   */
  private async createInteraction(customer: Customer, type: InteractionType): Promise<void> {
    const channel = this.selectChannel(type);
    const model = this.selectModel(type);
    
    // Simulate model processing
    const startTime = Date.now();
    const outcome = await this.simulateModelResponse(customer, type, model);
    const responseTime = Date.now() - startTime;

    const interaction: Interaction = {
      id: uuidv4(),
      customerId: customer.id,
      type,
      channel,
      timestamp: this.environment.state.currentTime,
      outcome,
      modelUsed: model?.id,
      responseTime,
      satisfactionRating: this.calculateSatisfaction(outcome, responseTime)
    };

    this.environment.state.interactions.push(interaction);
    customer.interactionHistory.push(interaction.id);

    // Update customer based on interaction
    this.updateCustomerFromInteraction(customer, interaction);

    this.emit('interaction:created', interaction);
  }

  /**
   * Simulate model response to interaction
   */
  private async simulateModelResponse(
    customer: Customer,
    type: InteractionType,
    model?: ModelConfiguration
  ): Promise<InteractionOutcome> {
    // Use real models if enabled and available
    if (this.useRealModels) {
      try {
        const modelType = this.getModelTypeForInteraction(type);
        const outcome = await this.agentConnector.generateInteractionOutcome(
          customer,
          type,
          modelType,
          model
        );
        
        // Update customer status based on outcome
        if (outcome.conversionType) {
          switch (outcome.conversionType) {
            case 'lead':
              customer.status = 'lead';
              break;
            case 'sale':
              customer.status = 'customer';
              break;
          }
        }
        
        return outcome;
      } catch (error) {
        logger.warn('Failed to use real model, falling back to simulation', error);
        // Fall through to simulated response
      }
    }

    // Simulated response (fallback or when real models disabled)
    const baseSuccessRate = this.getBaseSuccessRate(type);
    const modelBoost = model ? this.getModelBoost(model) : 0;
    const segmentFactor = this.getSegmentFactor(customer.segmentId);
    
    const successProbability = Math.min(1, baseSuccessRate + modelBoost * segmentFactor);
    const success = Math.random() < successProbability;

    let outcome: InteractionOutcome = {
      success,
      sentiment: success ? 0.5 + Math.random() * 0.5 : -0.5 + Math.random() * 0.5
    };

    // Determine conversion based on interaction type
    if (success) {
      switch (type) {
        case InteractionType.MARKETING_EMAIL:
          if (customer.status === 'prospect' && Math.random() < 0.3) {
            outcome.conversionType = 'lead';
            customer.status = 'lead';
          }
          break;
        case InteractionType.SALES_CALL:
          if (customer.status === 'lead' && Math.random() < 0.2) {
            outcome.conversionType = 'sale';
            customer.status = 'customer';
            outcome.revenue = this.calculateDealSize(customer);
          }
          break;
        case InteractionType.RENEWAL_DISCUSSION:
          if (customer.status === 'customer' && Math.random() < 0.8) {
            outcome.conversionType = 'renewal';
            outcome.revenue = this.calculateRenewalValue(customer);
          }
          break;
      }
    }

    return outcome;
  }

  /**
   * Simulate transactions
   */
  private simulateTransactions(): void {
    const customers = this.environment.state.customers.filter(
      c => c.status === 'customer'
    );

    customers.forEach(customer => {
      // Check for recurring billing
      if (this.shouldBillCustomer(customer)) {
        const transaction: Transaction = {
          id: uuidv4(),
          customerId: customer.id,
          type: 'renewal',
          amount: this.calculateMonthlyRevenue(customer),
          product: this.getCustomerProduct(customer),
          timestamp: this.environment.state.currentTime,
          billingPeriod: 'monthly'
        };

        this.environment.state.transactions.push(transaction);
        customer.purchaseHistory.push(transaction.id);
        customer.lifetimeValue += transaction.amount;

        this.emit('transaction:created', transaction);
      }
    });
  }

  /**
   * Simulate customer churn
   */
  private simulateChurn(): void {
    const customers = this.environment.state.customers.filter(
      c => c.status === 'customer'
    );

    customers.forEach(customer => {
      // Update churn probability based on satisfaction
      customer.churnProbability = this.updateChurnProbability(customer);
      
      if (Math.random() < customer.churnProbability / 30) { // Daily churn check
        customer.status = 'churned';
        
        const transaction: Transaction = {
          id: uuidv4(),
          customerId: customer.id,
          type: 'churn',
          amount: 0,
          product: this.getCustomerProduct(customer),
          timestamp: this.environment.state.currentTime,
          billingPeriod: 'monthly'
        };

        this.environment.state.transactions.push(transaction);
        this.emit('customer:churned', customer);
      }
    });
  }

  /**
   * Update business metrics
   */
  private updateMetrics(): void {
    const metrics = this.calculateMetrics();
    this.environment.metrics = metrics;
    
    // Check for anomalies or significant changes
    this.detectAnomalies(metrics);
  }

  /**
   * Calculate current business metrics
   */
  private calculateMetrics(): BusinessMetrics {
    const customers = this.environment.state.customers;
    const interactions = this.environment.state.interactions;
    const transactions = this.environment.state.transactions;

    // Calculate time windows
    const now = this.environment.state.currentTime;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Recent transactions
    const recentTransactions = transactions.filter(
      t => t.timestamp > thirtyDaysAgo
    );

    // Calculate MRR
    const mrr = recentTransactions
      .filter(t => t.type !== 'churn')
      .reduce((sum, t) => sum + t.amount, 0);

    // Customer counts
    const totalCustomers = customers.filter(c => c.status === 'customer').length;
    const newCustomers = customers.filter(
      c => c.status === 'customer' && c.acquisitionDate > thirtyDaysAgo
    ).length;
    const churnedCustomers = customers.filter(
      c => c.status === 'churned' && 
      transactions.find(t => t.customerId === c.id && t.type === 'churn' && t.timestamp > thirtyDaysAgo)
    ).length;

    // Calculate rates
    const churnRate = totalCustomers > 0 ? churnedCustomers / totalCustomers : 0;
    const growthRate = totalCustomers > 0 ? newCustomers / totalCustomers : 0;

    // Marketing metrics
    const leads = customers.filter(c => c.status === 'lead').length;
    const prospects = customers.filter(c => c.status === 'prospect').length;
    const marketingInteractions = interactions.filter(
      i => i.type === InteractionType.MARKETING_EMAIL && i.timestamp > thirtyDaysAgo
    );
    const successfulMarketing = marketingInteractions.filter(i => i.outcome.success);
    
    return {
      revenue: {
        mrr,
        arr: mrr * 12,
        arpu: totalCustomers > 0 ? mrr / totalCustomers : 0,
        ltv: this.calculateAverageLTV(),
        cac: this.calculateCAC(),
        ltvCacRatio: 0, // Will be calculated
        growthRate,
        churnRate,
        netRevenueRetention: this.calculateNRR()
      },
      customers: {
        total: totalCustomers,
        active: totalCustomers - churnedCustomers,
        new: newCustomers,
        churned: churnedCustomers,
        nps: this.calculateNPS(),
        csat: this.calculateCSAT(),
        healthScore: this.calculateHealthScore()
      },
      marketing: {
        leads,
        mql: Math.floor(leads * 0.6),
        sql: Math.floor(leads * 0.3),
        conversionRate: prospects > 0 ? leads / prospects : 0,
        cpl: this.calculateCPL(),
        emailOpenRate: marketingInteractions.length > 0 ? 
          successfulMarketing.length / marketingInteractions.length : 0,
        emailClickRate: successfulMarketing.length > 0 ? 
          successfulMarketing.filter(i => i.outcome.conversionType).length / successfulMarketing.length : 0,
        websiteTraffic: Math.floor(Math.random() * 10000),
        organicTraffic: Math.floor(Math.random() * 6000),
        paidTraffic: Math.floor(Math.random() * 4000)
      },
      sales: this.calculateSalesMetrics(),
      support: this.calculateSupportMetrics(),
      product: this.calculateProductMetrics()
    };
  }

  // Helper methods for calculations
  private calculateAcquisitionRate(): number {
    const baseRate = 0.01; // 1% base acquisition rate
    const marketFactor = this.environment.parameters.marketSize / 1000000;
    const economicFactor = (this.environment.parameters.economicConditions.growth + 1) / 2;
    return baseRate * marketFactor * economicFactor;
  }

  private selectCustomerSegment(): CustomerSegment {
    const segments = this.environment.parameters.customerSegments;
    const totalSize = segments.reduce((sum, s) => sum + s.size, 0);
    const random = Math.random() * totalSize;
    
    let cumulative = 0;
    for (const segment of segments) {
      cumulative += segment.size;
      if (random <= cumulative) {
        return segment;
      }
    }
    
    return segments[0];
  }

  private calculateInitialChurnProbability(segment: CustomerSegment): number {
    return segment.churnRate;
  }

  private calculateInteractionProbability(customer: Customer): number {
    const baseProbability = 0.05; // 5% daily interaction probability
    const satisfactionFactor = customer.satisfactionScore;
    const statusMultiplier = customer.status === 'lead' ? 2 : 1;
    return baseProbability * satisfactionFactor * statusMultiplier;
  }

  private selectInteractionType(customer: Customer): InteractionType {
    const weights = this.getInteractionWeights(customer);
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const random = Math.random() * totalWeight;
    
    let cumulative = 0;
    for (const [type, weight] of Object.entries(weights)) {
      cumulative += weight;
      if (random <= cumulative) {
        return type as InteractionType;
      }
    }
    
    return InteractionType.MARKETING_EMAIL;
  }

  private getInteractionWeights(customer: Customer): Record<InteractionType, number> {
    const weights: Partial<Record<InteractionType, number>> = {};
    
    switch (customer.status) {
      case 'prospect':
        weights[InteractionType.MARKETING_EMAIL] = 10;
        weights[InteractionType.PRODUCT_DEMO] = 2;
        break;
      case 'lead':
        weights[InteractionType.SALES_CALL] = 8;
        weights[InteractionType.PRODUCT_DEMO] = 5;
        weights[InteractionType.MARKETING_EMAIL] = 3;
        break;
      case 'customer':
        weights[InteractionType.SUPPORT_TICKET] = 5;
        weights[InteractionType.FEATURE_REQUEST] = 3;
        weights[InteractionType.RENEWAL_DISCUSSION] = 2;
        weights[InteractionType.COMPLAINT] = 1;
        break;
    }
    
    return weights as Record<InteractionType, number>;
  }

  private selectChannel(type: InteractionType): Channel {
    const channelMap: Record<InteractionType, Channel> = {
      [InteractionType.MARKETING_EMAIL]: Channel.EMAIL,
      [InteractionType.SALES_CALL]: Channel.PHONE,
      [InteractionType.SUPPORT_TICKET]: Channel.CHAT,
      [InteractionType.PRODUCT_DEMO]: Channel.VIDEO,
      [InteractionType.ONBOARDING]: Channel.IN_APP,
      [InteractionType.FEATURE_REQUEST]: Channel.IN_APP,
      [InteractionType.COMPLAINT]: Channel.EMAIL,
      [InteractionType.RENEWAL_DISCUSSION]: Channel.PHONE
    };
    
    return channelMap[type] || Channel.EMAIL;
  }

  private selectModel(type: InteractionType): ModelConfiguration | undefined {
    const modelType = this.getModelTypeForInteraction(type);
    const relevantModels = Array.from(this.models.values()).filter(
      m => m.type === modelType
    );
    
    if (relevantModels.length === 0) return undefined;
    
    // Select model based on allocation percentages
    const totalAllocation = relevantModels.reduce((sum, m) => sum + m.allocationPercent, 0);
    const random = Math.random() * totalAllocation;
    
    let cumulative = 0;
    for (const model of relevantModels) {
      cumulative += model.allocationPercent;
      if (random <= cumulative) {
        return model;
      }
    }
    
    return relevantModels[0];
  }

  private getModelTypeForInteraction(type: InteractionType): string {
    const typeMap: Record<InteractionType, string> = {
      [InteractionType.MARKETING_EMAIL]: 'marketing',
      [InteractionType.SALES_CALL]: 'sales',
      [InteractionType.SUPPORT_TICKET]: 'support',
      [InteractionType.PRODUCT_DEMO]: 'sales',
      [InteractionType.ONBOARDING]: 'support',
      [InteractionType.FEATURE_REQUEST]: 'support',
      [InteractionType.COMPLAINT]: 'support',
      [InteractionType.RENEWAL_DISCUSSION]: 'sales'
    };
    
    return typeMap[type] || 'support';
  }

  // Additional helper methods
  private getBaseSuccessRate(type: InteractionType): number {
    const rates: Record<InteractionType, number> = {
      [InteractionType.MARKETING_EMAIL]: 0.2,
      [InteractionType.SALES_CALL]: 0.15,
      [InteractionType.SUPPORT_TICKET]: 0.8,
      [InteractionType.PRODUCT_DEMO]: 0.3,
      [InteractionType.ONBOARDING]: 0.9,
      [InteractionType.FEATURE_REQUEST]: 0.7,
      [InteractionType.COMPLAINT]: 0.6,
      [InteractionType.RENEWAL_DISCUSSION]: 0.75
    };
    
    return rates[type] || 0.5;
  }

  private getModelBoost(model: ModelConfiguration): number {
    // Simulate model performance boost based on version and parameters
    const versionBoost = parseFloat(model.version) * 0.05;
    const parameterBoost = model.parameters.optimization ? 0.1 : 0;
    return versionBoost + parameterBoost;
  }

  private getSegmentFactor(segmentId: string): number {
    const segment = this.environment.parameters.customerSegments.find(
      s => s.id === segmentId
    );
    
    if (!segment) return 1;
    
    // Higher quality sensitivity means better response to good models
    return 1 + (segment.qualitySensitivity - 0.5);
  }

  private calculateSatisfaction(outcome: InteractionOutcome, responseTime: number): number {
    const outcomeSatisfaction = outcome.success ? 0.8 : 0.3;
    const timeSatisfaction = Math.max(0, 1 - responseTime / 10000); // Penalty for slow response
    const sentimentBoost = (outcome.sentiment + 1) / 4; // Convert -1,1 to 0,0.5
    
    return Math.min(1, outcomeSatisfaction * 0.6 + timeSatisfaction * 0.3 + sentimentBoost * 0.1);
  }

  private updateCustomerFromInteraction(customer: Customer, interaction: Interaction): void {
    // Update satisfaction score (weighted average)
    const weight = 0.1; // Recent interactions have 10% weight
    customer.satisfactionScore = customer.satisfactionScore * (1 - weight) + 
      (interaction.satisfactionRating || 0.5) * weight;
    
    // Update churn probability based on satisfaction
    customer.churnProbability = this.updateChurnProbability(customer);
  }

  private updateChurnProbability(customer: Customer): number {
    const segment = this.environment.parameters.customerSegments.find(
      s => s.id === customer.segmentId
    );
    
    if (!segment) return 0.1;
    
    const baseChurn = segment.churnRate;
    const satisfactionFactor = 1 - customer.satisfactionScore;
    const loyaltyFactor = 1 - segment.brandLoyalty;
    
    return baseChurn * (1 + satisfactionFactor * loyaltyFactor);
  }

  // ... Additional calculation methods

  private calculateInitialMetrics(): BusinessMetrics {
    return {
      revenue: {
        mrr: 0,
        arr: 0,
        arpu: 0,
        ltv: 0,
        cac: 1000,
        ltvCacRatio: 0,
        growthRate: 0,
        churnRate: 0,
        netRevenueRetention: 1
      },
      customers: {
        total: 0,
        active: 0,
        new: 0,
        churned: 0,
        nps: 0,
        csat: 0.5,
        healthScore: 0.5
      },
      marketing: {
        leads: 0,
        mql: 0,
        sql: 0,
        conversionRate: 0,
        cpl: 100,
        emailOpenRate: 0,
        emailClickRate: 0,
        websiteTraffic: 0,
        organicTraffic: 0,
        paidTraffic: 0
      },
      sales: {
        pipeline: 0,
        closedWon: 0,
        closedLost: 0,
        winRate: 0,
        averageDealSize: 0,
        salesCycle: 30,
        quotaAttainment: 0
      },
      support: {
        ticketVolume: 0,
        averageResponseTime: 0,
        averageResolutionTime: 0,
        firstContactResolution: 0,
        ticketBacklog: 0,
        csat: 0.5
      },
      product: {
        activeUsers: 0,
        featureAdoption: new Map(),
        usageFrequency: 0,
        sessionDuration: 0,
        retentionRate: 0,
        engagementScore: 0
      }
    };
  }

  // Remaining helper methods...
  private shouldBillCustomer(customer: Customer): boolean {
    // Simple monthly billing check
    const dayOfMonth = this.environment.state.currentTime.getDate();
    return dayOfMonth === 1; // Bill on the 1st of each month
  }

  private calculateMonthlyRevenue(customer: Customer): number {
    // Base pricing with segment adjustments
    return 100 * (1 + Math.random() * 0.5);
  }

  private getCustomerProduct(customer: Customer): string {
    return 'professional'; // Simplified for now
  }

  private calculateDealSize(customer: Customer): number {
    return 1200; // Annual value
  }

  private calculateRenewalValue(customer: Customer): number {
    return 1200 * (1 + Math.random() * 0.2); // With potential upsell
  }

  private calculateAverageLTV(): number {
    const customers = this.environment.state.customers;
    if (customers.length === 0) return 0;
    
    const totalLTV = customers.reduce((sum, c) => sum + c.lifetimeValue, 0);
    return totalLTV / customers.length;
  }

  private calculateCAC(): number {
    // Simplified CAC calculation
    return 1000;
  }

  private calculateNRR(): number {
    // Simplified NRR
    return 1.1;
  }

  private calculateNPS(): number {
    const customers = this.environment.state.customers.filter(c => c.status === 'customer');
    if (customers.length === 0) return 0;
    
    const promoters = customers.filter(c => c.satisfactionScore > 0.8).length;
    const detractors = customers.filter(c => c.satisfactionScore < 0.6).length;
    
    return ((promoters - detractors) / customers.length) * 100;
  }

  private calculateCSAT(): number {
    const interactions = this.environment.state.interactions;
    if (interactions.length === 0) return 0.5;
    
    const totalSatisfaction = interactions.reduce(
      (sum, i) => sum + (i.satisfactionRating || 0.5), 0
    );
    
    return totalSatisfaction / interactions.length;
  }

  private calculateHealthScore(): number {
    // Composite health score
    const metrics = this.environment.metrics;
    const factors = [
      metrics.revenue.growthRate > 0 ? 1 : 0,
      metrics.revenue.churnRate < 0.1 ? 1 : 0,
      metrics.customers.nps > 0 ? 1 : 0,
      metrics.customers.csat > 0.7 ? 1 : 0
    ];
    
    return factors.reduce((sum, f) => sum + f, 0) / factors.length;
  }

  private calculateCPL(): number {
    return 50; // Simplified
  }

  private calculateSalesMetrics() {
    const interactions = this.environment.state.interactions;
    const salesInteractions = interactions.filter(
      i => i.type === InteractionType.SALES_CALL || i.type === InteractionType.PRODUCT_DEMO
    );
    
    const won = salesInteractions.filter(i => i.outcome.conversionType === 'sale').length;
    const lost = salesInteractions.filter(i => !i.outcome.success).length;
    
    return {
      pipeline: 100000,
      closedWon: won,
      closedLost: lost,
      winRate: won + lost > 0 ? won / (won + lost) : 0,
      averageDealSize: 1200,
      salesCycle: 30,
      quotaAttainment: 0.8
    };
  }

  private calculateSupportMetrics() {
    const interactions = this.environment.state.interactions;
    const supportInteractions = interactions.filter(
      i => i.type === InteractionType.SUPPORT_TICKET
    );
    
    return {
      ticketVolume: supportInteractions.length,
      averageResponseTime: 300,
      averageResolutionTime: 3600,
      firstContactResolution: 0.7,
      ticketBacklog: Math.floor(Math.random() * 20),
      csat: this.calculateCSAT()
    };
  }

  private calculateProductMetrics() {
    const customers = this.environment.state.customers.filter(c => c.status === 'customer');
    
    return {
      activeUsers: customers.length,
      featureAdoption: new Map([
        ['feature1', 0.8],
        ['feature2', 0.6],
        ['feature3', 0.4]
      ]),
      usageFrequency: 5,
      sessionDuration: 1200,
      retentionRate: 0.9,
      engagementScore: 0.7
    };
  }

  private detectAnomalies(metrics: BusinessMetrics): void {
    // Simple anomaly detection
    if (metrics.revenue.churnRate > 0.2) {
      this.emit('anomaly:detected', {
        type: 'high-churn',
        severity: 'high',
        value: metrics.revenue.churnRate
      });
    }
    
    if (metrics.customers.nps < -20) {
      this.emit('anomaly:detected', {
        type: 'low-nps',
        severity: 'high',
        value: metrics.customers.nps
      });
    }
  }

  /**
   * Track model performance for A/B testing
   */
  private trackModelPerformance(data: any): void {
    const { type, modelName, metrics, success } = data;
    
    if (!this.modelPerformanceTracking.has(modelName)) {
      this.modelPerformanceTracking.set(modelName, []);
    }
    
    const tracking = this.modelPerformanceTracking.get(modelName)!;
    tracking.push({
      timestamp: new Date(),
      type,
      success,
      ...metrics
    });
    
    // Keep only last 1000 entries per model
    if (tracking.length > 1000) {
      tracking.shift();
    }
  }

  /**
   * Get model performance comparison for A/B testing
   */
  getModelComparison(): Record<string, any> {
    const comparison: Record<string, any> = {};
    
    for (const [modelName, data] of this.modelPerformanceTracking.entries()) {
      if (data.length === 0) continue;
      
      const successRate = data.filter(d => d.success).length / data.length;
      const avgResponseTime = data.reduce((sum, d) => sum + (d.responseTime || 0), 0) / data.length;
      const avgTokenCount = data.reduce((sum, d) => sum + (d.tokenCount || 0), 0) / data.length;
      
      comparison[modelName] = {
        invocations: data.length,
        successRate,
        avgResponseTime,
        avgTokenCount,
        p95ResponseTime: this.calculatePercentile(data.map(d => d.responseTime || 0), 0.95)
      };
    }
    
    return comparison;
  }

  /**
   * Calculate percentile for array of numbers
   */
  private calculatePercentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] || 0;
  }

  /**
   * Stop simulation
   */
  async stopSimulation(): Promise<void> {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    
    this.environment.state.isPaused = true;
    
    // Get final model performance report
    const modelPerformance = this.agentConnector.getPerformanceReport();
    const modelComparison = this.getModelComparison();
    
    const results = {
      ...this.getResults(),
      modelPerformance,
      modelComparison
    };
    
    this.emit('simulation:stopped', results);
    
    // Cleanup agent connector
    await this.agentConnector.cleanup();
  }

  /**
   * Get simulation results
   */
  getResults(): any {
    return {
      environment: this.environment,
      finalMetrics: this.environment.metrics,
      customers: this.environment.state.customers.length,
      interactions: this.environment.state.interactions.length,
      transactions: this.environment.state.transactions.length,
      duration: this.environment.state.currentTime,
      useRealModels: this.useRealModels
    };
  }
}