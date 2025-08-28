/**
 * Load Balancer - Cost-aware routing with intelligent model selection
 */

import { Redis } from 'ioredis';
import pino from 'pino';
import crypto from 'crypto';
import {
  ModelConfig,
  RequestContext,
  RoutingDecision,
  ModelCapability,
  RequestPriority,
  ComplexityLevel,
  UserTier,
  ModelStatus,
  RequestType
} from '../types';
import { ModelRegistry } from '../registry/model-registry';

const logger = pino({ name: 'load-balancer' });

export class LoadBalancer {
  private registry: ModelRegistry;
  private redis: Redis;
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 86400; // 24 hours in seconds

  constructor(registry: ModelRegistry, redis: Redis) {
    this.registry = registry;
    this.redis = redis;
  }

  /**
   * Route request to optimal model based on context
   */
  public async routeRequest(context: RequestContext): Promise<RoutingDecision> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(context);
    const cachedResult = await this.checkCache(cacheKey);
    
    if (cachedResult) {
      logger.info({
        requestId: context.id,
        cacheKey
      }, 'Cache hit - no model needed');
      
      return {
        requestId: context.id,
        selectedModel: {} as ModelConfig, // No model needed for cache hit
        alternativeModels: [],
        routingReason: 'Cache hit - returning cached result',
        estimatedResponseTime: 0,
        estimatedCost: 0,
        cacheHit: true,
        timestamp: new Date()
      };
    }

    // Get available models
    const availableModels = this.registry.getAvailableModels();
    
    if (availableModels.length === 0) {
      throw new Error('No available models');
    }

    // Apply routing logic based on context
    const selectedModel = await this.selectOptimalModel(context, availableModels);
    const alternativeModels = await this.getAlternativeModels(context, availableModels, selectedModel);
    
    // Calculate estimates
    const queuePosition = await this.getQueuePosition(selectedModel.id);
    const estimatedResponseTime = this.estimateResponseTime(selectedModel, context, queuePosition);
    const estimatedCost = this.estimateCost(selectedModel, context);
    
    // Create routing decision
    const decision: RoutingDecision = {
      requestId: context.id,
      selectedModel,
      alternativeModels,
      routingReason: this.getRoutingReason(context, selectedModel),
      estimatedResponseTime,
      estimatedCost,
      queuePosition,
      cacheHit: false,
      timestamp: new Date()
    };

    // Log routing decision
    logger.info({
      requestId: context.id,
      selectedModel: selectedModel.id,
      reason: decision.routingReason,
      estimatedTime: estimatedResponseTime,
      estimatedCost,
      routingTime: Date.now() - startTime
    }, 'Request routed');

    // Store routing decision for analytics
    await this.storeRoutingDecision(decision);

    return decision;
  }

  /**
   * Select optimal model based on request context
   */
  private async selectOptimalModel(
    context: RequestContext,
    availableModels: ModelConfig[]
  ): Promise<ModelConfig> {
    // Filter models by required capabilities
    let candidateModels = availableModels.filter(model =>
      context.capabilities.every(cap => model.capabilities.includes(cap))
    );

    if (candidateModels.length === 0) {
      candidateModels = availableModels; // Fallback to all available models
    }

    // Apply routing rules based on priority and complexity
    
    // Rule 1: Urgent + Simple → Use fastest model (Llama)
    if (context.priority === RequestPriority.URGENT && 
        context.complexity === ComplexityLevel.SIMPLE) {
      const llamaModel = candidateModels.find(m => m.id === 'fine-print-llama');
      if (llamaModel && await this.isModelAvailable(llamaModel)) {
        return llamaModel;
      }
    }

    // Rule 2: Complex + Time available → Use most accurate model (Qwen)
    if (context.complexity === ComplexityLevel.COMPLEX || 
        context.complexity === ComplexityLevel.VERY_COMPLEX) {
      if (context.priority !== RequestPriority.URGENT) {
        const qwenModel = candidateModels.find(m => m.id === 'fine-print-qwen-v2');
        if (qwenModel && await this.isModelAvailable(qwenModel)) {
          return qwenModel;
        }
        // Fallback to GPT-OSS for complex queries
        const gptModel = candidateModels.find(m => m.id === 'fine-print-gpt-oss');
        if (gptModel && await this.isModelAvailable(gptModel)) {
          return gptModel;
        }
      }
    }

    // Rule 3: Business queries → Use specialized models
    if (context.requestType === RequestType.BUSINESS_QUERY) {
      const businessModels = candidateModels.filter(m => 
        m.tags.includes('business') || m.tags.includes('specialized')
      );
      if (businessModels.length > 0) {
        // Select based on specific capability
        for (const model of businessModels) {
          if (await this.isModelAvailable(model)) {
            return model;
          }
        }
      }
    }

    // Rule 4: Cost optimization for free tier
    if (context.userTier === UserTier.FREE) {
      // Prefer cheaper models for free users
      candidateModels.sort((a, b) => a.costPerRequest - b.costPerRequest);
      for (const model of candidateModels) {
        const load = await this.registry.getModelLoad(model.id);
        if (load < 0.8) { // Model not overloaded
          return model;
        }
      }
    }

    // Rule 5: Premium users get priority access to fast models
    if (context.userTier === UserTier.PREMIUM || context.userTier === UserTier.ENTERPRISE) {
      // Prefer faster models for premium users
      candidateModels.sort((a, b) => a.avgResponseTime - b.avgResponseTime);
      for (const model of candidateModels) {
        if (await this.isModelAvailable(model)) {
          return model;
        }
      }
    }

    // Default: Select model with best cost-performance ratio
    const scoredModels = await Promise.all(
      candidateModels.map(async model => ({
        model,
        score: await this.calculateModelScore(model, context)
      }))
    );

    scoredModels.sort((a, b) => b.score - a.score);
    return scoredModels[0].model;
  }

  /**
   * Calculate model score based on multiple factors
   */
  private async calculateModelScore(
    model: ModelConfig,
    context: RequestContext
  ): Promise<number> {
    let score = 0;

    // Priority score (0-30 points)
    score += model.priority * 3;

    // Success rate score (0-20 points)
    score += model.successRate * 20;

    // Cost efficiency score (0-20 points)
    const costScore = (1 / model.costPerRequest) * 2;
    score += Math.min(costScore, 20);

    // Response time score (0-20 points)
    const timeScore = (120000 / model.avgResponseTime) * 10; // Baseline: 2 minutes
    score += Math.min(timeScore, 20);

    // Load score (0-10 points)
    const load = await this.registry.getModelLoad(model.id);
    score += (1 - load) * 10;

    // User tier bonus
    if (context.userTier === UserTier.ENTERPRISE) {
      score += 10;
    } else if (context.userTier === UserTier.PREMIUM) {
      score += 5;
    }

    // Capability match bonus
    const capabilityMatch = context.capabilities.filter(cap =>
      model.capabilities.includes(cap)
    ).length / context.capabilities.length;
    score += capabilityMatch * 10;

    return score;
  }

  /**
   * Check if model is available and not overloaded
   */
  private async isModelAvailable(model: ModelConfig): Promise<boolean> {
    if (model.status !== ModelStatus.AVAILABLE) {
      return false;
    }

    const load = await this.registry.getModelLoad(model.id);
    return load < 0.9; // Consider model available if load is below 90%
  }

  /**
   * Get alternative models for fallback
   */
  private async getAlternativeModels(
    context: RequestContext,
    availableModels: ModelConfig[],
    selectedModel: ModelConfig
  ): Promise<ModelConfig[]> {
    const alternatives = availableModels
      .filter(m => m.id !== selectedModel.id)
      .filter(m => context.capabilities.every(cap => m.capabilities.includes(cap)))
      .slice(0, 3); // Return top 3 alternatives

    return alternatives;
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(context: RequestContext): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      type: context.requestType,
      capabilities: context.capabilities.sort(),
      metadata: context.metadata
    }));
    return `cache:request:${hash.digest('hex')}`;
  }

  /**
   * Check cache for existing result
   */
  private async checkCache(key: string): Promise<any> {
    if (!this.cacheEnabled) return null;

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        // Update cache hit counter
        await this.redis.hincrby('cache:stats', 'hits', 1);
        await this.redis.hincrby(`cache:hits:${key}`, 'count', 1);
        
        return JSON.parse(cached);
      }
      
      // Update cache miss counter
      await this.redis.hincrby('cache:stats', 'misses', 1);
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Cache check failed');
      return null;
    }
  }

  /**
   * Store result in cache
   */
  public async cacheResult(
    context: RequestContext,
    result: any,
    modelId: string
  ): Promise<void> {
    if (!this.cacheEnabled) return;

    const key = this.generateCacheKey(context);
    
    try {
      await this.redis.setex(
        key,
        this.cacheTTL,
        JSON.stringify({
          result,
          modelId,
          cachedAt: new Date().toISOString(),
          requestId: context.id
        })
      );

      // Store cache metadata
      await this.redis.hset(
        `cache:metadata:${key}`,
        'modelId', modelId,
        'requestType', context.requestType,
        'userTier', context.userTier,
        'createdAt', new Date().toISOString()
      );

      logger.info({ key, modelId }, 'Result cached');
    } catch (error) {
      logger.error({ error, key }, 'Failed to cache result');
    }
  }

  /**
   * Get queue position for model
   */
  private async getQueuePosition(modelId: string): Promise<number> {
    const queueKey = `queue:${modelId}:pending`;
    const position = await this.redis.llen(queueKey);
    return position || 0;
  }

  /**
   * Estimate response time
   */
  private estimateResponseTime(
    model: ModelConfig,
    context: RequestContext,
    queuePosition: number
  ): number {
    let estimatedTime = model.avgResponseTime;

    // Add queue wait time
    if (queuePosition > 0) {
      estimatedTime += (queuePosition * model.avgResponseTime) / model.maxConcurrency;
    }

    // Adjust for complexity
    switch (context.complexity) {
      case ComplexityLevel.SIMPLE:
        estimatedTime *= 0.7;
        break;
      case ComplexityLevel.MODERATE:
        estimatedTime *= 1.0;
        break;
      case ComplexityLevel.COMPLEX:
        estimatedTime *= 1.5;
        break;
      case ComplexityLevel.VERY_COMPLEX:
        estimatedTime *= 2.0;
        break;
    }

    return Math.round(estimatedTime);
  }

  /**
   * Estimate cost for request
   */
  private estimateCost(model: ModelConfig, context: RequestContext): number {
    let cost = model.costPerRequest;

    // Adjust for complexity
    switch (context.complexity) {
      case ComplexityLevel.SIMPLE:
        cost *= 0.8;
        break;
      case ComplexityLevel.MODERATE:
        cost *= 1.0;
        break;
      case ComplexityLevel.COMPLEX:
        cost *= 1.5;
        break;
      case ComplexityLevel.VERY_COMPLEX:
        cost *= 2.0;
        break;
    }

    // Apply user tier discounts
    switch (context.userTier) {
      case UserTier.PREMIUM:
        cost *= 0.8; // 20% discount
        break;
      case UserTier.ENTERPRISE:
        cost *= 0.6; // 40% discount
        break;
    }

    return Math.round(cost * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Generate routing reason explanation
   */
  private getRoutingReason(context: RequestContext, model: ModelConfig): string {
    const reasons: string[] = [];

    // Priority-based reasoning
    if (context.priority === RequestPriority.URGENT && model.id === 'fine-print-llama') {
      reasons.push('Urgent request routed to fastest model');
    }

    // Complexity-based reasoning
    if (context.complexity === ComplexityLevel.COMPLEX && model.id === 'fine-print-qwen-v2') {
      reasons.push('Complex query routed to most accurate model');
    }

    // Cost-based reasoning
    if (context.userTier === UserTier.FREE && model.costPerRequest <= 0.001) {
      reasons.push('Free tier request routed to cost-efficient model');
    }

    // Capability-based reasoning
    if (model.tags.includes('business')) {
      reasons.push('Business query routed to specialized model');
    }

    // Load-based reasoning
    if (reasons.length === 0) {
      reasons.push(`Selected based on availability and performance score`);
    }

    return reasons.join('; ');
  }

  /**
   * Store routing decision for analytics
   */
  private async storeRoutingDecision(decision: RoutingDecision): Promise<void> {
    try {
      await this.redis.zadd(
        'routing:decisions',
        Date.now(),
        JSON.stringify(decision)
      );

      // Store summary metrics
      await this.redis.hincrby('routing:stats', 'total', 1);
      await this.redis.hincrby(`routing:stats:model:${decision.selectedModel.id}`, 'selected', 1);
      
      if (decision.cacheHit) {
        await this.redis.hincrby('routing:stats', 'cacheHits', 1);
      }
    } catch (error) {
      logger.error({ error, decision }, 'Failed to store routing decision');
    }
  }

  /**
   * Get routing statistics
   */
  public async getRoutingStats(): Promise<any> {
    const stats = await this.redis.hgetall('routing:stats');
    const modelStats: Record<string, any> = {};

    // Get per-model stats
    for (const model of this.registry.getAllModels()) {
      const modelStat = await this.redis.hgetall(`routing:stats:model:${model.id}`);
      if (Object.keys(modelStat).length > 0) {
        modelStats[model.id] = modelStat;
      }
    }

    return {
      total: parseInt(stats.total || '0', 10),
      cacheHits: parseInt(stats.cacheHits || '0', 10),
      cacheHitRate: stats.total ? 
        (parseInt(stats.cacheHits || '0', 10) / parseInt(stats.total, 10)) : 0,
      models: modelStats
    };
  }
}