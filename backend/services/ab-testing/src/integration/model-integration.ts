// Model Integration - Integration with Model Management Service

import { Redis } from 'ioredis';
import { Logger } from 'pino';
import axios, { AxiosInstance } from 'axios';
import { ModelPerformanceMetrics } from '../types';

export interface ModelConfig {
  modelId: string;
  modelVersion: string;
  provider: string;
  tier: 'small' | 'medium' | 'large' | 'custom';
  parameters?: Record<string, any>;
}

export interface ModelMetrics {
  latency: number;
  cost: number;
  accuracy?: number;
  tokensUsed?: number;
  cacheHit: boolean;
  errorRate: number;
}

export class ModelIntegration {
  private redis: Redis;
  private logger: Logger;
  private modelServiceClient: AxiosInstance;
  private metricsCache: Map<string, ModelMetrics[]>;

  constructor(redis: Redis, logger: Logger) {
    this.redis = redis;
    this.logger = logger;
    this.metricsCache = new Map();

    // Initialize model service client
    this.modelServiceClient = axios.create({
      baseURL: process.env.MODEL_SERVICE_URL || 'http://model-management:3004',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Set up interceptors for logging
    this.setupInterceptors();
  }

  /**
   * Get model configuration for a variant
   */
  async getModelConfig(variantId: string): Promise<ModelConfig | null> {
    try {
      // Check cache first
      const cacheKey = `model:config:${variantId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fetch from model service
      const response = await this.modelServiceClient.get(`/models/variant/${variantId}`);
      const config = response.data;

      // Cache for 1 hour
      await this.redis.set(cacheKey, JSON.stringify(config), 'EX', 3600);

      return config;
    } catch (error) {
      this.logger.error({ error, variantId }, 'Failed to get model config');
      return null;
    }
  }

  /**
   * Analyze document using specific model variant
   */
  async analyzeWithModel(
    variantId: string,
    documentContent: string,
    userId: string
  ): Promise<{ result: any; metrics: ModelMetrics }> {
    const startTime = Date.now();
    
    try {
      // Get model configuration
      const modelConfig = await this.getModelConfig(variantId);
      if (!modelConfig) {
        throw new Error(`Model config not found for variant ${variantId}`);
      }

      // Call model service
      const response = await this.modelServiceClient.post('/analyze', {
        modelId: modelConfig.modelId,
        modelVersion: modelConfig.modelVersion,
        content: documentContent,
        userId,
        experimentVariantId: variantId,
        parameters: modelConfig.parameters
      });

      const latency = Date.now() - startTime;
      
      // Extract metrics
      const metrics: ModelMetrics = {
        latency,
        cost: response.data.cost || this.estimateCost(modelConfig, documentContent.length),
        accuracy: response.data.accuracy,
        tokensUsed: response.data.tokensUsed,
        cacheHit: response.data.cacheHit || false,
        errorRate: 0
      };

      // Store metrics
      await this.storeModelMetrics(variantId, metrics);

      return {
        result: response.data.result,
        metrics
      };

    } catch (error) {
      this.logger.error({ error, variantId }, 'Failed to analyze with model');
      
      // Track error
      const metrics: ModelMetrics = {
        latency: Date.now() - startTime,
        cost: 0,
        cacheHit: false,
        errorRate: 1
      };
      
      await this.storeModelMetrics(variantId, metrics);
      
      throw error;
    }
  }

  /**
   * Compare multiple model variants
   */
  async compareModels(
    variantIds: string[],
    testDocument: string
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Run analysis with each variant in parallel
    const promises = variantIds.map(async (variantId) => {
      try {
        const { result, metrics } = await this.analyzeWithModel(
          variantId,
          testDocument,
          'test-user'
        );
        
        return {
          variantId,
          result,
          metrics
        };
      } catch (error) {
        return {
          variantId,
          error: error.message,
          metrics: null
        };
      }
    });

    const variantResults = await Promise.all(promises);

    // Organize results
    for (const variantResult of variantResults) {
      results[variantResult.variantId] = variantResult;
    }

    // Calculate comparison metrics
    const comparison = this.calculateComparison(variantResults);

    return {
      variants: results,
      comparison
    };
  }

  /**
   * Get aggregated model performance metrics
   */
  async getModelPerformance(
    variantId: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<any> {
    const key = `model:metrics:${variantId}`;
    
    // Get recent metrics from Redis
    const recentMetrics = await this.redis.lrange(key, 0, 999);
    const metrics = recentMetrics.map(m => JSON.parse(m));

    if (metrics.length === 0) {
      return {
        variantId,
        sampleSize: 0,
        averageLatency: 0,
        p95Latency: 0,
        totalCost: 0,
        averageCost: 0,
        cacheHitRate: 0,
        errorRate: 0
      };
    }

    // Calculate aggregates
    const latencies = metrics.map(m => m.latency).sort((a, b) => a - b);
    const costs = metrics.map(m => m.cost);
    const cacheHits = metrics.filter(m => m.cacheHit).length;
    const errors = metrics.filter(m => m.errorRate > 0).length;

    return {
      variantId,
      sampleSize: metrics.length,
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50Latency: latencies[Math.floor(latencies.length * 0.5)],
      p95Latency: latencies[Math.floor(latencies.length * 0.95)],
      p99Latency: latencies[Math.floor(latencies.length * 0.99)],
      totalCost: costs.reduce((a, b) => a + b, 0),
      averageCost: costs.reduce((a, b) => a + b, 0) / costs.length,
      cacheHitRate: cacheHits / metrics.length,
      errorRate: errors / metrics.length,
      timeRange: {
        start: new Date(metrics[metrics.length - 1].timestamp),
        end: new Date(metrics[0].timestamp)
      }
    };
  }

  /**
   * Optimize model selection based on constraints
   */
  async optimizeModelSelection(
    constraints: {
      maxLatency?: number;
      maxCost?: number;
      minAccuracy?: number;
    }
  ): Promise<string[]> {
    try {
      // Get available models from model service
      const response = await this.modelServiceClient.get('/models/available');
      const models = response.data;

      // Filter based on constraints
      const eligibleModels = models.filter((model: any) => {
        if (constraints.maxLatency && model.averageLatency > constraints.maxLatency) {
          return false;
        }
        if (constraints.maxCost && model.averageCost > constraints.maxCost) {
          return false;
        }
        if (constraints.minAccuracy && model.accuracy < constraints.minAccuracy) {
          return false;
        }
        return true;
      });

      // Sort by performance score
      eligibleModels.sort((a: any, b: any) => {
        const scoreA = this.calculateModelScore(a);
        const scoreB = this.calculateModelScore(b);
        return scoreB - scoreA;
      });

      return eligibleModels.map((m: any) => m.modelId);

    } catch (error) {
      this.logger.error({ error }, 'Failed to optimize model selection');
      return [];
    }
  }

  /**
   * Warm up model cache for experiment
   */
  async warmUpModels(variantIds: string[]): Promise<void> {
    this.logger.info({ variantIds }, 'Warming up models');

    const warmUpDocument = 'This is a test document for model warm-up.';
    
    const promises = variantIds.map(async (variantId) => {
      try {
        const config = await this.getModelConfig(variantId);
        if (config) {
          // Make warm-up request
          await this.modelServiceClient.post('/warmup', {
            modelId: config.modelId,
            modelVersion: config.modelVersion
          });
        }
      } catch (error) {
        this.logger.warn({ error, variantId }, 'Failed to warm up model');
      }
    });

    await Promise.all(promises);
  }

  // Private helper methods

  private setupInterceptors(): void {
    // Request interceptor
    this.modelServiceClient.interceptors.request.use(
      (config) => {
        config.headers['X-Request-ID'] = this.generateRequestId();
        config.headers['X-Service'] = 'ab-testing';
        return config;
      },
      (error) => {
        this.logger.error({ error }, 'Model service request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.modelServiceClient.interceptors.response.use(
      (response) => {
        this.logger.debug({
          url: response.config.url,
          status: response.status,
          duration: response.config.metadata?.duration
        }, 'Model service response');
        return response;
      },
      (error) => {
        this.logger.error({
          error: error.message,
          url: error.config?.url,
          status: error.response?.status
        }, 'Model service response error');
        return Promise.reject(error);
      }
    );
  }

  private generateRequestId(): string {
    return `ab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateCost(config: ModelConfig, documentLength: number): number {
    // Estimate cost based on model tier and document length
    const costPerToken = {
      small: 0.0001,
      medium: 0.0005,
      large: 0.002,
      custom: 0.001
    };

    const tokensEstimate = documentLength / 4; // Rough estimate
    return tokensEstimate * costPerToken[config.tier];
  }

  private async storeModelMetrics(variantId: string, metrics: ModelMetrics): Promise<void> {
    const key = `model:metrics:${variantId}`;
    const data = {
      ...metrics,
      timestamp: new Date().toISOString()
    };

    // Store in Redis list (keep last 1000)
    await this.redis.lpush(key, JSON.stringify(data));
    await this.redis.ltrim(key, 0, 999);
    await this.redis.expire(key, 86400); // 24 hours TTL

    // Update cache
    if (!this.metricsCache.has(variantId)) {
      this.metricsCache.set(variantId, []);
    }
    const cache = this.metricsCache.get(variantId)!;
    cache.unshift(metrics);
    if (cache.length > 100) {
      cache.pop();
    }
  }

  private calculateComparison(results: any[]): any {
    const validResults = results.filter(r => r.metrics !== null);
    
    if (validResults.length === 0) {
      return { error: 'No valid results to compare' };
    }

    // Find best performing variant
    const bestLatency = validResults.reduce((best, current) => 
      current.metrics.latency < best.metrics.latency ? current : best
    );
    
    const lowestCost = validResults.reduce((best, current) => 
      current.metrics.cost < best.metrics.cost ? current : best
    );

    const highestAccuracy = validResults
      .filter(r => r.metrics.accuracy !== undefined)
      .reduce((best, current) => 
        (current.metrics.accuracy || 0) > (best.metrics?.accuracy || 0) ? current : best,
        { metrics: { accuracy: 0 } }
      );

    return {
      bestLatency: {
        variantId: bestLatency.variantId,
        latency: bestLatency.metrics.latency
      },
      lowestCost: {
        variantId: lowestCost.variantId,
        cost: lowestCost.metrics.cost
      },
      highestAccuracy: highestAccuracy.metrics.accuracy > 0 ? {
        variantId: highestAccuracy.variantId,
        accuracy: highestAccuracy.metrics.accuracy
      } : null,
      summary: {
        averageLatency: validResults.reduce((sum, r) => sum + r.metrics.latency, 0) / validResults.length,
        averageCost: validResults.reduce((sum, r) => sum + r.metrics.cost, 0) / validResults.length,
        successRate: validResults.length / results.length
      }
    };
  }

  private calculateModelScore(model: any): number {
    // Weighted scoring: lower latency and cost is better, higher accuracy is better
    const latencyScore = 1 / (1 + model.averageLatency / 1000); // Normalize to 0-1
    const costScore = 1 / (1 + model.averageCost);
    const accuracyScore = model.accuracy || 0.5;
    
    // Weights
    const weights = {
      latency: 0.3,
      cost: 0.3,
      accuracy: 0.4
    };

    return (
      weights.latency * latencyScore +
      weights.cost * costScore +
      weights.accuracy * accuracyScore
    );
  }
}