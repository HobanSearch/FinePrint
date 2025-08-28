/**
 * Integration Manager - Handles connections and data flow between services
 * Manages communication with DSPy, Memory, and Business Intelligence services
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { 
  BusinessOutcome, 
  BusinessDomain, 
  LearningPattern,
  OptimizationJob,
  OptimizationStatus,
  TrainingExample 
} from '../types/learning';
import { 
  ServiceConnection, 
  ConnectionStatus, 
  DSPyIntegration,
  MemoryIntegration,
  BusinessIntelligenceIntegration,
  IntegrationHealth,
  LearningEvent,
  LearningEventType
} from '../types/integration';

export interface IntegrationManagerConfig {
  dspyServiceUrl: string;
  memoryServiceUrl: string;
  businessIntelligenceUrl: string;
  timeouts: {
    default: number;
    optimization: number;
    bulkOperations: number;
  };
  retryPolicy: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
  healthCheck: {
    interval: number;
    timeout: number;
  };
}

export class IntegrationManager {
  private logger = createServiceLogger('integration-manager');
  private config: IntegrationManagerConfig;
  
  // Service clients
  private dspyClient: AxiosInstance;
  private memoryClient: AxiosInstance;
  private biClient: AxiosInstance;

  // Connection status tracking
  private connections: Map<string, ServiceConnection> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: IntegrationManagerConfig) {
    this.config = config;
    this.initializeClients();
    this.startHealthChecking();
  }

  private initializeClients(): void {
    const defaultConfig: AxiosRequestConfig = {
      timeout: this.config.timeouts.default,
      headers: {
        'Content-Type': 'application/json',
        'X-Service': 'dspy-memory-integration',
      },
    };

    this.dspyClient = axios.create({
      ...defaultConfig,
      baseURL: this.config.dspyServiceUrl,
    });

    this.memoryClient = axios.create({
      ...defaultConfig,
      baseURL: this.config.memoryServiceUrl,
    });

    this.biClient = axios.create({
      ...defaultConfig,
      baseURL: this.config.businessIntelligenceUrl,
    });

    // Set up request/response interceptors
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // DSPy service interceptors
    this.setupServiceInterceptors(this.dspyClient, 'dspy');
    this.setupServiceInterceptors(this.memoryClient, 'memory');
    this.setupServiceInterceptors(this.biClient, 'business-intelligence');
  }

  private setupServiceInterceptors(client: AxiosInstance, serviceName: string): void {
    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        this.logger.debug(`${serviceName} request`, {
          url: config.url,
          method: config.method,
          data: config.data ? Object.keys(config.data) : undefined,
        });
        return config;
      },
      (error) => {
        this.logger.error(`${serviceName} request error`, { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        this.updateConnectionStatus(serviceName, {
          status: ConnectionStatus.HEALTHY,
          responseTime: response.config.metadata?.requestStartTime ? 
            Date.now() - response.config.metadata.requestStartTime : 0,
        });
        return response;
      },
      (error) => {
        this.updateConnectionStatus(serviceName, {
          status: ConnectionStatus.UNHEALTHY,
          error: error.message,
        });
        
        this.logger.error(`${serviceName} response error`, {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });

        return Promise.reject(error);
      }
    );
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheck.interval);
  }

  private async performHealthChecks(): Promise<void> {
    const healthChecks = [
      this.checkServiceHealth('dspy', this.dspyClient, '/health'),
      this.checkServiceHealth('memory', this.memoryClient, '/health'),
      this.checkServiceHealth('business-intelligence', this.biClient, '/health'),
    ];

    await Promise.allSettled(healthChecks);
  }

  private async checkServiceHealth(
    serviceName: string, 
    client: AxiosInstance, 
    endpoint: string
  ): Promise<void> {
    try {
      const startTime = Date.now();
      const response = await client.get(endpoint, {
        timeout: this.config.healthCheck.timeout,
      });
      
      const responseTime = Date.now() - startTime;
      
      this.updateConnectionStatus(serviceName, {
        status: response.data.status === 'ok' ? ConnectionStatus.HEALTHY : ConnectionStatus.DEGRADED,
        responseTime,
        version: response.data.version,
        lastPing: new Date(),
      });

    } catch (error) {
      this.updateConnectionStatus(serviceName, {
        status: ConnectionStatus.UNHEALTHY,
        error: error.message,
        lastPing: new Date(),
      });
    }
  }

  private updateConnectionStatus(serviceName: string, update: Partial<ServiceConnection>): void {
    const existing = this.connections.get(serviceName) || {
      serviceName,
      endpoint: '',
      healthStatus: ConnectionStatus.DISCONNECTED,
      lastPing: new Date(),
      responseTime: 0,
      errorCount: 0,
      version: 'unknown',
    };

    const updated = { ...existing, ...update };
    
    if (update.status === ConnectionStatus.UNHEALTHY) {
      updated.errorCount += 1;
    } else if (update.status === ConnectionStatus.HEALTHY) {
      updated.errorCount = 0;
    }

    this.connections.set(serviceName, updated);
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Integration Manager...');

      // Perform initial health checks
      await this.performHealthChecks();

      // Verify all critical services are available
      const criticalServices = ['dspy', 'memory', 'business-intelligence'];
      const unhealthyServices = criticalServices.filter(service => {
        const connection = this.connections.get(service);
        return !connection || connection.healthStatus === ConnectionStatus.UNHEALTHY;
      });

      if (unhealthyServices.length > 0) {
        this.logger.warn('Some services are unhealthy', { unhealthyServices });
        // Continue initialization but log warning
      }

      this.logger.info('Integration Manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Integration Manager', { error });
      throw error;
    }
  }

  // DSPy Service Integration Methods

  async runDSPyOptimization(request: {
    domain: BusinessDomain;
    trainingData: TrainingExample[];
    parameters: any;
  }): Promise<any> {
    try {
      this.logger.info('Running DSPy optimization', {
        domain: request.domain,
        trainingDataSize: request.trainingData.length,
      });

      const response = await this.dspyClient.post('/api/optimization/start', {
        domain: request.domain,
        training_data: request.trainingData.map(example => ({
          input: example.input,
          output: example.output,
          quality_score: example.qualityScore,
        })),
        parameters: {
          max_iterations: request.parameters.maxIterations || 100,
          convergence_threshold: request.parameters.convergenceThreshold || 0.01,
          learning_rate: request.parameters.learningRate || 0.1,
          exploration_rate: request.parameters.explorationRate || 0.1,
        },
      }, {
        timeout: this.config.timeouts.optimization,
      });

      return response.data.data;

    } catch (error) {
      this.logger.error('DSPy optimization failed', {
        error: error.message,
        domain: request.domain,
      });
      throw error;
    }
  }

  async getDSPyOptimizationStatus(jobId: string): Promise<any> {
    try {
      const response = await this.dspyClient.get(`/api/optimization/status/${jobId}`);
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get DSPy optimization status', { error, jobId });
      throw error;
    }
  }

  async deployOptimizedPrompts(prompts: any[], domain: BusinessDomain): Promise<void> {
    try {
      this.logger.info('Deploying optimized prompts', {
        domain,
        promptCount: prompts.length,
      });

      await this.dspyClient.post('/api/modules/deploy', {
        domain,
        prompts: prompts.map(prompt => ({
          id: prompt.id,
          template: prompt.template,
          parameters: prompt.parameters,
          version: prompt.version,
        })),
      });

      this.logger.info('Prompts deployed successfully', { domain });

    } catch (error) {
      this.logger.error('Failed to deploy optimized prompts', { error, domain });
      throw error;
    }
  }

  async evaluatePrompt(prompt: string, context: any, domain: BusinessDomain): Promise<any> {
    try {
      const response = await this.dspyClient.post('/api/dspy/evaluate', {
        prompt,
        context,
        domain,
      });

      return response.data.data;

    } catch (error) {
      this.logger.error('Failed to evaluate prompt', { error, domain });
      throw error;
    }
  }

  // Memory Service Integration Methods

  async storeOutcome(outcome: BusinessOutcome): Promise<void> {
    try {
      await this.memoryClient.post('/api/v1/memories', {
        type: 'business_outcome',
        data: outcome,
        tags: [outcome.domain, outcome.success ? 'success' : 'failure'],
        metadata: {
          promptId: outcome.promptId,
          domain: outcome.domain,
          timestamp: outcome.timestamp,
        },
      });

      this.logger.debug('Business outcome stored', { outcomeId: outcome.id });

    } catch (error) {
      this.logger.error('Failed to store business outcome', { error, outcomeId: outcome.id });
      throw error;
    }
  }

  async getOutcome(outcomeId: string): Promise<BusinessOutcome | null> {
    try {
      const response = await this.memoryClient.get(`/api/v1/memories/search`, {
        params: {
          type: 'business_outcome',
          filter: JSON.stringify({ id: outcomeId }),
          limit: 1,
        },
      });

      const memories = response.data.data;
      return memories.length > 0 ? memories[0].data : null;

    } catch (error) {
      this.logger.error('Failed to get business outcome', { error, outcomeId });
      throw error;
    }
  }

  async getPendingOutcomes(): Promise<BusinessOutcome[]> {
    try {
      const response = await this.memoryClient.get('/api/v1/memories/search', {
        params: {
          type: 'business_outcome',
          filter: JSON.stringify({ processed: false }),
          limit: 100,
          sort: 'timestamp',
          order: 'desc',
        },
      });

      return response.data.data.map((memory: any) => memory.data);

    } catch (error) {
      this.logger.error('Failed to get pending outcomes', { error });
      return [];
    }
  }

  async storePattern(pattern: LearningPattern): Promise<void> {
    try {
      await this.memoryClient.post('/api/v1/memories', {
        type: 'learning_pattern',
        data: pattern,
        tags: [pattern.domain, pattern.status],
        metadata: {
          patternId: pattern.id,
          domain: pattern.domain,
          confidence: pattern.confidence,
          sampleSize: pattern.sampleSize,
        },
      });

      this.logger.debug('Learning pattern stored', { patternId: pattern.id });

    } catch (error) {
      this.logger.error('Failed to store learning pattern', { error, patternId: pattern.id });
      throw error;
    }
  }

  async getPattern(patternId: string): Promise<LearningPattern | null> {
    try {
      const response = await this.memoryClient.get('/api/v1/memories/search', {
        params: {
          type: 'learning_pattern',
          filter: JSON.stringify({ id: patternId }),
          limit: 1,
        },
      });

      const memories = response.data.data;
      return memories.length > 0 ? memories[0].data : null;

    } catch (error) {
      this.logger.error('Failed to get learning pattern', { error, patternId });
      throw error;
    }
  }

  async getPatternsForDomain(domain: BusinessDomain): Promise<LearningPattern[]> {
    try {
      const response = await this.memoryClient.get('/api/v1/memories/search', {
        params: {
          type: 'learning_pattern',
          filter: JSON.stringify({ domain }),
          limit: 1000,
          sort: 'confidence',
          order: 'desc',
        },
      });

      return response.data.data.map((memory: any) => memory.data);

    } catch (error) {
      this.logger.error('Failed to get patterns for domain', { error, domain });
      return [];
    }
  }

  async storeOptimizationJob(job: OptimizationJob): Promise<void> {
    try {
      await this.memoryClient.post('/api/v1/memories', {
        type: 'optimization_job',
        data: job,
        tags: [job.domain, job.status, job.type],
        metadata: {
          jobId: job.id,
          domain: job.domain,
          priority: job.priority,
          status: job.status,
        },
      });

      this.logger.debug('Optimization job stored', { jobId: job.id });

    } catch (error) {
      this.logger.error('Failed to store optimization job', { error, jobId: job.id });
      throw error;
    }
  }

  async updateOptimizationJobStatus(jobId: string, status: OptimizationStatus): Promise<void> {
    try {
      // First, get the current job
      const response = await this.memoryClient.get('/api/v1/memories/search', {
        params: {
          type: 'optimization_job',
          filter: JSON.stringify({ id: jobId }),
          limit: 1,
        },
      });

      if (response.data.data.length === 0) {
        throw new Error(`Optimization job not found: ${jobId}`);
      }

      const job = response.data.data[0].data;
      job.status = status;
      
      if (status === OptimizationStatus.COMPLETED || status === OptimizationStatus.FAILED) {
        job.endTime = new Date();
      }

      // Update the job in memory
      await this.memoryClient.put(`/api/v1/memories/${response.data.data[0].id}`, {
        data: job,
        tags: [job.domain, status, job.type],
      });

      this.logger.debug('Optimization job status updated', { jobId, status });

    } catch (error) {
      this.logger.error('Failed to update optimization job status', { error, jobId, status });
      throw error;
    }
  }

  async getHistoricalOutcomes(request: {
    domain?: BusinessDomain;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<BusinessOutcome[]> {
    try {
      const filter: any = {};
      
      if (request.domain) {
        filter.domain = request.domain;
      }
      
      if (request.startDate || request.endDate) {
        filter.timestamp = {};
        if (request.startDate) {
          filter.timestamp.$gte = request.startDate;
        }
        if (request.endDate) {
          filter.timestamp.$lte = request.endDate;
        }
      }

      const response = await this.memoryClient.get('/api/v1/memories/search', {
        params: {
          type: 'business_outcome',
          filter: JSON.stringify(filter),
          limit: request.limit || 1000,
          sort: 'timestamp',
          order: 'desc',
        },
      });

      return response.data.data.map((memory: any) => memory.data);

    } catch (error) {
      this.logger.error('Failed to get historical outcomes', { error, request });
      return [];
    }
  }

  // Business Intelligence Service Integration Methods

  async recordBusinessMetrics(metrics: {
    domain: BusinessDomain;
    metrics: Record<string, number>;
    timestamp: Date;
    context?: any;
  }): Promise<void> {
    try {
      await this.biClient.post('/api/metrics/record', {
        domain: metrics.domain,
        metrics: metrics.metrics,
        timestamp: metrics.timestamp,
        context: metrics.context,
        source: 'dspy-learning-system',
      });

      this.logger.debug('Business metrics recorded', { domain: metrics.domain });

    } catch (error) {
      this.logger.error('Failed to record business metrics', { error, domain: metrics.domain });
      throw error;
    }
  }

  async getBusinessMetrics(request: {
    domain?: BusinessDomain;
    metrics: string[];
    timeframe: string;
    aggregation?: string;
  }): Promise<any> {
    try {
      const response = await this.biClient.get('/api/analytics/metrics', {
        params: {
          domain: request.domain,
          metrics: request.metrics.join(','),
          timeframe: request.timeframe,
          aggregation: request.aggregation || 'average',
        },
      });

      return response.data.data;

    } catch (error) {
      this.logger.error('Failed to get business metrics', { error, request });
      throw error;
    }
  }

  async getBusinessImpactAnalysis(domain: BusinessDomain, timeframe: string): Promise<any> {
    try {
      const response = await this.biClient.get('/api/analytics/impact', {
        params: {
          domain,
          timeframe,
          includeProjections: true,
        },
      });

      return response.data.data;

    } catch (error) {
      this.logger.error('Failed to get business impact analysis', { error, domain });
      throw error;
    }
  }

  async createBusinessAlert(alert: {
    domain: BusinessDomain;
    metric: string;
    threshold: number;
    condition: 'above' | 'below';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
  }): Promise<void> {
    try {
      await this.biClient.post('/api/alerts/create', {
        ...alert,
        source: 'dspy-learning-system',
        timestamp: new Date(),
      });

      this.logger.info('Business alert created', { domain: alert.domain, metric: alert.metric });

    } catch (error) {
      this.logger.error('Failed to create business alert', { error, alert });
      throw error;
    }
  }

  // Event Management

  async publishLearningEvent(event: Omit<LearningEvent, 'id' | 'timestamp' | 'processed' | 'retryCount'>): Promise<void> {
    try {
      const fullEvent: LearningEvent = {
        ...event,
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        processed: false,
        retryCount: 0,
      };

      // Store event in memory for processing
      await this.memoryClient.post('/api/v1/memories', {
        type: 'learning_event',
        data: fullEvent,
        tags: [event.type, event.source, event.context.domain],
        metadata: {
          eventType: event.type,
          source: event.source,
          domain: event.context.domain,
        },
      });

      this.logger.debug('Learning event published', {
        eventId: fullEvent.id,
        type: event.type,
        source: event.source,
      });

    } catch (error) {
      this.logger.error('Failed to publish learning event', { error, event });
      throw error;
    }
  }

  // Health and Status Methods

  async getHealthStatus(): Promise<IntegrationHealth> {
    const services = {
      dspy: this.getServiceHealth('dspy'),
      memory: this.getServiceHealth('memory'),
      businessIntelligence: this.getServiceHealth('business-intelligence'),
    };

    const overallStatus = Object.values(services).every(service => 
      service.status === ConnectionStatus.HEALTHY
    ) ? ConnectionStatus.HEALTHY : ConnectionStatus.DEGRADED;

    const issues = Array.from(this.connections.values())
      .filter(conn => conn.healthStatus !== ConnectionStatus.HEALTHY)
      .map(conn => ({
        service: conn.serviceName,
        severity: conn.healthStatus === ConnectionStatus.UNHEALTHY ? 'high' as const : 'medium' as const,
        description: `Service ${conn.serviceName} is ${conn.healthStatus}`,
        impact: 'May affect learning system functionality',
        resolution: 'Check service logs and network connectivity',
        timestamp: new Date(),
        resolved: false,
      }));

    return {
      overall: overallStatus,
      services,
      lastHealthCheck: new Date(),
      issues,
    };
  }

  private getServiceHealth(serviceName: string) {
    const connection = this.connections.get(serviceName);
    
    if (!connection) {
      return {
        status: ConnectionStatus.DISCONNECTED,
        responseTime: 0,
        errorRate: 100,
        throughput: 0,
        lastSuccessfulCall: new Date(0),
        capabilities: [],
        limitations: ['Service not connected'],
      };
    }

    return {
      status: connection.healthStatus,
      responseTime: connection.responseTime,
      errorRate: connection.errorCount > 0 ? (connection.errorCount / 100) * 100 : 0,
      throughput: 0, // Would need to track this separately
      lastSuccessfulCall: connection.lastPing,
      capabilities: [], // Would be populated based on service discovery
      limitations: connection.healthStatus !== ConnectionStatus.HEALTHY ? ['Service degraded'] : [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.performHealthChecks();
      
      const criticalServices = ['dspy', 'memory'];
      return criticalServices.every(service => {
        const connection = this.connections.get(service);
        return connection?.healthStatus === ConnectionStatus.HEALTHY;
      });

    } catch (error) {
      this.logger.error('Integration health check failed', { error });
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Integration Manager...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // No need to explicitly close axios clients
    this.logger.info('Integration Manager shutdown complete');
  }
}