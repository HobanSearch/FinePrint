import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

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

const logger = Logger.child({ component: 'agent-registry' });

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInstance> = new Map();
  private agentMetrics: Map<string, AgentMetrics[]> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsCollectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Agent Registry...');

      // Load existing agents from database
      await this.loadAgents();

      // Auto-discover agents if enabled
      if (config.environment === 'development') {
        await this.autoDiscoverAgents();
      }

      logger.info('Agent Registry initialized successfully', {
        agentCount: this.agents.size,
        agentTypes: this.getAgentTypeDistribution(),
      });
    } catch (error) {
      logger.error('Failed to initialize Agent Registry', { error: error.message });
      throw error;
    }
  }

  async startHealthChecking(): Promise<void> {
    if (this.healthCheckInterval) {
      logger.warn('Health checking is already running');
      return;
    }

    logger.info('Starting agent health checking...');

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, config.monitoring.healthCheckInterval);

    this.metricsCollectionInterval = setInterval(async () => {
      await this.collectMetrics();
    }, config.monitoring.metricsCollectionInterval);

    // Perform initial health check
    await this.performHealthChecks();
  }

  async stop(): Promise<void> {
    logger.info('Stopping Agent Registry...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = null;
    }

    logger.info('Agent Registry stopped');
  }

  // Agent Management
  async registerAgent(registration: AgentRegistration): Promise<string> {
    try {
      // Validate registration
      this.validateRegistration(registration);

      // Check if agent already exists
      if (this.agents.has(registration.id)) {
        throw new Error(`Agent ${registration.id} is already registered`);
      }

      // Create agent instance
      const agent: AgentInstance = {
        id: registration.id,
        registration,
        status: AgentStatus.OFFLINE,
        currentLoad: 0,
        lastHealthCheck: new Date(),
        activeTaskCount: 0,
        completedTaskCount: 0,
        failedTaskCount: 0,
        averageResponseTime: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store agent
      this.agents.set(registration.id, agent);

      // Initialize metrics collection
      this.agentMetrics.set(registration.id, []);

      // Perform initial health check
      await this.checkAgentHealth(registration.id);

      this.emit('agent:registered', { agentId: registration.id, agent });

      logger.info('Agent registered', {
        agentId: registration.id,
        type: registration.type,
        name: registration.name,
        capabilities: registration.capabilities,
      });

      return registration.id;
    } catch (error) {
      logger.error('Failed to register agent', {
        agentId: registration.id,
        error: error.message,
      });
      throw error;
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Check if agent has active tasks
    if (agent.activeTaskCount > 0) {
      throw new Error(`Cannot unregister agent ${agentId}: ${agent.activeTaskCount} active tasks`);
    }

    this.agents.delete(agentId);
    this.agentMetrics.delete(agentId);

    this.emit('agent:unregistered', { agentId, agent });

    logger.info('Agent unregistered', { agentId, type: agent.registration.type });
  }

  async updateAgent(agentId: string, updates: Partial<AgentRegistration>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const oldRegistration = { ...agent.registration };
    agent.registration = { ...agent.registration, ...updates };
    agent.updatedAt = new Date();

    this.emit('agent:updated', { 
      agentId, 
      oldRegistration, 
      newRegistration: agent.registration 
    });

    logger.info('Agent updated', { agentId, updates: Object.keys(updates) });
  }

  // Agent Discovery
  async findAgents(criteria: {
    type?: AgentType;
    capabilities?: AgentCapability[];
    status?: AgentStatus | AgentStatus[];
    minLoad?: number;
    maxLoad?: number;
    tags?: string[];
  }): Promise<AgentInstance[]> {
    const agents = Array.from(this.agents.values());

    return agents.filter(agent => {
      // Filter by type
      if (criteria.type && agent.registration.type !== criteria.type) {
        return false;
      }

      // Filter by capabilities
      if (criteria.capabilities && criteria.capabilities.length > 0) {
        const hasAllCapabilities = criteria.capabilities.every(cap => 
          agent.registration.capabilities.includes(cap)
        );
        if (!hasAllCapabilities) return false;
      }

      // Filter by status
      if (criteria.status) {
        const statuses = Array.isArray(criteria.status) ? criteria.status : [criteria.status];
        if (!statuses.includes(agent.status)) return false;
      }

      // Filter by load
      if (criteria.minLoad !== undefined && agent.currentLoad < criteria.minLoad) {
        return false;
      }
      if (criteria.maxLoad !== undefined && agent.currentLoad > criteria.maxLoad) {
        return false;
      }

      // Filter by tags
      if (criteria.tags && criteria.tags.length > 0) {
        const agentTags = Object.keys(agent.registration.metadata?.tags || {});
        const hasAllTags = criteria.tags.every(tag => agentTags.includes(tag));
        if (!hasAllTags) return false;
      }

      return true;
    });
  }

  async findBestAgent(criteria: {
    type: AgentType;
    capabilities: AgentCapability[];
    strategy?: 'least_loaded' | 'round_robin' | 'performance_based';
  }): Promise<AgentInstance | null> {
    const candidates = await this.findAgents({
      type: criteria.type,
      capabilities: criteria.capabilities,
      status: [AgentStatus.HEALTHY, AgentStatus.IDLE],
    });

    if (candidates.length === 0) {
      return null;
    }

    const strategy = criteria.strategy || 'least_loaded';

    switch (strategy) {
      case 'least_loaded':
        return candidates.reduce((best, current) => 
          current.currentLoad < best.currentLoad ? current : best
        );

      case 'performance_based':
        return candidates.reduce((best, current) => 
          current.averageResponseTime < best.averageResponseTime ? current : best
        );

      case 'round_robin':
        // Simple round-robin based on completion count
        return candidates.reduce((best, current) => 
          current.completedTaskCount < best.completedTaskCount ? current : best
        );

      default:
        return candidates[0];
    }
  }

  // Health Management
  private async performHealthChecks(): Promise<void> {
    const agents = Array.from(this.agents.values());
    const healthCheckPromises = agents.map(agent => 
      this.checkAgentHealth(agent.id).catch(error => {
        logger.warn('Health check failed', {
          agentId: agent.id,
          error: error.message,
        });
      })
    );

    await Promise.allSettled(healthCheckPromises);
  }

  private async checkAgentHealth(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const previousStatus = agent.status;

    try {
      const healthUrl = `${agent.registration.endpoint}${agent.registration.healthCheckPath}`;
      const response = await axios.get(healthUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': 'FinePrint-Orchestrator/1.0',
        },
      });

      if (response.status === 200) {
        const healthData: AgentHealthStatus = response.data;
        
        // Update agent status based on health data
        agent.status = this.determineAgentStatus(healthData);
        agent.lastHealthCheck = new Date();

        // Update load information if available
        if (healthData.metrics) {
          agent.currentLoad = this.calculateLoad(healthData.metrics);
        }

        // Emit status change event if status changed
        if (previousStatus !== agent.status) {
          this.emit('agent:status_changed', {
            agentId,
            previousStatus,
            newStatus: agent.status,
            healthData,
          });

          logger.info('Agent status changed', {
            agentId,
            type: agent.registration.type,
            previousStatus,
            newStatus: agent.status,
          });
        }
      } else {
        this.markAgentUnhealthy(agent, `HTTP ${response.status}`);
      }
    } catch (error) {
      this.markAgentUnhealthy(agent, error.message);
      
      if (previousStatus !== agent.status) {
        this.emit('agent:status_changed', {
          agentId,
          previousStatus,
          newStatus: agent.status,
          error: error.message,
        });
      }
    }
  }

  private markAgentUnhealthy(agent: AgentInstance, reason: string): void {
    const timeSinceLastCheck = Date.now() - agent.lastHealthCheck.getTime();
    
    if (timeSinceLastCheck > config.monitoring.healthCheckInterval * 3) {
      agent.status = AgentStatus.OFFLINE;
    } else {
      agent.status = AgentStatus.UNHEALTHY;
    }

    logger.warn('Agent marked unhealthy', {
      agentId: agent.id,
      type: agent.registration.type,
      reason,
      status: agent.status,
    });
  }

  private determineAgentStatus(healthData: AgentHealthStatus): AgentStatus {
    // Determine status based on health data
    if (healthData.status === 'healthy') {
      // Check if agent is busy based on metrics
      const isBusy = healthData.metrics.queueSize > 10 || 
                    healthData.metrics.cpu > 80 || 
                    healthData.metrics.memory > 85;
      
      return isBusy ? AgentStatus.BUSY : AgentStatus.IDLE;
    } else if (healthData.status === 'degraded') {
      return AgentStatus.DEGRADED;
    } else {
      return AgentStatus.UNHEALTHY;
    }
  }

  private calculateLoad(metrics: any): number {
    // Calculate load based on various metrics
    const cpuLoad = metrics.cpu / 100;
    const memoryLoad = metrics.memory / 100;
    const connectionLoad = metrics.activeConnections / 100; // Assuming max 100 connections
    const queueLoad = Math.min(metrics.queueSize / 50, 1); // Assuming max 50 queue items

    // Weighted average
    return Math.round(
      (cpuLoad * 0.3 + memoryLoad * 0.3 + connectionLoad * 0.2 + queueLoad * 0.2) * 100
    );
  }

  // Metrics Collection
  private async collectMetrics(): Promise<void> {
    const agents = Array.from(this.agents.values())
      .filter(agent => agent.status !== AgentStatus.OFFLINE);

    for (const agent of agents) {
      try {
        await this.collectAgentMetrics(agent.id);
      } catch (error) {
        logger.warn('Failed to collect metrics', {
          agentId: agent.id,
          error: error.message,
        });
      }
    }
  }

  private async collectAgentMetrics(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    try {
      const metricsUrl = `${agent.registration.endpoint}/metrics`;
      const response = await axios.get(metricsUrl, {
        timeout: 3000,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.status === 200) {
        const metrics: AgentMetrics = {
          agentId,
          timestamp: new Date(),
          cpu: response.data.cpu || 0,
          memory: response.data.memory || 0,
          responseTime: response.data.responseTime || 0,
          throughput: response.data.throughput || 0,
          errorRate: response.data.errorRate || 0,
          availability: response.data.availability || 100,
        };

        // Store metrics
        const agentMetrics = this.agentMetrics.get(agentId) || [];
        agentMetrics.push(metrics);

        // Keep only last 1000 metrics per agent
        if (agentMetrics.length > 1000) {
          agentMetrics.splice(0, agentMetrics.length - 1000);
        }

        this.agentMetrics.set(agentId, agentMetrics);

        // Update agent's average response time
        const recentMetrics = agentMetrics.slice(-10); // Last 10 metrics
        agent.averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;

        this.emit('metrics:collected', { agentId, metrics });
      }
    } catch (error) {
      // Metrics collection is optional, don't fail if unavailable
      logger.debug('Metrics collection failed', {
        agentId,
        error: error.message,
      });
    }
  }

  // Task Management
  async assignTask(agentId: string, taskId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.activeTaskCount++;
    agent.updatedAt = new Date();

    this.emit('task:assigned', { agentId, taskId });

    logger.debug('Task assigned to agent', { agentId, taskId });
  }

  async completeTask(agentId: string, taskId: string, success: boolean): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.activeTaskCount = Math.max(0, agent.activeTaskCount - 1);
    
    if (success) {
      agent.completedTaskCount++;
    } else {
      agent.failedTaskCount++;
    }

    agent.updatedAt = new Date();

    this.emit('task:completed', { agentId, taskId, success });

    logger.debug('Task completed by agent', { agentId, taskId, success });
  }

  // Auto-discovery
  private async autoDiscoverAgents(): Promise<void> {
    logger.info('Auto-discovering agents...');

    // Discover local development agents
    const potentialPorts = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009];
    
    for (const port of potentialPorts) {
      try {
        const response = await axios.get(`http://localhost:${port}/health`, {
          timeout: 2000,
        });

        if (response.status === 200 && response.data.service) {
          const serviceInfo = response.data.service;
          
          // Create registration from discovered service
          const registration: AgentRegistration = {
            id: uuidv4(),
            type: this.mapServiceToAgentType(serviceInfo.name),
            name: serviceInfo.name,
            version: serviceInfo.version || '1.0.0',
            capabilities: this.inferCapabilities(serviceInfo.name),
            endpoint: `http://localhost:${port}`,
            healthCheckPath: '/health',
            priority: 5,
            maxConcurrentTasks: 10,
            timeout: 300000,
            retryPolicy: {
              maxRetries: 3,
              backoffMultiplier: 2,
              initialDelay: 1000,
            },
            dependencies: [],
            metadata: {
              autoDiscovered: true,
              port,
            },
          };

          await this.registerAgent(registration);
        }
      } catch (error) {
        // Service not available, skip
        continue;
      }
    }
  }

  // Utility Methods
  private validateRegistration(registration: AgentRegistration): void {
    if (!registration.id || !registration.type || !registration.name) {
      throw new Error('Registration missing required fields: id, type, name');
    }

    if (!registration.endpoint || !URL.canParse(registration.endpoint)) {
      throw new Error('Invalid endpoint URL');
    }

    if (registration.capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }

    if (registration.priority < 1 || registration.priority > 10) {
      throw new Error('Priority must be between 1 and 10');
    }
  }

  private mapServiceToAgentType(serviceName: string): AgentType {
    const mapping: Record<string, AgentType> = {
      'fullstack-agent': AgentType.FULLSTACK_AGENT,
      'aiml-engineering': AgentType.AIML_ENGINEERING,
      'ui-ux-design': AgentType.UI_UX_DESIGN,
      'devops-agent': AgentType.DEVOPS_AGENT,
      'dspy-framework': AgentType.DSPY_FRAMEWORK,
      'gated-lora-system': AgentType.GATED_LORA_SYSTEM,
      'knowledge-graph': AgentType.KNOWLEDGE_GRAPH,
      'enhanced-ollama': AgentType.ENHANCED_OLLAMA,
      'sales-agent': AgentType.SALES_AGENT,
      'customer-success-agent': AgentType.CUSTOMER_SUCCESS,
      'content-marketing-agent': AgentType.CONTENT_MARKETING,
    };

    return mapping[serviceName] || AgentType.FULLSTACK_AGENT;
  }

  private inferCapabilities(serviceName: string): AgentCapability[] {
    const capabilityMapping: Record<string, AgentCapability[]> = {
      'fullstack-agent': [
        AgentCapability.CODE_GENERATION,
        AgentCapability.ARCHITECTURE_DECISIONS,
        AgentCapability.TESTING_AUTOMATION,
      ],
      'aiml-engineering': [
        AgentCapability.MODEL_TRAINING,
        AgentCapability.HYPERPARAMETER_OPTIMIZATION,
        AgentCapability.MODEL_DEPLOYMENT,
        AgentCapability.PERFORMANCE_MONITORING,
      ],
      'sales-agent': [
        AgentCapability.LEAD_GENERATION,
        AgentCapability.CUSTOMER_SUPPORT,
      ],
      'content-marketing-agent': [
        AgentCapability.CONTENT_CREATION,
      ],
    };

    return capabilityMapping[serviceName] || [AgentCapability.CODE_GENERATION];
  }

  private async loadAgents(): Promise<void> {
    // Load agents from database - placeholder implementation
    logger.debug('Loading agents from database...');
  }

  private getAgentTypeDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const agent of this.agents.values()) {
      const type = agent.registration.type;
      distribution[type] = (distribution[type] || 0) + 1;
    }

    return distribution;
  }

  // Public getters
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  getAgentMetrics(agentId: string): AgentMetrics[] {
    return this.agentMetrics.get(agentId) || [];
  }

  getAgentsByType(type: AgentType): AgentInstance[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.registration.type === type);
  }

  getHealthyAgents(): AgentInstance[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === AgentStatus.HEALTHY || agent.status === AgentStatus.IDLE);
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getAgentStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    offline: number;
    busy: number;
    idle: number;
  } {
    const agents = Array.from(this.agents.values());
    
    return {
      total: agents.length,
      healthy: agents.filter(a => a.status === AgentStatus.HEALTHY).length,
      unhealthy: agents.filter(a => a.status === AgentStatus.UNHEALTHY).length,
      offline: agents.filter(a => a.status === AgentStatus.OFFLINE).length,
      busy: agents.filter(a => a.status === AgentStatus.BUSY).length,
      idle: agents.filter(a => a.status === AgentStatus.IDLE).length,
    };
  }
}