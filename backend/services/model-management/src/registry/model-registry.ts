/**
 * Model Registry - Track model status, performance, and availability
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import pino from 'pino';
import {
  ModelConfig,
  ModelStatus,
  ModelType,
  ModelCapability,
  ModelMetrics,
  HourlyMetric,
  ModelHealthStatus
} from '../types';

const logger = pino({ name: 'model-registry' });

export class ModelRegistry extends EventEmitter {
  private models: Map<string, ModelConfig>;
  private redis: Redis;
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsUpdateInterval?: NodeJS.Timeout;

  constructor(redis: Redis) {
    super();
    this.models = new Map();
    this.redis = redis;
    this.initializeModels();
    this.startHealthChecks();
    this.startMetricsCollection();
  }

  /**
   * Initialize model configurations based on test results
   */
  private initializeModels(): void {
    const models: ModelConfig[] = [
      {
        id: 'fine-print-llama',
        name: 'Fine Print Llama',
        type: ModelType.PRIMARY,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 81540, // 81.54s from test results
        successRate: 1.0, // 100% success rate
        costPerRequest: 0.001, // $0.001 per request
        maxConcurrency: 10,
        timeout: 120000, // 2 minutes
        priority: 10, // Highest priority as primary model
        tags: ['llama', 'primary', 'fast'],
        capabilities: [
          ModelCapability.DOCUMENT_ANALYSIS,
          ModelCapability.PATTERN_DETECTION,
          ModelCapability.LEGAL_INTERPRETATION,
          ModelCapability.RISK_ASSESSMENT
        ],
        status: ModelStatus.AVAILABLE
      },
      {
        id: 'fine-print-qwen-v2',
        name: 'Fine Print Qwen V2',
        type: ModelType.COMPLEX,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 936760, // 936.76s from test results
        successRate: 1.0,
        costPerRequest: 0.005, // $0.005 per request
        maxConcurrency: 5,
        timeout: 1200000, // 20 minutes for complex queries
        priority: 7,
        tags: ['qwen', 'complex', 'accurate'],
        capabilities: [
          ModelCapability.DOCUMENT_ANALYSIS,
          ModelCapability.PATTERN_DETECTION,
          ModelCapability.LEGAL_INTERPRETATION,
          ModelCapability.RISK_ASSESSMENT
        ],
        status: ModelStatus.AVAILABLE
      },
      {
        id: 'fine-print-gpt-oss',
        name: 'Fine Print GPT OSS',
        type: ModelType.BACKUP,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 465210, // 465.21s from test results
        successRate: 1.0,
        costPerRequest: 0.01, // $0.01 per request
        maxConcurrency: 8,
        timeout: 600000, // 10 minutes
        priority: 5,
        tags: ['gpt', 'backup', 'reliable'],
        capabilities: [
          ModelCapability.DOCUMENT_ANALYSIS,
          ModelCapability.PATTERN_DETECTION,
          ModelCapability.LEGAL_INTERPRETATION,
          ModelCapability.RISK_ASSESSMENT
        ],
        status: ModelStatus.AVAILABLE
      },
      {
        id: 'fine-print-marketing',
        name: 'Fine Print Marketing',
        type: ModelType.BUSINESS,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 50000, // ~50s average
        successRate: 1.0,
        costPerRequest: 0.002,
        maxConcurrency: 5,
        timeout: 90000,
        priority: 6,
        tags: ['marketing', 'business', 'specialized'],
        capabilities: [ModelCapability.MARKETING_ANALYSIS],
        status: ModelStatus.AVAILABLE
      },
      {
        id: 'fine-print-sales',
        name: 'Fine Print Sales',
        type: ModelType.BUSINESS,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 50000,
        successRate: 1.0,
        costPerRequest: 0.002,
        maxConcurrency: 5,
        timeout: 90000,
        priority: 6,
        tags: ['sales', 'business', 'specialized'],
        capabilities: [ModelCapability.SALES_INSIGHTS],
        status: ModelStatus.AVAILABLE
      },
      {
        id: 'fine-print-customer',
        name: 'Fine Print Customer',
        type: ModelType.BUSINESS,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 50000,
        successRate: 1.0,
        costPerRequest: 0.002,
        maxConcurrency: 5,
        timeout: 90000,
        priority: 6,
        tags: ['customer', 'business', 'specialized'],
        capabilities: [ModelCapability.CUSTOMER_ANALYTICS],
        status: ModelStatus.AVAILABLE
      },
      {
        id: 'fine-print-analytics',
        name: 'Fine Print Analytics',
        type: ModelType.BUSINESS,
        endpoint: 'http://ollama:11434/api/generate',
        avgResponseTime: 50000,
        successRate: 1.0,
        costPerRequest: 0.002,
        maxConcurrency: 5,
        timeout: 90000,
        priority: 6,
        tags: ['analytics', 'business', 'specialized'],
        capabilities: [ModelCapability.BUSINESS_INTELLIGENCE],
        status: ModelStatus.AVAILABLE
      }
    ];

    // Register all models
    models.forEach(model => {
      this.registerModel(model);
    });

    logger.info(`Initialized ${models.length} models in registry`);
  }

  /**
   * Register a new model or update existing
   */
  public registerModel(config: ModelConfig): void {
    this.models.set(config.id, config);
    this.emit('model:registered', config);
    
    // Store in Redis for persistence
    this.redis.hset(
      'models:registry',
      config.id,
      JSON.stringify(config)
    ).catch(err => {
      logger.error({ err, modelId: config.id }, 'Failed to persist model to Redis');
    });
  }

  /**
   * Get model by ID
   */
  public getModel(modelId: string): ModelConfig | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get all models
   */
  public getAllModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by type
   */
  public getModelsByType(type: ModelType): ModelConfig[] {
    return Array.from(this.models.values()).filter(m => m.type === type);
  }

  /**
   * Get models by capability
   */
  public getModelsByCapability(capability: ModelCapability): ModelConfig[] {
    return Array.from(this.models.values()).filter(
      m => m.capabilities.includes(capability)
    );
  }

  /**
   * Get available models sorted by priority
   */
  public getAvailableModels(): ModelConfig[] {
    return Array.from(this.models.values())
      .filter(m => m.status === ModelStatus.AVAILABLE)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Update model status
   */
  public async updateModelStatus(modelId: string, status: ModelStatus): Promise<void> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const previousStatus = model.status;
    model.status = status;
    
    // Emit status change event
    this.emit('model:status-changed', {
      modelId,
      previousStatus,
      newStatus: status,
      timestamp: new Date()
    });

    // Update in Redis
    await this.redis.hset(
      'models:status',
      modelId,
      JSON.stringify({
        status,
        timestamp: new Date().toISOString()
      })
    );

    logger.info({
      modelId,
      previousStatus,
      newStatus: status
    }, 'Model status updated');
  }

  /**
   * Update model metrics
   */
  public async updateModelMetrics(
    modelId: string,
    responseTime: number,
    success: boolean,
    cost: number
  ): Promise<void> {
    const model = this.models.get(modelId);
    if (!model) return;

    // Initialize metrics if not exists
    if (!model.metrics) {
      model.metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        totalCost: 0,
        lastUpdated: new Date(),
        hourlyMetrics: []
      };
    }

    // Update metrics
    model.metrics.totalRequests++;
    if (success) {
      model.metrics.successfulRequests++;
    } else {
      model.metrics.failedRequests++;
    }
    
    // Update average response time (exponential moving average)
    const alpha = 0.1; // Smoothing factor
    model.metrics.avgResponseTime = 
      alpha * responseTime + (1 - alpha) * model.metrics.avgResponseTime;
    
    model.metrics.totalCost += cost;
    model.metrics.lastUpdated = new Date();

    // Update success rate
    model.successRate = model.metrics.successfulRequests / model.metrics.totalRequests;

    // Store metrics in Redis
    await this.redis.zadd(
      `models:metrics:${modelId}`,
      Date.now(),
      JSON.stringify({
        responseTime,
        success,
        cost,
        timestamp: new Date().toISOString()
      })
    );

    // Emit metrics update event
    this.emit('model:metrics-updated', {
      modelId,
      metrics: model.metrics
    });
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    const healthCheckInterval = 30000; // 30 seconds

    this.healthCheckInterval = setInterval(async () => {
      for (const model of this.models.values()) {
        try {
          const health = await this.checkModelHealth(model);
          
          // Update model status based on health
          if (health.consecutiveFailures >= 3) {
            await this.updateModelStatus(model.id, ModelStatus.UNAVAILABLE);
          } else if (health.consecutiveFailures > 0) {
            await this.updateModelStatus(model.id, ModelStatus.DEGRADED);
          } else if (health.responseTime > model.avgResponseTime * 2) {
            await this.updateModelStatus(model.id, ModelStatus.BUSY);
          } else {
            await this.updateModelStatus(model.id, ModelStatus.AVAILABLE);
          }

          model.lastHealthCheck = new Date();
        } catch (error) {
          logger.error({
            error,
            modelId: model.id
          }, 'Health check failed');
        }
      }
    }, healthCheckInterval);

    logger.info('Started health check monitoring');
  }

  /**
   * Check health of a specific model
   */
  private async checkModelHealth(model: ModelConfig): Promise<ModelHealthStatus> {
    const start = Date.now();
    let consecutiveFailures = 0;

    try {
      // Simulate health check (in production, make actual API call)
      const response = await fetch(`${model.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (!response || !response.ok) {
        consecutiveFailures++;
      }

      const responseTime = Date.now() - start;

      return {
        modelId: model.id,
        status: model.status,
        responseTime,
        lastCheck: new Date(),
        consecutiveFailures
      };
    } catch (error) {
      return {
        modelId: model.id,
        status: ModelStatus.UNAVAILABLE,
        responseTime: Date.now() - start,
        lastCheck: new Date(),
        consecutiveFailures: consecutiveFailures + 1
      };
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    const metricsInterval = 60000; // 1 minute

    this.metricsUpdateInterval = setInterval(async () => {
      for (const model of this.models.values()) {
        if (!model.metrics) continue;

        // Calculate hourly metrics
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 3600000);

        // Get metrics from Redis
        const metrics = await this.redis.zrangebyscore(
          `models:metrics:${model.id}`,
          hourAgo.getTime(),
          now.getTime()
        );

        if (metrics.length > 0) {
          const hourlyMetric: HourlyMetric = {
            timestamp: now,
            requests: metrics.length,
            avgResponseTime: 0,
            errorRate: 0,
            cost: 0
          };

          let totalResponseTime = 0;
          let errors = 0;

          metrics.forEach(metricStr => {
            const metric = JSON.parse(metricStr);
            totalResponseTime += metric.responseTime;
            if (!metric.success) errors++;
            hourlyMetric.cost += metric.cost;
          });

          hourlyMetric.avgResponseTime = totalResponseTime / metrics.length;
          hourlyMetric.errorRate = errors / metrics.length;

          // Add to hourly metrics array (keep last 24 hours)
          model.metrics.hourlyMetrics.push(hourlyMetric);
          if (model.metrics.hourlyMetrics.length > 24) {
            model.metrics.hourlyMetrics.shift();
          }

          // Calculate percentiles
          const responseTimes = metrics.map(m => JSON.parse(m).responseTime).sort((a, b) => a - b);
          model.metrics.p50ResponseTime = this.percentile(responseTimes, 50);
          model.metrics.p95ResponseTime = this.percentile(responseTimes, 95);
          model.metrics.p99ResponseTime = this.percentile(responseTimes, 99);
        }
      }
    }, metricsInterval);

    logger.info('Started metrics collection');
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  /**
   * Get model load (current usage vs capacity)
   */
  public async getModelLoad(modelId: string): Promise<number> {
    const activeJobs = await this.redis.get(`models:active:${modelId}`);
    const model = this.models.get(modelId);
    
    if (!model) return 0;
    
    const active = parseInt(activeJobs || '0', 10);
    return active / model.maxConcurrency;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }
    this.removeAllListeners();
  }
}