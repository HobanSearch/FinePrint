import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import axios from 'axios';
import _ from 'lodash';
import PQueue from 'p-queue';

import { Logger } from '../utils/logger';
import { config } from '../config';
import {
  AgentType,
  AgentStatus,
  AgentCapability,
  AgentRegistration,
  AgentInstance,
  AgentMetrics,
  AgentHealthStatus,
} from '../types/agent';
import {
  AgentRegistration as EnhancedAgentRegistration,
  AgentHealth,
  AgentError,
  EventType,
  OrchestrationEvent,
} from '../types/orchestration';
import { AgentCapabilityRegistry } from './agent-capability-registry';
import { DecisionEngine } from './decision-engine';

const logger = Logger.child({ component: 'enhanced-agent-registry' });

interface ConflictResolution {
  id: string;
  type: 'resource_conflict' | 'task_conflict' | 'priority_conflict' | 'capability_conflict';
  involvedAgents: string[];
  resolution: 'reassign' | 'queue' | 'scale' | 'reject';
  timestamp: Date;
  details: Record<string, any>;
}

interface LoadBalancerState {
  strategy: 'round_robin' | 'least_connections' | 'weighted_round_robin' | 'least_response_time' | 'ip_hash';
  currentIndex: number;
  weights: Map<string, number>;
  connections: Map<string, number>;
  responseTimes: Map<string, number[]>;
}

interface CoordinationGroup {
  id: string;
  name: string;
  agentIds: string[];
  coordinationType: 'master_slave' | 'peer_to_peer' | 'hierarchical';
  masterAgentId?: string;
  syncState: 'synchronized' | 'synchronizing' | 'out_of_sync';
  lastSync: Date;
  metadata: Record<string, any>;
}

export class EnhancedAgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInstance> = new Map();
  private enhancedAgents: Map<string, EnhancedAgentRegistration> = new Map();
  private agentHealth: Map<string, AgentHealth> = new Map();
  private agentMetrics: Map<string, AgentMetrics[]> = new Map();
  private coordinationGroups: Map<string, CoordinationGroup> = new Map();
  private conflicts: Map<string, ConflictResolution> = new Map();
  
  // Load balancing and coordination
  private loadBalancer: LoadBalancerState;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsCollectionInterval: NodeJS.Timeout | null = null;
  private conflictResolutionInterval: NodeJS.Timeout | null = null;
  private coordinationSyncInterval: NodeJS.Timeout | null = null;
  
  // Queues for different operations
  private healthCheckQueue: PQueue;
  private conflictResolutionQueue: PQueue;
  private coordinationQueue: PQueue;

  constructor(
    private capabilityRegistry: AgentCapabilityRegistry,
    private decisionEngine: DecisionEngine
  ) {
    super();
    this.setMaxListeners(10000);
    
    // Initialize load balancer
    this.loadBalancer = {
      strategy: 'least_connections',
      currentIndex: 0,
      weights: new Map(),
      connections: new Map(),
      responseTimes: new Map(),
    };

    // Initialize queues
    this.healthCheckQueue = new PQueue({ concurrency: 10, intervalCap: 50, interval: 1000 });
    this.conflictResolutionQueue = new PQueue({ concurrency: 5, intervalCap: 20, interval: 1000 });
    this.coordinationQueue = new PQueue({ concurrency: 3, intervalCap: 10, interval: 1000 });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Enhanced Agent Registry...');

      // Load existing agents and configurations
      await this.loadAgents();
      await this.loadCoordinationGroups();
      await this.loadLoadBalancerConfiguration();

      // Auto-discover agents if enabled
      if (config.environment === 'development') {
        await this.autoDiscoverAgents();
      }

      // Start background services
      this.startHealthMonitoring();
      this.startConflictResolution();
      this.startCoordinationSync();
      this.startLoadBalancerOptimization();

      logger.info('Enhanced Agent Registry initialized successfully', {
        agentCount: this.agents.size,
        coordinationGroups: this.coordinationGroups.size,
        loadBalancerStrategy: this.loadBalancer.strategy,
      });
    } catch (error) {
      logger.error('Failed to initialize Enhanced Agent Registry', { error: error.message });
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Enhanced Agent Registry...');

    // Stop all intervals
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.metricsCollectionInterval) clearInterval(this.metricsCollectionInterval);
    if (this.conflictResolutionInterval) clearInterval(this.conflictResolutionInterval);
    if (this.coordinationSyncInterval) clearInterval(this.coordinationSyncInterval);

    // Drain all queues
    this.healthCheckQueue.pause();
    this.conflictResolutionQueue.pause();
    this.coordinationQueue.pause();

    await Promise.all([
      this.healthCheckQueue.onIdle(),
      this.conflictResolutionQueue.onIdle(),
      this.coordinationQueue.onIdle(),
    ]);

    logger.info('Enhanced Agent Registry stopped');
  }

  // Enhanced Agent Registration
  async registerEnhancedAgent(registration: EnhancedAgentRegistration): Promise<string> {
    try {
      logger.info('Registering enhanced agent', { 
        agentId: registration.id,
        agentType: registration.type,
        capabilityCount: registration.capabilities.length,
      });

      // Validate registration
      await this.validateEnhancedRegistration(registration);

      // Register with capability registry
      await this.capabilityRegistry.registerAgent(registration);

      // Store enhanced registration
      this.enhancedAgents.set(registration.id, registration);

      // Initialize health tracking
      const initialHealth: AgentHealth = {
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
      };
      this.agentHealth.set(registration.id, initialHealth);

      // Initialize load balancer tracking
      this.loadBalancer.weights.set(registration.id, registration.loadBalancing.weight);
      this.loadBalancer.connections.set(registration.id, 0);
      this.loadBalancer.responseTimes.set(registration.id, []);

      // Perform initial health check
      await this.performEnhancedHealthCheck(registration.id);

      // Auto-assign to coordination groups if applicable
      await this.autoAssignToCoordinationGroups(registration);

      this.emit('agent:enhanced_registered', { 
        agentId: registration.id,
        registration,
      });

      logger.info('Enhanced agent registered successfully', { 
        agentId: registration.id,
        status: initialHealth.status,
      });

      return registration.id;
    } catch (error) {
      logger.error('Failed to register enhanced agent', { 
        agentId: registration.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Advanced Load Balancing
  async selectAgentWithLoadBalancing(
    criteria: {
      capabilities: string[];
      agentTypes?: string[];
      excludeAgents?: string[];
      preferredAgents?: string[];
      maxResponseTime?: number;
      minSuccessRate?: number;
    }
  ): Promise<string | null> {
    // Get candidate agents
    const candidates = await this.findCandidateAgents(criteria);
    
    if (candidates.length === 0) {
      return null;
    }

    // Apply load balancing strategy
    const selectedAgent = this.applyLoadBalancingStrategy(candidates);
    
    if (selectedAgent) {
      // Update connection count
      const currentConnections = this.loadBalancer.connections.get(selectedAgent.id) || 0;
      this.loadBalancer.connections.set(selectedAgent.id, currentConnections + 1);
      
      // Update round-robin index if needed
      if (this.loadBalancer.strategy === 'round_robin') {
        this.loadBalancer.currentIndex = (this.loadBalancer.currentIndex + 1) % candidates.length;
      }
    }

    return selectedAgent?.id || null;
  }

  private applyLoadBalancingStrategy(candidates: EnhancedAgentRegistration[]): EnhancedAgentRegistration | null {
    if (candidates.length === 0) return null;

    switch (this.loadBalancer.strategy) {
      case 'round_robin':
        return candidates[this.loadBalancer.currentIndex % candidates.length];

      case 'least_connections':
        return candidates.reduce((best, current) => {
          const bestConnections = this.loadBalancer.connections.get(best.id) || 0;
          const currentConnections = this.loadBalancer.connections.get(current.id) || 0;
          return currentConnections < bestConnections ? current : best;
        });

      case 'weighted_round_robin':
        return this.selectWeightedAgent(candidates);

      case 'least_response_time':
        return candidates.reduce((best, current) => {
          const bestResponseTimes = this.loadBalancer.responseTimes.get(best.id) || [];
          const currentResponseTimes = this.loadBalancer.responseTimes.get(current.id) || [];
          
          const bestAvg = bestResponseTimes.length > 0 ? _.mean(bestResponseTimes) : Infinity;
          const currentAvg = currentResponseTimes.length > 0 ? _.mean(currentResponseTimes) : Infinity;
          
          return currentAvg < bestAvg ? current : best;
        });

      default:
        return candidates[0];
    }
  }

  private selectWeightedAgent(candidates: EnhancedAgentRegistration[]): EnhancedAgentRegistration {
    const totalWeight = candidates.reduce((sum, agent) => {
      return sum + (this.loadBalancer.weights.get(agent.id) || 1);
    }, 0);

    let random = Math.random() * totalWeight;
    
    for (const agent of candidates) {
      const weight = this.loadBalancer.weights.get(agent.id) || 1;
      random -= weight;
      if (random <= 0) {
        return agent;
      }
    }

    return candidates[0]; // Fallback
  }

  // Conflict Resolution
  private startConflictResolution(): void {
    this.conflictResolutionInterval = setInterval(async () => {
      await this.detectAndResolveConflicts();
    }, 30000); // Check every 30 seconds
  }

  private async detectAndResolveConflicts(): Promise<void> {
    try {
      // Detect resource conflicts
      const resourceConflicts = await this.detectResourceConflicts();
      
      // Detect task conflicts
      const taskConflicts = await this.detectTaskConflicts();
      
      // Detect priority conflicts
      const priorityConflicts = await this.detectPriorityConflicts();

      // Resolve all detected conflicts
      const allConflicts = [...resourceConflicts, ...taskConflicts, ...priorityConflicts];
      
      for (const conflict of allConflicts) {
        await this.conflictResolutionQueue.add(() => this.resolveConflict(conflict));
      }

    } catch (error) {
      logger.error('Error in conflict detection and resolution', { error: error.message });
    }
  }

  private async detectResourceConflicts(): Promise<ConflictResolution[]> {
    const conflicts: ConflictResolution[] = [];
    
    // Check for agents competing for limited resources
    for (const [agentId, health] of this.agentHealth.entries()) {
      if (health.load.cpu > 90 || health.load.memory > 90) {
        // Find other agents that could take some load
        const alternatives = await this.findAlternativeAgents(agentId);
        
        if (alternatives.length > 0) {
          conflicts.push({
            id: uuidv4(),
            type: 'resource_conflict',
            involvedAgents: [agentId, ...alternatives.slice(0, 2).map(a => a.id)],
            resolution: 'reassign',
            timestamp: new Date(),
            details: {
              overloadedAgent: agentId,
              resourceUsage: health.load,
              alternatives: alternatives.slice(0, 2),
            },
          });
        }
      }
    }

    return conflicts;
  }

  private async detectTaskConflicts(): Promise<ConflictResolution[]> {
    // Placeholder for task conflict detection
    return [];
  }

  private async detectPriorityConflicts(): Promise<ConflictResolution[]> {
    // Placeholder for priority conflict detection
    return [];
  }

  private async resolveConflict(conflict: ConflictResolution): Promise<void> {
    try {
      logger.info('Resolving conflict', { 
        conflictId: conflict.id,
        type: conflict.type,
        resolution: conflict.resolution,
      });

      switch (conflict.resolution) {
        case 'reassign':
          await this.handleReassignmentResolution(conflict);
          break;
        case 'queue':
          await this.handleQueueResolution(conflict);
          break;
        case 'scale':
          await this.handleScalingResolution(conflict);
          break;
        case 'reject':
          await this.handleRejectionResolution(conflict);
          break;
      }

      // Store resolved conflict
      this.conflicts.set(conflict.id, conflict);

      this.emit('conflict:resolved', conflict);

    } catch (error) {
      logger.error('Failed to resolve conflict', { 
        conflictId: conflict.id,
        error: error.message,
      });
    }
  }

  // Coordination Groups Management
  async createCoordinationGroup(group: {
    name: string;
    agentIds: string[];
    coordinationType: 'master_slave' | 'peer_to_peer' | 'hierarchical';
    masterAgentId?: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const groupId = uuidv4();
    
    // Validate agents exist
    for (const agentId of group.agentIds) {
      if (!this.enhancedAgents.has(agentId)) {
        throw new Error(`Agent ${agentId} not found`);
      }
    }

    const coordinationGroup: CoordinationGroup = {
      id: groupId,
      name: group.name,
      agentIds: group.agentIds,
      coordinationType: group.coordinationType,
      masterAgentId: group.masterAgentId,
      syncState: 'synchronized',
      lastSync: new Date(),
      metadata: group.metadata || {},
    };

    this.coordinationGroups.set(groupId, coordinationGroup);

    // Initialize coordination
    await this.initializeGroupCoordination(coordinationGroup);

    this.emit('coordination_group:created', { groupId, group: coordinationGroup });

    logger.info('Coordination group created', {
      groupId,
      name: group.name,
      agentCount: group.agentIds.length,
      type: group.coordinationType,
    });

    return groupId;
  }

  private async initializeGroupCoordination(group: CoordinationGroup): Promise<void> {
    switch (group.coordinationType) {
      case 'master_slave':
        await this.initializeMasterSlaveCoordination(group);
        break;
      case 'peer_to_peer':
        await this.initializePeerToPeerCoordination(group);
        break;
      case 'hierarchical':
        await this.initializeHierarchicalCoordination(group);
        break;
    }
  }

  private startCoordinationSync(): void {
    this.coordinationSyncInterval = setInterval(async () => {
      for (const [groupId, group] of this.coordinationGroups.entries()) {
        await this.coordinationQueue.add(() => this.synchronizeGroup(group));
      }
    }, 60000); // Sync every minute
  }

  private async synchronizeGroup(group: CoordinationGroup): Promise<void> {
    try {
      group.syncState = 'synchronizing';
      
      // Perform coordination sync based on type
      switch (group.coordinationType) {
        case 'master_slave':
          await this.syncMasterSlaveGroup(group);
          break;
        case 'peer_to_peer':
          await this.syncPeerToPeerGroup(group);
          break;
        case 'hierarchical':
          await this.syncHierarchicalGroup(group);
          break;
      }

      group.syncState = 'synchronized';
      group.lastSync = new Date();

    } catch (error) {
      group.syncState = 'out_of_sync';
      logger.error('Failed to synchronize coordination group', {
        groupId: group.id,
        error: error.message,
      });
    }
  }

  // Enhanced Health Monitoring
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      const agents = Array.from(this.enhancedAgents.keys());
      
      // Add all health checks to queue
      for (const agentId of agents) {
        this.healthCheckQueue.add(() => this.performEnhancedHealthCheck(agentId));
      }
    }, 30000); // Check every 30 seconds

    this.metricsCollectionInterval = setInterval(async () => {
      await this.collectEnhancedMetrics();
    }, 60000); // Collect metrics every minute
  }

  private async performEnhancedHealthCheck(agentId: string): Promise<void> {
    const registration = this.enhancedAgents.get(agentId);
    const health = this.agentHealth.get(agentId);
    
    if (!registration || !health) return;

    try {
      const startTime = Date.now();
      
      // Perform health check
      const response = await axios.get(registration.healthCheck.url, {
        timeout: registration.healthCheck.timeout,
        headers: {
          'User-Agent': 'FinePrint-Enhanced-Orchestrator/1.0',
        },
      });

      const responseTime = Date.now() - startTime;
      const previousStatus = health.status;

      // Update health metrics
      health.lastCheckAt = new Date();
      health.responseTime = responseTime;
      health.status = response.status === 200 ? 'healthy' : 'degraded';

      // Update response time tracking for load balancer
      const responseTimes = this.loadBalancer.responseTimes.get(agentId) || [];
      responseTimes.push(responseTime);
      
      // Keep only last 10 response times
      if (responseTimes.length > 10) {
        responseTimes.shift();
      }
      this.loadBalancer.responseTimes.set(agentId, responseTimes);

      // Parse health data if available
      if (response.data) {
        this.updateHealthFromResponse(health, response.data);
      }

      // Emit status change event
      if (previousStatus !== health.status) {
        this.emit('agent:status_changed', {
          agentId,
          previousStatus,
          currentStatus: health.status,
          responseTime,
        });

        // Emit orchestration event
        this.emitOrchestrationEvent({
          id: uuidv4(),
          type: health.status === 'healthy' ? EventType.AGENT_AVAILABLE : EventType.AGENT_UNAVAILABLE,
          source: 'enhanced-agent-registry',
          timestamp: new Date(),
          payload: { agentId, status: health.status, responseTime },
          metadata: { correlationId: nanoid(), traceId: nanoid(), version: 1 },
          headers: { 'Content-Type': 'application/json' },
        });
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.lastCheckAt = new Date();
      health.errors.push({
        timestamp: new Date(),
        type: 'health_check_failed',
        message: error.message,
        severity: 'high',
        context: { healthCheckUrl: registration.healthCheck.url },
      });

      this.emit('agent:health_check_failed', {
        agentId,
        error: error.message,
      });

      logger.warn('Enhanced health check failed', {
        agentId,
        error: error.message,
      });
    }
  }

  private async collectEnhancedMetrics(): Promise<void> {
    for (const [agentId, health] of this.agentHealth.entries()) {
      // Calculate and update performance metrics
      if (health.metrics.totalRequests > 0) {
        health.errorRate = health.metrics.failedRequests / health.metrics.totalRequests;
        health.throughput = health.metrics.totalRequests / 60; // requests per minute
      }

      // Emit performance alerts if needed
      if (health.errorRate > 0.1) {
        this.emit('agent:high_error_rate', { agentId, errorRate: health.errorRate });
      }

      if (health.responseTime > 30000) {
        this.emit('agent:slow_response', { agentId, responseTime: health.responseTime });
      }

      if (health.load.cpu > 90 || health.load.memory > 90) {
        this.emit('agent:resource_overload', { agentId, load: health.load });
      }
    }
  }

  // Utility Methods
  private async findCandidateAgents(criteria: {
    capabilities: string[];
    agentTypes?: string[];
    excludeAgents?: string[];
    preferredAgents?: string[];
    maxResponseTime?: number;
    minSuccessRate?: number;
  }): Promise<EnhancedAgentRegistration[]> {
    const candidates: EnhancedAgentRegistration[] = [];

    for (const [agentId, registration] of this.enhancedAgents.entries()) {
      // Check exclusions
      if (criteria.excludeAgents?.includes(agentId)) continue;

      // Check agent types
      if (criteria.agentTypes && !criteria.agentTypes.includes(registration.type)) continue;

      // Check capabilities
      const hasAllCapabilities = criteria.capabilities.every(capId =>
        registration.capabilities.some(cap => cap.id === capId)
      );
      if (!hasAllCapabilities) continue;

      // Check health and performance criteria
      const health = this.agentHealth.get(agentId);
      if (health) {
        if (health.status !== 'healthy' && health.status !== 'degraded') continue;
        if (criteria.maxResponseTime && health.responseTime > criteria.maxResponseTime) continue;
        
        const successRate = health.metrics.totalRequests > 0 
          ? health.metrics.successfulRequests / health.metrics.totalRequests 
          : 1;
        if (criteria.minSuccessRate && successRate < criteria.minSuccessRate) continue;
      }

      candidates.push(registration);
    }

    // Prioritize preferred agents
    if (criteria.preferredAgents) {
      candidates.sort((a, b) => {
        const aPreferred = criteria.preferredAgents!.includes(a.id);
        const bPreferred = criteria.preferredAgents!.includes(b.id);
        
        if (aPreferred && !bPreferred) return -1;
        if (!aPreferred && bPreferred) return 1;
        return 0;
      });
    }

    return candidates;
  }

  private async findAlternativeAgents(overloadedAgentId: string): Promise<EnhancedAgentRegistration[]> {
    const overloadedAgent = this.enhancedAgents.get(overloadedAgentId);
    if (!overloadedAgent) return [];

    // Find agents with similar capabilities but lower load
    const alternatives: EnhancedAgentRegistration[] = [];
    
    for (const [agentId, registration] of this.enhancedAgents.entries()) {
      if (agentId === overloadedAgentId) continue;

      const health = this.agentHealth.get(agentId);
      if (!health || health.status !== 'healthy') continue;

      // Check if agent has overlapping capabilities
      const hasOverlappingCapabilities = overloadedAgent.capabilities.some(cap1 =>
        registration.capabilities.some(cap2 => cap1.id === cap2.id)
      );

      if (hasOverlappingCapabilities && health.load.cpu < 70 && health.load.memory < 70) {
        alternatives.push(registration);
      }
    }

    return alternatives;
  }

  private updateHealthFromResponse(health: AgentHealth, responseData: any): void {
    if (responseData.load) {
      health.load = { ...health.load, ...responseData.load };
    }
    
    if (responseData.metrics) {
      health.metrics = { ...health.metrics, ...responseData.metrics };
    }
    
    if (responseData.currentTasks !== undefined) {
      health.currentTasks = responseData.currentTasks;
    }
    
    if (responseData.queuedTasks !== undefined) {
      health.queuedTasks = responseData.queuedTasks;
    }
  }

  private emitOrchestrationEvent(event: OrchestrationEvent): void {
    this.emit('orchestration:event', event);
  }

  // Placeholder implementations for conflict resolution methods
  private async handleReassignmentResolution(conflict: ConflictResolution): Promise<void> {
    logger.info('Handling reassignment resolution', { conflictId: conflict.id });
  }

  private async handleQueueResolution(conflict: ConflictResolution): Promise<void> {
    logger.info('Handling queue resolution', { conflictId: conflict.id });
  }

  private async handleScalingResolution(conflict: ConflictResolution): Promise<void> {
    logger.info('Handling scaling resolution', { conflictId: conflict.id });
  }

  private async handleRejectionResolution(conflict: ConflictResolution): Promise<void> {
    logger.info('Handling rejection resolution', { conflictId: conflict.id });
  }

  // Placeholder implementations for coordination methods
  private async initializeMasterSlaveCoordination(group: CoordinationGroup): Promise<void> {
    logger.debug('Initializing master-slave coordination', { groupId: group.id });
  }

  private async initializePeerToPeerCoordination(group: CoordinationGroup): Promise<void> {
    logger.debug('Initializing peer-to-peer coordination', { groupId: group.id });
  }

  private async initializeHierarchicalCoordination(group: CoordinationGroup): Promise<void> {
    logger.debug('Initializing hierarchical coordination', { groupId: group.id });
  }

  private async syncMasterSlaveGroup(group: CoordinationGroup): Promise<void> {
    logger.debug('Syncing master-slave group', { groupId: group.id });
  }

  private async syncPeerToPeerGroup(group: CoordinationGroup): Promise<void> {
    logger.debug('Syncing peer-to-peer group', { groupId: group.id });
  }

  private async syncHierarchicalGroup(group: CoordinationGroup): Promise<void> {
    logger.debug('Syncing hierarchical group', { groupId: group.id });
  }

  // Placeholder implementations for loading and validation
  private async validateEnhancedRegistration(registration: EnhancedAgentRegistration): Promise<void> {
    // Enhanced validation logic
  }

  private async autoAssignToCoordinationGroups(registration: EnhancedAgentRegistration): Promise<void> {
    // Auto-assignment logic
  }

  private async loadAgents(): Promise<void> {
    logger.debug('Loading agents from storage...');
  }

  private async loadCoordinationGroups(): Promise<void> {
    logger.debug('Loading coordination groups from storage...');
  }

  private async loadLoadBalancerConfiguration(): Promise<void> {
    logger.debug('Loading load balancer configuration...');
  }

  private async autoDiscoverAgents(): Promise<void> {
    logger.debug('Auto-discovering agents...');
  }

  private startLoadBalancerOptimization(): void {
    // Start load balancer optimization
    setInterval(() => {
      this.optimizeLoadBalancing();
    }, 300000); // Every 5 minutes
  }

  private optimizeLoadBalancing(): void {
    // Load balancer optimization logic
    logger.debug('Optimizing load balancing strategy');
  }

  // Public getters
  getEnhancedAgent(agentId: string): EnhancedAgentRegistration | undefined {
    return this.enhancedAgents.get(agentId);
  }

  getAgentHealth(agentId: string): AgentHealth | undefined {
    return this.agentHealth.get(agentId);
  }

  getCoordinationGroup(groupId: string): CoordinationGroup | undefined {
    return this.coordinationGroups.get(groupId);
  }

  getLoadBalancerState(): LoadBalancerState {
    return { ...this.loadBalancer };
  }

  getAllConflicts(): ConflictResolution[] {
    return Array.from(this.conflicts.values());
  }
}