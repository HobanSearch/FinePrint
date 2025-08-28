import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import _ from 'lodash';
import PQueue from 'p-queue';

import { Logger } from '../utils/logger';
import { config } from '../config';
import {
  AgentCapability,
  AgentRegistration,
  AgentHealth,
  TaskSchedulingRequest,
  TaskSchedulingResult,
  TaskSchedulingStrategy,
  AffinityRule,
  DecisionRequest,
  DecisionResult,
  OrchestrationEvent,
  EventType,
} from '../types/orchestration';
import { DecisionEngine } from './decision-engine';
import { ResourceManager } from './resource-manager';

const logger = Logger.child({ component: 'agent-capability-registry' });

interface AgentInstance {
  registration: AgentRegistration;
  health: AgentHealth;
  currentLoad: number;
  assignedTasks: string[];
  performance: {
    averageResponseTime: number;
    successRate: number;
    errorRate: number;
    totalRequests: number;
  };
  lastHealthCheck: Date;
  capabilities: Map<string, AgentCapability>;
}

interface CapabilityIndex {
  capabilityId: string;
  agentIds: string[];
  metadata: {
    complexity: 'simple' | 'medium' | 'complex';
    category: string;
    estimatedDuration: number;
    qualityScore: number;
  };
}

export class AgentCapabilityRegistry extends EventEmitter {
  private agents: Map<string, AgentInstance> = new Map();
  private capabilities: Map<string, AgentCapability> = new Map();
  private capabilityIndex: Map<string, CapabilityIndex> = new Map();
  private taskQueue: PQueue;
  private healthCheckInterval?: NodeJS.Timeout;
  private performanceInterval?: NodeJS.Timeout;
  private running: boolean = false;

  constructor(
    private decisionEngine: DecisionEngine,
    private resourceManager: ResourceManager
  ) {
    super();
    
    // Initialize task scheduling queue
    this.taskQueue = new PQueue({
      concurrency: 100, // High concurrency for task assignment
      intervalCap: 1000,
      interval: 1000,
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Agent Capability Registry...');

      // Load existing agents and capabilities
      await this.loadAgentRegistrations();
      await this.loadCapabilities();
      
      // Build capability index
      this.buildCapabilityIndex();
      
      // Start background services
      this.startHealthMonitoring();
      this.startPerformanceTracking();
      this.startLoadBalancing();

      this.running = true;

      logger.info('Agent Capability Registry initialized successfully', {
        agentCount: this.agents.size,
        capabilityCount: this.capabilities.size,
        indexedCapabilities: this.capabilityIndex.size,
      });
    } catch (error) {
      logger.error('Failed to initialize Agent Capability Registry', { error: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Agent Capability Registry...');
    
    this.running = false;

    // Stop background services
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }

    // Pause and drain task queue
    this.taskQueue.pause();
    await this.taskQueue.onIdle();

    logger.info('Agent Capability Registry stopped');
  }

  // Agent Registration and Management
  async registerAgent(registration: AgentRegistration): Promise<void> {
    try {
      logger.info('Registering agent', { 
        agentId: registration.id,
        agentType: registration.type,
        capabilityCount: registration.capabilities.length,
      });

      // Validate agent registration
      await this.validateAgentRegistration(registration);

      // Create agent instance
      const agentInstance: AgentInstance = {
        registration,
        health: {
          agentId: registration.id,
          status: 'unknown',
          lastCheckAt: new Date(),
          responseTime: 0,
          errorRate: 0,
          throughput: 0,
          load: { cpu: 0, memory: 0, storage: 0, network: 0 },
          currentTasks: 0,
          queuedTasks: 0,
          errors: [],
          metrics: {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            avgResponseTime: 0,
            p95ResponseTime: 0,
          },
        },
        currentLoad: 0,
        assignedTasks: [],
        performance: {
          averageResponseTime: 0,
          successRate: 1.0,
          errorRate: 0,
          totalRequests: 0,
        },
        lastHealthCheck: new Date(),
        capabilities: new Map(),
      };

      // Index capabilities
      for (const capability of registration.capabilities) {
        agentInstance.capabilities.set(capability.id, capability);
        this.capabilities.set(capability.id, capability);
        this.updateCapabilityIndex(capability, registration.id);
      }

      this.agents.set(registration.id, agentInstance);

      // Perform initial health check
      await this.performHealthCheck(registration.id);

      // Emit registration event
      this.emit('agent:registered', { 
        agentId: registration.id,
        agentType: registration.type,
        capabilities: registration.capabilities.map(c => c.id),
      });

      logger.info('Agent registered successfully', { 
        agentId: registration.id,
        status: agentInstance.health.status,
      });
    } catch (error) {
      logger.error('Failed to register agent', { 
        agentId: registration.id,
        error: error.message,
      });
      throw error;
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agentInstance = this.agents.get(agentId);
    if (!agentInstance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    logger.info('Unregistering agent', { agentId });

    // Cancel assigned tasks
    for (const taskId of agentInstance.assignedTasks) {
      await this.reassignTask(taskId, agentId);
    }

    // Remove from capability index
    for (const capability of agentInstance.capabilities.values()) {
      this.removeFromCapabilityIndex(capability.id, agentId);
    }

    // Remove agent
    this.agents.delete(agentId);

    this.emit('agent:unregistered', { agentId });
    
    logger.info('Agent unregistered successfully', { agentId });
  }

  // Dynamic Agent Discovery
  async discoverAgents(criteria: {
    capabilities?: string[];
    agentTypes?: string[];
    healthStatus?: string[];
    maxResponseTime?: number;
    minSuccessRate?: number;
    region?: string;
  }): Promise<AgentRegistration[]> {
    const matchingAgents: AgentRegistration[] = [];

    for (const [agentId, instance] of this.agents.entries()) {
      let matches = true;

      // Check capabilities
      if (criteria.capabilities && criteria.capabilities.length > 0) {
        const hasAllCapabilities = criteria.capabilities.every(capId => 
          instance.capabilities.has(capId)
        );
        if (!hasAllCapabilities) matches = false;
      }

      // Check agent types
      if (criteria.agentTypes && criteria.agentTypes.length > 0) {
        if (!criteria.agentTypes.includes(instance.registration.type)) {
          matches = false;
        }
      }

      // Check health status
      if (criteria.healthStatus && criteria.healthStatus.length > 0) {
        if (!criteria.healthStatus.includes(instance.health.status)) {
          matches = false;
        }
      }

      // Check response time
      if (criteria.maxResponseTime && instance.health.responseTime > criteria.maxResponseTime) {
        matches = false;
      }

      // Check success rate
      if (criteria.minSuccessRate && instance.performance.successRate < criteria.minSuccessRate) {
        matches = false;
      }

      // Check region (from metadata)
      if (criteria.region && instance.registration.metadata.region !== criteria.region) {
        matches = false;
      }

      if (matches) {
        matchingAgents.push(instance.registration);
      }
    }

    logger.debug('Agent discovery completed', {
      criteria,
      matchingAgents: matchingAgents.length,
    });

    return matchingAgents;
  }

  // Intelligent Task Assignment
  async assignTask(request: TaskSchedulingRequest): Promise<TaskSchedulingResult> {
    try {
      logger.debug('Processing task assignment request', { 
        requestId: request.id,
        workflowExecutionId: request.workflowExecutionId,
        priority: request.priority,
      });

      // Find candidate agents
      const candidates = await this.findCandidateAgents(request);
      
      if (candidates.length === 0) {
        return {
          requestId: request.id,
          status: 'rejected',
          reason: 'No suitable agents found',
        };
      }

      // Use decision engine to select best agent
      const decision = await this.selectOptimalAgent(request, candidates);
      
      if (!decision.selectedOption) {
        return {
          requestId: request.id,
          status: 'failed',
          reason: 'Agent selection failed',
        };
      }

      const selectedAgent = decision.selectedOption.metadata.agent as AgentInstance;
      
      // Assign task to selected agent
      await this.assignTaskToAgent(request, selectedAgent);

      return {
        requestId: request.id,
        status: 'scheduled',
        assignedAgent: selectedAgent.registration.id,
        scheduledAt: new Date(),
        estimatedStartTime: this.calculateEstimatedStartTime(selectedAgent),
        estimatedDuration: this.estimateTaskDuration(request, selectedAgent),
        estimatedCost: this.estimateTaskCost(request, selectedAgent),
        alternatives: decision.alternatives.slice(0, 3).map(alt => ({
          agentId: alt.option.metadata.agent.registration.id,
          score: alt.score,
          reasons: alt.reasons,
        })),
      };
    } catch (error) {
      logger.error('Failed to assign task', { 
        requestId: request.id,
        error: error.message,
      });
      
      return {
        requestId: request.id,
        status: 'failed',
        reason: error.message,
      };
    }
  }

  // Load Balancing
  private async findCandidateAgents(request: TaskSchedulingRequest): Promise<AgentInstance[]> {
    const candidates: AgentInstance[] = [];

    // Get agents with required capabilities
    const requiredCapabilities = request.requirements.capabilities;
    const potentialAgents = new Set<string>();

    for (const capabilityId of requiredCapabilities) {
      const capabilityIndex = this.capabilityIndex.get(capabilityId);
      if (capabilityIndex) {
        capabilityIndex.agentIds.forEach(agentId => potentialAgents.add(agentId));
      }
    }

    // Filter agents based on requirements and constraints
    for (const agentId of potentialAgents) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;

      // Check if agent has all required capabilities
      const hasAllCapabilities = requiredCapabilities.every(capId => 
        agent.capabilities.has(capId)
      );
      if (!hasAllCapabilities) continue;

      // Check health status
      if (agent.health.status !== 'healthy' && agent.health.status !== 'degraded') {
        continue;
      }

      // Check load capacity
      if (agent.currentLoad >= agent.registration.loadBalancing.maxConcurrentTasks) {
        continue;
      }

      // Check resource requirements
      if (request.requirements.resources) {
        if (!this.checkResourceCompatibility(request.requirements.resources, agent)) {
          continue;
        }
      }

      // Check constraints
      if (request.requirements.constraints) {
        if (!this.checkTaskConstraints(request.requirements.constraints, agent)) {
          continue;
        }
      }

      candidates.push(agent);
    }

    // Sort candidates by priority and performance
    candidates.sort((a, b) => {
      // Primary sort: priority (higher is better)
      const priorityDiff = b.registration.loadBalancing.priority - a.registration.loadBalancing.priority;
      if (priorityDiff !== 0) return priorityDiff;
      
      // Secondary sort: current load (lower is better)
      const loadDiff = a.currentLoad - b.currentLoad;
      if (loadDiff !== 0) return loadDiff;
      
      // Tertiary sort: performance (higher success rate is better)
      return b.performance.successRate - a.performance.successRate;
    });

    return candidates;
  }

  private async selectOptimalAgent(
    request: TaskSchedulingRequest,
    candidates: AgentInstance[]
  ): Promise<DecisionResult> {
    // Prepare decision request
    const decisionRequest: DecisionRequest = {
      id: uuidv4(),
      type: 'agent_selection',
      context: { task: request },
      constraints: this.buildDecisionConstraints(request),
      criteria: this.buildDecisionCriteria(request),
      options: candidates.map(agent => ({
        id: agent.registration.id,
        type: 'agent',
        attributes: {
          load: agent.currentLoad,
          performance: agent.performance.successRate,
          responseTime: agent.health.responseTime,
          availability: agent.health.status === 'healthy' ? 1 : 0.5,
          cost: this.calculateAgentCost(agent),
          priority: agent.registration.loadBalancing.priority,
          weight: agent.registration.loadBalancing.weight,
        },
        cost: this.calculateAgentCost(agent),
        availability: agent.health.status === 'healthy',
        metadata: { agent },
      })),
      strategy: this.mapSchedulingStrategy(request.scheduling.strategy),
      timeout: 5000,
      metadata: { requestId: request.id },
      createdAt: new Date(),
    };

    return await this.decisionEngine.makeDecision(decisionRequest);
  }

  // Health Monitoring
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (!this.running) return;

      for (const [agentId] of this.agents.entries()) {
        await this.performHealthCheck(agentId);
      }
    }, 30000); // Check every 30 seconds
  }

  private async performHealthCheck(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    try {
      const startTime = Date.now();
      
      // Perform health check request
      const healthCheckUrl = agent.registration.healthCheck.url;
      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        timeout: agent.registration.healthCheck.timeout,
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.ok;

      // Update health metrics
      agent.health.lastCheckAt = new Date();
      agent.health.responseTime = responseTime;
      
      const previousStatus = agent.health.status;
      agent.health.status = isHealthy ? 'healthy' : 'degraded';

      // Parse health response if available
      if (response.headers.get('content-type')?.includes('application/json')) {
        const healthData = await response.json();
        this.updateHealthMetrics(agent, healthData);
      }

      // Emit status change event if status changed
      if (previousStatus !== agent.health.status) {
        this.emit('agent:status_changed', {
          agentId,
          previousStatus,
          currentStatus: agent.health.status,
          responseTime,
        });
      }

      logger.debug('Health check completed', {
        agentId,
        status: agent.health.status,
        responseTime,
      });
    } catch (error) {
      agent.health.status = 'unhealthy';
      agent.health.lastCheckAt = new Date();
      agent.health.errors.push({
        timestamp: new Date(),
        type: 'health_check_failed',
        message: error.message,
        severity: 'high',
        context: { healthCheckUrl: agent.registration.healthCheck.url },
      });

      this.emit('agent:health_check_failed', {
        agentId,
        error: error.message,
      });

      logger.warn('Health check failed', {
        agentId,
        error: error.message,
      });
    }
  }

  // Performance Tracking
  private startPerformanceTracking(): void {
    this.performanceInterval = setInterval(() => {
      if (!this.running) return;

      this.updatePerformanceMetrics();
      this.analyzePerformanceTrends();
      this.optimizeLoadDistribution();
    }, 60000); // Update every minute
  }

  private updatePerformanceMetrics(): void {
    for (const [agentId, agent] of this.agents.entries()) {
      // Calculate performance metrics
      const metrics = agent.health.metrics;
      
      if (metrics.totalRequests > 0) {
        agent.performance.successRate = metrics.successfulRequests / metrics.totalRequests;
        agent.performance.errorRate = metrics.failedRequests / metrics.totalRequests;
        agent.performance.averageResponseTime = metrics.avgResponseTime;
        agent.performance.totalRequests = metrics.totalRequests;
      }

      // Update current load
      agent.currentLoad = agent.assignedTasks.length;

      logger.debug('Performance metrics updated', {
        agentId,
        successRate: agent.performance.successRate,
        errorRate: agent.performance.errorRate,
        currentLoad: agent.currentLoad,
      });
    }
  }

  // Utility Methods
  private async validateAgentRegistration(registration: AgentRegistration): Promise<void> {
    // Validate required fields
    if (!registration.id || !registration.name || !registration.type) {
      throw new Error('Missing required agent registration fields');
    }

    // Validate capabilities
    if (!registration.capabilities || registration.capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }

    // Validate health check configuration
    if (!registration.healthCheck.url) {
      throw new Error('Health check URL is required');
    }

    // Check for duplicate agent ID
    if (this.agents.has(registration.id)) {
      throw new Error(`Agent ${registration.id} is already registered`);
    }
  }

  private buildCapabilityIndex(): void {
    this.capabilityIndex.clear();

    for (const [agentId, agent] of this.agents.entries()) {
      for (const capability of agent.capabilities.values()) {
        this.updateCapabilityIndex(capability, agentId);
      }
    }

    logger.debug('Capability index built', {
      capabilityCount: this.capabilityIndex.size,
    });
  }

  private updateCapabilityIndex(capability: AgentCapability, agentId: string): void {
    let index = this.capabilityIndex.get(capability.id);
    
    if (!index) {
      index = {
        capabilityId: capability.id,
        agentIds: [],
        metadata: {
          complexity: capability.complexity,
          category: capability.category,
          estimatedDuration: capability.estimatedDuration,
          qualityScore: (capability.qualityMetrics.accuracy + 
                        capability.qualityMetrics.reliability + 
                        capability.qualityMetrics.performance) / 3,
        },
      };
      this.capabilityIndex.set(capability.id, index);
    }

    if (!index.agentIds.includes(agentId)) {
      index.agentIds.push(agentId);
    }
  }

  private removeFromCapabilityIndex(capabilityId: string, agentId: string): void {
    const index = this.capabilityIndex.get(capabilityId);
    if (index) {
      index.agentIds = index.agentIds.filter(id => id !== agentId);
      if (index.agentIds.length === 0) {
        this.capabilityIndex.delete(capabilityId);
      }
    }
  }

  private checkResourceCompatibility(
    requirements: any,
    agent: AgentInstance
  ): boolean {
    // Check if agent has sufficient resources
    const health = agent.health;
    
    if (requirements.cpu && health.load.cpu > (100 - requirements.cpu)) {
      return false;
    }
    
    if (requirements.memory && health.load.memory > (100 - requirements.memory)) {
      return false;
    }
    
    return true;
  }

  private checkTaskConstraints(constraints: any, agent: AgentInstance): boolean {
    // Check required agents
    if (constraints.requiredAgents && !constraints.requiredAgents.includes(agent.registration.id)) {
      return false;
    }
    
    // Check excluded agents
    if (constraints.excludedAgents && constraints.excludedAgents.includes(agent.registration.id)) {
      return false;
    }
    
    // Check affinity rules
    if (constraints.affinityRules) {
      for (const rule of constraints.affinityRules) {
        if (!this.checkAffinityRule(rule, agent)) {
          return false;
        }
      }
    }
    
    return true;
  }

  private checkAffinityRule(rule: AffinityRule, agent: AgentInstance): boolean {
    // Simplified affinity rule checking
    switch (rule.type) {
      case 'agent':
        if (rule.mode === 'required' && agent.registration.id !== rule.target) {
          return false;
        }
        if (rule.mode === 'anti_affinity' && agent.registration.id === rule.target) {
          return false;
        }
        break;
      // Add more affinity rule types as needed
    }
    
    return true;
  }

  private buildDecisionConstraints(request: TaskSchedulingRequest): any[] {
    const constraints = [];
    
    if (request.requirements.constraints?.maxLatency) {
      constraints.push({
        type: 'hard',
        field: 'responseTime',
        operator: 'lessThan',
        value: request.requirements.constraints.maxLatency,
      });
    }
    
    if (request.requirements.constraints?.maxCost) {
      constraints.push({
        type: 'soft',
        field: 'cost',
        operator: 'lessThan',
        value: request.requirements.constraints.maxCost,
        weight: 0.3,
      });
    }
    
    return constraints;
  }

  private buildDecisionCriteria(request: TaskSchedulingRequest): any[] {
    const strategy = request.scheduling.strategy;
    
    switch (strategy.type) {
      case 'performance_optimized':
        return [
          { name: 'performance', weight: 0.4, type: 'numeric', direction: 'maximize' },
          { name: 'responseTime', weight: 0.3, type: 'numeric', direction: 'minimize' },
          { name: 'load', weight: 0.2, type: 'numeric', direction: 'minimize' },
          { name: 'cost', weight: 0.1, type: 'numeric', direction: 'minimize' },
        ];
      case 'cost_optimized':
        return [
          { name: 'cost', weight: 0.5, type: 'numeric', direction: 'minimize' },
          { name: 'load', weight: 0.3, type: 'numeric', direction: 'minimize' },
          { name: 'performance', weight: 0.2, type: 'numeric', direction: 'maximize' },
        ];
      case 'capability_based':
        return [
          { name: 'availability', weight: 0.4, type: 'numeric', direction: 'maximize' },
          { name: 'performance', weight: 0.3, type: 'numeric', direction: 'maximize' },
          { name: 'load', weight: 0.3, type: 'numeric', direction: 'minimize' },
        ];
      default:
        return [
          { name: 'load', weight: 0.4, type: 'numeric', direction: 'minimize' },
          { name: 'performance', weight: 0.3, type: 'numeric', direction: 'maximize' },
          { name: 'responseTime', weight: 0.3, type: 'numeric', direction: 'minimize' },
        ];
    }
  }

  private mapSchedulingStrategy(strategy: TaskSchedulingStrategy): string {
    const strategyMap: Record<string, string> = {
      'round_robin': 'greedy',
      'least_loaded': 'optimal',
      'capability_based': 'heuristic',
      'priority_based': 'rule_based',
      'cost_optimized': 'optimal',
      'performance_optimized': 'optimal',
    };
    
    return strategyMap[strategy.type] || 'heuristic';
  }

  private calculateAgentCost(agent: AgentInstance): number {
    // Calculate cost based on agent capabilities
    let totalCost = 0;
    
    for (const capability of agent.capabilities.values()) {
      totalCost += capability.costModel.fixedCost + capability.costModel.variableCost;
    }
    
    return totalCost;
  }

  private calculateEstimatedStartTime(agent: AgentInstance): Date {
    // Calculate based on current queue and average task duration
    const queueDelay = agent.assignedTasks.length * agent.performance.averageResponseTime;
    return new Date(Date.now() + queueDelay);
  }

  private estimateTaskDuration(request: TaskSchedulingRequest, agent: AgentInstance): number {
    // Estimate based on capability duration and agent performance
    let estimatedDuration = 0;
    
    for (const capabilityId of request.requirements.capabilities) {
      const capability = agent.capabilities.get(capabilityId);
      if (capability) {
        estimatedDuration += capability.estimatedDuration;
      }
    }
    
    // Adjust for agent performance
    const performanceFactor = 1 / Math.max(agent.performance.successRate, 0.1);
    return estimatedDuration * performanceFactor;
  }

  private estimateTaskCost(request: TaskSchedulingRequest, agent: AgentInstance): number {
    let estimatedCost = 0;
    
    for (const capabilityId of request.requirements.capabilities) {
      const capability = agent.capabilities.get(capabilityId);
      if (capability) {
        estimatedCost += capability.costModel.fixedCost + capability.costModel.variableCost;
      }
    }
    
    return estimatedCost;
  }

  private async assignTaskToAgent(request: TaskSchedulingRequest, agent: AgentInstance): Promise<void> {
    // Add task to agent's assigned tasks
    agent.assignedTasks.push(request.id);
    agent.currentLoad++;
    
    // Update agent metrics
    agent.health.currentTasks++;
    
    logger.debug('Task assigned to agent', {
      taskId: request.id,
      agentId: agent.registration.id,
      currentLoad: agent.currentLoad,
    });
  }

  private async reassignTask(taskId: string, fromAgentId: string): Promise<void> {
    const agent = this.agents.get(fromAgentId);
    if (agent) {
      agent.assignedTasks = agent.assignedTasks.filter(id => id !== taskId);
      agent.currentLoad--;
      agent.health.currentTasks--;
    }
    
    logger.debug('Task reassigned', { taskId, fromAgentId });
  }

  private updateHealthMetrics(agent: AgentInstance, healthData: any): void {
    if (healthData.load) {
      agent.health.load = { ...agent.health.load, ...healthData.load };
    }
    
    if (healthData.metrics) {
      agent.health.metrics = { ...agent.health.metrics, ...healthData.metrics };
    }
    
    if (healthData.currentTasks !== undefined) {
      agent.health.currentTasks = healthData.currentTasks;
    }
    
    if (healthData.queuedTasks !== undefined) {
      agent.health.queuedTasks = healthData.queuedTasks;
    }
  }

  private analyzePerformanceTrends(): void {
    // Analyze performance trends and identify issues
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.performance.errorRate > 0.1) {
        this.emit('agent:high_error_rate', {
          agentId,
          errorRate: agent.performance.errorRate,
        });
      }
      
      if (agent.performance.averageResponseTime > 30000) { // 30 seconds
        this.emit('agent:slow_response', {
          agentId,
          responseTime: agent.performance.averageResponseTime,
        });
      }
    }
  }

  private optimizeLoadDistribution(): void {
    // Implement load balancing optimization
    const overloadedAgents = Array.from(this.agents.values())
      .filter(agent => agent.currentLoad > agent.registration.loadBalancing.maxConcurrentTasks * 0.8);
    
    if (overloadedAgents.length > 0) {
      this.emit('agent:load_imbalance', {
        overloadedAgents: overloadedAgents.map(a => ({
          agentId: a.registration.id,
          currentLoad: a.currentLoad,
          maxLoad: a.registration.loadBalancing.maxConcurrentTasks,
        })),
      });
    }
  }

  private startLoadBalancing(): void {
    // Start load balancing optimization
    setInterval(() => {
      if (!this.running) return;
      this.optimizeLoadDistribution();
    }, 120000); // Every 2 minutes
  }

  // Placeholder methods for loading data
  private async loadAgentRegistrations(): Promise<void> {
    // Load agent registrations from database
    logger.debug('Loading agent registrations...');
  }

  private async loadCapabilities(): Promise<void> {
    // Load capabilities from database
    logger.debug('Loading capabilities...');
  }

  // Public getters
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  getCapability(capabilityId: string): AgentCapability | undefined {
    return this.capabilities.get(capabilityId);
  }

  getAllCapabilities(): AgentCapability[] {
    return Array.from(this.capabilities.values());
  }

  getAgentsByCapability(capabilityId: string): AgentInstance[] {
    const index = this.capabilityIndex.get(capabilityId);
    if (!index) return [];
    
    return index.agentIds
      .map(agentId => this.agents.get(agentId))
      .filter(agent => agent !== undefined) as AgentInstance[];
  }
}