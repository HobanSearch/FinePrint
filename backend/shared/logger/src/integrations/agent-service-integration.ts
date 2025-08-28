/**
 * Agent Service Integration for Fine Print AI Logging System
 * Integrates with autonomous agents for specialized logging and decision tracking
 */

import { EventEmitter } from 'events';
import { LoggerService } from '../services/logger-service';
import { ServiceType, Environment, LogEntry } from '../types';

interface AgentServiceConfig {
  serviceUrls: string[];
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  enableDecisionTracking: boolean;
  enablePerformanceMonitoring: boolean;
  enableLearningAnalytics: boolean;
  healthCheckInterval: number; // seconds
}

interface AgentDecision {
  agentId: string;
  agentType: string;
  decisionId: string;
  timestamp: Date;
  context: Record<string, any>;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  confidence: number;
  reasoning: string[];
  executionTime: number;
  success: boolean;
  errorMessage?: string;
}

interface AgentPerformance {
  agentId: string;
  agentType: string;
  timestamp: Date;
  metrics: {
    taskCompletionRate: number;
    avgResponseTime: number;
    successRate: number;
    resourceUsage: {
      cpu: number;
      memory: number;
      gpu?: number;
    };
    throughput: number;
    queueDepth: number;
  };
}

interface AgentLearning {
  agentId: string;
  agentType: string;
  timestamp: Date;
  learningMetrics: {
    modelVersion: string;
    accuracyScore: number;
    confidenceDistribution: number[];
    learningRate: number;
    trainingIterations: number;
    convergenceStatus: string;
    knowledgeGrowth: number;
  };
}

interface AgentHealth {
  agentId: string;
  agentType: string;
  serviceUrl: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  uptime: number;
  version: string;
}

export class AgentServiceIntegration extends EventEmitter {
  private serviceUrls: string[];
  private logger: LoggerService;
  private config: AgentServiceConfig;
  private agentHealth: Map<string, AgentHealth> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private decisionBuffer: AgentDecision[] = [];
  private performanceBuffer: AgentPerformance[] = [];
  private learningBuffer: AgentLearning[] = [];
  private initialized = false;

  constructor(serviceUrls: string[], logger: LoggerService) {
    super();
    this.serviceUrls = serviceUrls;
    this.logger = logger;
    this.config = {
      serviceUrls,
      timeout: 5000,
      retryAttempts: 3,
      enableDecisionTracking: true,
      enablePerformanceMonitoring: true,
      enableLearningAnalytics: true,
      healthCheckInterval: 60,
    };
  }

  /**
   * Initialize the agent service integration
   */
  async initialize(): Promise<void> {
    try {
      // Test connections to all agent services
      await this.discoverAndTestAgents();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start data collection
      this.startDataCollection();

      this.initialized = true;

      this.logger.info('Agent service integration initialized', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentServices: this.serviceUrls.length,
        enabledFeatures: {
          decisionTracking: this.config.enableDecisionTracking,
          performanceMonitoring: this.config.enablePerformanceMonitoring,
          learningAnalytics: this.config.enableLearningAnalytics,
        },
      });

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize agent service integration', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        serviceUrls: this.serviceUrls,
      }, error as Error);

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Track an agent decision
   */
  async trackAgentDecision(decision: AgentDecision): Promise<void> {
    if (!this.config.enableDecisionTracking) return;

    try {
      this.decisionBuffer.push(decision);

      // Log the decision
      this.logger.info('Agent decision tracked', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: decision.agentId,
        agentType: decision.agentType,
        decisionId: decision.decisionId,
        confidence: decision.confidence,
        success: decision.success,
        executionTime: decision.executionTime,
        metadata: {
          reasoning: decision.reasoning.length,
          inputKeys: Object.keys(decision.inputs),
          outputKeys: Object.keys(decision.outputs),
        },
      });

      this.emit('decision-tracked', decision);
    } catch (error) {
      this.logger.error('Failed to track agent decision', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: decision.agentId,
        decisionId: decision.decisionId,
      }, error as Error);
    }
  }

  /**
   * Monitor agent performance
   */
  async monitorAgentPerformance(performance: AgentPerformance): Promise<void> {
    if (!this.config.enablePerformanceMonitoring) return;

    try {
      this.performanceBuffer.push(performance);

      // Log performance metrics
      this.logger.info('Agent performance monitored', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: performance.agentId,
        agentType: performance.agentType,
        taskCompletionRate: performance.metrics.taskCompletionRate,
        avgResponseTime: performance.metrics.avgResponseTime,
        successRate: performance.metrics.successRate,
        resourceUsage: performance.metrics.resourceUsage,
        throughput: performance.metrics.throughput,
      });

      // Check for performance anomalies
      this.checkPerformanceAnomalies(performance);

      this.emit('performance-monitored', performance);
    } catch (error) {
      this.logger.error('Failed to monitor agent performance', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: performance.agentId,
      }, error as Error);
    }
  }

  /**
   * Track agent learning progress
   */
  async trackAgentLearning(learning: AgentLearning): Promise<void> {
    if (!this.config.enableLearningAnalytics) return;

    try {
      this.learningBuffer.push(learning);

      // Log learning metrics
      this.logger.info('Agent learning tracked', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: learning.agentId,
        agentType: learning.agentType,
        modelVersion: learning.learningMetrics.modelVersion,
        accuracyScore: learning.learningMetrics.accuracyScore,
        learningRate: learning.learningMetrics.learningRate,
        convergenceStatus: learning.learningMetrics.convergenceStatus,
        knowledgeGrowth: learning.learningMetrics.knowledgeGrowth,
      });

      this.emit('learning-tracked', learning);
    } catch (error) {
      this.logger.error('Failed to track agent learning', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: learning.agentId,
      }, error as Error);
    }
  }

  /**
   * Get agent health status
   */
  getAgentHealth(): AgentHealth[] {
    return Array.from(this.agentHealth.values());
  }

  /**
   * Get agent performance summary
   */
  getAgentPerformanceSummary(): {
    totalAgents: number;
    healthyAgents: number;
    avgResponseTime: number;
    avgSuccessRate: number;
    avgThroughput: number;
  } {
    const agents = Array.from(this.agentHealth.values());
    const recentPerformance = this.performanceBuffer.filter(
      p => p.timestamp.getTime() > Date.now() - 60 * 60 * 1000 // Last hour
    );

    const healthyAgents = agents.filter(a => a.status === 'healthy').length;
    const avgResponseTime = agents.reduce((sum, a) => sum + a.responseTime, 0) / agents.length || 0;
    const avgSuccessRate = recentPerformance.reduce((sum, p) => sum + p.metrics.successRate, 0) / recentPerformance.length || 0;
    const avgThroughput = recentPerformance.reduce((sum, p) => sum + p.metrics.throughput, 0) / recentPerformance.length || 0;

    return {
      totalAgents: agents.length,
      healthyAgents,
      avgResponseTime,
      avgSuccessRate,
      avgThroughput,
    };
  }

  /**
   * Get decision analytics
   */
  getDecisionAnalytics(timeRange?: { start: Date; end: Date }): {
    totalDecisions: number;
    successRate: number;
    avgConfidence: number;
    avgExecutionTime: number;
    decisionsByAgent: Record<string, number>;
    decisionsByType: Record<string, number>;
  } {
    let decisions = this.decisionBuffer;
    
    if (timeRange) {
      decisions = decisions.filter(
        d => d.timestamp >= timeRange.start && d.timestamp <= timeRange.end
      );
    }

    const totalDecisions = decisions.length;
    const successfulDecisions = decisions.filter(d => d.success).length;
    const successRate = totalDecisions > 0 ? successfulDecisions / totalDecisions : 0;
    const avgConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions || 0;
    const avgExecutionTime = decisions.reduce((sum, d) => sum + d.executionTime, 0) / totalDecisions || 0;

    const decisionsByAgent: Record<string, number> = {};
    const decisionsByType: Record<string, number> = {};

    decisions.forEach(d => {
      decisionsByAgent[d.agentId] = (decisionsByAgent[d.agentId] || 0) + 1;
      decisionsByType[d.agentType] = (decisionsByType[d.agentType] || 0) + 1;
    });

    return {
      totalDecisions,
      successRate,
      avgConfidence,
      avgExecutionTime,
      decisionsByAgent,
      decisionsByType,
    };
  }

  /**
   * Get learning analytics
   */
  getLearningAnalytics(): {
    totalLearningEvents: number;
    avgAccuracyScore: number;
    modelVersions: Record<string, number>;
    convergenceStatus: Record<string, number>;
    knowledgeGrowthTrend: Array<{ timestamp: Date; growth: number }>;
  } {
    const learning = this.learningBuffer;
    const totalLearningEvents = learning.length;
    const avgAccuracyScore = learning.reduce((sum, l) => sum + l.learningMetrics.accuracyScore, 0) / totalLearningEvents || 0;

    const modelVersions: Record<string, number> = {};
    const convergenceStatus: Record<string, number> = {};
    const knowledgeGrowthTrend: Array<{ timestamp: Date; growth: number }> = [];

    learning.forEach(l => {
      modelVersions[l.learningMetrics.modelVersion] = (modelVersions[l.learningMetrics.modelVersion] || 0) + 1;
      convergenceStatus[l.learningMetrics.convergenceStatus] = (convergenceStatus[l.learningMetrics.convergenceStatus] || 0) + 1;
      knowledgeGrowthTrend.push({
        timestamp: l.timestamp,
        growth: l.learningMetrics.knowledgeGrowth,
      });
    });

    // Sort knowledge growth by timestamp
    knowledgeGrowthTrend.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      totalLearningEvents,
      avgAccuracyScore,
      modelVersions,
      convergenceStatus,
      knowledgeGrowthTrend,
    };
  }

  /**
   * Discover and test agent services
   */
  private async discoverAndTestAgents(): Promise<void> {
    const testPromises = this.serviceUrls.map(async (serviceUrl) => {
      try {
        const response = await this.makeRequest(serviceUrl, '/health', {
          method: 'GET',
        });

        if (response.ok) {
          const healthData = await response.json();
          
          const agentHealth: AgentHealth = {
            agentId: healthData.agentId || `agent-${serviceUrl.split('/').pop()}`,
            agentType: healthData.agentType || 'unknown',
            serviceUrl,
            status: 'healthy',
            lastCheck: new Date(),
            responseTime: 0, // Would measure actual response time
            errorRate: 0,
            uptime: healthData.uptime || 0,
            version: healthData.version || '1.0.0',
          };

          this.agentHealth.set(agentHealth.agentId, agentHealth);

          this.logger.debug('Agent service discovered', {
            service: 'agent-integration' as ServiceType,
            environment: 'production' as Environment,
            agentId: agentHealth.agentId,
            agentType: agentHealth.agentType,
            serviceUrl,
          });
        } else {
          throw new Error(`Health check failed: ${response.status}`);
        }
      } catch (error) {
        this.logger.warn('Agent service unavailable', {
          service: 'agent-integration' as ServiceType,
          environment: 'production' as Environment,
          serviceUrl,
        }, error as Error);

        // Still track the agent as offline
        this.agentHealth.set(`offline-${serviceUrl}`, {
          agentId: `offline-${serviceUrl}`,
          agentType: 'unknown',
          serviceUrl,
          status: 'offline',
          lastCheck: new Date(),
          responseTime: 0,
          errorRate: 1,
          uptime: 0,
          version: 'unknown',
        });
      }
    });

    await Promise.allSettled(testPromises);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      const healthPromises = Array.from(this.agentHealth.values()).map(async (agent) => {
        try {
          const startTime = Date.now();
          const response = await this.makeRequest(agent.serviceUrl, '/health', {
            method: 'GET',
          });
          const responseTime = Date.now() - startTime;

          if (response.ok) {
            const healthData = await response.json();
            
            agent.status = 'healthy';
            agent.lastCheck = new Date();
            agent.responseTime = responseTime;
            agent.uptime = healthData.uptime || agent.uptime;
            agent.version = healthData.version || agent.version;
            agent.errorRate = Math.max(0, agent.errorRate - 0.1); // Decay error rate
          } else {
            agent.status = 'unhealthy';
            agent.errorRate = Math.min(1, agent.errorRate + 0.1);
          }
        } catch (error) {
          agent.status = 'offline';
          agent.errorRate = Math.min(1, agent.errorRate + 0.1);
          
          this.logger.warn('Agent health check failed', {
            service: 'agent-integration' as ServiceType,
            environment: 'production' as Environment,
            agentId: agent.agentId,
            serviceUrl: agent.serviceUrl,
          }, error as Error);
        }
      });

      await Promise.allSettled(healthPromises);
      
      // Emit health status
      this.emit('health-check-complete', this.getAgentHealth());
    }, this.config.healthCheckInterval * 1000);
  }

  /**
   * Start data collection from agents
   */
  private startDataCollection(): void {
    // This would implement periodic data collection from agents
    // For now, we rely on agents pushing data to us
    
    this.logger.info('Agent data collection started', {
      service: 'agent-integration' as ServiceType,
      environment: 'production' as Environment,
      collectionTypes: ['decisions', 'performance', 'learning'],
    });
  }

  /**
   * Check for performance anomalies
   */
  private checkPerformanceAnomalies(performance: AgentPerformance): void {
    const thresholds = {
      taskCompletionRate: 0.8,
      avgResponseTime: 5000, // 5 seconds
      successRate: 0.9,
      cpuUsage: 0.8,
      memoryUsage: 0.8,
    };

    const anomalies: string[] = [];

    if (performance.metrics.taskCompletionRate < thresholds.taskCompletionRate) {
      anomalies.push(`Low task completion rate: ${performance.metrics.taskCompletionRate}`);
    }

    if (performance.metrics.avgResponseTime > thresholds.avgResponseTime) {
      anomalies.push(`High response time: ${performance.metrics.avgResponseTime}ms`);
    }

    if (performance.metrics.successRate < thresholds.successRate) {
      anomalies.push(`Low success rate: ${performance.metrics.successRate}`);
    }

    if (performance.metrics.resourceUsage.cpu > thresholds.cpuUsage) {
      anomalies.push(`High CPU usage: ${performance.metrics.resourceUsage.cpu}`);
    }

    if (performance.metrics.resourceUsage.memory > thresholds.memoryUsage) {
      anomalies.push(`High memory usage: ${performance.metrics.resourceUsage.memory}`);
    }

    if (anomalies.length > 0) {
      this.logger.warn('Agent performance anomalies detected', {
        service: 'agent-integration' as ServiceType,
        environment: 'production' as Environment,
        agentId: performance.agentId,
        agentType: performance.agentType,
        anomalies,
      });

      this.emit('performance-anomaly', { performance, anomalies });
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(baseUrl: string, path: string, options: RequestInit): Promise<Response> {
    const url = `${baseUrl}${path}`;
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
          },
        });

        clearTimeout(timeout);
        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Get integration statistics
   */
  getStatistics(): {
    agentCount: number;
    healthyAgents: number;
    bufferSizes: {
      decisions: number;
      performance: number;
      learning: number;
    };
    dataCollectionRate: number;
  } {
    return {
      agentCount: this.agentHealth.size,
      healthyAgents: Array.from(this.agentHealth.values()).filter(a => a.status === 'healthy').length,
      bufferSizes: {
        decisions: this.decisionBuffer.length,
        performance: this.performanceBuffer.length,
        learning: this.learningBuffer.length,
      },
      dataCollectionRate: 0, // Would need to track this
    };
  }

  /**
   * Shutdown the integration
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.logger.info('Agent service integration shut down', {
      service: 'agent-integration' as ServiceType,
      environment: 'production' as Environment,
      agentCount: this.agentHealth.size,
    });

    this.emit('shutdown');
  }
}