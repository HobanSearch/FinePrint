import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';

import { Logger } from '../utils/logger';
import { config } from '../config';
import {
  DecisionType,
  DecisionStrategy,
  DecisionRequest,
  DecisionResult,
  DecisionPolicy,
  ConflictResolution,
  EscalationPolicy,
  DecisionAudit,
  AgentAuthorityMatrix,
  DecisionMetrics,
} from '../types/decision';
import { AgentRegistry } from './agent-registry';
import { ResourceManager } from './resource-manager';

const logger = Logger.child({ component: 'decision-engine' });

export class DecisionEngine extends EventEmitter {
  private policies: Map<string, DecisionPolicy> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private authorityMatrix: Map<string, AgentAuthorityMatrix> = new Map();
  private auditLog: Map<string, DecisionAudit[]> = new Map();
  private pendingDecisions: Map<string, DecisionRequest> = new Map();
  private conflictResolutions: Map<string, ConflictResolution> = new Map();
  private decisionMetrics: DecisionMetrics;

  constructor(
    private agentRegistry: AgentRegistry,
    private resourceManager: ResourceManager
  ) {
    super();
    this.initializeMetrics();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Decision Engine...');

      // Load existing policies
      await this.loadPolicies();
      await this.loadEscalationPolicies();
      await this.loadAuthorityMatrix();

      // Setup default policies
      await this.setupDefaultPolicies();

      logger.info('Decision Engine initialized successfully', {
        policyCount: this.policies.size,
        escalationPolicyCount: this.escalationPolicies.size,
        authorityMatrixCount: this.authorityMatrix.size,
      });
    } catch (error) {
      logger.error('Failed to initialize Decision Engine', { error: error.message });
      throw error;
    }
  }

  // Core Decision Making
  async makeDecision(request: DecisionRequest): Promise<DecisionResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Processing decision request', {
        requestId: request.id,
        type: request.type,
        strategy: request.strategy,
        optionCount: request.options.length,
      });

      // Store pending decision
      this.pendingDecisions.set(request.id, request);

      // Find applicable policies
      const applicablePolicies = this.findApplicablePolicies(request);

      // Apply constraints
      const validOptions = this.applyConstraints(request.options, request.constraints);
      
      if (validOptions.length === 0) {
        throw new Error('No valid options after applying constraints');
      }

      // Execute decision strategy
      const result = await this.executeDecisionStrategy(
        request,
        validOptions,
        applicablePolicies
      );

      // Calculate processing time
      result.processingTime = Date.now() - startTime;

      // Audit the decision
      await this.auditDecision(request, result);

      // Update metrics
      this.updateMetrics(request, result);

      // Remove from pending
      this.pendingDecisions.delete(request.id);

      this.emit('decision:made', { request, result });

      logger.info('Decision made', {
        requestId: request.id,
        selectedOptionId: result.selectedOption.id,
        score: result.score,
        confidence: result.confidence,
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      logger.error('Decision making failed', {
        requestId: request.id,
        error: error.message,
        processingTime: Date.now() - startTime,
      });

      // Handle escalation if needed
      if (this.shouldEscalate(request, error)) {
        await this.escalateDecision(request, error);
      }

      throw error;
    }
  }

  // Decision Strategies
  private async executeDecisionStrategy(
    request: DecisionRequest,
    options: any[],
    policies: DecisionPolicy[]
  ): Promise<DecisionResult> {
    switch (request.strategy) {
      case DecisionStrategy.ROUND_ROBIN:
        return this.roundRobinStrategy(request, options);
      
      case DecisionStrategy.LEAST_LOADED:
        return this.leastLoadedStrategy(request, options);
      
      case DecisionStrategy.WEIGHTED_ROUND_ROBIN:
        return this.weightedRoundRobinStrategy(request, options);
      
      case DecisionStrategy.CAPABILITY_BASED:
        return this.capabilityBasedStrategy(request, options);
      
      case DecisionStrategy.PERFORMANCE_BASED:
        return this.performanceBasedStrategy(request, options);
      
      case DecisionStrategy.COST_OPTIMIZED:
        return this.costOptimizedStrategy(request, options);
      
      case DecisionStrategy.CUSTOM:
        return this.customStrategy(request, options, policies);
      
      default:
        return this.multiCriteriaStrategy(request, options);
    }
  }

  private async multiCriteriaStrategy(
    request: DecisionRequest,
    options: any[]
  ): Promise<DecisionResult> {
    const scores = new Map<string, { score: number; reasoning: any[] }>();

    for (const option of options) {
      let totalScore = 0;
      const reasoning: any[] = [];

      for (const criterion of request.criteria) {
        const value = this.extractCriterionValue(option, criterion);
        const normalizedScore = this.normalizeCriterionScore(value, criterion, options);
        const weightedScore = normalizedScore * criterion.weight;

        totalScore += weightedScore;
        reasoning.push({
          criterion: criterion.name,
          weight: criterion.weight,
          score: normalizedScore,
          explanation: `${criterion.name}: ${value} -> ${normalizedScore.toFixed(2)} (weighted: ${weightedScore.toFixed(2)})`,
          evidence: { value, normalizedScore, weightedScore },
        });
      }

      scores.set(option.id, { score: totalScore, reasoning });
    }

    // Find the best option
    const bestEntry = Array.from(scores.entries())
      .reduce((best, current) => 
        current[1].score > best[1].score ? current : best
      );

    const [bestOptionId, { score, reasoning }] = bestEntry;
    const selectedOption = options.find(opt => opt.id === bestOptionId)!;

    // Calculate confidence based on score distribution
    const allScores = Array.from(scores.values()).map(s => s.score);
    const confidence = this.calculateConfidence(score, allScores);

    // Generate alternatives
    const alternatives = Array.from(scores.entries())
      .filter(([id]) => id !== bestOptionId)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3) // Top 3 alternatives
      .map(([id, data]) => ({
        option: options.find(opt => opt.id === id)!,
        score: data.score,
        reason: `Score: ${data.score.toFixed(2)}`,
      }));

    return {
      id: uuidv4(),
      requestId: request.id,
      selectedOption,
      score,
      confidence,
      reasoning,
      alternatives,
      processedAt: new Date(),
      processingTime: 0, // Will be set by caller
      metadata: {
        strategy: 'multi_criteria',
        totalOptions: options.length,
      },
    };
  }

  // Conflict Resolution
  async resolveConflict(
    type: string,
    conflictingItems: any[],
    strategy: string = 'priority_based'
  ): Promise<ConflictResolution> {
    const conflictId = uuidv4();
    const startTime = Date.now();

    try {
      logger.info('Resolving conflict', {
        conflictId,
        type,
        itemCount: conflictingItems.length,
        strategy,
      });

      let resolution: any = {};

      switch (strategy) {
        case 'first_come_first_serve':
          resolution = this.resolveByTimestamp(conflictingItems);
          break;
        
        case 'priority_based':
          resolution = this.resolveByPriority(conflictingItems);
          break;
        
        case 'negotiation':
          resolution = await this.resolveByNegotiation(conflictingItems);
          break;
        
        case 'resource_sharing':
          resolution = await this.resolveByResourceSharing(conflictingItems);
          break;
        
        case 'escalation':
          resolution = await this.resolveByEscalation(conflictingItems);
          break;

        default:
          throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
      }

      const conflictResolution: ConflictResolution = {
        id: conflictId,
        type: type as any,
        conflictingItems,
        resolutionStrategy: strategy as any,
        resolution,
        resolvedAt: new Date(),
        processingTime: Date.now() - startTime,
        metadata: {},
      };

      this.conflictResolutions.set(conflictId, conflictResolution);

      this.emit('conflict:resolved', { conflictId, resolution: conflictResolution });

      logger.info('Conflict resolved', {
        conflictId,
        strategy,
        processingTime: conflictResolution.processingTime,
      });

      return conflictResolution;
    } catch (error) {
      logger.error('Conflict resolution failed', {
        conflictId,
        type,
        strategy,
        error: error.message,
      });
      throw error;
    }
  }

  // Policy Management
  async createPolicy(policy: DecisionPolicy): Promise<string> {
    this.validatePolicy(policy);
    this.policies.set(policy.id, policy);

    this.emit('policy:created', { policyId: policy.id, policy });

    logger.info('Decision policy created', {
      policyId: policy.id,
      name: policy.name,
      type: policy.type,
      priority: policy.priority,
    });

    return policy.id;
  }

  async updatePolicy(policyId: string, updates: Partial<DecisionPolicy>): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const updatedPolicy = { ...policy, ...updates, updatedAt: new Date() };
    this.validatePolicy(updatedPolicy);
    
    this.policies.set(policyId, updatedPolicy);

    this.emit('policy:updated', { policyId, oldPolicy: policy, newPolicy: updatedPolicy });

    logger.info('Decision policy updated', { policyId, updates: Object.keys(updates) });
  }

  async deletePolicy(policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    this.policies.delete(policyId);

    this.emit('policy:deleted', { policyId, policy });

    logger.info('Decision policy deleted', { policyId });
  }

  // Escalation Management
  private async escalateDecision(request: DecisionRequest, error: Error): Promise<void> {
    const escalationId = uuidv4();
    
    logger.warn('Escalating decision', {
      escalationId,
      requestId: request.id,
      error: error.message,
    });

    // Find applicable escalation policy
    const escalationPolicy = this.findEscalationPolicy(request);
    
    if (escalationPolicy) {
      await this.executeEscalation(escalationId, escalationPolicy, request, error);
    } else {
      // Default escalation to human operator
      await this.notifyHumanOperator(escalationId, request, error);
    }

    this.emit('decision:escalated', {
      escalationId,
      requestId: request.id,
      error: error.message,
    });
  }

  // Authority Matrix
  async checkAuthority(
    agentType: string,
    domain: string,
    level: string,
    context: Record<string, any> = {}
  ): Promise<boolean> {
    const authority = this.authorityMatrix.get(agentType);
    if (!authority) {
      return false;
    }

    // Check direct authority
    const directAuthority = authority.authorities.find(auth => 
      auth.domain === domain && this.hasRequiredLevel(auth.level, level)
    );

    if (directAuthority) {
      // Check constraints
      return this.evaluateAuthorityConstraints(directAuthority.constraints, context);
    }

    // Check delegated authority
    for (const delegation of authority.delegations) {
      if (delegation.domain === domain && 
          this.hasRequiredLevel(delegation.level, level) &&
          this.evaluateDelegationConditions(delegation.conditions, context)) {
        return true;
      }
    }

    return false;
  }

  // Utility Methods
  private extractCriterionValue(option: any, criterion: any): number {
    const value = _.get(option.attributes, criterion.name);
    
    if (typeof value === 'number') {
      return value;
    } else if (typeof value === 'boolean') {
      return value ? 1 : 0;
    } else if (typeof value === 'string') {
      // Convert categorical values to numbers
      return this.categoricalToNumeric(value, criterion);
    }
    
    return 0;
  }

  private normalizeCriterionScore(
    value: number,
    criterion: any,
    allOptions: any[]
  ): number {
    const allValues = allOptions.map(opt => this.extractCriterionValue(opt, criterion));
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    
    if (min === max) return 1; // All values are the same
    
    let normalized = (value - min) / (max - min);
    
    // Reverse for minimize criteria
    if (criterion.direction === 'minimize') {
      normalized = 1 - normalized;
    }
    
    return normalized;
  }

  private calculateConfidence(bestScore: number, allScores: number[]): number {
    if (allScores.length <= 1) return 1;
    
    const sortedScores = allScores.sort((a, b) => b - a);
    const bestScore2 = sortedScores[0];
    const secondBest = sortedScores[1];
    
    // Confidence based on gap between best and second-best
    const gap = bestScore2 - secondBest;
    const maxPossibleGap = bestScore2;
    
    return Math.min(gap / maxPossibleGap, 1);
  }

  private findApplicablePolicies(request: DecisionRequest): DecisionPolicy[] {
    return Array.from(this.policies.values())
      .filter(policy => 
        policy.enabled && 
        policy.type === request.type &&
        this.evaluatePolicyConditions(policy, request)
      )
      .sort((a, b) => b.priority - a.priority);
  }

  private applyConstraints(options: any[], constraints: any[]): any[] {
    return options.filter(option => 
      constraints.every(constraint => 
        this.evaluateConstraint(option, constraint)
      )
    );
  }

  private evaluateConstraint(option: any, constraint: any): boolean {
    const value = _.get(option.attributes, constraint.field);
    
    switch (constraint.operator) {
      case 'equals':
        return value === constraint.value;
      case 'not_equals':
        return value !== constraint.value;
      case 'greater_than':
        return value > constraint.value;
      case 'less_than':
        return value < constraint.value;
      case 'in':
        return Array.isArray(constraint.value) && constraint.value.includes(value);
      case 'not_in':
        return Array.isArray(constraint.value) && !constraint.value.includes(value);
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return false;
    }
  }

  private async auditDecision(request: DecisionRequest, result: DecisionResult): Promise<void> {
    if (!config.decisions.auditEnabled) return;

    const audit: DecisionAudit = {
      id: uuidv4(),
      requestId: request.id,
      decisionId: result.id,
      action: 'created',
      newState: {
        selectedOption: result.selectedOption.id,
        score: result.score,
        confidence: result.confidence,
      },
      reason: 'Decision made by engine',
      timestamp: new Date(),
      metadata: {
        strategy: request.strategy,
        criteriaCount: request.criteria.length,
        processingTime: result.processingTime,
      },
    };

    const auditLog = this.auditLog.get(request.id) || [];
    auditLog.push(audit);
    this.auditLog.set(request.id, auditLog);

    this.emit('decision:audited', { audit });
  }

  private initializeMetrics(): void {
    this.decisionMetrics = {
      totalDecisions: 0,
      averageProcessingTime: 0,
      accuracyRate: 0,
      conflictRate: 0,
      escalationRate: 0,
      strategyEffectiveness: {} as any,
      criteriaImportance: {},
      performanceTrends: [],
    };
  }

  private updateMetrics(request: DecisionRequest, result: DecisionResult): void {
    this.decisionMetrics.totalDecisions++;
    
    // Update average processing time
    const totalTime = this.decisionMetrics.averageProcessingTime * (this.decisionMetrics.totalDecisions - 1);
    this.decisionMetrics.averageProcessingTime = 
      (totalTime + result.processingTime) / this.decisionMetrics.totalDecisions;

    // Update strategy effectiveness
    if (!this.decisionMetrics.strategyEffectiveness[request.strategy]) {
      this.decisionMetrics.strategyEffectiveness[request.strategy] = {
        usage: 0,
        successRate: 0,
        averageScore: 0,
      };
    }

    const strategyStats = this.decisionMetrics.strategyEffectiveness[request.strategy];
    strategyStats.usage++;
    strategyStats.averageScore = 
      (strategyStats.averageScore * (strategyStats.usage - 1) + result.score) / strategyStats.usage;

    // Update criteria importance
    for (const reasoning of result.reasoning) {
      if (!this.decisionMetrics.criteriaImportance[reasoning.criterion]) {
        this.decisionMetrics.criteriaImportance[reasoning.criterion] = 0;
      }
      this.decisionMetrics.criteriaImportance[reasoning.criterion] += reasoning.weight;
    }
  }

  // Strategy Implementations (simplified)
  private async roundRobinStrategy(request: DecisionRequest, options: any[]): Promise<DecisionResult> {
    // Simple round-robin based on usage count
    const selected = options.reduce((best, current) => 
      (current.metadata?.usageCount || 0) < (best.metadata?.usageCount || 0) ? current : best
    );

    return this.createSimpleResult(request, selected, options, 'round_robin');
  }

  private async leastLoadedStrategy(request: DecisionRequest, options: any[]): Promise<DecisionResult> {
    const selected = options.reduce((best, current) => 
      (current.attributes?.load || 0) < (best.attributes?.load || 0) ? current : best
    );

    return this.createSimpleResult(request, selected, options, 'least_loaded');
  }

  private createSimpleResult(
    request: DecisionRequest,
    selectedOption: any,
    options: any[],
    strategy: string
  ): DecisionResult {
    const alternatives = options
      .filter(opt => opt.id !== selectedOption.id)
      .slice(0, 3)
      .map(opt => ({
        option: opt,
        score: 0.5,
        reason: `Alternative option`,
      }));

    return {
      id: uuidv4(),
      requestId: request.id,
      selectedOption,
      score: 1.0,
      confidence: 0.8,
      reasoning: [{
        criterion: 'strategy',
        weight: 1.0,
        score: 1.0,
        explanation: `Selected by ${strategy} strategy`,
        evidence: { strategy },
      }],
      alternatives,
      processedAt: new Date(),
      processingTime: 0,
      metadata: { strategy },
    };
  }

  // Placeholder implementations for other methods
  private async loadPolicies(): Promise<void> { /* Load from database */ }
  private async loadEscalationPolicies(): Promise<void> { /* Load from database */ }
  private async loadAuthorityMatrix(): Promise<void> { /* Load from database */ }
  private async setupDefaultPolicies(): Promise<void> { /* Setup defaults */ }
  private validatePolicy(policy: DecisionPolicy): void { /* Validate policy */ }
  private evaluatePolicyConditions(policy: DecisionPolicy, request: DecisionRequest): boolean { return true; }
  private shouldEscalate(request: DecisionRequest, error: Error): boolean { return false; }
  private findEscalationPolicy(request: DecisionRequest): EscalationPolicy | null { return null; }
  private async executeEscalation(id: string, policy: EscalationPolicy, request: DecisionRequest, error: Error): Promise<void> { }
  private async notifyHumanOperator(id: string, request: DecisionRequest, error: Error): Promise<void> { }
  private hasRequiredLevel(authLevel: string, requiredLevel: string): boolean { return true; }
  private evaluateAuthorityConstraints(constraints: Record<string, any>, context: Record<string, any>): boolean { return true; }
  private evaluateDelegationConditions(conditions: string[], context: Record<string, any>): boolean { return true; }
  private categoricalToNumeric(value: string, criterion: any): number { return 0; }
  private resolveByTimestamp(items: any[]): any { return { winner: items[0]?.id }; }
  private resolveByPriority(items: any[]): any { return { winner: items[0]?.id }; }
  private async resolveByNegotiation(items: any[]): Promise<any> { return { compromise: {} }; }
  private async resolveByResourceSharing(items: any[]): Promise<any> { return { allocation: {} }; }
  private async resolveByEscalation(items: any[]): Promise<any> { return { escalatedTo: 'human' }; }
  private async weightedRoundRobinStrategy(request: DecisionRequest, options: any[]): Promise<DecisionResult> { return this.roundRobinStrategy(request, options); }
  private async capabilityBasedStrategy(request: DecisionRequest, options: any[]): Promise<DecisionResult> { return this.multiCriteriaStrategy(request, options); }
  private async performanceBasedStrategy(request: DecisionRequest, options: any[]): Promise<DecisionResult> { return this.multiCriteriaStrategy(request, options); }
  private async costOptimizedStrategy(request: DecisionRequest, options: any[]): Promise<DecisionResult> { return this.multiCriteriaStrategy(request, options); }
  private async customStrategy(request: DecisionRequest, options: any[], policies: DecisionPolicy[]): Promise<DecisionResult> { return this.multiCriteriaStrategy(request, options); }

  // Public getters
  getMetrics(): DecisionMetrics {
    return { ...this.decisionMetrics };
  }

  getPolicies(): Map<string, DecisionPolicy> {
    return this.policies;
  }

  getAuditLog(requestId: string): DecisionAudit[] {
    return this.auditLog.get(requestId) || [];
  }
}