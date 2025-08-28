import { EventEmitter } from 'eventemitter3';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import {
  AgentInfo,
  AgentType,
  AgentStatus,
  CoordinationMessage,
  MessageType,
  MessagePriority,
  TaskRequest,
  InformationShare,
  CoordinationRequest,
  BusinessEvent,
  CoordinationPattern,
  AgentPerformanceMetrics,
  CoordinationAnalytics
} from '../types';

export class CoordinationHub extends EventEmitter {
  private redis: Redis;
  private messageQueue: Queue;
  private messageWorker: Worker;
  private agents: Map<string, AgentInfo> = new Map();
  private activeConnections: Map<string, WebSocket> = new Map();
  private coordinationPatterns: Map<string, CoordinationPattern> = new Map();
  private messageHistory: CoordinationMessage[] = [];
  private performanceMetrics: Map<string, AgentPerformanceMetrics> = new Map();

  constructor(redisConfig: { host: string; port: number; password?: string }) {
    super();
    this.redis = new Redis(redisConfig);
    this.messageQueue = new Queue('agent-coordination', { 
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    });
    
    this.messageWorker = new Worker('agent-coordination', 
      async (job: Job) => this.processMessage(job.data),
      { connection: redisConfig }
    );

    this.initializePatterns();
    this.startHeartbeatMonitoring();
  }

  /**
   * Register an agent with the coordination hub
   */
  public async registerAgent(agentInfo: AgentInfo): Promise<void> {
    this.agents.set(agentInfo.id, {
      ...agentInfo,
      lastHeartbeat: new Date(),
      status: AgentStatus.HEALTHY
    });

    // Publish agent registration event
    await this.redis.publish('agent-events', JSON.stringify({
      type: 'agent-registered',
      agentId: agentInfo.id,
      agentType: agentInfo.type,
      timestamp: new Date()
    }));

    this.emit('agentRegistered', agentInfo);
  }

  /**
   * Handle agent heartbeat
   */
  public async heartbeat(agentId: string, status?: Partial<AgentInfo>): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const updatedAgent: AgentInfo = {
      ...agent,
      ...status,
      lastHeartbeat: new Date(),
      status: status?.status || AgentStatus.HEALTHY
    };

    this.agents.set(agentId, updatedAgent);

    // Store heartbeat in Redis for analytics
    await this.redis.hset(`agent:${agentId}:heartbeat`, {
      timestamp: Date.now(),
      status: updatedAgent.status,
      currentLoad: updatedAgent.currentLoad
    });
  }

  /**
   * Send message between agents
   */
  public async sendMessage(message: Omit<CoordinationMessage, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: CoordinationMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date()
    };

    // Add to message queue for processing
    await this.messageQueue.add('process-message', fullMessage, {
      priority: this.getPriority(message.priority),
      delay: 0
    });

    // Store in history for analytics
    this.messageHistory.push(fullMessage);
    if (this.messageHistory.length > 10000) {
      this.messageHistory = this.messageHistory.slice(-5000);
    }

    return fullMessage.id;
  }

  /**
   * Request task execution from capable agents
   */
  public async requestTask(request: TaskRequest, fromAgent: string): Promise<string> {
    const capableAgents = this.findCapableAgents(request.requiredCapabilities);
    
    if (capableAgents.length === 0) {
      throw new Error(`No agents available with capabilities: ${request.requiredCapabilities.join(', ')}`);
    }

    // Select best agent based on load and performance
    const selectedAgent = this.selectOptimalAgent(capableAgents, request);

    const messageId = await this.sendMessage({
      fromAgent,
      toAgent: selectedAgent.id,
      type: MessageType.TASK_REQUEST,
      priority: request.context.priority,
      payload: request,
      correlationId: request.context.sessionId
    });

    return messageId;
  }

  /**
   * Share information with relevant agents
   */
  public async shareInformation(info: InformationShare, fromAgent: string): Promise<void> {
    const relevantAgents = info.relevantAgents || this.findRelevantAgents(info);

    for (const agentId of relevantAgents) {
      await this.sendMessage({
        fromAgent,
        toAgent: agentId,
        type: MessageType.INFORMATION_SHARE,
        priority: MessagePriority.MEDIUM,
        payload: info,
        expiresAt: info.ttl ? new Date(Date.now() + info.ttl * 1000) : undefined
      });
    }

    // Store in knowledge base for future reference
    await this.redis.setex(
      `shared-info:${info.category}:${Date.now()}`,
      info.ttl || 3600,
      JSON.stringify(info)
    );
  }

  /**
   * Coordinate multi-agent collaboration
   */
  public async coordinateAgents(request: CoordinationRequest, fromAgent: string): Promise<string> {
    const coordinationId = uuidv4();
    
    // Check if all participants are available
    const unavailableAgents = request.participants.filter(
      agentId => !this.agents.has(agentId) || 
                 this.agents.get(agentId)?.status !== AgentStatus.HEALTHY
    );

    if (unavailableAgents.length > 0) {
      throw new Error(`Agents unavailable: ${unavailableAgents.join(', ')}`);
    }

    // Send coordination requests to all participants
    for (const agentId of request.participants) {
      await this.sendMessage({
        fromAgent,
        toAgent: agentId,
        type: MessageType.COORDINATION_REQUEST,
        priority: MessagePriority.HIGH,
        payload: {
          ...request,
          coordinationId,
          role: this.determineAgentRole(agentId, request)
        },
        correlationId: coordinationId
      });
    }

    return coordinationId;
  }

  /**
   * Broadcast business event to interested agents
   */
  public async broadcastBusinessEvent(event: BusinessEvent, fromAgent: string): Promise<void> {
    const interestedAgents = this.findInterestedAgents(event);

    for (const agentId of interestedAgents) {
      await this.sendMessage({
        fromAgent,
        toAgent: agentId,
        type: MessageType.BUSINESS_EVENT,
        priority: MessagePriority.MEDIUM,
        payload: event
      });
    }

    // Store event for analytics
    await this.redis.lpush('business-events', JSON.stringify({
      ...event,
      processedAt: new Date(),
      notifiedAgents: interestedAgents
    }));
  }

  /**
   * Get coordination analytics
   */
  public async getCoordinationAnalytics(period?: { start: Date; end: Date }): Promise<CoordinationAnalytics> {
    const messages = period ? 
      this.messageHistory.filter(m => 
        m.timestamp >= period.start && m.timestamp <= period.end
      ) : this.messageHistory;

    const messagesByType = messages.reduce((acc, msg) => {
      acc[msg.type] = (acc[msg.type] || 0) + 1;
      return acc;
    }, {} as Record<MessageType, number>);

    const messagesByPriority = messages.reduce((acc, msg) => {
      acc[msg.priority] = (acc[msg.priority] || 0) + 1;
      return acc;
    }, {} as Record<MessagePriority, number>);

    // Calculate collaboration patterns
    const collaborations = this.analyzeCollaborations(messages);

    return {
      totalMessages: messages.length,
      messagesByType,
      messagesByPriority,
      averageLatency: await this.calculateAverageLatency(),
      successRate: await this.calculateSuccessRate(),
      topCollaborations: collaborations,
      bottlenecks: await this.identifyBottlenecks()
    };
  }

  /**
   * WebSocket connection handler
   */
  public handleWebSocketConnection(ws: WebSocket, agentId: string): void {
    this.activeConnections.set(agentId, ws);

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);
        await this.handleWebSocketMessage(message, agentId);
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      this.activeConnections.delete(agentId);
    });

    // Send initial agent registry
    ws.send(JSON.stringify({
      type: 'registry-update',
      agents: Array.from(this.agents.values())
    }));
  }

  private async processMessage(message: CoordinationMessage): Promise<void> {
    try {
      // Route message to target agent
      if (message.toAgent) {
        const connection = this.activeConnections.get(message.toAgent);
        if (connection) {
          connection.send(JSON.stringify(message));
        } else {
          // Agent not connected, store for later delivery
          await this.redis.lpush(`agent:${message.toAgent}:messages`, JSON.stringify(message));
        }
      } else {
        // Broadcast message
        for (const [agentId, connection] of this.activeConnections.entries()) {
          if (agentId !== message.fromAgent) {
            connection.send(JSON.stringify(message));
          }
        }
      }

      // Update performance metrics
      await this.updatePerformanceMetrics(message);

    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  private findCapableAgents(requiredCapabilities: string[]): AgentInfo[] {
    return Array.from(this.agents.values()).filter(agent => 
      agent.status === AgentStatus.HEALTHY &&
      requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    );
  }

  private selectOptimalAgent(agents: AgentInfo[], request: TaskRequest): AgentInfo {
    // Score agents based on load, performance, and preferences
    const scoredAgents = agents.map(agent => ({
      agent,
      score: this.calculateAgentScore(agent, request)
    }));

    scoredAgents.sort((a, b) => b.score - a.score);
    return scoredAgents[0].agent;
  }

  private calculateAgentScore(agent: AgentInfo, request: TaskRequest): number {
    let score = 100;

    // Load factor (lower load = higher score)
    const loadFactor = 1 - (agent.currentLoad / agent.maxCapacity);
    score *= loadFactor;

    // Performance factor (get from metrics)
    const metrics = this.performanceMetrics.get(agent.id);
    if (metrics) {
      score *= (metrics.averageQualityScore / 100);
    }

    // Preference factor
    if (request.preferences?.preferredAgents?.includes(agent.id)) {
      score *= 1.5;
    }
    if (request.preferences?.excludedAgents?.includes(agent.id)) {
      score *= 0.1;
    }

    return score;
  }

  private findRelevantAgents(info: InformationShare): string[] {
    const relevant: string[] = [];

    for (const [agentId, agent] of this.agents.entries()) {
      // Check if agent's capabilities match information category
      if (this.isRelevantToAgent(agent, info)) {
        relevant.push(agentId);
      }
    }

    return relevant;
  }

  private isRelevantToAgent(agent: AgentInfo, info: InformationShare): boolean {
    // Business context matching
    if (info.businessContext) {
      const businessTypes = ['marketing', 'sales', 'support', 'legal'];
      for (const type of businessTypes) {
        if (agent.type.includes(type) && info.category.includes(type)) {
          return true;
        }
      }
    }

    // Tag matching
    return info.tags.some(tag => agent.capabilities.some(cap => cap.includes(tag)));
  }

  private findInterestedAgents(event: BusinessEvent): string[] {
    const interested: string[] = [];

    for (const [agentId, agent] of this.agents.values()) {
      if (this.isInterestedInEvent(agent, event)) {
        interested.push(agentId);
      }
    }

    return interested;
  }

  private isInterestedInEvent(agent: AgentInfo, event: BusinessEvent): boolean {
    // Map event types to interested agent types
    const eventAgentMap: Record<string, AgentType[]> = {
      'customer.signup': [AgentType.SALES_AGENT, AgentType.MARKETING_CONTEXT, AgentType.SUPPORT_AGENT],
      'document.analyzed': [AgentType.BUSINESS_INTELLIGENCE, AgentType.KNOWLEDGE_GRAPH],
      'campaign.launched': [AgentType.MARKETING_CONTEXT, AgentType.BUSINESS_INTELLIGENCE],
      'deal.closed': [AgentType.SALES_CONTEXT, AgentType.BUSINESS_INTELLIGENCE]
    };

    const interestedTypes = eventAgentMap[event.eventType] || [];
    return interestedTypes.includes(agent.type);
  }

  private determineAgentRole(agentId: string, request: CoordinationRequest): string {
    const agent = this.agents.get(agentId);
    if (!agent) return 'participant';

    // Determine role based on agent type and coordination type
    switch (request.coordinationType) {
      case 'collaborative-analysis':
        if (agent.type === AgentType.BUSINESS_INTELLIGENCE) return 'coordinator';
        return 'analyst';
      case 'sequential-workflow':
        return 'executor';
      default:
        return 'participant';
    }
  }

  private getPriority(priority: MessagePriority): number {
    const priorityMap = {
      [MessagePriority.CRITICAL]: 1,
      [MessagePriority.HIGH]: 2,
      [MessagePriority.MEDIUM]: 3,
      [MessagePriority.LOW]: 4
    };
    return priorityMap[priority];
  }

  private async handleWebSocketMessage(message: any, agentId: string): Promise<void> {
    switch (message.type) {
      case 'heartbeat':
        await this.heartbeat(agentId, message.status);
        break;
      case 'task-response':
        await this.handleTaskResponse(message, agentId);
        break;
      case 'coordination-response':
        await this.handleCoordinationResponse(message, agentId);
        break;
    }
  }

  private async handleTaskResponse(message: any, agentId: string): Promise<void> {
    // Forward response to requesting agent
    const originalRequest = this.messageHistory.find(
      m => m.id === message.correlationId && m.type === MessageType.TASK_REQUEST
    );

    if (originalRequest) {
      await this.sendMessage({
        fromAgent: agentId,
        toAgent: originalRequest.fromAgent,
        type: MessageType.TASK_RESPONSE,
        priority: MessagePriority.MEDIUM,
        payload: message.result,
        correlationId: message.correlationId
      });
    }
  }

  private async handleCoordinationResponse(message: any, agentId: string): Promise<void> {
    // Handle coordination response logic
    // This would implement coordination pattern execution
  }

  private initializePatterns(): void {
    // Initialize common coordination patterns
    const patterns: CoordinationPattern[] = [
      {
        id: 'marketing-campaign-analysis',
        name: 'Marketing Campaign Analysis',
        description: 'Coordinate multiple agents to analyze and optimize marketing campaigns',
        participants: [AgentType.MARKETING_CONTEXT, AgentType.BUSINESS_INTELLIGENCE, AgentType.DSPY_OPTIMIZER],
        workflow: [
          {
            stepId: 'gather-data',
            agentType: AgentType.MARKETING_CONTEXT,
            action: 'collect-campaign-data',
            inputs: ['campaignId'],
            outputs: ['campaignMetrics'],
            dependencies: [],
            timeout: 30000,
            retryPolicy: { maxRetries: 3, backoffStrategy: 'exponential', baseDelay: 1000, maxDelay: 10000 }
          },
          {
            stepId: 'analyze-performance',
            agentType: AgentType.BUSINESS_INTELLIGENCE,
            action: 'analyze-metrics',
            inputs: ['campaignMetrics'],
            outputs: ['performanceInsights'],
            dependencies: ['gather-data'],
            timeout: 60000,
            retryPolicy: { maxRetries: 2, backoffStrategy: 'linear', baseDelay: 2000, maxDelay: 8000 }
          }
        ],
        successCriteria: {
          required: ['performanceInsights'],
          optional: ['optimizationRecommendations'],
          businessMetrics: ['engagement_rate', 'conversion_rate', 'roi']
        },
        businessValue: 'Improve marketing campaign effectiveness through coordinated analysis'
      }
    ];

    patterns.forEach(pattern => this.coordinationPatterns.set(pattern.id, pattern));
  }

  private startHeartbeatMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const heartbeatTimeout = 60000; // 1 minute

      for (const [agentId, agent] of this.agents.entries()) {
        if (now - agent.lastHeartbeat.getTime() > heartbeatTimeout) {
          agent.status = AgentStatus.UNAVAILABLE;
          this.emit('agentUnhealthy', { agentId, status: AgentStatus.UNAVAILABLE });
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private async updatePerformanceMetrics(message: CoordinationMessage): Promise<void> {
    // Update agent performance metrics based on message processing
    const agentId = message.fromAgent;
    const metrics = this.performanceMetrics.get(agentId) || this.createDefaultMetrics(agentId);

    // Update metrics based on message type and success
    if (message.type === MessageType.TASK_RESPONSE) {
      metrics.tasksCompleted++;
    }

    this.performanceMetrics.set(agentId, metrics);
  }

  private createDefaultMetrics(agentId: string): AgentPerformanceMetrics {
    return {
      agentId,
      period: { start: new Date(), end: new Date() },
      tasksCompleted: 0,
      tasksFailedCount: 0,
      averageResponseTime: 0,
      averageQualityScore: 80,
      businessImpact: { revenue: 0, customerSatisfaction: 0, costSavings: 0 },
      collaborationMetrics: { messagesExchanged: 0, coordinationSuccess: 0, knowledgeShared: 0 }
    };
  }

  private analyzeCollaborations(messages: CoordinationMessage[]): Array<{
    agents: string[];
    frequency: number;
    successRate: number;
    businessValue: number;
  }> {
    // Analyze message patterns to identify frequent collaborations
    const collaborations = new Map<string, { count: number; success: number }>();

    messages.forEach(msg => {
      if (msg.toAgent) {
        const key = [msg.fromAgent, msg.toAgent].sort().join('-');
        const current = collaborations.get(key) || { count: 0, success: 0 };
        current.count++;
        if (msg.type === MessageType.TASK_RESPONSE) {
          current.success++;
        }
        collaborations.set(key, current);
      }
    });

    return Array.from(collaborations.entries())
      .map(([key, stats]) => ({
        agents: key.split('-'),
        frequency: stats.count,
        successRate: stats.success / stats.count,
        businessValue: stats.success * 10 // Simplified business value calculation
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  private async calculateAverageLatency(): Promise<number> {
    // Calculate average message processing latency
    const latencies = await this.redis.lrange('message-latencies', 0, 100);
    if (latencies.length === 0) return 0;
    
    const sum = latencies.reduce((acc, latency) => acc + parseFloat(latency), 0);
    return sum / latencies.length;
  }

  private async calculateSuccessRate(): Promise<number> {
    const totalTasks = await this.redis.get('total-tasks') || '0';
    const successfulTasks = await this.redis.get('successful-tasks') || '0';
    
    const total = parseInt(totalTasks);
    const successful = parseInt(successfulTasks);
    
    return total > 0 ? successful / total : 0;
  }

  private async identifyBottlenecks(): Promise<Array<{
    agentType: AgentType;
    issue: string;
    impact: string;
    recommendation: string;
  }>> {
    const bottlenecks = [];

    // Analyze agent loads and response times
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.currentLoad / agent.maxCapacity > 0.8) {
        bottlenecks.push({
          agentType: agent.type,
          issue: 'High load',
          impact: 'Increased response times and potential task queuing',
          recommendation: 'Scale out or optimize agent performance'
        });
      }
    }

    return bottlenecks;
  }
}